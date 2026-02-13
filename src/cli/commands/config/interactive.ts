import { getProfile, saveProfile, trackProfileModified, trackKeysModified } from '../../config';
import type { GenerationDepth } from '../../../lib/utils/constants';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import { estimateDiffCost } from '../../../lib/utils/pricing';
import { formatAiConfig } from './index';
import { syncUpload } from '../../sync';
import { PROVIDER_IDS } from '../../../lib/utils/providers';
import { RESET, DIM, BOLD, CYAN, GREEN, BRIGHT_YELLOW, SERVICE_NAME } from '../../ui';

const PROVIDERS = PROVIDER_IDS;
type Provider = (typeof PROVIDERS)[number];

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
async function readLine(prompt: string): Promise<string | null> {
	process.stdout.write(prompt);
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
			} else if (ch === '\x03' || ch === '\x1b') {
				// Ctrl+C or Esc - cancel input
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.removeListener('data', onData);
				process.stdout.write('\n');
				hideCursor();
				resolve(null);
			} else if (ch === '\x7f' || ch === '\b') {
				if (buf.length > 0) {
					buf.pop();
					process.stdout.write('\b \b');
				}
			} else {
				buf.push(ch);
				process.stdout.write(ch);
			}
		};

		process.stdin.on('data', onData);
	});
}

