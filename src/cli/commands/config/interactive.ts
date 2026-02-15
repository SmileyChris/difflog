import { getProfile, saveProfile, getConfiguredKeys, trackProfileModified, trackKeysModified } from '../../config';
import type { GenerationDepth } from '../../../lib/utils/constants';
import { LANGUAGES, FRAMEWORKS, TOOLS, TOPICS } from '../../../lib/utils/constants';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import { estimateDiffCost } from '../../../lib/utils/pricing';
import { formatAiConfig } from './index';
import { syncUpload } from '../../sync';
import { PROVIDERS, PROVIDER_IDS, PROVIDER_LABELS } from '../../../lib/utils/providers';
import { RESET, DIM, BOLD, CYAN, GREEN, BRIGHT_YELLOW, SERVICE_NAME, clearScreen, hideCursor, showCursor, readLine, menuLoop } from '../../ui';

const PROVIDER_ID_LIST = PROVIDER_IDS;
type Provider = (typeof PROVIDER_ID_LIST)[number];

class QuitSignal extends Error {
	profile: any;
	constructor(profile?: any) { super('quit'); this.profile = profile; }
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
	let selectedDepth = depths.indexOf(profile.depth || 'standard');
	let tempFocus = profile.customFocus || '';
	let result = profile;

	const DEPTH_DESCRIPTIONS: Record<GenerationDepth, string> = {
		quick: 'Brief overview, faster generation',
		standard: 'Balanced depth and detail',
		detailed: 'Comprehensive coverage, longer'
	};

	await menuLoop({
		itemCount: depths.length,
		render: (cursor) => {
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}Depth & Focus${RESET}\n\n`);
			process.stdout.write(`${DIM}↑/↓ navigate • Space to select • Enter to edit focus • Esc to go back${RESET}\n\n`);

			process.stdout.write(`${DIM}Generation depth:${RESET}\n`);
			for (let i = 0; i < depths.length; i++) {
				const isSelected = i === selectedDepth;
				const isCursor = i === cursor;
				const marker = isCursor ? `${CYAN}▸${RESET}` : ' ';
				const checkbox = isSelected ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
				const label = isCursor ? `${BOLD}${depths[i]}${RESET}` : depths[i];
				const desc = `${DIM}${DEPTH_DESCRIPTIONS[depths[i]]}${RESET}`;
				process.stdout.write(`${marker} ${checkbox} ${label}\n`);
				process.stdout.write(`   ${desc}\n`);
			}

			process.stdout.write(`\n${DIM}Custom focus:${RESET} ${tempFocus || `${DIM}none${RESET}`}\n`);
		},
		onSpace: (cursor) => { selectedDepth = cursor; },
		async onEnter(cursor) {
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}Custom Focus${RESET}\n\n`);
			process.stdout.write(`${DIM}Current:${RESET} ${tempFocus || 'none'}\n\n`);
			process.stdout.write(`${DIM}Leave empty to clear, Esc to cancel${RESET}\n\n`);

			const newFocus = await readLine(`${CYAN}Focus:${RESET} `);
			if (newFocus !== null) {
				tempFocus = newFocus;
			}
		},
		onEsc: () => {
			result = { ...profile, depth: depths[selectedDepth], customFocus: tempFocus };
			return 'break';
		},
		onQuit: () => {
			profile = { ...profile, depth: depths[selectedDepth], customFocus: tempFocus };
			throw new QuitSignal(profile);
		}
	}, depths.indexOf(profile.depth || 'standard'));

	return result;
}

