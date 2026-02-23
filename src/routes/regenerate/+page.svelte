<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import { browser } from "$app/environment";
	import { getProfile, isDemoProfile } from "$lib/stores/profiles.svelte";
	import { getHistory, getStreak } from "$lib/stores/history.svelte";
	import { isMobile } from "$lib/stores/mobile.svelte";
	import {
		generating,
		generationError,
		clearGenerationState,
		hasStageCache,
		clearStageCache,
	} from "$lib/stores/ui.svelte";
	import { PageHeader, HeaderNav, SiteFooter } from "$lib/components";
	import MobileHeader from "$lib/components/mobile/MobileHeader.svelte";
	import {
		DEPTHS,
		SCAN_MESSAGES,
		type GenerationDepth,
	} from "$lib/utils/constants";
	import { daysSince } from "$lib/utils/time.svelte";
	import {
		startGeneration,
		estimatedTime,
		randomWaitTip,
	} from "$lib/actions/startGeneration";
	import '../../styles/focus.css';

	let scanIndex = $state(0);
	let scanMessages = $state([...SCAN_MESSAGES].sort(() => Math.random() - 0.5));
	let waitTip = $state(randomWaitTip());
	let scanInterval: ReturnType<typeof setInterval> | null = null;
	let selectedDepthOverride = $state<GenerationDepth | null>(null);
	let forceNew = $state(false);

	const isTodayDiff = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return false;
		return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
	});

	const lastDiffDays = $derived(getHistory().length > 0 ? daysSince(getHistory()[0].generated_at) : Infinity);
	const isStale = $derived(lastDiffDays > 5);
	const hasDiff = $derived(getHistory().length > 0);

	const staleText = $derived.by(() => {
		const days = lastDiffDays;
		if (days <= 7) return "The dev world moves fast — time to catch up.";
		if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
		return "You've got weeks of ecosystem changes to unpack.";
	});

	const catchUpLabel = $derived.by(() => {
		const days = lastDiffDays;
		if (days === 0) return '';
		if (days === 1) return '1 day since your last diff';
		if (days < Infinity) return `${days} days since your last diff`;
		return '';
	});

	const profileInterests = $derived.by(() => {
		const p = getProfile();
		if (!p) return [];
		const items: string[] = [];
		if (p.languages?.length) items.push(...p.languages);
		if (p.frameworks?.length) items.push(...p.frameworks);
		if (p.tools?.length) items.push(...p.tools);
		return items.slice(0, 6);
	});

	const providersText = $derived.by(() => {
		const p = getProfile();
		if (isDemoProfile(p)) return 'Using sample demo data';
		const selections = p?.providerSelections || {};
		const nameMap: Record<string, string> = {
			anthropic: 'Anthropic', perplexity: 'Perplexity',
			deepseek: 'DeepSeek', gemini: 'Gemini', serper: 'Serper',
		};
		const providers = new Set<string>();
		if (selections.search) providers.add(nameMap[selections.search] || selections.search);
		if (selections.curation) providers.add(nameMap[selections.curation] || selections.curation);
		if (selections.synthesis) providers.add(nameMap[selections.synthesis || 'anthropic'] || 'Anthropic');
		const list = Array.from(providers);
		if (list.length === 0) return 'Using Anthropic';
		if (list.length === 1) return `Using ${list[0]}`;
		if (list.length === 2) return `Using ${list.join(' and ')}`;
		const last = list.pop();
		return `Using ${list.join(', ')} and ${last}`;
	});

	const streak = $derived(getStreak());
	const historyCount = $derived(getHistory().length);

	// Generation state: 'ready' | 'generating' | 'error'
	const genState = $derived.by(() => {
		if (generating.value) return 'generating' as const;
		if (generationError.value) return 'error' as const;
		return 'ready' as const;
	});

	function startScanAnimation() {
		scanInterval = setInterval(() => {
			scanIndex = (scanIndex + 1) % scanMessages.length;
		}, 4400);
	}

	function stopScanAnimation() {
		if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
	}

	async function handleGenerate() {
		scanIndex = 0;
		scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
		waitTip = randomWaitTip();

		await startGeneration({
			forceNew,
			depthOverride: selectedDepthOverride,
			onScanStart: startScanAnimation,
			onScanStop: stopScanAnimation,
			onSuccess: () => {
				stopScanAnimation();
				goto("/");
			},
		});
	}

	function handleRetry() { handleGenerate(); }
	function handleStartFresh() { clearStageCache(); handleGenerate(); }
	function goBack() { clearGenerationState(); goto("/"); }

	// Swipe right to go back to latest diff
	let touchStartX = 0;
	let touchStartY = 0;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function handleTouchEnd(e: TouchEvent) {
		if (genState !== 'ready') return;
		if (!hasDiff) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;
		// Swipe right → go back to latest diff
		if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			goBack();
		}
	}

	onMount(() => {
		if (generating.value) startScanAnimation();
		if (browser) {
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
		stopScanAnimation();
		if (browser) window.onbeforeunload = null;
	});
</script>

<svelte:head>
	<title>{generating.value ? "Generating..." : isTodayDiff ? "Regenerate" : "Generate"} | diff·log</title>
</svelte:head>

{#if isMobile.value}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="regen-page"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
		<MobileHeader />

		<div class="regen-body">
			{#if genState === 'generating'}
				<div class="regen-center">
					<div class="regen-scan-bar">
						<div class="regen-scan-line"></div>
					</div>
					<div class="regen-scan-msg">
						<span class="regen-scan-icon">{scanMessages[scanIndex].icon}</span>
						<p class="regen-scan-text">{scanMessages[scanIndex].text}</p>
					</div>
					<div class="regen-dots">
						{#each Array(8) as _, i}
							<div class="regen-dot" class:regen-dot-on={i <= scanIndex % 8}></div>
						{/each}
					</div>
					<p class="regen-subtext">{estimatedTime(waitTip)}</p>
				</div>
			{:else if genState === 'error'}
				<div class="regen-center">
					<span class="regen-error-icon">&#9670;</span>
					<span class="regen-heading">Generation failed</span>
					<p class="regen-error-detail">
						{generationError.value?.replace(/^Generation failed:\s*/, '') ?? 'Unknown error'}
					</p>
					<button class="btn-primary btn-branded" onclick={handleRetry}>
						{hasStageCache() ? 'Resume' : 'Try Again'}
					</button>
					{#if hasStageCache()}
						<button class="btn-secondary" onclick={handleStartFresh}>Start Fresh</button>
					{/if}
					{#if hasDiff}
						<button class="btn-secondary" onclick={goBack}>View last diff</button>
					{/if}
				</div>
			{:else}
				<div class="regen-center">
					<div class="regen-diamond">&#9670;</div>
					<span class="regen-heading">{isTodayDiff && !forceNew ? 'Ready to regenerate' : 'Ready to generate'}</span>
					{#if catchUpLabel}
						<span class="regen-ago">{catchUpLabel}</span>
					{/if}
					{#if isStale}
						<p class="regen-stale-text">{staleText}</p>
					{:else if isTodayDiff && !forceNew}
						<p class="regen-stale-text">You've already generated today's diff. Regenerate to refresh it, or you can <!-- svelte-ignore a11y_invalid_attribute --><a href="#" class="regen-link" onclick={(e) => { e.preventDefault(); forceNew = true; }}>generate another</a>.</p>
					{:else if isTodayDiff && forceNew}
						<p class="regen-stale-text">This will create a separate diff, or you can <!-- svelte-ignore a11y_invalid_attribute --><a href="#" class="regen-link" onclick={(e) => { e.preventDefault(); forceNew = false; }}>regenerate today's</a>.</p>
					{:else}
						<p class="regen-stale-text">Generate a personalized diff of what's changed in your dev ecosystem.</p>
					{/if}
					<button class="btn-primary btn-branded" onclick={handleGenerate}>
						{isTodayDiff && !forceNew ? 'Regenerate' : 'Generate new diff'}
					</button>
					<p class="regen-provider-hint">{providersText}</p>
				</div>
			{/if}
		</div>

		{#if genState === 'ready' && profileInterests.length > 0}
			<div class="regen-meta">
				<div class="regen-tags">
					{#each profileInterests as tag}
						<span class="regen-tag">{tag}</span>
					{/each}
				</div>
			</div>
		{/if}

		<footer class="focus-footer focus-footer-mobile">
			<span class="focus-card-category-label">
				{#if hasDiff}
					<button class="focus-nav-arrow" onclick={goBack}>&#8249;</button>
				{/if}
				<span>{historyCount} {historyCount === 1 ? 'diff' : 'diffs'}</span>
			</span>
			<span></span>
			{#if streak.streak > 0}
				<span class="focus-card-category-label">{streak.streak} day streak</span>
			{/if}
		</footer>
	</div>
{:else}
	<PageHeader>
		<HeaderNav />
	</PageHeader>

	<main class="regen-desktop">
		{#if generating.value}
			<div class="regen-center">
				<div class="regen-scan-bar regen-scan-bar-lg">
					<div class="regen-scan-line"></div>
				</div>
				<div class="regen-scan-msg">
					<span class="regen-scan-icon">{scanMessages[scanIndex].icon}</span>
					<p class="regen-scan-text">{scanMessages[scanIndex].text}</p>
				</div>
				<div class="regen-dots">
					{#each Array(8) as _, i}
						<div class="regen-dot" class:regen-dot-on={i <= scanIndex % 8}></div>
					{/each}
				</div>
				<p class="regen-subtext">{estimatedTime(waitTip)}</p>
			</div>
		{:else if generationError.value}
			<div class="regen-center">
				<div class="logo-mark" style="color: var(--error, #dc3545)">&#9670;</div>
				<h2 class="regen-heading-lg">Generation failed</h2>
				<p class="regen-error-detail regen-error-detail-lg">
					{generationError.value.replace(/^Generation failed:\s*/, '')}
				</p>
				<button class="btn-primary btn-lg btn-branded" onclick={handleRetry}>
					{hasStageCache() ? 'Resume' : 'Try Again'}
				</button>
				<div class="regen-error-secondary">
					{#if hasStageCache()}
						<button class="btn-secondary" onclick={handleStartFresh}>Start Fresh</button>
					{/if}
					{#if historyCount > 0}
						<button class="btn-secondary" onclick={goBack}>View last diff</button>
					{/if}
				</div>
			</div>
		{:else}
			<div class="regen-center">
				<div class="logo-mark">&#9670;</div>
				<h2 class="regen-heading-lg">{isTodayDiff ? 'Ready to regenerate' : 'Ready to generate'}</h2>

				<div class="regen-options-lg">
					<div class="regen-depth-row">
						<span class="regen-depth-label">Depth</span>
						{#each DEPTHS as d, i}
							{#if i > 0}<span class="regen-depth-dot">&middot;</span>{/if}
							<button
								class="regen-depth-btn"
								class:regen-depth-active={(selectedDepthOverride || getProfile()?.depth || 'standard') === d.id}
								onclick={() => { selectedDepthOverride = d.id; }}
							>
								{d.label}
							</button>
						{/each}
					</div>
				</div>

				<button class="btn-primary btn-lg btn-branded" onclick={handleGenerate}>
					{isTodayDiff ? 'Regenerate Diff' : 'Generate Diff'}
				</button>

				{#if historyCount > 0}
					<button class="btn-secondary" onclick={goBack}>Back home</button>
				{/if}

				<p class="regen-provider-hint">{providersText}</p>
			</div>
		{/if}
	</main>

	<SiteFooter />
{/if}

<style>
	/* Mobile: full-viewport card */
	.regen-page {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 3rem;
		background: var(--bg-base);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.regen-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0 2rem;
		min-height: 0;
	}

	.regen-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
		max-width: 18rem;
	}

	/* Bottom meta — sits above footer */
	.regen-meta {
		flex-shrink: 0;
	}

	/* Diamond logo */
	.regen-diamond {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		font-size: 1.3rem;
		color: var(--accent);
	}

	.regen-diamond::after {
		content: '\25C7';
		position: absolute;
		font-size: 2.5rem;
		color: var(--accent);
	}

	/* Catch-up label */
	.regen-ago {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-heading);
		line-height: 1.3;
	}

	.regen-stale-text {
		font-size: 0.85rem;
		color: var(--text-subtle);
		line-height: 1.5;
		margin: 0;
	}

	.regen-link {
		color: var(--accent);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
	}

	/* Headings */
	.regen-heading {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-heading);
		line-height: 1.3;
	}

	.regen-heading-lg {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--text-heading);
		line-height: 1.3;
		margin: 0;
	}

	/* Depth options (desktop) */
	.regen-options-lg {
		padding: 0.75rem 1rem;
		background: var(--bg-chip);
		border-radius: var(--radius-md);
		max-width: 500px;
		margin: 0 auto;
	}

	.regen-depth-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		justify-content: center;
	}

	.regen-depth-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--accent);
		flex-shrink: 0;
		margin-right: 0.2rem;
	}

	.regen-depth-dot {
		color: var(--text-hint);
		font-size: 0.75rem;
	}

	.regen-depth-btn {
		font-size: 0.85rem;
		font-family: inherit;
		color: var(--text-hint);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.regen-depth-btn:hover {
		color: var(--text-secondary);
	}

	.regen-depth-active {
		color: var(--text-primary);
		font-weight: 600;
	}

	/* Provider hint */
	.regen-provider-hint {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin: 0;
	}

	/* Bottom meta section (tags + stats) */
	.regen-meta {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 1.25rem 1rem;
	}

	.regen-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: center;
	}

	.regen-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-hint);
		background: var(--bg-chip);
		padding: 0.2rem 0.45rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}

	/* Scan animation */
	.regen-scan-bar {
		width: 200px;
		height: 3px;
		background: var(--bg-chip);
		border-radius: 2px;
		overflow: hidden;
		position: relative;
	}

	.regen-scan-bar-lg {
		width: 280px;
		height: 4px;
	}

	.regen-scan-line {
		position: absolute;
		width: 40%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		animation: regen-scan 1.5s ease-in-out infinite;
	}

	@keyframes regen-scan {
		0% { left: -40%; }
		100% { left: 100%; }
	}

	.regen-scan-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 1.75rem;
	}

	.regen-scan-icon {
		font-size: 1.1rem;
		animation: regen-pulse 1s ease-in-out infinite;
	}

	@keyframes regen-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.regen-scan-text {
		font-size: 0.85rem;
		color: var(--accent);
		margin: 0;
		font-weight: 500;
	}

	.regen-dots {
		display: flex;
		gap: 0.35rem;
	}

	.regen-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--bg-chip);
		transition: background 0.3s;
	}

	.regen-dot-on {
		background: var(--accent);
	}

	.regen-subtext {
		font-size: 0.75rem;
		color: var(--text-disabled);
		margin: 0;
	}

	/* Error state */
	.regen-error-icon {
		font-size: 1.5rem;
		color: var(--error, #dc3545);
	}

	.regen-error-detail {
		font-size: 0.8rem;
		color: var(--text-secondary);
		background: var(--bg-chip);
		border-left: 3px solid var(--error, #dc3545);
		padding: 0.75rem 1rem;
		border-radius: var(--radius-sm);
		text-align: left;
		line-height: 1.5;
		margin: 0;
		max-width: 18rem;
	}

	.regen-error-detail-lg {
		max-width: 480px;
		padding: 0.875rem 1.25rem;
		font-size: 0.9rem;
	}

	.regen-error-secondary {
		display: flex;
		gap: 0.5rem;
	}

	/* Desktop layout */
	.regen-desktop {
		text-align: center;
		padding: 4rem 2rem;
	}

	.regen-desktop .regen-center {
		max-width: 500px;
		margin: 0 auto;
	}
</style>
