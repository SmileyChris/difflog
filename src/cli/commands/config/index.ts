import { getProfile, saveProfile, trackProfileModified } from '../../config';
import type { GenerationDepth } from '../../../lib/utils/constants';
import { showTopics, handleTopics } from './topics';
import { showAiConfig, handleAi } from './ai';
import { runInteractiveWizard } from './interactive';
import { syncUpload } from '../../sync';
import { RESET, DIM, BOLD, CYAN, GREEN, BRIGHT_YELLOW, BIN, showHelp } from '../../ui';

export function formatAiConfig(providerSelections: any): string {
	if (!providerSelections) return `${BRIGHT_YELLOW}curation unset, synthesis unset${RESET}`;

	const parts: string[] = [];
	const providerGroups: Record<string, string[]> = {};

	// Group by provider
	if (providerSelections.search) {
		if (!providerGroups[providerSelections.search]) {
			providerGroups[providerSelections.search] = [];
		}
		providerGroups[providerSelections.search].push('search');
	}

	if (providerSelections.curation) {
		if (!providerGroups[providerSelections.curation]) {
			providerGroups[providerSelections.curation] = [];
		}
		providerGroups[providerSelections.curation].push('curation');
	}

	if (providerSelections.synthesis) {
		if (!providerGroups[providerSelections.synthesis]) {
			providerGroups[providerSelections.synthesis] = [];
		}
		providerGroups[providerSelections.synthesis].push('synthesis');
	}

	// Add provider groups: "Anthropic (curation, synthesis)"
	for (const [provider, caps] of Object.entries(providerGroups)) {
		parts.push(`${provider} (${caps.join(', ')})`);
	}

	// Add unset warnings for required capabilities
	if (!providerSelections.curation) {
		parts.push(`${BRIGHT_YELLOW}curation unset${RESET}${DIM}`);
	}
	if (!providerSelections.synthesis) {
		parts.push(`${BRIGHT_YELLOW}synthesis unset${RESET}${DIM}`);
	}

	return parts.length > 0 ? parts.join(', ') : `${DIM}none${RESET}`;
}

function clearScreen() {
	process.stdout.write('\x1b[2J\x1b[H');
}

function hideCursor() {
	process.stdout.write('\x1b[?25l');
}

function showCursor() {
	process.stdout.write('\x1b[?25h');
}

/** Read a line from stdin */
async function readLine(prompt: string, mask = false): Promise<string> {
	process.stdout.write(prompt);

	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		const line = typeof value === 'string' ? value : new TextDecoder().decode(value);
		return line.trimEnd();
	}

	showCursor();
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
				hideCursor();
				resolve(buf.join(''));
			} else if (ch === '\x03') {
				process.stdin.setRawMode(false);
				showCursor();
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

/** Read a single keypress */
async function readKey(): Promise<string> {
	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		return typeof value === 'string' ? value : new TextDecoder().decode(value);
	}

	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (key: string) => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
			resolve(key);
		};

		process.stdin.on('data', onData);
	});
}

async function showStatus(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	clearScreen();

	// Title
	process.stdout.write(`${BOLD}${GREEN}Profile Configuration${RESET}\n\n`);
	process.stdout.write(`${DIM}Profile:${RESET} ${profile.name}\n\n`);

	// Provider selections
	process.stdout.write(`${DIM}AI:${RESET} ${formatAiConfig(profile.providerSelections)}\n\n`);

	// Depth
	process.stdout.write(`${DIM}Depth:${RESET} ${profile.depth || 'standard'}\n\n`);

	// Show topics
	await showTopics();

	// Show AI config
	await showAiConfig();
}

async function editName(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	clearScreen();
	process.stdout.write(`${BOLD}${GREEN}Edit Profile Name${RESET}\n\n`);
	process.stdout.write(`${DIM}Current:${RESET} ${profile.name}\n\n`);

	const name = await readLine(`${CYAN}New name:${RESET} `);
	if (name) {
		saveProfile({ ...profile, name });
		trackProfileModified();
		await syncUpload();
		clearScreen();
		process.stdout.write(`${GREEN}✓${RESET} Name updated to: ${BOLD}${name}${RESET}\n\n`);
		process.stdout.write(`${DIM}Press any key to continue...${RESET}`);
		await readKey();
	}
}

