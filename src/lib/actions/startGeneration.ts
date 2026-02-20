/**
 * Shared generation orchestration — used by both the desktop /generate page
 * and the mobile inline generate card.
 *
 * Callers own their own animation and navigation via callbacks.
 */
import { getProfile, isDemoProfile } from '$lib/stores/profiles.svelte';
import { getHistory } from '$lib/stores/history.svelte';
import { updateProfile, autoSync } from '$lib/stores/sync.svelte';
import {
	generating,
	generationError,
	runGeneration,
	clearGenerationState,
} from '$lib/stores/ui.svelte';
import { addDiff, deleteDiff } from '$lib/stores/operations.svelte';
import type { GenerationDepth } from '$lib/utils/constants';
import { WAIT_TIPS } from '$lib/utils/constants';
import type { ResolvedMapping } from '$lib/utils/sync';

export interface StartGenerationCallbacks {
	forceNew?: boolean;
	depthOverride?: GenerationDepth | null;
	onScanStart: () => void;
	onScanStop: () => void;
	onSuccess: () => void;
}

export async function startGeneration(callbacks: StartGenerationCallbacks): Promise<void> {
	const { forceNew = false, depthOverride = null, onScanStart, onScanStop, onSuccess } = callbacks;

	if (isDemoProfile()) {
		generating.value = true;
		onScanStart();
		const { createDemoDiff } = await import('$lib/utils/demo');
		await new Promise((r) => setTimeout(r, 2500));

		const today = new Date().toDateString();
		const history = getHistory();
		if (
			!forceNew &&
			history.length > 0 &&
			new Date(history[0].generated_at).toDateString() === today
		) {
			deleteDiff(history[0].id);
		}
		addDiff(createDemoDiff(getHistory()[0]?.title));
		generating.value = false;
		onScanStop();
		onSuccess();
		return;
	}

	const profile = getProfile();
	if (!profile) {
		generationError.value = 'No profile found';
		return;
	}

	onScanStart();

	const lastDiff = getHistory()[0];
	const selectedDepth = depthOverride || profile.depth || 'standard';

	try {
		const result = await runGeneration({
			profile: {
				...profile,
				languages: profile.languages || [],
				frameworks: profile.frameworks || [],
				tools: profile.tools || [],
				topics: profile.topics || [],
				depth: (profile.depth as GenerationDepth) || 'standard',
				providerSelections: {
					synthesis: profile.providerSelections?.synthesis || undefined,
				},
			},
			selectedDepth,
			lastDiffDate: lastDiff?.generated_at ?? null,
			lastDiffContent: lastDiff?.content,
			onMappingsResolved: (mappings) =>
				updateProfile({
					resolvedMappings: mappings as Record<string, ResolvedMapping>,
				}),
		});

		const today = new Date().toDateString();
		const history = getHistory();
		if (
			!forceNew &&
			history.length > 0 &&
			new Date(history[0].generated_at).toDateString() === today
		) {
			deleteDiff(history[0].id);
		}
		addDiff(result.diff);
		autoSync();

		clearGenerationState();
		onSuccess();
	} catch {
		// Error already set by runGeneration — stop animation, stay on page
		onScanStop();
	}
}

export function estimatedTime(waitTip: string): string {
	const history = getHistory();
	const durations = history
		.map((h) => h.duration_seconds as number)
		.filter((d) => d && d > 0);
	let timeStr: string;
	if (durations.length === 0) {
		timeStr = 'This usually takes 30\u201360 seconds...';
	} else {
		const avg = Math.round(
			durations.reduce((a, b) => (a || 0) + (b || 0), 0) / durations.length,
		);
		if (avg < 60) {
			timeStr = `Usually takes about ${avg} seconds...`;
		} else {
			const mins = Math.floor(avg / 60);
			const secs = avg % 60;
			timeStr =
				secs > 0
					? `Usually takes about ${mins}m ${secs}s...`
					: `Usually takes about ${mins} minute${mins > 1 ? 's' : ''}...`;
		}
	}
	return waitTip ? `${timeStr} ${waitTip}` : timeStr;
}

export function randomWaitTip(): string {
	return WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)];
}
