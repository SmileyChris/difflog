import { getProfile, saveProfile } from '../../config';

const CATEGORIES = ['languages', 'frameworks', 'tools', 'topics'] as const;
type Category = (typeof CATEGORIES)[number];

export async function showTopics(): Promise<void> {
	const profile = getProfile();
	if (!profile) return;

	process.stdout.write('Topics:\n');
	if (profile.languages?.length) {
		process.stdout.write(`  Languages:   ${profile.languages.join(', ')}\n`);
	}
	if (profile.frameworks?.length) {
		process.stdout.write(`  Frameworks:  ${profile.frameworks.join(', ')}\n`);
	}
	if (profile.tools?.length) {
		process.stdout.write(`  Tools:       ${profile.tools.join(', ')}\n`);
	}
	if (profile.topics?.length) {
		process.stdout.write(`  Topics:      ${profile.topics.join(', ')}\n`);
	}
	if (profile.customFocus) {
		process.stdout.write(`  Focus:       ${profile.customFocus}\n`);
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
				process.stdout.write('Usage: difflog config topics add <languages|frameworks|tools|topics> <items...>\n');
				return;
			}
			if (items.length === 0) {
				process.stdout.write('No items provided\n');
				return;
			}
			const current = profile[category] || [];
			const updated = [...new Set([...current, ...items])];
			saveProfile({ ...profile, [category]: updated });
			process.stdout.write(`✓ Added to ${category}: ${items.join(', ')}\n`);
			break;
		}

		case 'rm': {
			const category = args[1] as Category;
			const items = args.slice(2);
			if (!category || !CATEGORIES.includes(category)) {
				process.stdout.write('Usage: difflog config topics rm <languages|frameworks|tools|topics> <items...>\n');
				return;
			}
			if (items.length === 0) {
				process.stdout.write('No items provided\n');
				return;
			}
			const current = profile[category] || [];
			const updated = current.filter(item => !items.includes(item));
			saveProfile({ ...profile, [category]: updated });
			process.stdout.write(`✓ Removed from ${category}: ${items.join(', ')}\n`);
			break;
		}

		case 'focus': {
			const focus = args.slice(1).join(' ');
			if (!focus) {
				process.stdout.write('Usage: difflog config topics focus <string|none>\n');
				return;
			}
			if (focus.toLowerCase() === 'none') {
				saveProfile({ ...profile, customFocus: '' });
				process.stdout.write('✓ Custom focus cleared\n');
			} else {
				saveProfile({ ...profile, customFocus: focus });
				process.stdout.write(`✓ Custom focus set: ${focus}\n`);
			}
			break;
		}

		default:
			process.stdout.write('Usage: difflog config topics [add|rm|focus]\n');
	}
}
