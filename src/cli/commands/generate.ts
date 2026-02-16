import { getProfile, saveProfile, getSession, getDiffs, saveDiffs, trackDiffModified, trackDiffDeleted, getApiKeys } from '../config';
import type { ResolvedMapping } from '../../lib/types/sync';
import { generateDiffContent } from '../../lib/actions/generateDiff';
import { DEPTHS, type GenerationDepth } from '../../lib/utils/constants';
import { isConfigurationComplete, STEPS, PROVIDER_LABELS, type ProviderStep } from '../../lib/utils/providers';
import { canSync, download, upload } from '../sync';
import { BASE } from '../api';
import { BIN, showHelp, BOLD, RESET, DIM, CYAN, YELLOW } from '../ui';
import { timeAgo } from '../time';
import type { Diff } from '../config';

function getProvidersText(selections: { search: string | null; curation: string | null; synthesis: string | null }): string {
	const providers = new Set<string>();
	if (selections.search) providers.add(PROVIDER_LABELS[selections.search] || selections.search);
	if (selections.curation) providers.add(PROVIDER_LABELS[selections.curation] || selections.curation);
	if (selections.synthesis) providers.add(PROVIDER_LABELS[selections.synthesis || 'anthropic'] || 'Anthropic');

	const list = Array.from(providers);
	if (list.length === 0) return 'Anthropic';
	if (list.length === 1) return list[0];
	if (list.length === 2) return list.join(' and ');
	const last = list.pop();
	return `${list.join(', ')} and ${last}`;
}

function showPreGenScreen(
	trackingText: string,
	providersText: string,
	depthIndex: number,
	hasTodayDiff: boolean,
	replacing: boolean,
	lastDiff: Diff | undefined
): void {
	const CLEAR = '\x1b[2J\x1b[H';
	const lines: string[] = [];

	if (replacing) {
		lines.push(`${BOLD}Generate a new diff${RESET}  ${YELLOW}replaces today's diff${RESET}`);
	} else {
		lines.push(`${BOLD}Generate a new diff${RESET}`);
	}
	lines.push('');
	if (lastDiff) {
		const title = lastDiff.title || 'Untitled';
		const ago = timeAgo(lastDiff.generated_at);
		lines.push(`${DIM}Latest${RESET}     ${title}  ${DIM}${ago}${RESET}`);
	}
	lines.push(`${DIM}Tracking${RESET}   ${trackingText}`);

	// Depth selector
	const depthParts = DEPTHS.map((d, i) => {
		if (i === depthIndex) return `${BOLD}${CYAN}${d.label}${RESET}`;
		return `${DIM}${d.label}${RESET}`;
	});
	const depthLine = depthParts.join(`${DIM}  \u25B8  ${RESET}`);
	lines.push(`${DIM}Depth${RESET}      ${depthLine}`);

	lines.push('');
	lines.push(`${DIM}Using ${providersText}${RESET}`);
	lines.push('');
	let footer = `${DIM}[Enter]${RESET} Generate  ${DIM}[${CYAN}←→${RESET}${DIM}]${RESET} Depth`;
	if (hasTodayDiff) {
		footer += `  ${DIM}[r]${RESET} ${replacing ? 'Keep both' : 'Replace'}`;
	}
	footer += `  ${DIM}[Esc]${RESET} Cancel`;
	lines.push(footer);

	process.stdout.write(CLEAR + lines.join('\n'));
}

type PreGenResult =
	| { action: 'generate'; depth: GenerationDepth; replace: boolean }
	| { action: 'cancel' }
	| { action: 'quit' };

async function interactivePreGen(
	profile: { languages: string[]; frameworks: string[]; tools: string[]; depth?: string },
	selections: { search: string | null; curation: string | null; synthesis: string | null },
	hasTodayDiff: boolean,
	lastDiff: Diff | undefined
): Promise<PreGenResult> {
	const tracking = [...(profile.languages || []), ...(profile.frameworks || []), ...(profile.tools || [])];
	const trackingText = tracking.length > 0 ? tracking.join(' \u00B7 ') : 'No topics configured';
	const providersText = getProvidersText(selections);

	const profileDepth = (profile.depth as GenerationDepth) || 'standard';
	let depthIndex = DEPTHS.findIndex(d => d.id === profileDepth);
	if (depthIndex === -1) depthIndex = 1;
	let replacing = hasTodayDiff;

	showPreGenScreen(trackingText, providersText, depthIndex, hasTodayDiff, replacing, lastDiff);

	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const cleanup = () => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
		};

		const onData = (ch: string) => {
			if (ch === '\r' || ch === '\n') {
				cleanup();
				process.stdout.write('\x1b[2J\x1b[H');
				resolve({ action: 'generate', depth: DEPTHS[depthIndex].id, replace: replacing });
			} else if (ch === '\x1b' && ch.length === 1) {
				// Esc: cancel, go back
				cleanup();
				process.stdout.write('\x1b[2J\x1b[H');
				resolve({ action: 'cancel' });
			} else if (ch === 'q' || ch === '\x03') {
				// q / Ctrl+C: quit entirely
				cleanup();
				process.stdout.write('\x1b[2J\x1b[H');
				resolve({ action: 'quit' });
			} else if (ch === 'r' && hasTodayDiff) {
				replacing = !replacing;
				showPreGenScreen(trackingText, providersText, depthIndex, hasTodayDiff, replacing, lastDiff);
			} else if (ch === '\x1b[D' || ch === '\x1b[C') {
				// Left / Right arrow
				if (ch === '\x1b[D' && depthIndex > 0) depthIndex--;
				if (ch === '\x1b[C' && depthIndex < DEPTHS.length - 1) depthIndex++;
				showPreGenScreen(trackingText, providersText, depthIndex, hasTodayDiff, replacing, lastDiff);
			}
		};

		process.stdin.on('data', onData);
	});
}

