import { getProfile, clearAll } from '../config';
import { deletePassword } from 'cross-keychain';
import { PROVIDER_IDS } from '../../lib/utils/providers';
import { RESET, DIM, GREEN, BRIGHT_YELLOW, SERVICE_NAME, BIN, showHelp } from '../ui';

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

export async function logoutCommand(args: string[]): Promise<void> {
	showHelp(args, `Remove profile, diffs, and API keys from this machine

Usage: ${BIN} logout
`);

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
	for (const provider of PROVIDER_IDS) {
		try {
			await deletePassword(SERVICE_NAME, provider);
		} catch {
			// Key may not exist, that's fine
		}
	}

	// Remove all local config files
	clearAll();

	process.stdout.write(`${GREEN}✓${RESET} Profile, diffs, and API keys removed.\n`);
	process.stdout.write(`${DIM}Run '${BIN} login' or '${BIN} config' to set up again.${RESET}\n`);
}