async function editDepth(depth?: string): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	// If depth provided as argument, use it
	if (depth) {
		if (['quick', 'standard', 'detailed'].includes(depth)) {
			saveProfile({ ...profile, depth: depth as GenerationDepth });
			trackProfileModified();
			await syncUpload();
			process.stdout.write(`${GREEN}✓${RESET} Depth set to: ${BOLD}${depth}${RESET}\n`);
		} else {
			process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Invalid depth. Use: quick, standard, or detailed\n`);
		}
		return;
	}

	// Interactive depth selection
	clearScreen();
	process.stdout.write(`${BOLD}${GREEN}Generation Depth${RESET}\n\n`);
	process.stdout.write(`${DIM}Current:${RESET} ${profile.depth || 'standard'}\n\n`);

	const depths: GenerationDepth[] = ['quick', 'standard', 'detailed'];
	let selected = depths.indexOf(profile.depth || 'standard');

	hideCursor();

	const render = () => {
		clearScreen();
		process.stdout.write(`${BOLD}${GREEN}Generation Depth${RESET}\n\n`);
		process.stdout.write(`${DIM}Use ↑/↓ or j/k to select, Enter to confirm, q to cancel${RESET}\n\n`);

		for (let i = 0; i < depths.length; i++) {
			const marker = i === selected ? `${CYAN}▸${RESET}` : ' ';
			const label = i === selected ? `${BOLD}${depths[i]}${RESET}` : depths[i];
			process.stdout.write(`${marker} ${label}\n`);
		}
	};

	render();

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			// Up
			selected = Math.max(0, selected - 1);
			render();
		} else if (key === '\u001b[B' || key === 'j') {
			// Down
			selected = Math.min(depths.length - 1, selected + 1);
			render();
		} else if (key === '\r' || key === '\n') {
			// Enter
			saveProfile({ ...profile, depth: depths[selected] });
			trackProfileModified();
			await syncUpload();
			clearScreen();
			process.stdout.write(`${GREEN}✓${RESET} Depth set to: ${BOLD}${depths[selected]}${RESET}\n\n`);
			process.stdout.write(`${DIM}Press any key to continue...${RESET}`);
			showCursor();
			await readKey();
			hideCursor();
			break;
		} else if (key === 'q' || key === '\u001b') {
			// Quit/Escape
			break;
		} else if (key === '\u0003') {
			// Ctrl+C
			showCursor();
			process.exit(130);
		}
	}
}


export async function configCommand(args: string[]): Promise<void> {
	showHelp(args, `Configure your profile, topics, and AI providers

Usage: ${BIN} config [command]

Commands:
  ${BIN} config                                Interactive wizard
  ${BIN} config name                           Edit profile name
  ${BIN} config depth [quick|standard|detailed]  Set generation depth
  ${BIN} config topics add <category> <items...>    Add languages/frameworks/tools/topics
  ${BIN} config topics rm <category> <items...>     Remove items
  ${BIN} config topics focus <string|none>     Set custom focus
  ${BIN} config ai                             Show AI configuration
  ${BIN} config ai key add <provider> <key>    Add API key
  ${BIN} config ai key rm <provider>           Remove API key
  ${BIN} config ai set <search> <curation> <synthesis>  Set providers

Examples:
  ${BIN} config                      # Interactive wizard
  ${BIN} config name "My Profile"    # Edit name
  ${BIN} config depth standard       # Set depth
  ${BIN} config topics add languages rust go
  ${BIN} config ai key add anthropic sk-ant-...
`);

	let profile = getProfile();

	// If no profile exists, create one
	if (!profile) {
		clearScreen();
		process.stdout.write(`${BOLD}${GREEN}Create Profile${RESET}\n\n`);

		const name = await readLine(`${CYAN}Profile name:${RESET} `);
		if (!name) {
			process.stderr.write(`\n${BRIGHT_YELLOW}!${RESET} Profile name is required\n`);
			process.exit(1);
		}

		// Generate profile ID
		const { randomBytes } = await import('crypto');
		const profileId = randomBytes(16).toString('hex');

		// Create minimal profile
		profile = {
			id: profileId,
			name,
			languages: [],
			frameworks: [],
			tools: [],
			topics: [],
			customFocus: '',
			depth: 'standard' as const,
			providerSelections: {
				search: null,
				curation: null,
				synthesis: null
			}
		};

		// Create session (no password salt - this is a local-only profile)
		const { saveSession } = await import('../../config');
		saveSession({ profileId });
		saveProfile(profile);

		clearScreen();
		process.stdout.write(`${GREEN}✓${RESET} Profile created: ${BOLD}${name}${RESET}\n\n`);
		process.stdout.write(`${DIM}Press any key to continue...${RESET}`);
		await readKey();
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
			await runInteractiveWizard();
			return;
		default:
			process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Unknown subcommand: ${subcommand}\n`);
			process.stdout.write(`${DIM}Usage: ${BIN} config [name|depth|topics|ai]${RESET}\n`);
			process.exit(1);
	}
}
