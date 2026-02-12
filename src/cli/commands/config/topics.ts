import { getProfile, saveProfile, trackProfileModified } from '../../config';
import { syncUpload } from '../../sync';

const CATEGORIES = ['languages', 'frameworks', 'tools', 'topics'] as const;
type Category = (typeof CATEGORIES)[number];

// ANSI codes
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const BRIGHT_YELLOW = '\x1b[93m';

export async function showTopics(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	process.stdout.write(`${DIM}Topics:${RESET}\n`);
	if (profile.languages?.length) {
		process.stdout.write(`  ${DIM}Languages:${RESET}   ${profile.languages.join(', ')}\n`);
	}
	if (profile.frameworks?.length) {
		process.stdout.write(`  ${DIM}Frameworks:${RESET}  ${profile.frameworks.join(', ')}\n`);
	}
	if (profile.tools?.length) {
		process.stdout.write(`  ${DIM}Tools:${RESET}       ${profile.tools.join(', ')}\n`);
	}
	if (profile.topics?.length) {
		process.stdout.write(`  ${DIM}Topics:${RESET}      ${profile.topics.join(', ')}\n`);
	}
	if (profile.customFocus) {
		process.stdout.write(`  ${DIM}Focus:${RESET}       ${profile.customFocus}\n`);
	}
	process.stdout.write('\n');
}

export async function handleTopics(args: string[]): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	const subcommand = args[0];

	if (!subcommand) {
		// Just show topics
		await showTopics();
		return;
	}

	switch (subcommand) {
		case 'add': {
			const category = args[1] as Category;
			const items = args.slice(2);
			if (!category || !CATEGORIES.includes(category)) {
				process.stdout.write(`${DIM}Usage: difflog config topics add <languages|frameworks|tools|topics> <items...>${RESET}\n`);
				return;
			}
			if (items.length === 0) {
				process.stdout.write(`${BRIGHT_YELLOW}!${RESET} No items provided\n`);
				return;
			}
			const current = profile[category] || [];
			const updated = [...new Set([...current, ...items])];
			saveProfile({ ...profile, [category]: updated });
			trackProfileModified();
			process.stdout.write(`${GREEN}✓${RESET} Added to ${category}: ${BOLD}${items.join(', ')}${RESET}\n`);
			await syncUpload();
			break;
		}

		case 'rm': {
			const category = args[1] as Category;
			const items = args.slice(2);
			if (!category || !CATEGORIES.includes(category)) {
				process.stdout.write(`${DIM}Usage: difflog config topics rm <languages|frameworks|tools|topics> <items...>${RESET}\n`);
				return;
			}
			if (items.length === 0) {
				process.stdout.write(`${BRIGHT_YELLOW}!${RESET} No items provided\n`);
				return;
			}
			const current = profile[category] || [];
			const updated = current.filter(item => !items.includes(item));
			saveProfile({ ...profile, [category]: updated });
			trackProfileModified();
			process.stdout.write(`${GREEN}✓${RESET} Removed from ${category}: ${BOLD}${items.join(', ')}${RESET}\n`);
			await syncUpload();
			break;
		}

		case 'focus': {
			const focus = args.slice(1).join(' ');
			if (!focus) {
				process.stdout.write(`${DIM}Usage: difflog config topics focus <string|none>${RESET}\n`);
				return;
			}
			if (focus.toLowerCase() === 'none') {
				saveProfile({ ...profile, customFocus: '' });
				trackProfileModified();
				process.stdout.write(`${GREEN}✓${RESET} Custom focus cleared\n`);
			} else {
				saveProfile({ ...profile, customFocus: focus });
				trackProfileModified();
				process.stdout.write(`${GREEN}✓${RESET} Custom focus set: ${BOLD}${focus}${RESET}\n`);
			}
			await syncUpload();
			break;
		}

		default:
			process.stdout.write(`${DIM}Usage: difflog config topics [add|rm|focus]${RESET}\n`);
	}
}
