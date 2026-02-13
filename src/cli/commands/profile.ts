import { getSession, saveSession, getProfile, getDiffs, getApiKeys, getSyncMeta, saveSyncMeta, clearPendingChanges } from '../config';
import type { Session } from '../config';
import { canSync } from '../sync';
import { localAwareFetch, BASE } from '../api';
import { encryptData, hashPasswordForTransport, uint8ToBase64 } from '../../lib/utils/crypto';
import { computeKeysHash } from '../../lib/utils/sync';
import type { ProviderSelections, ApiKeys } from '../../lib/utils/sync';
import { formatAiConfig } from './config/index';
import { timeAgo } from '../time';

// ANSI codes
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BRIGHT_YELLOW = '\x1b[93m';

interface EncryptedKeysBlob {
	apiKeys: Record<string, string>;
	providerSelections?: ProviderSelections;
}

/** Read a line from stdin. Uses raw mode for masked input when isTTY. */
async function prompt(label: string, mask = false): Promise<string> {
	process.stderr.write(label);

	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		const line = typeof value === 'string' ? value : new TextDecoder().decode(value);
		return line.trimEnd();
	}

	return new Promise((resolve) => {
		const buf: string[] = [];
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (ch: string) => {
			if (ch === '\r' || ch === '\n') {
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.removeListener('data', onData);
				process.stderr.write('\n');
				resolve(buf.join(''));
			} else if (ch === '\x03') {
				process.stdin.setRawMode(false);
				process.stderr.write('\n');
				process.exit(130);
			} else if (ch === '\x7f' || ch === '\b') {
				if (buf.length > 0) {
					buf.pop();
					if (mask) process.stderr.write('\b \b');
				}
			} else {
				buf.push(ch);
				process.stderr.write(mask ? '*' : ch);
			}
		};

		process.stdin.on('data', onData);
	});
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await localAwareFetch(url, init);
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error || `Request failed: ${res.status}`);
	}
	return res.json() as Promise<T>;
}

async function showInfo(session: Session): Promise<void> {
	const profile = getProfile();
	if (!profile) {
		process.stderr.write('No profile data found. Run: difflog config\n');
		process.exit(1);
	}

	const diffs = getDiffs();
	const shared = canSync();
	const syncMeta = getSyncMeta();

	process.stdout.write(`\n${BOLD}${GREEN}Profile${RESET}\n\n`);
	process.stdout.write(`  ${DIM}Name:${RESET}   ${profile.name}\n`);
	process.stdout.write(`  ${DIM}ID:${RESET}     ${session.profileId.slice(0, 8)}...\n`);
	process.stdout.write(`  ${DIM}Diffs:${RESET}  ${diffs.length}\n`);
	process.stdout.write(`  ${DIM}Depth:${RESET}  ${profile.depth || 'standard'}\n`);
	process.stdout.write(`  ${DIM}AI:${RESET}     ${formatAiConfig(profile.providerSelections)}\n`);

	if (shared) {
		let syncLine = `${GREEN}Shared${RESET}`;
		if (syncMeta.lastSyncedAt) {
			const ago = timeAgo(syncMeta.lastSyncedAt);
			syncLine += ` ${DIM}(last synced ${ago})${RESET}`;
		}
		process.stdout.write(`  ${DIM}Sync:${RESET}   ${syncLine}\n`);
	} else {
		process.stdout.write(`  ${DIM}Sync:${RESET}   ${BRIGHT_YELLOW}Local-only${RESET}\n`);
	}

	process.stdout.write('\n');
}

async function shareCommand(session: Session): Promise<void> {
	if (canSync()) {
		process.stderr.write('Profile is already shared.\n');
		process.stderr.write('Use `difflog profile password` to change your sync password.\n');
		process.stderr.write('Use `difflog profile unshare` to remove from server.\n');
		process.exit(1);
	}

	const profile = getProfile();
	if (!profile) {
		process.stderr.write('No profile data found. Run: difflog config\n');
		process.exit(1);
	}

	const apiKeys = await getApiKeys();
	if (Object.keys(apiKeys).length === 0) {
		process.stderr.write('No API keys configured. Run: difflog config ai key add <provider> <key>\n');
		process.exit(1);
	}

	// Prompt for password
	const password = await prompt('  Enter a sync password: ', true);
	if (!password) {
		process.stderr.write('Password is required.\n');
		process.exit(1);
	}

	const confirm = await prompt('  Confirm password: ', true);
	if (password !== confirm) {
		process.stderr.write('Passwords do not match.\n');
		process.exit(1);
	}

	process.stderr.write('\n  Sharing profile...\n');

	// Build encrypted keys blob
	const blob: EncryptedKeysBlob = {
		apiKeys,
		providerSelections: profile.providerSelections as ProviderSelections
	};

	// Generate encryption salt
	const saltBytes = crypto.getRandomValues(new Uint8Array(16));
	const salt = uint8ToBase64(saltBytes);

	// Encrypt blob
	const encryptedApiKey = await encryptData(blob, password, salt);

	// Hash password for transport (generates new password salt)
	const passwordHash = await hashPasswordForTransport(password);
	const passwordSalt = passwordHash.split(':')[0];

	// Compute keys hash
	const keysHash = await computeKeysHash(apiKeys as ApiKeys, profile.providerSelections as ProviderSelections);

	// Upload to server
	await fetchJson(`${BASE}/api/profile/create`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			id: session.profileId,
			name: profile.name,
			password_hash: passwordHash,
			encrypted_api_key: encryptedApiKey,
			salt,
			keys_hash: keysHash,
			languages: profile.languages,
			frameworks: profile.frameworks,
			tools: profile.tools,
			topics: profile.topics,
			depth: profile.depth,
			custom_focus: profile.customFocus
		})
	});

	// Update session with sync credentials
	saveSession({
		profileId: session.profileId,
		password,
		passwordSalt,
		salt
	});

	process.stderr.write(`\n  ${GREEN}✓${RESET} Profile shared to difflog.dev\n`);
	process.stderr.write(`  ${DIM}You can now sync with \`difflog login\` on other machines.${RESET}\n\n`);
}

