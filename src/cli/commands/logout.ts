import { getProfile, clearAll } from '../config';
import { deletePassword } from 'cross-keychain';

const SERVICE_NAME = 'difflog-cli';
const PROVIDERS = ['anthropic', 'serper', 'perplexity', 'deepseek', 'gemini'] as const;

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const BRIGHT_YELLOW = '\x1b[93m';

async function confirm(message: string): Promise<boolean> {
	process.stdout.write(`${message} [y/N] `);
	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (key: string) => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
			process.stdout.write(key + '\n');
			resolve(key === 'y' || key === 'Y');
		};

		process.stdin.on('data', onData);
	});
}

export async function logoutCommand(): Promise<void> {
	const profile = getProfile();
	if (!profile) {
		process.stderr.write('No profile found. Nothing to remove.\n');
		process.exit(0);
	}

	process.stdout.write(`${BRIGHT_YELLOW}!${RESET} This will remove:\n`);
	process.stdout.write(`  • Profile "${profile.name}"\n`);
	process.stdout.write(`  • All cached diffs\n`);
	process.stdout.write(`  • All API keys from OS keychain\n\n`);

	const ok = await confirm('Continue?');
	if (!ok) {
		process.stdout.write(`${DIM}Cancelled${RESET}\n`);
		process.exit(0);
	}

	// Remove API keys from OS keychain
	for (const provider of PROVIDERS) {
		try {
			await deletePassword(SERVICE_NAME, provider);
		} catch {
			// Key may not exist, that's fine
		}
	}

	// Remove all local config files
	clearAll();

	process.stdout.write(`${GREEN}✓${RESET} Profile, diffs, and API keys removed.\n`);
	process.stdout.write(`${DIM}Run 'difflog login' or 'difflog config' to set up again.${RESET}\n`);
}
