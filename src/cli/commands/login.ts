import { saveSession, saveDiffs, saveProfile, clearSession } from '../config';
import type { Profile, Diff } from '../config';
import { login, localAwareFetch, BASE } from '../api';
import { decryptData } from '../../lib/utils/crypto';
import { importProfile } from '../../lib/utils/sync';
import { setPassword } from 'cross-keychain';
import { SERVICE_NAME, BIN, showHelp, prompt } from '../ui';

interface RelayPayload {
	profileId: string;
}

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 5 * 60 * 1000;

function waitForEnter(): Promise<void> {
	return new Promise((resolve) => {
		if (!process.stdin.isTTY) {
			resolve();
			return;
		}
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (ch: string) => {
			if (ch === '\r' || ch === '\n') {
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.removeListener('data', onData);
				resolve();
			} else if (ch === '\x03') {
				process.stdin.setRawMode(false);
				process.stderr.write('\n');
				process.exit(130);
			}
		};

		process.stdin.on('data', onData);
	});
}

function openBrowser(url: string): void {
	try {
		const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
		Bun.spawn([cmd, url], { stdout: 'ignore', stderr: 'ignore' });
	} catch {
		// Ignore — URL is printed to stderr regardless
	}
}

const SPINNER = ['|', '/', '-', '\\'];

async function pollForRelay(code: string, expires: number): Promise<RelayPayload> {
	const deadline = Date.now() + POLL_TIMEOUT;
	let tick = 0;

	while (Date.now() < deadline) {
		const frame = SPINNER[tick++ % SPINNER.length];
		process.stderr.write(`\r  ${frame} Waiting for browser login...`);

		let res: Response;
		try {
			res = await localAwareFetch(`${BASE}/api/cli/auth/${code}`);
		} catch (err: any) {
			throw new Error(`Unable to connect to ${BASE} — ${err.message}`);
		}
		if (!res.ok) throw new Error(`Relay error: ${res.status}`);

		const data = (await res.json()) as { pending?: boolean; session?: string };

		if (data.session) {
			process.stderr.write('\r  Waiting for browser login... done\n');
			// Encode expires as base64 salt (same as browser)
			const expiresBytes = new TextEncoder().encode(String(expires));
			const expiresSalt = btoa(String.fromCharCode(...expiresBytes));
			return decryptData<RelayPayload>(data.session, code, expiresSalt);
		}

		await new Promise((r) => setTimeout(r, POLL_INTERVAL));
	}

	process.stderr.write('\n');
	throw new Error(`Login timed out. Run \`${BIN} login\` to try again.`);
}

async function webLogin(noBrowser: boolean): Promise<void> {
	const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
	const expires = Date.now() + POLL_TIMEOUT;
	const url = `${BASE}/cli/auth?code=${code}&expires=${expires}`;

	// Generate verification code from hash of code + expires
	const data = new TextEncoder().encode(code + String(expires));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
	const verify = hashHex.slice(-4);

	process.stderr.write('\n');
	process.stderr.write(`  Verification code: ${verify}\n\n`);

	if (noBrowser) {
		process.stderr.write(`  Open this URL to log in:\n`);
		process.stderr.write(`  ${url}\n\n`);
	} else {
		process.stderr.write(`  Press Enter to open difflog.dev in your browser...`);
		await waitForEnter();
		process.stderr.write('\n');
		openBrowser(url);
	}

	const { profileId } = await pollForRelay(code, expires);

	// Prompt for password to decrypt API keys
	process.stderr.write('\n');
	const password = await prompt('  Enter profile password: ', true);
	process.stderr.write('\n');

	// Use import flow to fetch profile and decrypt keys
	process.stderr.write('  Fetching profile...\n');
	const { profile, diffs } = await importProfile(profileId, password, {
		baseUrl: BASE,
		fetchFn: localAwareFetch
	});

	// Store API keys in OS keychain
	if (profile.apiKeys) {
		let keysStored = 0;
		for (const [provider, key] of Object.entries(profile.apiKeys)) {
			if (key) {
				try {
					await setPassword(SERVICE_NAME, provider, key);
					keysStored++;
				} catch (err) {
					process.stderr.write(`  Warning: Failed to store ${provider} key in keychain\n`);
				}
			}
		}
		if (keysStored > 0) {
			process.stderr.write(`  ✓ Stored ${keysStored} API key(s) in OS keychain\n`);
		}
	}

	// Save profile without API keys (they're in keychain now)
	const profileWithoutKeys = { ...profile };
	delete profileWithoutKeys.apiKeys;

	clearSession();
	saveSession({ profileId: profile.id, password, passwordSalt: profile.passwordSalt || '', salt: profile.salt || '' });
	saveProfile(profileWithoutKeys);
	saveDiffs(diffs);

	process.stderr.write(`  Logged in as ${profile.name}. ${diffs.length} diff(s) cached.\n`);
}

async function directLogin(profileId: string, password: string): Promise<void> {
	process.stderr.write('Logging in...\n');

	const { session, profile, diffs } = await login(profileId, password);

	clearSession();
	saveSession(session);
	saveProfile(profile);
	saveDiffs(diffs);

	process.stderr.write(`Logged in as ${profile.name}. ${diffs.length} diff(s) cached.\n`);
}

export async function loginCommand(args: string[]): Promise<void> {
	showHelp(args, `Log in via browser or with credentials

Usage: ${BIN} login [flags]

Flags:
  --profile <id>       Profile ID (skip browser, prompts for password)
  --password <pw>      Password (use with --profile to skip prompt)
  --no-browser         Print URL only, don't open browser
`);

	let profileId: string | undefined;
	let password: string | undefined;
	let noBrowser = false;

	// Parse flags
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--profile' && args[i + 1]) {
			profileId = args[++i];
		} else if (args[i] === '--password' && args[i + 1]) {
			password = args[++i];
		} else if (args[i] === '--no-browser') {
			noBrowser = true;
		}
	}

	try {
		if (profileId) {
			// Have profile ID — prompt for password if not provided
			if (!password) {
				password = await prompt('  Enter profile password: ', true);
				process.stderr.write('\n');
			}
			await directLogin(profileId, password);
		} else {
			// Web-based login (default interactive flow)
			await webLogin(noBrowser);
		}
	} catch (err: any) {
		process.stderr.write(`Error: ${err.message}\n`);
		process.exit(1);
	}
}
