#!/usr/bin/env bun

import { getSession, getDiffs } from './config';
import { loginCommand } from './commands/login';
import { lsCommand } from './commands/ls';
import { showCommand } from './commands/show';

const VERSION = '0.1.0';

const HELP = `difflog — developer intelligence diffs in your terminal

Usage:
  difflog                    Show latest diff (or login if not authenticated)
  difflog login              Log in via browser (opens difflog.dev)
  difflog ls                 List cached diffs
  difflog show <n|id>        Show a diff by index or UUID prefix

Options:
  --help, -h                 Show this help
  --version, -v              Show version

Login flags:
  --profile <id>             Profile ID (skip browser login)
  --password <pw>            Password (skip browser login)
  --no-browser               Print URL only, don't open browser

Show flags:
  --full, -f                 Full output mode (disable interactive navigation)

Examples:
  difflog                    # Smart default: login or show latest
  difflog login
  difflog login --no-browser
  difflog login --profile UUID --password PW
  difflog ls
  difflog show 1             # Interactive mode (if TTY)
  difflog show 1 --full      # Full output mode
  difflog show 1 | less -R   # Auto-detects pipe (full mode)
`;

const args = process.argv.slice(2);
const command = args[0];

if (command === '--help' || command === '-h') {
	process.stdout.write(HELP);
	process.exit(0);
}

if (command === '--version' || command === '-v') {
	process.stdout.write(`difflog ${VERSION}\n`);
	process.exit(0);
}

// No command provided: smart default
if (!command) {
	const session = getSession();
	if (!session) {
		// No session: send to login
		process.stderr.write('Not logged in. Starting login flow...\n\n');
		loginCommand([]).catch((err) => {
			process.stderr.write(`Error: ${err.message}\n`);
			process.exit(1);
		});
		// loginCommand is async, so we don't exit here
	} else {
		// Has session: show most recent diff
		const diffs = getDiffs();
		if (diffs.length === 0) {
			process.stderr.write('No diffs found. Generate one at difflog.dev or run: difflog login\n');
			process.exit(1);
		}
		// Show the first diff (most recent)
		// Don't call process.exit() here - let interactive mode keep running
		showCommand(['1']);
	}
} else {

	switch (command) {
		case 'login':
			loginCommand(args.slice(1)).catch((err) => {
				process.stderr.write(`Error: ${err.message}\n`);
				process.exit(1);
			});
			break;

		case 'ls':
			lsCommand();
			break;

		case 'show':
			showCommand(args.slice(1));
			break;

		default:
			process.stderr.write(`Unknown command: ${command}\n`);
			process.stderr.write('Run difflog --help for usage.\n');
			process.exit(1);
	}
}
