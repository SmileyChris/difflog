<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import { browser } from "$app/environment";
	import { getProfile, isDemoProfile } from "$lib/stores/profiles.svelte";
	import { getHistory } from "$lib/stores/history.svelte";
	import { getStars } from "$lib/stores/stars.svelte";
	import { updateProfile, autoSync } from "$lib/stores/sync.svelte";
	import {
		generating,
		generationError,
		runGeneration,
		clearGenerationState,
		hasStageCache,
		clearStageCache,
	} from "$lib/stores/ui.svelte";
	import {
		addDiff,
		deleteDiff,
		removeStar,
	} from "$lib/stores/operations.svelte";
	import { PageHeader, HeaderNav, SiteFooter } from "$lib/components";
	import {
		DEPTHS,
		SCAN_MESSAGES,
		WAIT_TIPS,
		type GenerationDepth,
	} from "$lib/utils/constants";
	import { getCurrentDateFormatted } from "$lib/utils/time";
	import type { ResolvedMapping } from "$lib/utils/sync";

	let scanIndex = $state(0);
	let scanMessages = $state(
		[...SCAN_MESSAGES].sort(() => Math.random() - 0.5),
	);
	let waitTip = $state(
		WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)],
	);
	let scanInterval: ReturnType<typeof setInterval> | null = null;
	let forceNew = $state(false);
	let ctrlHeld = $state(false);
	let selectedDepthOverride = $state<GenerationDepth | null>(null);

	const currentDate = getCurrentDateFormatted();

	const isFirstTime = $derived(getHistory().length === 0);

	const isTodayDiff = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return false;
		return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
	});

	const trackingText = $derived.by(() => {
		const p = getProfile();
		if (!p) return "";
		return [
			...(p.languages || []),
			...(p.frameworks || []),
			...(p.tools || []),
		].join(" · ");
	});

	const providersText = $derived.by(() => {
		const p = getProfile();
		if (isDemoProfile(p)) return 'Using sample demo data';
		const selections = p?.providerSelections || {};
		const nameMap: Record<string, string> = {
			anthropic: 'Anthropic',
			perplexity: 'Perplexity',
			deepseek: 'DeepSeek',
			gemini: 'Gemini',
			serper: 'Serper',
		};

		// Collect unique providers being used
		const providers = new Set<string>();
		if (selections.search) providers.add(nameMap[selections.search] || selections.search);
		if (selections.curation) providers.add(nameMap[selections.curation] || selections.curation);
		if (selections.synthesis) providers.add(nameMap[selections.synthesis || 'anthropic'] || 'Anthropic');

		const providerList = Array.from(providers);
		if (providerList.length === 0) return 'Using Anthropic';
		if (providerList.length === 1) return `Using ${providerList[0]}`;
		if (providerList.length === 2) return `Using ${providerList.join(' and ')}`;

		const last = providerList.pop();
		return `Using ${providerList.join(', ')} and ${last}`;
	});

	onMount(() => {
		// Check URL params for force new
		const params = new URLSearchParams(window.location.search);
		forceNew = params.get("force") === "1";

		if (generating.value) {
			// Pick up existing generation animation
			startScanAnimation();
		}

		// Warn on browser close/refresh, track Ctrl key
		if (browser) {
			window.addEventListener("keydown", onKeyDown);
			window.addEventListener("keyup", onKeyUp);
			window.addEventListener("blur", onBlur);
			window.onbeforeunload = (e) => {
				if (generating.value) {
					e.preventDefault();
					e.returnValue = "";
					return "";
				}
			};
		}
	});

	onDestroy(() => {
		if (scanInterval) {
			clearInterval(scanInterval);
			scanInterval = null;
		}
		if (browser) {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", onBlur);
		}
	});

	function onKeyDown(e: KeyboardEvent) { if (e.key === "Control") ctrlHeld = true; }
	function onKeyUp(e: KeyboardEvent) { if (e.key === "Control") ctrlHeld = false; }
	function onBlur() { ctrlHeld = false; }

	function startScanAnimation() {
		scanInterval = setInterval(() => {
			scanIndex = (scanIndex + 1) % scanMessages.length;
		}, 4400);
	}

	async function startGeneration() {
		if (isDemoProfile()) {
			if (ctrlHeld) forceNew = true;
			scanIndex = 0;
			scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
			generating.value = true;
			startScanAnimation();
			const { createDemoDiff } = await import("$lib/utils/demo");
			await new Promise((r) => setTimeout(r, 2500));

			// Handle replacing today's existing diff (unless force new)
			const today = new Date().toDateString();
			const history = getHistory();
			if (
				!forceNew &&
				history.length > 0 &&
				new Date(history[0].generated_at).toDateString() === today
			) {
				const oldDiffId = history[0].id;
				const starsToRemove = getStars().filter(
					(s) => s.diff_id === oldDiffId,
				);
				for (const star of starsToRemove) {
					removeStar(star.diff_id, star.p_index);
				}
				deleteDiff(oldDiffId);
			}
			addDiff(createDemoDiff(getHistory()[0]?.title));
			generating.value = false;
			if (scanInterval) {
				clearInterval(scanInterval);
				scanInterval = null;
			}
			goto("/");
			return;
		}

		const profile = getProfile();
		if (!profile) {
			generationError.value = "No profile found";
			return;
		}

		// Ctrl held at click time means force new
		if (ctrlHeld) forceNew = true;

		// Reset UI state
		scanIndex = 0;
		scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
		waitTip = WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)];
		startScanAnimation();

		const lastDiff = getHistory()[0];
		const selectedDepth = selectedDepthOverride || profile.depth || "standard";

		try {
			const result = await runGeneration({
				profile: {
					...profile,
					languages: profile.languages || [],
					frameworks: profile.frameworks || [],
					tools: profile.tools || [],
					topics: profile.topics || [],
					depth: (profile.depth as GenerationDepth) || "standard",
					providerSelections: {
						synthesis:
							profile.providerSelections?.synthesis || undefined,
					},
				},
				selectedDepth,
				lastDiffDate: lastDiff?.generated_at ?? null,
				lastDiffContent: lastDiff?.content,
				onMappingsResolved: (mappings) =>
					updateProfile({
						resolvedMappings: mappings as Record<
							string,
							ResolvedMapping
						>,
					}),
			});

			// Handle replacing today's existing diff (unless force new)
			const today = new Date().toDateString();
			const history = getHistory();
			if (
				!forceNew &&
				history.length > 0 &&
				new Date(history[0].generated_at).toDateString() === today
			) {
				const oldDiffId = history[0].id;
				const starsToRemove = getStars().filter(
					(s) => s.diff_id === oldDiffId,
				);
				for (const star of starsToRemove) {
					removeStar(star.diff_id, star.p_index);
				}
				deleteDiff(oldDiffId);
			}
			addDiff(result.diff);
			autoSync();

			// Success - go home to view the new diff
			clearGenerationState();
			goto("/");
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
		const durations = history
			.map((h) => h.duration_seconds as number)
			.filter((d) => d && d > 0);
		let timeStr: string;
		if (durations.length === 0) {
			timeStr = "This usually takes 30–60 seconds...";
		} else {
			const avg = Math.round(
				durations.reduce((a, b) => (a || 0) + (b || 0), 0) /
					durations.length,
			);
			if (avg < 60) {
				timeStr = `Usually takes about ${avg} seconds...`;
			} else {
				const mins = Math.floor(avg / 60);
				const secs = avg % 60;
				timeStr =
					secs > 0
						? `Usually takes about ${mins}m ${secs}s...`
						: `Usually takes about ${mins} minute${mins > 1 ? "s" : ""}...`;
			}
		}
		return waitTip ? `${timeStr} ${waitTip}` : timeStr;
	}

	function goHome() {
		clearGenerationState();
		goto("/");
	}
