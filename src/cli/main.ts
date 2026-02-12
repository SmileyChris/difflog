#!/usr/bin/env bun

import { getSession, getDiffs } from './config';
import { loginCommand } from './commands/login';
import { lsCommand } from './commands/ls';
import { showCommand } from './commands/show';
import { generateCommand } from './commands/generate';
import { configCommand } from './commands/config/index';

const VERSION = '0.1.0';

const HELP = `difflog — developer intelligence diffs in your terminal

Usage:
  difflog                    Show latest diff (or login if not authenticated)
  difflog config             Interactive configuration wizard (creates profile if needed)
  difflog login              Log in via browser (opens difflog.dev)
  difflog generate           Generate a new diff
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

Config commands:
  difflog config                                Interactive wizard (matches order below)
  difflog config name                           Edit profile name
  difflog config depth [quick|standard|detailed]  Set generation depth
  difflog config topics add <category> <items...>    Add languages/frameworks/tools/topics
  difflog config topics rm <category> <items...>     Remove items
  difflog config topics focus <string|none>     Set custom focus
  difflog config ai                             Show AI configuration
  difflog config ai key add <provider> <key>    Add API key
  difflog config ai key rm <provider>           Remove API key
  difflog config ai set <search> <curation> <synthesis>  Set providers

Examples:
  difflog config                      # Interactive wizard: name → depth → topics → AI
  difflog login                       # Login from web
  difflog config name "My Profile"    # Edit name
  difflog config depth standard       # Set depth
  difflog config topics add languages rust go
  difflog config topics add frameworks svelte next.js
  difflog config topics focus "cloud native development"
  difflog config ai key add anthropic sk-ant-...
  difflog generate                    # Generate new diff
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
		// No session: show options
		process.stderr.write('No profile found.\n\n');
		process.stderr.write('Get started:\n');
		process.stderr.write('  difflog config  — Create a new profile\n');
		process.stderr.write('  difflog login   — Import profile from difflog.dev\n');
		process.exit(1);
	} else {
		// Has session: show most recent diff
		const diffs = getDiffs();
		if (diffs.length === 0) {
			process.stderr.write('No diffs found. Run: difflog generate\n');
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

		case 'generate':
			generateCommand().catch((err) => {
				process.stderr.write(`Error: ${err.message}\n`);
				process.exit(1);
			});
			break;

		case 'config':
			configCommand(args.slice(1)).catch((err) => {
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
