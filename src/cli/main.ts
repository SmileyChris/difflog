#!/usr/bin/env bun

import { getSession, getDiffs } from './config';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { lsCommand } from './commands/ls';
import { showCommand } from './commands/show';
import { archiveCommand } from './commands/archive';
import { generateCommand } from './commands/generate';
import { configCommand } from './commands/config/index';
import { profileCommand } from './commands/profile';
import { canSync, download } from './sync';
import { BIN } from './ui';
import pkg from '../../package.json';

const VERSION = pkg.cliVersion;

const HELP = `difflog — developer intelligence diffs in your terminal

Usage:
  ${BIN}                    Show latest diff (or login if not authenticated)
  ${BIN} generate           Generate a new diff
  ${BIN} config             Interactive configuration wizard
  ${BIN} login              Log in via browser (opens difflog.dev)
  ${BIN} logout             Remove profile, diffs, and API keys
  ${BIN} profile            Show profile info and sync status
  ${BIN} archive            Browse all diffs and stars
  ${BIN} ls                 List cached diffs
  ${BIN} show <n|id>        Show a diff by index or UUID prefix

Options:
  -h, --help                 Show help (also works per command)
  -v, --version              Show version
`;

const args = process.argv.slice(2);
const command = args[0];

if (command === '--help' || command === '-h') {
	process.stdout.write(HELP);
	process.exit(0);
}

if (command === '--version' || command === '-v') {
	process.stdout.write(`${BIN} ${VERSION}\n`);
	process.exit(0);
}

// No command provided: smart default
if (!command) {
	const session = getSession();
	if (!session) {
		// No session: show options
		process.stderr.write('No profile found.\n\n');
		process.stderr.write('Get started:\n');
		process.stderr.write(`  ${BIN} config  — Create a new profile\n`);
		process.stderr.write(`  ${BIN} login   — Import profile from difflog.dev\n`);
		process.exit(1);
	} else {
		// Has session: sync down then show most recent diff
		if (canSync()) {
			try {
				const { downloaded } = await download(session);
				if (downloaded > 0) process.stderr.write(`Synced ${downloaded} new diff(s)\n`);
			} catch { /* silent */ }
		}

		let diffs = getDiffs();
		if (diffs.length === 0) {
			process.stderr.write(`No diffs found. Run: ${BIN} generate\n`);
			process.exit(1);
		}

		// Main navigation loop: show ↔ archive ↔ generate
		let action: string = 'show';
		let showArg = '1';
		let lastShowArg = '1';
		let showTopicIndex: number | undefined;

		loop: while (true) {
			switch (action) {
				case 'show': {
					lastShowArg = showArg;
					const result = await showCommand([showArg], showTopicIndex);
					showArg = lastShowArg; // preserve for back navigation
					showTopicIndex = undefined;
					if (result === 'generate') { action = 'generate'; continue; }
					if (result === 'archive') { action = 'archive'; continue; }
					break loop;
				}
				case 'archive': {
					const result = await archiveCommand();
					if (result.action === 'back') { action = 'show'; continue; }
					if (result.action === 'open-diff') {
						showArg = String(result.diffIndex);
						showTopicIndex = result.topicIndex;
						action = 'show';
						continue;
					}
					if (result.action === 'generate') { action = 'generate'; continue; }
					break loop;
				}
				case 'generate': {
					const result = await generateCommand([]);
					if (result === 'quit') break loop;
					diffs = getDiffs();
					if (diffs.length === 0) break loop;
					action = 'show';
					continue;
				}
				default:
					break loop;
			}
		}
		process.exit(0);
	}
} else {

	const subArgs = args.slice(1);

	try {
		switch (command) {
			case 'login':
				await loginCommand(subArgs);
				break;

			case 'logout':
				await logoutCommand(subArgs);
				break;

			case 'generate':
				await generateCommand(subArgs);
				break;

			case 'config':
				await configCommand(subArgs);
				break;

			case 'profile':
				await profileCommand(subArgs);
				break;

			case 'archive':
				await archiveCommand();
				break;

			case 'ls':
				lsCommand(subArgs);
				break;

			case 'show':
				await showCommand(subArgs);
				break;

			default:
				process.stderr.write(`Unknown command: ${command}\n`);
				process.stderr.write(`Run ${BIN} --help for usage.\n`);
				process.exit(1);
		}
	} catch (err) {
		process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exit(1);
	}
}
