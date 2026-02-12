import { getProfile, saveProfile } from '../../config';
import type { GenerationDepth } from '../../../lib/utils/constants';
import { showTopics, handleTopics } from './topics';
import { showAiConfig, handleAi } from './ai';

/** Read a line from stdin */
async function readLine(prompt: string, mask = false): Promise<string> {
	process.stdout.write(prompt);

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
				process.stdout.write('\n');
				resolve(buf.join(''));
			} else if (ch === '\x03') {
				process.stdin.setRawMode(false);
				process.stdout.write('\n');
				process.exit(130);
			} else if (ch === '\x7f' || ch === '\b') {
				if (buf.length > 0) {
					buf.pop();
					if (!mask) process.stdout.write('\b \b');
				}
			} else {
				buf.push(ch);
				process.stdout.write(mask ? '*' : ch);
			}
		};

		process.stdin.on('data', onData);
	});
}

async function showStatus(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	process.stdout.write('\n');
	process.stdout.write(`Profile: ${profile.name}\n`);
	process.stdout.write('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n');

	// Show depth
	process.stdout.write(`Depth: ${profile.depth || 'standard'}\n\n`);

	// Show topics
	await showTopics();

	// Show AI config
	await showAiConfig();
}

async function editName(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	const name = await readLine(`Name [${profile.name}]: `);
	if (name) {
		saveProfile({ ...profile, name });
		process.stdout.write('✓ Name updated\n');
	}
}

async function editDepth(depth?: string): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	// If depth provided as argument, use it
	if (depth) {
		if (['quick', 'standard', 'detailed'].includes(depth)) {
			saveProfile({ ...profile, depth: depth as GenerationDepth });
			process.stdout.write(`✓ Depth set to: ${depth}\n`);
		} else {
			process.stdout.write('Invalid depth. Use: quick, standard, or detailed\n');
		}
		return;
	}

	// Otherwise show current
	process.stdout.write(`Current depth: ${profile.depth || 'standard'}\n`);
}

async function runWizard(): Promise<void> {
	while (true) {
		await showStatus();

		process.stdout.write('[N]ame  [D]epth  [T]opics  [A]I  [Q]uit\n');
		const choice = await readLine('> ');

		if (!choice || choice.toLowerCase() === 'q') {
			process.stdout.write('Goodbye!\n');
			break;
		}

		switch (choice.toLowerCase()) {
			case 'n':
				await editName();
				break;
			case 'd':
				await editDepth();
				break;
			case 't':
				await handleTopics([]);
				break;
			case 'a':
				await handleAi([]);
				break;
			default:
				process.stdout.write('Invalid choice\n');
		}
	}
}

export async function configCommand(args: string[]): Promise<void> {
	const profile = getProfile();
	if (!profile) {
		process.stdout.write('No profile found. Run: difflog login\n');
		process.exit(1);
	}

	const subcommand = args[0];

	// Handle subcommands
	switch (subcommand) {
		case 'name':
			await editName();
			return;
		case 'depth':
			await editDepth(args[1]);
			return;
		case 'topics':
			await handleTopics(args.slice(1));
			return;
		case 'ai':
			await handleAi(args.slice(1));
			return;
		case undefined:
			// No subcommand: run full wizard
			await runWizard();
			return;
		default:
			process.stdout.write(`Unknown subcommand: ${subcommand}\n`);
			process.stdout.write('Usage: difflog config [name|depth|topics|ai]\n');
			process.exit(1);
	}
}
