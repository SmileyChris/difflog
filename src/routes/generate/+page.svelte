<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { getProfile, getApiKey } from '$lib/stores/profiles.svelte';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getStars } from '$lib/stores/stars.svelte';
	import { updateProfile, autoSync } from '$lib/stores/sync.svelte';
	import { generating, generationError, generationResult, runGeneration, clearGenerationState } from '$lib/stores/ui.svelte';
	import { addDiff, deleteDiff, removeStar } from '$lib/stores/operations.svelte';
	import { PageHeader, SiteFooter } from '$lib/components';
	import { SCAN_MESSAGES, WAIT_TIPS } from '$lib/utils/constants';
	import { getCurrentDateFormatted } from '$lib/utils/time';

	let scanIndex = $state(0);
	let scanMessages = $state([...SCAN_MESSAGES].sort(() => Math.random() - 0.5));
	let waitTip = $state(WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)]);
	let scanInterval: ReturnType<typeof setInterval> | null = null;
	let forceNew = $state(false);

	const currentDate = getCurrentDateFormatted();

	const trackingText = $derived.by(() => {
		const p = getProfile();
		if (!p) return '';
		return [...(p.languages || []), ...(p.frameworks || []), ...(p.tools || [])].join(' · ');
	});

	onMount(() => {
		// Check URL params for force new
		const params = new URLSearchParams(window.location.search);
		forceNew = params.get('force') === '1';

		if (generating.value) {
			// Pick up existing generation animation
			startScanAnimation();
		}

		// Warn on browser close/refresh
		if (browser) {
			window.onbeforeunload = (e) => {
				if (generating.value) {
					e.preventDefault();
					e.returnValue = '';
					return '';
				}
			};
		}
	});

	onDestroy(() => {
		if (scanInterval) {
			clearInterval(scanInterval);
			scanInterval = null;
		}
	});

	function startScanAnimation() {
		scanInterval = setInterval(() => {
			scanIndex = (scanIndex + 1) % scanMessages.length;
		}, 4400);
	}

	async function startGeneration() {
		const apiKey = getApiKey();

		if (apiKey === 'demo-key-placeholder') {
			generationError.value = 'This is a demo profile. To generate real diffs, go to Profiles and add your Anthropic API key, or create a new profile with a valid key.';
			return;
		}

		const profile = getProfile();
		if (!profile) {
			generationError.value = 'No profile found';
			return;
		}

		// Reset UI state
		scanIndex = 0;
		scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
		waitTip = WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)];
		startScanAnimation();

		const lastDiff = getHistory()[0];
		const selectedDepth = profile.depth || 'standard';

		try {
			const result = await runGeneration({
				profile,
				apiKey: apiKey || '',
				selectedDepth,
				lastDiffDate: lastDiff?.generated_at ?? null,
				lastDiffContent: lastDiff?.content,
				onMappingsResolved: (mappings) => updateProfile({ resolvedMappings: mappings })
			});

			// Handle replacing today's existing diff (unless force new)
			const today = new Date().toDateString();
			const history = getHistory();
			if (!forceNew && history.length > 0 && new Date(history[0].generated_at).toDateString() === today) {
				const oldDiffId = history[0].id;
				const starsToRemove = getStars().filter((s) => s.diff_id === oldDiffId);
				for (const star of starsToRemove) {
					removeStar(star.diff_id, star.p_index);
				}
				deleteDiff(oldDiffId);
			}
			addDiff(result.diff);
			autoSync();

			// Success - go home to view the new diff
			clearGenerationState();
			goto('/');
		} catch {
			// Error is already set by runGeneration, stay on page to show it
			if (scanInterval) {
				clearInterval(scanInterval);
				scanInterval = null;
			}
		} finally {
			if (browser) {
				window.onbeforeunload = null;
			}
		}
	}

	function estimatedTime(): string {
		const history = getHistory();
		const durations = history.map((h) => h.duration_seconds).filter((d) => d && d > 0);
		let timeStr: string;
		if (durations.length === 0) {
			timeStr = 'This usually takes 30–60 seconds...';
		} else {
			const avg = Math.round(durations.reduce((a, b) => (a || 0) + (b || 0), 0) / durations.length);
			if (avg < 60) {
				timeStr = `Usually takes about ${avg} seconds...`;
			} else {
				const mins = Math.floor(avg / 60);
				const secs = avg % 60;
				timeStr = secs > 0 ? `Usually takes about ${mins}m ${secs}s...` : `Usually takes about ${mins} minute${mins > 1 ? 's' : ''}...`;
			}
		}
		return waitTip ? `${timeStr} ${waitTip}` : timeStr;
	}

	function goHome() {
		clearGenerationState();
		goto('/');
	}
</script>

<svelte:head>
	<title>{generating.value ? 'Generating...' : 'Generate'} | diff·log</title>
</svelte:head>

<main id="content">
	<PageHeader subtitle={currentDate} iconSpinning={generating.value} />

	{#if generating.value}
		<div class="generating-state">
			<div class="scan-animation">
				<div class="scan-line"></div>
			</div>
			<div class="scan-message-container">
				<span class="scan-icon">{scanMessages[scanIndex].icon}</span>
				<p class="generating-text">{scanMessages[scanIndex].text}</p>
			</div>
			<div class="scan-progress">
				{#each Array(8) as _, i}
					<div class="progress-dot" class:progress-dot-active={i <= scanIndex % 8}></div>
				{/each}
			</div>
			<p class="generating-subtext">{estimatedTime()}</p>
		</div>
	{:else if generationError.value}
		<div class="welcome-area">
			<div class="logo-mark logo-mark-error">&#9670;</div>
			<h2 class="welcome-heading-lg">Generation failed</h2>
			<p class="error-message">{generationError.value}</p>
			<button class="btn-generate" onclick={startGeneration}>
				<span>&#9670;</span> Try Again
			</button>
			{#if getHistory().length > 0}
				<button class="btn-secondary" onclick={goHome}>
					View last diff
				</button>
			{/if}
		</div>
	{:else}
		<div class="welcome-area">
			<div class="logo-mark">&#9670;</div>
			<h2 class="welcome-heading-lg">Ready to generate</h2>
			<p class="welcome-text">Generate a personalized diff of what's changed in your dev ecosystem.</p>

			{#if trackingText}
				<div class="first-time-tracking">
					<span class="first-time-tracking-label">Tracking</span>
					<span class="first-time-tracking-items">{trackingText}</span>
					<a href="/profiles" class="first-time-tracking-edit">Edit</a>
				</div>
			{/if}

			<button class="btn-generate" onclick={startGeneration}>
				<span>&#9670;</span> Generate your diff
			</button>

			{#if getHistory().length > 0}
				<button class="btn-secondary" onclick={goHome}>
					Back to dashboard
				</button>
			{/if}
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