/** Read a single keypress */
async function readKey(): Promise<string> {
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

type Section = 'name' | 'ai' | 'languages' | 'frameworks' | 'tools' | 'topics' | 'depth';

const SECTION_LABELS: Record<Section, string> = {
	name: 'Profile Name',
	ai: 'AI Configuration',
	languages: 'Languages',
	frameworks: 'Frameworks',
	tools: 'Tools',
	topics: 'Topics',
	depth: 'Depth & Focus'
};

// Predefined options for each category
const LANGUAGE_OPTIONS = ['TypeScript', 'JavaScript', 'Python', 'Go', 'Rust', 'Java', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin'];
const FRAMEWORK_OPTIONS = ['React', 'Vue', 'Svelte', 'Angular', 'Next.js', 'Nuxt', 'SvelteKit', 'Astro', 'Node.js', 'Express', 'FastAPI', 'Django', 'Rails'];
const TOOL_OPTIONS = ['Docker', 'Kubernetes', 'Git', 'GitHub Actions', 'Terraform', 'AWS', 'GCP', 'Azure', 'PostgreSQL', 'Redis', 'Nginx'];
const TOPIC_OPTIONS = ['AI/ML', 'DevOps', 'Security', 'Testing', 'Performance', 'Databases', 'APIs', 'WebAssembly', 'Serverless', 'Blockchain'];

async function getConfiguredKeys(): Promise<Set<Provider>> {
	const configured = new Set<Provider>();
	for (const provider of PROVIDERS) {
		try {
			const key = await getPassword(SERVICE_NAME, provider);
			if (key) configured.add(provider);
		} catch {
			// Not configured
		}
	}
	return configured;
}

function renderMainMenu(selectedSection: number, profile: any) {
	clearScreen();

	process.stdout.write(`${BOLD}${GREEN}Profile Configuration${RESET}\n\n`);
	process.stdout.write(`${DIM}Use ↑/↓ to navigate, Enter to edit, Esc to quit${RESET}\n\n`);

	const sections: Section[] = ['name', 'ai', 'languages', 'frameworks', 'tools', 'topics', 'depth'];

	for (let i = 0; i < sections.length; i++) {
		const section = sections[i];
		const marker = i === selectedSection ? `${CYAN}▸${RESET}` : ' ';
		const label = i === selectedSection ? `${BOLD}${SECTION_LABELS[section]}${RESET}` : `${SECTION_LABELS[section]}`;

		let value = '';
		switch (section) {
			case 'name':
				value = profile.name;
				break;
			case 'ai':
				value = formatAiConfig(profile.providerSelections);
				break;
			case 'languages':
				value = profile.languages?.length ? profile.languages.join(', ') : `${DIM}none${RESET}`;
				break;
			case 'frameworks':
				value = profile.frameworks?.length ? profile.frameworks.join(', ') : `${DIM}none${RESET}`;
				break;
			case 'tools':
				value = profile.tools?.length ? profile.tools.join(', ') : `${DIM}none${RESET}`;
				break;
			case 'topics':
				value = profile.topics?.length ? profile.topics.join(', ') : `${DIM}none${RESET}`;
				break;
			case 'depth':
				const depthVal = profile.depth || 'standard';
				const focusVal = profile.customFocus ? ` • ${profile.customFocus}` : '';
				value = depthVal + focusVal;
				break;
		}

		process.stdout.write(`${marker} ${label}\n`);
		process.stdout.write(`  ${DIM}${value}${RESET}\n\n`);
	}
}

async function editName(profile: any): Promise<any> {
	clearScreen();
	process.stdout.write(`${BOLD}${GREEN}Edit Profile Name${RESET}\n\n`);
	process.stdout.write(`${DIM}Current:${RESET} ${profile.name}\n\n`);
	process.stdout.write(`${DIM}Press Esc or Ctrl+C to cancel${RESET}\n\n`);

	const name = await readLine(`${CYAN}New name:${RESET} `);
	if (name === null) {
		// Cancelled
		return profile;
	}
	if (name) {
		return { ...profile, name };
	}
	return profile;
}

async function editDepth(profile: any): Promise<any> {
	const depths: GenerationDepth[] = ['quick', 'standard', 'detailed'];
	let selectedDepth = depths.indexOf(profile.depth || 'standard');  // Current selection (◉)
	let cursorPosition = selectedDepth;  // Cursor position (▸)
	let tempFocus = profile.customFocus || '';

	const DEPTH_DESCRIPTIONS: Record<GenerationDepth, string> = {
		quick: 'Brief overview, faster generation',
		standard: 'Balanced depth and detail',
		detailed: 'Comprehensive coverage, longer'
	};

	const render = () => {
		clearScreen();
		process.stdout.write(`${BOLD}${GREEN}Depth & Focus${RESET}\n\n`);
		process.stdout.write(`${DIM}↑/↓ navigate • Space to select • Enter to edit focus • Esc to go back${RESET}\n\n`);

		process.stdout.write(`${DIM}Generation depth:${RESET}\n`);
		for (let i = 0; i < depths.length; i++) {
			const isSelected = i === selectedDepth;
			const isCursor = i === cursorPosition;
			const marker = isCursor ? `${CYAN}▸${RESET}` : ' ';
			const checkbox = isSelected ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
			const label = isCursor ? `${BOLD}${depths[i]}${RESET}` : depths[i];
			const desc = `${DIM}${DEPTH_DESCRIPTIONS[depths[i]]}${RESET}`;
			process.stdout.write(`${marker} ${checkbox} ${label}\n`);
			process.stdout.write(`   ${desc}\n`);
		}

		process.stdout.write(`\n${DIM}Custom focus:${RESET} ${tempFocus || `${DIM}none${RESET}`}\n`);
	};

	render();

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			// Up
			cursorPosition = Math.max(0, cursorPosition - 1);
			render();
		} else if (key === '\u001b[B' || key === 'j') {
			// Down
			cursorPosition = Math.min(depths.length - 1, cursorPosition + 1);
			render();
		} else if (key === ' ') {
			// Space to select depth at cursor position
			selectedDepth = cursorPosition;
			render();
		} else if (key === '\r' || key === '\n') {
			// Enter to edit custom focus
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}Custom Focus${RESET}\n\n`);
			process.stdout.write(`${DIM}Current:${RESET} ${tempFocus || 'none'}\n\n`);
			process.stdout.write(`${DIM}Leave empty to clear, Esc to cancel${RESET}\n\n`);

			const newFocus = await readLine(`${CYAN}Focus:${RESET} `);
			if (newFocus !== null) {
				tempFocus = newFocus;
			}
			render();
		} else if (key === '\u001b' || key === '\u0003') {
			// Save and exit
			return {
				...profile,
				depth: depths[selectedDepth],
				customFocus: tempFocus
			};
		}
	}
}

async function editList(
	profile: any,
	category: 'languages' | 'frameworks' | 'tools' | 'topics',
	title: string,
	options: string[]
): Promise<any> {
	const current = new Set(profile[category] || []);

	// Find custom items (items in profile that aren't in predefined options)
	const customItems = Array.from(current).filter(item => !options.includes(item));

	// Build full list: predefined options + custom items
	const allOptions = [...options, ...customItems];
	let selectedIndex = 0;

	const render = () => {
		clearScreen();
		process.stdout.write(`${BOLD}${GREEN}${title}${RESET}\n\n`);
		process.stdout.write(`${DIM}Use ↑/↓ to navigate, Space to toggle, Enter to add custom, Esc to go back${RESET}\n\n`);

		for (let i = 0; i < allOptions.length; i++) {
			const option = allOptions[i];
			const isCustomItem = customItems.includes(option);
			const isSelected = current.has(option);
			const isCursor = i === selectedIndex;

			const marker = isCursor ? `${CYAN}▸${RESET}` : ' ';
			const checkbox = isSelected ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
			const displayLabel = isCustomItem ? `${option} ${DIM}(custom)${RESET}` : option;
			const label = isCursor ? `${BOLD}${displayLabel}${RESET}` : displayLabel;

			process.stdout.write(`${marker} ${checkbox} ${label}\n`);
		}
	};

	render();

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			selectedIndex = Math.max(0, selectedIndex - 1);
			render();
		} else if (key === '\u001b[B' || key === 'j') {
			selectedIndex = Math.min(allOptions.length - 1, selectedIndex + 1);
			render();
		} else if (key === ' ') {
			// Toggle selection
			const option = allOptions[selectedIndex];
			if (current.has(option)) {
				current.delete(option);
			} else {
				current.add(option);
			}
			render();
		} else if (key === '\r' || key === '\n') {
			// Add custom item
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}Add Custom ${title}${RESET}\n\n`);
			const custom = await readLine(`${CYAN}Enter item:${RESET} `);
			if (custom && custom.length > 0 && !allOptions.includes(custom)) {
				current.add(custom);
				customItems.push(custom);
				allOptions.push(custom);
				// Navigate to the newly added item
				selectedIndex = allOptions.length - 1;
			}
			render();
		} else if (key === '\u001b' || key === '\u0003') {
			// Esc - save and go back
			return { ...profile, [category]: Array.from(current) };
		}
	}
}