async function editList(
	profile: any,
	category: 'languages' | 'frameworks' | 'tools' | 'topics',
	title: string,
	options: readonly string[]
): Promise<any> {
	const current = new Set(profile[category] || []);
	const customItems = Array.from(current).filter(item => !options.includes(item));
	const allOptions = [...options, ...customItems];
	let result = profile;

	await menuLoop({
		get itemCount() { return allOptions.length; },
		render: (cursor) => {
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}${title}${RESET}\n\n`);
			process.stdout.write(`${DIM}Use ↑/↓ to navigate, Space to toggle, Enter to add custom, Esc to go back${RESET}\n\n`);

			for (let i = 0; i < allOptions.length; i++) {
				const option = allOptions[i];
				const isCustomItem = customItems.includes(option);
				const isSelected = current.has(option);
				const isCursor = i === cursor;

				const marker = isCursor ? `${CYAN}▸${RESET}` : ' ';
				const checkbox = isSelected ? `${GREEN}◉${RESET}` : `${DIM}○${RESET}`;
				const displayLabel = isCustomItem ? `${option} ${DIM}(custom)${RESET}` : option;
				const label = isCursor ? `${BOLD}${displayLabel}${RESET}` : displayLabel;

				process.stdout.write(`${marker} ${checkbox} ${label}\n`);
			}
		},
		onSpace: (cursor) => {
			const option = allOptions[cursor];
			if (current.has(option)) {
				current.delete(option);
			} else {
				current.add(option);
			}
		},
		async onEnter() {
			clearScreen();
			process.stdout.write(`${BOLD}${GREEN}Add Custom ${title}${RESET}\n\n`);
			const custom = await readLine(`${CYAN}Enter item:${RESET} `);
			if (custom && custom.length > 0 && !allOptions.includes(custom)) {
				current.add(custom);
				customItems.push(custom);
				allOptions.push(custom);
			}
		},
		onEsc: () => {
			result = { ...profile, [category]: Array.from(current) };
			return 'break';
		},
		onQuit: () => {
			profile = { ...profile, [category]: Array.from(current) };
			throw new QuitSignal(profile);
		}
	});

	return result;
}


async function editProviderKey(provider: Provider, hasKey: boolean): Promise<string | null> {
	clearScreen();
	process.stdout.write(`${BOLD}${GREEN}${PROVIDER_LABELS[provider]}${RESET}\n\n`);

	// Show capabilities
	const caps = PROVIDERS[provider].capabilities;
	process.stdout.write(`${DIM}Can be used for:${RESET} ${caps.join(', ')}\n\n`);

	// Show current status
	if (hasKey) {
		process.stdout.write(`${GREEN}✓${RESET} Key configured\n\n`);
	} else {
		process.stdout.write(`${DIM}No key configured${RESET}\n\n`);
	}

	// Show link to get key
	process.stdout.write(`${DIM}Get API key:${RESET} ${CYAN}${PROVIDERS[provider].docsUrl}${RESET}\n\n`);
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
	let selectedColumn = 0; // 0=search, 1=curation, 2=synthesis

	// Get configured keys from keychain
	const keys: Record<Provider, string | undefined> = {} as any;
	for (const provider of PROVIDER_ID_LIST) {
		try {
			keys[provider] = await getPassword(SERVICE_NAME, provider) || undefined;
		} catch {
			keys[provider] = undefined;
		}
	}

	const existing = profile.providerSelections || {};
	const selections = {
		search: existing.search ?? null,
		curation: existing.curation ?? null,
		synthesis: existing.synthesis ?? null
	};
	const originalSelections = JSON.stringify(selections);
	let result = profile;

	await menuLoop({
		itemCount: PROVIDER_ID_LIST.length,
		render: (cursor) => {
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

			for (let i = 0; i < PROVIDER_ID_LIST.length; i++) {
				const provider = PROVIDER_ID_LIST[i];
				const marker = i === cursor ? `${CYAN}▸${RESET}` : ' ';
				const hasKey = keys[provider] ? `${GREEN}✓${RESET}` : `${DIM}✗${RESET}`;

				const caps = PROVIDERS[provider].capabilities;
				const isSelected = (columnIndex: number) => i === cursor && columnIndex === selectedColumn;

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

				const labelWithColor = i === cursor ? `${BOLD}${PROVIDER_LABELS[provider].padEnd(20)}${RESET}` : PROVIDER_LABELS[provider].padEnd(20);

				process.stdout.write(`${marker} ${labelWithColor}  ${hasKey}     ${searchIcon}       ${curationIcon}         ${synthesisIcon}\n`);
			}

			process.stdout.write(`\n${DIM}● = selected  ○ = available  · = needs key / not available${RESET}\n`);
		},
		onHorizontal: (_cursor, direction) => {
			if (direction === 'right') selectedColumn = Math.min(2, selectedColumn + 1);
			else selectedColumn = Math.max(0, selectedColumn - 1);
		},
		onSpace: (cursor) => {
			const provider = PROVIDER_ID_LIST[cursor];
			const caps = PROVIDERS[provider].capabilities;

			if (selectedColumn === 0 && caps.includes('search') && keys[provider]) {
				selections.search = selections.search === provider ? null : provider;
			} else if (selectedColumn === 1 && caps.includes('curation') && keys[provider]) {
				selections.curation = selections.curation === provider ? null : provider;
			} else if (selectedColumn === 2 && caps.includes('synthesis') && keys[provider]) {
				selections.synthesis = selections.synthesis === provider ? null : provider;
			}
		},
		async onEnter(cursor) {
			const provider = PROVIDER_ID_LIST[cursor];
			const newKey = await editProviderKey(provider, !!keys[provider]);

			if (newKey !== null) {
				if (newKey === '') {
					await deletePassword(SERVICE_NAME, provider);
					keys[provider] = undefined;
					if (selections.search === provider) selections.search = null;
					if (selections.curation === provider) selections.curation = null;
					if (selections.synthesis === provider) selections.synthesis = null;
				} else {
					await setPassword(SERVICE_NAME, provider, newKey);
					keys[provider] = newKey;

					const caps = PROVIDERS[provider].capabilities;
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
		},
		onEsc: () => {
			if (JSON.stringify(selections) !== originalSelections) {
				result = { ...profile, providerSelections: selections };
			}
			return 'break';
		},
		onQuit: () => {
			if (JSON.stringify(selections) !== originalSelections) {
				profile = { ...profile, providerSelections: selections };
			}
			throw new QuitSignal(profile);
		}
	});

	return result;
}

async function quitConfirmation(hasChanges: boolean): Promise<'save' | 'discard' | 'cancel'> {
	if (!hasChanges) {
		return 'discard';
	}

	const options = ['Save changes', 'Discard changes', 'Back to config'];
	let result: 'save' | 'discard' | 'cancel' = 'cancel';

	await menuLoop({
		itemCount: options.length,
		render: (cursor) => {
			clearScreen();
			process.stdout.write(`${BOLD}${BRIGHT_YELLOW}Unsaved Changes${RESET}\n\n`);
			process.stdout.write(`${DIM}You have unsaved changes. What would you like to do?${RESET}\n\n`);

			for (let i = 0; i < options.length; i++) {
				const marker = i === cursor ? `${CYAN}▸${RESET}` : ' ';
				const label = i === cursor ? `${BOLD}${options[i]}${RESET}` : options[i];
				process.stdout.write(`${marker} ${label}\n`);
			}

			process.stdout.write(`\n${DIM}Press Enter to select, Esc to go back${RESET}\n`);
		},
		onEnter: (cursor) => {
			if (cursor === 0) result = 'save';
			else if (cursor === 1) result = 'discard';
			else result = 'cancel';
			return 'break';
		},
		onEsc: () => {
			result = 'cancel';
			return 'break';
		},
		onCtrlC: () => {
			result = 'discard';
			return 'break';
		},
		onQuit: () => {
			result = 'cancel';
			return 'break';
		}
	});

	return result;
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
	const sections: Section[] = ['name', 'ai', 'languages', 'frameworks', 'tools', 'topics', 'depth'];
	let selectedSection = 0;

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

	// Handle Ctrl+C
	const sigintHandler = () => {
		cleanup(false, false);
		process.exit(0);
	};
	process.on('SIGINT', sigintHandler);

	const handleQuit = async (): Promise<boolean> => {
		const hasChanges = hasProfileChanged(originalProfile, profile);
		const decision = await quitConfirmation(hasChanges);

		if (decision === 'save') {
			await cleanup(true);
			return true;
		} else if (decision === 'discard') {
			await cleanup(false);
			return true;
		}
		// 'cancel' — continue the loop
		return false;
	};

	try {
		await menuLoop({
			itemCount: sections.length,
			wrap: true,
			render: (cursor) => {
				selectedSection = cursor;
				renderMainMenu(cursor, profile);
			},
			async onEnter(cursor) {
				const section = sections[cursor];

				try {
					switch (section) {
						case 'name':
							profile = await editName(profile);
							break;
						case 'ai':
							profile = await editAi(profile);
							break;
						case 'languages':
							profile = await editList(profile, 'languages', 'Languages', LANGUAGES);
							break;
						case 'frameworks':
							profile = await editList(profile, 'frameworks', 'Frameworks', FRAMEWORKS);
							break;
						case 'tools':
							profile = await editList(profile, 'tools', 'Tools', TOOLS);
							break;
						case 'topics':
							profile = await editList(profile, 'topics', 'Topics', TOPICS);
							break;
						case 'depth':
							profile = await editDepth(profile);
							break;
					}
				} catch (err) {
					if (err instanceof QuitSignal) {
						if (err.profile) profile = err.profile;
						if (await handleQuit()) return 'break';
					} else {
						throw err;
					}
				}
			},
			async onEsc() {
				if (await handleQuit()) return 'break';
			},
			async onCtrlC() {
				await cleanup(false, false);
				process.removeListener('SIGINT', sigintHandler);
				process.exit(0);
			},
			async onQuit() {
				if (await handleQuit()) return 'break';
			}
		});
	} finally {
		process.removeListener('SIGINT', sigintHandler);
	}
}