</script>

<svelte:head>
	<title>{generating.value ? "Generating..." : isTodayDiff ? "Regenerate" : "Generate"} | diff·log</title>
</svelte:head>

<PageHeader subtitle={currentDate}>
	<HeaderNav />
</PageHeader>

<main id="content">
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
					<div
						class="progress-dot"
						class:progress-dot-active={i <= scanIndex % 8}
					></div>
				{/each}
			</div>
			<p class="generating-subtext">{estimatedTime()}</p>
		</div>
	{:else if generationError.value}
		<div class="welcome-area">
			<div class="logo-mark logo-mark-error">&#9670;</div>
			<h2 class="welcome-heading-lg">Generation failed</h2>
			<p class="error-detail">
				{generationError.value.replace(/^Generation failed:\s*/, "")}
			</p>
			<div class="error-actions">
				<button
					class="btn-primary btn-lg btn-branded"
					onclick={startGeneration}
				>
					{hasStageCache() ? "Resume" : "Try Again"}
				</button>
				<div class="error-actions-secondary">
					{#if hasStageCache()}
						<button
							class="btn-secondary"
							onclick={() => {
								clearStageCache();
								startGeneration();
							}}
						>
							Start Fresh
						</button>
					{/if}
					{#if getHistory().length > 0}
						<button class="btn-secondary" onclick={goHome}>
							View last diff
						</button>
					{/if}
				</div>
			</div>
		</div>
	{:else}
		<div class="welcome-area">
			<div class="logo-mark">&#9670;</div>
			<h2 class="welcome-heading-lg">{isFirstTime ? `Welcome, ${getProfile()?.name || "Developer"}` : isTodayDiff ? "Ready to regenerate" : "Ready to generate"}</h2>
			{#if isFirstTime}
				<p class="welcome-text">
					A diff is your personalized changelog for the developer ecosystem — releases,
					announcements, and developments filtered to what you care about.
				</p>
				<p class="welcome-text-sub">
					Hit generate and we'll scan what's new across your stack.
				</p>
			{:else if isTodayDiff}
				<p class="welcome-text">
					You've already generated today's diff.
					{#if ctrlHeld}But let's generate another...{:else}Regenerate to refresh it.
					<small class="ctrl-hint">(hold <kbd>Ctrl</kbd> to generate another)</small>{/if}
				</p>
			{:else}
				<p class="welcome-text">
					Generate a personalized diff of what's changed in your dev
					ecosystem.
				</p>
			{/if}

			{#if !isFirstTime}
				<div class="gen-options">
					{#if trackingText}
						<div class="gen-options-row">
							<span class="first-time-tracking-label">Tracking</span>
							<span class="first-time-tracking-items">{trackingText}</span>
							<a href="/setup?edit=2" class="first-time-tracking-edit">&#9998;</a>
						</div>
					{/if}
					<div class="gen-options-row">
						<span class="first-time-tracking-label">Depth</span>
						{#each DEPTHS as d, i}
							{#if i > 0}<span class="middot">&middot;</span>{/if}
							<button
								class="depth-option"
								class:depth-option-active={(selectedDepthOverride || getProfile()?.depth || "standard") === d.id}
								onclick={() => { selectedDepthOverride = d.id; }}
							>
								{d.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<button
				class="btn-primary btn-lg btn-branded"
				onclick={startGeneration}
			>
				{isTodayDiff && !ctrlHeld ? "Regenerate Diff" : "Generate Diff"}
			</button>

			{#if getHistory().length > 0}
				<button class="btn-secondary" onclick={goHome}>
					Back home
				</button>
			{/if}

			<p class="provider-hint">{providersText}</p>
		</div>
	{/if}
</main>

<SiteFooter />

<style>
	.depth-option {
		font-size: 0.85rem;
		font-family: inherit;
		color: var(--text-hint);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}
	.depth-option:hover {
		color: var(--text-secondary);
	}
	.depth-option-active {
		color: var(--text-primary);
		font-weight: 600;
	}
	.gen-options {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2rem;
		padding: 0.75rem 1rem;
		background: var(--bg-chip);
		border-radius: var(--radius-md);
		max-width: 500px;
		margin-left: auto;
		margin-right: auto;
	}
	.gen-options-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.gen-options-row .first-time-tracking-label {
		margin-right: 0.2rem;
	}
	.middot {
		color: var(--text-hint);
		font-size: 0.75rem;
	}
	.welcome-text-sub {
		color: var(--text-hint);
		font-size: 0.9rem;
		margin-top: -0.25rem;
	}

	/* Generating State */
	.generating-state {
		text-align: center;
		padding: 4rem 2rem;
	}

	.scan-animation {
		width: 280px;
		height: 4px;
		background: var(--bg-chip);
		border-radius: 2px;
		margin: 0 auto 2rem;
		overflow: hidden;
		position: relative;
	}

	.scan-line {
		position: absolute;
		width: 40%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		animation: scan 1.5s ease-in-out infinite;
	}

	.scan-message-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		min-height: 2rem;
	}

	.scan-icon {
		font-size: 1.25rem;
		animation: pulse 1s ease-in-out infinite;
	}

	.generating-text {
		font-size: 0.95rem;
		color: var(--accent);
		margin: 0;
		font-weight: 500;
	}

	.generating-subtext {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin-top: 0.5rem;
	}

	@keyframes scan {
		0% {
			left: -40%;
		}

		100% {
			left: 100%;
		}
	}

	/* Error */
	.logo-mark-error {
		color: var(--error, #dc3545);
	}

	.logo-mark-error::after {
		color: var(--error, #dc3545);
	}

	.error-detail {
		font-size: 0.9rem;
		color: var(--text-secondary);
		background: var(--bg-chip);
		border-left: 3px solid var(--error, #dc3545);
		padding: 0.875rem 1.25rem;
		border-radius: var(--radius-sm);
		margin: 0 auto 2rem;
		max-width: 480px;
		text-align: left;
		line-height: 1.5;
	}

	.error-actions-secondary {
		display: flex;
		gap: 0.5rem;
	}

	/* First-time tracking summary */
	.first-time-tracking-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--accent);
		flex-shrink: 0;
	}

	.first-time-tracking-items {
		font-size: 0.85rem;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.first-time-tracking-edit {
		font-size: 0.75rem;
		color: var(--text-hint);
		text-decoration: none;
		flex-shrink: 0;
	}

	.first-time-tracking-edit:hover {
		color: var(--accent);
	}

	.provider-hint {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin-top: 0.75rem;
		text-align: center;
	}
</style>