async function passwordCommand(session: Session): Promise<void> {
	if (!canSync()) {
		process.stderr.write('Profile is not shared. Run `difflog profile share` first.\n');
		process.exit(1);
	}

	const profile = getProfile();
	if (!profile) {
		process.stderr.write('No profile data found.\n');
		process.exit(1);
	}

	// Verify current password
	const currentPassword = await prompt('  Current password: ', true);
	if (currentPassword !== session.password) {
		process.stderr.write('Incorrect password.\n');
		process.exit(1);
	}

	// Prompt for new password
	const newPassword = await prompt('  New password: ', true);
	if (!newPassword) {
		process.stderr.write('Password is required.\n');
		process.exit(1);
	}

	const confirm = await prompt('  Confirm new password: ', true);
	if (newPassword !== confirm) {
		process.stderr.write('Passwords do not match.\n');
		process.exit(1);
	}

	process.stderr.write('\n  Updating password...\n');

	// Generate new encryption salt
	const newSaltBytes = crypto.getRandomValues(new Uint8Array(16));
	const newSalt = uint8ToBase64(newSaltBytes);

	// Hash old password with existing salt for server verification
	const oldPasswordHash = await hashPasswordForTransport(session.password, session.passwordSalt);

	// Hash new password (generates new password salt)
	const newPasswordHash = await hashPasswordForTransport(newPassword);
	const newPasswordSalt = newPasswordHash.split(':')[0];

	// Re-encrypt API keys blob with new password + new salt
	const apiKeys = await getApiKeys();
	const blob: EncryptedKeysBlob = {
		apiKeys,
		providerSelections: profile.providerSelections as ProviderSelections
	};
	const newEncryptedApiKey = await encryptData(blob, newPassword, newSalt);

	// Re-encrypt all local diffs with new password + new salt
	const diffs = getDiffs();
	const encryptedDiffs: { id: string; encrypted_data: string }[] = [];
	for (const diff of diffs) {
		const encrypted = await encryptData(diff, newPassword, newSalt);
		encryptedDiffs.push({ id: diff.id, encrypted_data: encrypted });
	}

	// POST to server
	await fetchJson(`${BASE}/api/profile/${session.profileId}/password`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			old_password_hash: oldPasswordHash,
			new_password_hash: newPasswordHash,
			new_encrypted_api_key: newEncryptedApiKey,
			new_salt: newSalt,
			diffs: encryptedDiffs,
			stars: []
		})
	});

	// Update session with new credentials
	saveSession({
		profileId: session.profileId,
		password: newPassword,
		passwordSalt: newPasswordSalt,
		salt: newSalt
	});

	process.stderr.write(`\n  ${GREEN}✓${RESET} Password updated\n`);
	process.stderr.write(`  ${DIM}Use the new password when logging in on other machines.${RESET}\n\n`);
}

async function unshareCommand(session: Session): Promise<void> {
	if (!canSync()) {
		process.stderr.write('Profile is not shared.\n');
		process.exit(1);
	}

	// Confirm destructive action
	const answer = await prompt(`  ${RED}Delete profile from server?${RESET} This cannot be undone. [y/N] `);
	if (answer.toLowerCase() !== 'y') {
		process.stderr.write('Cancelled.\n');
		return;
	}

	process.stderr.write('\n  Removing from server...\n');

	// Hash password for auth
	const passwordHash = await hashPasswordForTransport(session.password, session.passwordSalt);

	// DELETE from server
	await fetchJson(`${BASE}/api/profile/${session.profileId}?password_hash=${encodeURIComponent(passwordHash)}`, {
		method: 'DELETE'
	});

	// Revert session to local-only
	saveSession({
		profileId: session.profileId,
		password: '',
		passwordSalt: '',
		salt: ''
	});

	// Clear sync artifacts
	clearPendingChanges();
	saveSyncMeta({});

	process.stderr.write(`\n  ${GREEN}✓${RESET} Profile removed from server\n`);
	process.stderr.write(`  ${DIM}Your local profile and diffs are still here.${RESET}\n`);
	process.stderr.write(`  ${DIM}Run \`difflog profile share\` to re-share.${RESET}\n\n`);
}

export async function profileCommand(args: string[]): Promise<void> {
	const session = getSession();
	if (!session) {
		process.stderr.write('No profile found. Run: difflog config\n');
		process.exit(1);
	}

	switch (args[0]) {
		case undefined:
			return showInfo(session);
		case 'share':
			return shareCommand(session);
		case 'password':
			return passwordCommand(session);
		case 'unshare':
			return unshareCommand(session);
		default:
			process.stderr.write(`Unknown subcommand: ${args[0]}\n`);
			process.stderr.write('Usage: difflog profile [share|password|unshare]\n');
			process.exit(1);
	}
}