const PROVIDER_LABELS: Record<Provider, string> = {
	anthropic: 'Anthropic (Claude)',
	serper: 'Serper (web search)',
	perplexity: 'Perplexity',
	deepseek: 'DeepSeek',
	gemini: 'Google Gemini'
};

const PROVIDER_CAPABILITIES: Record<Provider, Array<'search' | 'curation' | 'synthesis'>> = {
	anthropic: ['search', 'curation', 'synthesis'],
	serper: ['search'],
	perplexity: ['search', 'curation', 'synthesis'],
	deepseek: ['curation', 'synthesis'],
	gemini: ['curation', 'synthesis']
};

const PROVIDER_URLS: Record<Provider, string> = {
	anthropic: 'https://console.anthropic.com/',
	serper: 'https://serper.dev/',
	perplexity: 'https://www.perplexity.ai/',
	deepseek: 'https://platform.deepseek.com/',
	gemini: 'https://ai.google.dev/'
};

async function editProviderKey(provider: Provider, hasKey: boolean): Promise<string | null> {
	clearScreen();
	process.stdout.write(`${BOLD}${GREEN}${PROVIDER_LABELS[provider]}${RESET}\n\n`);

	// Show capabilities
	const caps = PROVIDER_CAPABILITIES[provider];
	process.stdout.write(`${DIM}Can be used for:${RESET} ${caps.join(', ')}\n\n`);

	// Show current status
	if (hasKey) {
		process.stdout.write(`${GREEN}✓${RESET} Key configured\n\n`);
	} else {
		process.stdout.write(`${DIM}No key configured${RESET}\n\n`);
	}

	// Show link to get key
	process.stdout.write(`${DIM}Get API key:${RESET} ${CYAN}${PROVIDER_URLS[provider]}${RESET}\n\n`);
	process.stdout.write(`${DIM}Enter key (leave empty to cancel, or type 'remove' to delete)${RESET}\n\n`);

	const key = await readLine(`${CYAN}API Key:${RESET} `);

	if (key === null) {
		// Cancelled
		return null;
	}

	if (key.toLowerCase() === 'remove') {
		return hasKey ? '' : null;  // Empty string means remove (only if key exists)
	}

	if (!key) {
		// Empty input - no change
		return null;
	}

	return key;
}