/** Result of generation: 'done' means generated or skipped, 'cancel' means go back, 'quit' means exit */
export type GenerateResult = 'done' | 'cancel' | 'quit';

export async function generateCommand(args: string[]): Promise<GenerateResult> {
	showHelp(args, `Generate a new diff based on your profile

Usage: ${BIN} generate [--now]

Options:
  --now    Skip interactive screen and generate immediately
`);

	const profile = getProfile();
	if (!profile) {
		process.stderr.write(`No profile found. Run: ${BIN} login\n`);
		process.exit(1);
	}

	// Get API keys from OS keychain (with fallback to environment variables)
	const apiKeys = await getApiKeys();

	// Use profile's provider selections
	const selections = {
		search: profile.providerSelections?.search ?? null,
		curation: profile.providerSelections?.curation ?? null,
		synthesis: profile.providerSelections?.synthesis ?? null
	};

	// Validate that required steps have keys configured
	if (!isConfigurationComplete(apiKeys, selections)) {
		const missing: string[] = [];
		for (const step of STEPS) {
			if (!step.required) continue;
			const provider = selections[step.id as ProviderStep];
			if (!provider) {
				missing.push(`${step.label}: no provider selected`);
			} else if (!apiKeys[provider]) {
				missing.push(`${step.label}: missing API key for ${provider}`);
			}
		}
		process.stderr.write('Error: AI configuration incomplete.\n\n');
		for (const m of missing) {
			process.stderr.write(`  • ${m}\n`);
		}
		process.stderr.write(`\nRun \`${BIN} config\` to configure providers and API keys.\n`);
		process.exit(1);
	}

	// Check if today's diff already exists (for UI hint and replacement)
	const existingDiffs = getDiffs();
	const today = new Date().toDateString();
	const replacing = existingDiffs.length > 0 && new Date(existingDiffs[0].generated_at).toDateString() === today;

	// Determine depth: interactive screen or immediate
	let depth: GenerationDepth;
	let replace = replacing; // default: replace if today's diff exists
	const skipInteractive = args.includes('--now') || !process.stdin.isTTY;

	if (skipInteractive) {
		depth = (profile.depth as GenerationDepth) || 'standard';
	} else {
		const result = await interactivePreGen(profile, selections, replacing, existingDiffs[0]);
		if (result.action === 'cancel') return 'cancel';
		if (result.action === 'quit') return 'quit';
		depth = result.depth;
		replace = result.replace;
	}

	// Sync down before generating to get latest state
	const session = getSession();
	if (session && canSync()) {
		try {
			const { downloaded } = await download(session);
			if (downloaded > 0) process.stdout.write(`Synced ${downloaded} diff(s) from server\n`);
		} catch { /* silent */ }
	}

	// Get last diff for window calculation
	let diffs = getDiffs();
	const lastDiff = diffs[0];
	const lastDiffDate = lastDiff?.generated_at || null;
	const lastDiffContent = lastDiff?.content;

	process.stdout.write('Generating diff...\n');
	process.stdout.write(`Profile: ${profile.name}\n`);
	process.stdout.write(`Depth: ${depth}\n`);
	process.stdout.write(`Synthesis: ${selections.synthesis}\n`);
	if (selections.curation) process.stdout.write(`Curation: ${selections.curation}\n`);
	if (selections.search) process.stdout.write(`Search: ${selections.search}\n`);
	process.stdout.write('\n');

	try {
		// Generate the diff using shared logic
		const { diff } = await generateDiffContent({
			profile: {
				name: profile.name,
				languages: profile.languages,
				frameworks: profile.frameworks,
				tools: profile.tools,
				topics: profile.topics,
				depth,
				resolvedMappings: profile.resolvedMappings || {},
				providerSelections: { synthesis: selections.synthesis || undefined },
				apiKeys
			},
			selectedDepth: depth,
			lastDiffDate,
			lastDiffContent,
			apiHost: BASE,
			onMappingsResolved: (mappings) => {
				const current = getProfile();
				if (current) saveProfile({ ...current, resolvedMappings: mappings as Record<string, ResolvedMapping> });
			}
		});

		// Replace today's existing diff if requested
		if (replace && diffs.length > 0 && new Date(diffs[0].generated_at).toDateString() === today) {
			const oldId = diffs[0].id;
			diffs = diffs.slice(1);
			trackDiffDeleted(oldId);
		}

		// Save the diff
		const updatedDiffs = [diff, ...diffs];
		saveDiffs(updatedDiffs);
		trackDiffModified(diff.id);

		// Upload to server
		if (session && canSync()) {
			try { await upload(session); } catch { /* silent */ }
		}

		process.stdout.write('\n✓ Diff generated successfully!\n');
		process.stdout.write(`Title: ${diff.title}\n`);
		process.stdout.write(`Duration: ${diff.duration_seconds}s\n`);
		if (diff.cost) {
			process.stdout.write(`Cost: $${diff.cost.toFixed(4)}\n`);
		}
		process.stdout.write(`\nRun \`${BIN}\` to view it.\n`);
		return 'done';
	} catch (error) {
		process.stderr.write(`\nError generating diff: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
		process.exit(1);
	}
}