async function editAi(profile: any): Promise<any> {
	let selectedProvider = 0;
	let selectedColumn = 0; // 0=search, 1=curation, 2=synthesis

	// Get configured keys from keychain
	const keys: Record<Provider, string | undefined> = {} as any;
	for (const provider of PROVIDERS) {
		try {
			keys[provider] = await getPassword(SERVICE_NAME, provider) || undefined;
		} catch {
			keys[provider] = undefined;
		}
	}

	const selections = profile.providerSelections || {
		search: null,
		curation: null,
		synthesis: null
	};

	const render = () => {
		clearScreen();
		process.stdout.write(`${BOLD}${GREEN}AI Configuration${RESET}\n\n`);
		process.stdout.write(`${DIM}↑/↓ navigate • ←/→ select column • Space to toggle • Enter to edit key • Esc to go back${RESET}\n\n`);

		// Cost estimate
		if (selections.curation && selections.synthesis) {
			const cost = estimateDiffCost({
				search: selections.search as any,
				curation: selections.curation as any,
				synthesis: selections.synthesis as any
			});
			const formatCost = (c: number) => c < 0.01 ? `$${c.toFixed(4)}` : `$${c.toFixed(2)}`;
			process.stdout.write(`${DIM}Est. cost per diff:${RESET} ${formatCost(cost.min)} – ${formatCost(cost.max)}\n\n`);
		}

		// Provider table with column selection
		const searchHeader = selectedColumn === 0 ? `${CYAN}${BOLD}Search${RESET}` : `${DIM}Search${RESET}`;
		const curationHeader = selectedColumn === 1 ? `${CYAN}${BOLD}Curation${RESET}` : `${DIM}Curation${RESET}`;
		const synthesisHeader = selectedColumn === 2 ? `${CYAN}${BOLD}Synthesis${RESET}` : `${DIM}Synthesis${RESET}`;

		process.stdout.write(`${DIM}Provider              Key    ${RESET}${searchHeader}  ${curationHeader}  ${synthesisHeader}\n`);
		process.stdout.write(`${DIM}────────────────────────────────────────────────────────${RESET}\n`);

		for (let i = 0; i < PROVIDERS.length; i++) {
			const provider = PROVIDERS[i];
			const marker = i === selectedProvider ? `${CYAN}▸${RESET}` : ' ';
			const label = i === selectedProvider ? `${BOLD}${PROVIDER_LABELS[provider]}${RESET}` : PROVIDER_LABELS[provider];
			const hasKey = keys[provider] ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`;

			const caps = PROVIDER_CAPABILITIES[provider];

			// Helper to check if cell is selected (row + column)
			const isSelected = (columnIndex: number) => i === selectedProvider && columnIndex === selectedColumn;

			const searchIcon = caps.includes('search')
				? (isSelected(0)
					? (selections.search === provider ? `${CYAN}●${RESET}` : keys[provider] ? `${CYAN}○${RESET}` : `${CYAN}·${RESET}`)
					: selections.search === provider ? `${GREEN}●${RESET}` : keys[provider] ? `${DIM}○${RESET}` : `${DIM}·${RESET}`)
				: isSelected(0) ? `${CYAN}·${RESET}` : ' ';
			const curationIcon = caps.includes('curation')
				? (isSelected(1)
					? (selections.curation === provider ? `${CYAN}●${RESET}` : keys[provider] ? `${CYAN}○${RESET}` : `${CYAN}·${RESET}`)
					: selections.curation === provider ? `${GREEN}●${RESET}` : keys[provider] ? `${DIM}○${RESET}` : `${DIM}·${RESET}`)
				: isSelected(1) ? `${CYAN}·${RESET}` : ' ';
			const synthesisIcon = caps.includes('synthesis')
				? (isSelected(2)
					? (selections.synthesis === provider ? `${CYAN}●${RESET}` : keys[provider] ? `${CYAN}○${RESET}` : `${CYAN}·${RESET}`)
					: selections.synthesis === provider ? `${GREEN}●${RESET}` : keys[provider] ? `${DIM}○${RESET}` : `${DIM}·${RESET}`)
				: isSelected(2) ? `${CYAN}·${RESET}` : ' ';

			// Pad provider name to 20 chars
			const paddedLabel = label.replace(/\x1b\[[0-9;]*m/g, '').padEnd(20);
			const labelWithColor = i === selectedProvider ? `${BOLD}${PROVIDER_LABELS[provider].padEnd(20)}${RESET}` : PROVIDER_LABELS[provider].padEnd(20);

			process.stdout.write(`${marker} ${labelWithColor}  ${hasKey}     ${searchIcon}       ${curationIcon}         ${synthesisIcon}\n`);
		}

		process.stdout.write(`\n${DIM}● = selected  ○ = available  · = needs key / not available${RESET}\n`);
	};

	render();

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			// Up
			selectedProvider = Math.max(0, selectedProvider - 1);
			render();
		} else if (key === '\u001b[B' || key === 'j') {
			// Down
			selectedProvider = Math.min(PROVIDERS.length - 1, selectedProvider + 1);
			render();
		} else if (key === '\u001b[C' || key === 'l') {
			// Right
			selectedColumn = Math.min(2, selectedColumn + 1);
			render();
		} else if (key === '\u001b[D' || key === 'h') {
			// Left
			selectedColumn = Math.max(0, selectedColumn - 1);
			render();
		} else if (key === ' ') {
			// Space - toggle selection in current column
			const provider = PROVIDERS[selectedProvider];
			const caps = PROVIDER_CAPABILITIES[provider];

			if (selectedColumn === 0 && caps.includes('search') && keys[provider]) {
				selections.search = selections.search === provider ? null : provider;
				render();
			} else if (selectedColumn === 1 && caps.includes('curation') && keys[provider]) {
				selections.curation = selections.curation === provider ? null : provider;
				render();
			} else if (selectedColumn === 2 && caps.includes('synthesis') && keys[provider]) {
				selections.synthesis = selections.synthesis === provider ? null : provider;
				render();
			}
		} else if (key === '\r' || key === '\n') {
			// Edit key
			const provider = PROVIDERS[selectedProvider];
			const newKey = await editProviderKey(provider, !!keys[provider]);

			if (newKey !== null) {
				if (newKey === '') {
					// Remove key
					await deletePassword(SERVICE_NAME, provider);
					keys[provider] = undefined;
					// Clear in-memory selections (persisted when wizard saves profile)
					if (selections.search === provider) selections.search = null;
					if (selections.curation === provider) selections.curation = null;
					if (selections.synthesis === provider) selections.synthesis = null;
				} else {
					// Save key
					await setPassword(SERVICE_NAME, provider, newKey);
					keys[provider] = newKey;

					// Auto-select for capabilities if not already set
					const caps = PROVIDER_CAPABILITIES[provider];
					if (caps.includes('search') && !selections.search) {
						selections.search = provider;
					}
					if (caps.includes('curation') && !selections.curation) {
						selections.curation = provider;
					}
					if (caps.includes('synthesis') && !selections.synthesis) {
						selections.synthesis = provider;
					}
				}
			}

			render();
		} else if (key === '\u001b' || key === '\u0003') {
			// Save and exit
			return { ...profile, providerSelections: selections };
		}
	}
}

async function quitConfirmation(hasChanges: boolean): Promise<'save' | 'discard' | 'cancel'> {
	if (!hasChanges) {
		return 'discard';
	}

	let selected = 0;
	const options = ['Save changes', 'Discard changes', 'Back to config'];

	const render = () => {
		clearScreen();
		process.stdout.write(`${BOLD}${BRIGHT_YELLOW}Unsaved Changes${RESET}\n\n`);
		process.stdout.write(`${DIM}You have unsaved changes. What would you like to do?${RESET}\n\n`);

		for (let i = 0; i < options.length; i++) {
			const marker = i === selected ? `${CYAN}▸${RESET}` : ' ';
			const label = i === selected ? `${BOLD}${options[i]}${RESET}` : options[i];
			process.stdout.write(`${marker} ${label}\n`);
		}

		process.stdout.write(`\n${DIM}Press Enter to select, Esc to go back${RESET}\n`);
	};

	render();

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			selected = Math.max(0, selected - 1);
			render();
		} else if (key === '\u001b[B' || key === 'j') {
			selected = Math.min(options.length - 1, selected + 1);
			render();
		} else if (key === '\r' || key === '\n') {
			if (selected === 0) return 'save';
			if (selected === 1) return 'discard';
			if (selected === 2) return 'cancel';
		} else if (key === '\u001b') {
			return 'cancel';
		} else if (key === '\u0003') {
			// Ctrl+C always discards
			return 'discard';
		}
	}
}

function hasProfileChanged(original: any, current: any): boolean {
	// Deep comparison
	return JSON.stringify(original) !== JSON.stringify(current);
}

export async function runInteractiveWizard(): Promise<void> {
	let profile = getProfile();
	if (!profile) {
		throw new Error('No profile found');
	}

	const originalProfile = JSON.parse(JSON.stringify(profile)); // Deep clone
	let selectedSection = 0;
	const sections: Section[] = ['name', 'ai', 'languages', 'frameworks', 'tools', 'topics', 'depth'];

	hideCursor();

	const cleanup = async (save: boolean, showMessage: boolean = true) => {
		showCursor();
		clearScreen();
		if (save) {
			const hasChanges = hasProfileChanged(originalProfile, profile);
			saveProfile(profile);
			if (hasChanges) {
				trackProfileModified();
				// Check if provider selections changed (implies keys blob needs re-sync)
				if (JSON.stringify(originalProfile.providerSelections) !== JSON.stringify(profile.providerSelections)) {
					trackKeysModified();
				}
				await syncUpload();
			}
			if (showMessage) {
				process.stdout.write(`${GREEN}✓${RESET} Configuration saved\n`);
			}
		} else {
			// Restore original profile
			saveProfile(originalProfile);
			if (showMessage) {
				const hasChanges = hasProfileChanged(originalProfile, profile);
				if (hasChanges) {
					process.stdout.write(`${BRIGHT_YELLOW}!${RESET} Changes discarded\n`);
				} else {
					process.stdout.write(`${DIM}No changes made${RESET}\n`);
				}
			}
		}
	};

	let running = true;

	// Handle Ctrl+C
	const sigintHandler = () => {
		cleanup(false, false);
		process.exit(0);
	};
	process.on('SIGINT', sigintHandler);

	try {
		while (running) {
			renderMainMenu(selectedSection, profile);

			const key = await readKey();

			if (key === '\u001b' || key === 'q') {
				// Escape or 'q' - check for changes
				const hasChanges = hasProfileChanged(originalProfile, profile);
				const decision = await quitConfirmation(hasChanges);

				if (decision === 'save') {
					await cleanup(true);
					running = false;
					break;
				} else if (decision === 'discard') {
					await cleanup(false);
					running = false;
					break;
				}
				// If 'cancel', just continue the loop and re-render
			} else if (key === '\u0003') {
				// Ctrl+C - always discard
				await cleanup(false, false);
				process.removeListener('SIGINT', sigintHandler);
				process.exit(0);
			} else if (key === '\u001b[A' || key === 'k') {
				// Up - cycle to bottom if at top
				selectedSection = selectedSection === 0 ? sections.length - 1 : selectedSection - 1;
			} else if (key === '\u001b[B' || key === 'j') {
				// Down - cycle to top if at bottom
				selectedSection = selectedSection === sections.length - 1 ? 0 : selectedSection + 1;
			} else if (key === '\r' || key === '\n') {
				const section = sections[selectedSection];

				switch (section) {
					case 'name':
						profile = await editName(profile);
						break;
					case 'ai':
						profile = await editAi(profile);
						break;
					case 'languages':
						profile = await editList(profile, 'languages', 'Languages', LANGUAGE_OPTIONS);
						break;
					case 'frameworks':
						profile = await editList(profile, 'frameworks', 'Frameworks', FRAMEWORK_OPTIONS);
						break;
					case 'tools':
						profile = await editList(profile, 'tools', 'Tools', TOOL_OPTIONS);
						break;
					case 'topics':
						profile = await editList(profile, 'topics', 'Topics', TOPIC_OPTIONS);
						break;
					case 'depth':
						profile = await editDepth(profile);
						break;
				}
			}
		}
	} finally {
		process.removeListener('SIGINT', sigintHandler);
	}
}
