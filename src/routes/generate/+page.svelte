<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import { browser } from "$app/environment";
	import { getProfile, isDemoProfile } from "$lib/stores/profiles.svelte";
	import { getHistory, getStreak } from "$lib/stores/history.svelte";
	import { isMobile, mobileDiff } from "$lib/stores/mobile.svelte";
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
	import StreakCalendar from '../StreakCalendar.svelte';
	import '../../styles/focus.css';

	let showStreakCalendar = $state(false);

	function goToDiffOnDate(isoDate: string) {
		const history = getHistory();
		const match = history.find((d) => {
			const dd = new Date(d.generated_at);
			const iso = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
			return iso === isoDate;
		});
		if (match) {
			showStreakCalendar = false;
			goto(`/d/${match.id}`);
		}
	}

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

	const heading = $derived(
		!hasDiff ? `Welcome, ${getProfile()?.name || 'Developer'}`
		: isTodayDiff && !forceNew ? 'Ready to regenerate'
		: 'Ready to generate'
	);

	const buttonLabel = $derived(
		isTodayDiff && !forceNew ? 'Regenerate'
		: hasDiff ? 'Generate new diff'
		: 'Generate Diff'
	);

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

	// Slide animation state (mobile)
	let slideOut = $state(false);
	let slideInDir: 'left' | 'right' | null = $state(null);
	let swiping = false;

	function goBack() {
		if (swiping) return;
		swiping = true;
		slideOut = true;
		mobileDiff.pendingSlideIn = 'left';
		setTimeout(() => {
			clearGenerationState();
			goto("/");
		}, 200);
	}

	// Swipe right to go back to latest diff (mobile)
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
		if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
			goBack();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'ArrowLeft') return;
		if (genState !== 'ready') return;
		if (!hasDiff) return;
		const target = e.target as HTMLElement | null;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
		e.preventDefault();
		goBack();
	}

	onMount(() => {
		if (generating.value) startScanAnimation();
		mobileDiff.navigateBack = goBack;
		const pending = mobileDiff.pendingSlideIn;
		if (pending) {
			slideInDir = pending;
			mobileDiff.pendingSlideIn = null;
			setTimeout(() => { slideInDir = null; }, 250);
		}
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
		mobileDiff.navigateBack = null;
		if (browser) window.onbeforeunload = null;
	});
</script>

<!-- Shared content snippets -->

{#snippet generatingContent()}
	<div class="gen-center">
		<div class="gen-scan-bar">
			<div class="gen-scan-line"></div>
		</div>
		<div class="gen-scan-msg">
			<span class="gen-scan-icon">{scanMessages[scanIndex].icon}</span>
			<p class="gen-scan-text">{scanMessages[scanIndex].text}</p>
		</div>
		<div class="gen-dots">
			{#each Array(8) as _, i}
				<div class="gen-dot" class:gen-dot-on={i <= scanIndex % 8}></div>
			{/each}
		</div>
		<p class="gen-subtext">{estimatedTime(waitTip)}</p>
	</div>
{/snippet}

{#snippet errorContent()}
	<div class="gen-center">
		<span class="gen-error-icon">&#9670;</span>
		<span class="gen-heading">Generation failed</span>
		<p class="gen-error-detail">
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
{/snippet}

{#snippet readyContent()}
	<div class="gen-center">
		<div class="gen-diamond">&#9670;</div>
		<span class="gen-heading">{heading}</span>
		{#if !hasDiff}
			<p class="gen-body-text">A diff is your personalized changelog for the developer ecosystem — releases, announcements, and developments filtered to what you care about.</p>
			<p class="gen-body-text">Hit generate and we'll scan what's new across your stack.</p>
		{:else}
			{#if catchUpLabel}
				<span class="gen-ago">{catchUpLabel}</span>
			{/if}
			{#if isStale}
				<p class="gen-body-text">{staleText}</p>
			{:else if isTodayDiff && !forceNew}
				<p class="gen-body-text">You've already generated today's diff. Regenerate to refresh it, or you can <!-- svelte-ignore a11y_invalid_attribute --><a href="#" class="gen-link" onclick={(e) => { e.preventDefault(); forceNew = true; }}>generate another</a>.</p>
			{:else if isTodayDiff && forceNew}
				<p class="gen-body-text">This will create a separate diff, or you can <!-- svelte-ignore a11y_invalid_attribute --><a href="#" class="gen-link" onclick={(e) => { e.preventDefault(); forceNew = false; }}>regenerate today's</a>.</p>
			{:else}
				<p class="gen-body-text">Generate a personalized diff of what's changed in your dev ecosystem.</p>
			{/if}
			{#if !isMobile.value}
				<div class="gen-depth-options">
					<div class="gen-depth-row">
						<span class="gen-depth-label">Depth</span>
						{#each DEPTHS as d, i}
							{#if i > 0}<span class="gen-depth-dot">&middot;</span>{/if}
							<button
								class="gen-depth-btn"
								class:gen-depth-active={(selectedDepthOverride || getProfile()?.depth || 'standard') === d.id}
								onclick={() => { selectedDepthOverride = d.id; }}
							>
								{d.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}
		{/if}
		<button class="btn-primary btn-branded" onclick={handleGenerate}>
			{buttonLabel}
		</button>
		{#if !isMobile.value && historyCount > 0}
			<button class="btn-secondary" onclick={goBack}>Back home</button>
		{/if}
		<p class="gen-provider-hint">{providersText}</p>
	</div>
{/snippet}

{#snippet pageContent()}
	{#if genState === 'generating'}
		{@render generatingContent()}
	{:else if genState === 'error'}
		{@render errorContent()}
	{:else}
		{@render readyContent()}
	{/if}
{/snippet}

<!-- Page layout -->

<svelte:head>
	<title>{generating.value ? "Generating..." : isTodayDiff ? "Regenerate" : "Generate"} | diff·log</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if isMobile.value}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="gen-mobile"
		ontouchstart={handleTouchStart}
		ontouchend={handleTouchEnd}
	>
	<div class="gen-mobile-inner"
		class:gen-slide-in={slideInDir === 'right'}
		class:gen-slide-in-left={slideInDir === 'left'}
		class:gen-slide-out={slideOut}
	>
		<MobileHeader />

		<div class="gen-mobile-body">
			{@render pageContent()}
		</div>

		{#if genState === 'ready' && profileInterests.length > 0}
			<div class="gen-meta">
				<div class="gen-tags">
					{#each profileInterests as tag}
						<span class="gen-tag">{tag}</span>
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
			{#if streak.streak > 1}
				<button class="gen-streak-btn" onclick={() => showStreakCalendar = !showStreakCalendar}>
					<span>&#128293;</span> {streak.streak} day streak
				</button>
			{/if}
		</footer>

		{#if showStreakCalendar}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div class="gen-streak-overlay" onclick={() => showStreakCalendar = false}>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="gen-streak-panel" onclick={(e) => e.stopPropagation()}>
					<StreakCalendar onDayClick={goToDiffOnDate} />
				</div>
			</div>
		{/if}
	</div>
	</div>
{:else}
	<PageHeader>
		<HeaderNav />
	</PageHeader>

	<main class="gen-desktop">
		{@render pageContent()}
	</main>

	<SiteFooter />
{/if}

<style>
	/* ── Shared content styles ── */

	.gen-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
	}

	/* Diamond logo */
	.gen-diamond {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		font-size: 1.3rem;
		color: var(--accent);
	}

	.gen-diamond::after {
		content: '\25C7';
		position: absolute;
		font-size: 2.5rem;
		color: var(--accent);
	}

	/* Heading */
	.gen-heading {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-heading);
		line-height: 1.3;
	}

	/* Catch-up label */
	.gen-ago {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-heading);
		line-height: 1.3;
	}

	/* Body text */
	.gen-body-text {
		font-size: 0.85rem;
		color: var(--text-subtle);
		line-height: 1.5;
		margin: 0;
	}

	.gen-link {
		color: var(--accent);
		text-decoration: underline dotted;
		text-underline-offset: 2px;
	}

	/* Provider hint */
	.gen-provider-hint {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin: 0;
	}

	/* Depth options */
	.gen-depth-options {
		padding: 0.75rem 1rem;
		background: var(--bg-chip);
		border-radius: var(--radius-md);
		max-width: 500px;
		margin: 0 auto;
	}

	.gen-depth-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		justify-content: center;
	}

	.gen-depth-label {
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--accent);
		flex-shrink: 0;
		margin-right: 0.2rem;
	}

	.gen-depth-dot {
		color: var(--text-hint);
		font-size: 0.75rem;
	}

	.gen-depth-btn {
		font-size: 0.85rem;
		font-family: inherit;
		color: var(--text-hint);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
	}

	.gen-depth-btn:hover {
		color: var(--text-secondary);
	}

	.gen-depth-active {
		color: var(--text-primary);
		font-weight: 600;
	}

	/* Scan animation */
	.gen-scan-bar {
		width: 200px;
		height: 3px;
		background: var(--bg-chip);
		border-radius: 2px;
		overflow: hidden;
		position: relative;
	}

	.gen-scan-line {
		position: absolute;
		width: 40%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		animation: gen-scan 1.5s ease-in-out infinite;
	}

	@keyframes gen-scan {
		0% { left: -40%; }
		100% { left: 100%; }
	}

	.gen-scan-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 1.75rem;
	}

	.gen-scan-icon {
		font-size: 1.1rem;
		animation: gen-pulse 1s ease-in-out infinite;
	}

	@keyframes gen-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.gen-scan-text {
		font-size: 0.85rem;
		color: var(--accent);
		margin: 0;
		font-weight: 500;
	}

	.gen-dots {
		display: flex;
		gap: 0.35rem;
	}

	.gen-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--bg-chip);
		transition: background 0.3s;
	}

	.gen-dot-on {
		background: var(--accent);
	}

	.gen-subtext {
		font-size: 0.75rem;
		color: var(--text-disabled);
		margin: 0;
	}

	/* Error state */
	.gen-error-icon {
		font-size: 1.5rem;
		color: var(--error, #dc3545);
	}

	.gen-error-detail {
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

	/* ── Mobile layout ── */

	.gen-mobile {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 3rem;
		background: var(--bg-base);
	}

	.gen-mobile-inner {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.gen-mobile-body {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0 2rem;
		min-height: 0;
	}

	.gen-mobile .gen-center {
		max-width: 18rem;
	}

	/* Tags */
	.gen-meta {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 1.25rem 1rem;
	}

	.gen-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: center;
	}

	.gen-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-hint);
		background: var(--bg-chip);
		padding: 0.2rem 0.45rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}

	/* Slide animations */
	.gen-slide-in {
		animation: gen-slide-in 0.25s ease-out forwards;
	}

	.gen-slide-in-left {
		animation: gen-slide-in-left 0.25s ease-out forwards;
	}

	.gen-slide-out {
		animation: gen-slide-out 0.2s ease-in forwards;
	}

	@keyframes gen-slide-in {
		from { transform: translateX(30%); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}

	@keyframes gen-slide-in-left {
		from { transform: translateX(-30%); opacity: 0; }
		to { transform: translateX(0); opacity: 1; }
	}

	@keyframes gen-slide-out {
		from { transform: translateX(0); opacity: 1; }
		to { transform: translateX(30%); opacity: 0; }
	}

	/* ── Desktop layout ── */

	.gen-desktop {
		text-align: center;
		padding: 4rem 2rem;
	}

	.gen-desktop .gen-center {
		max-width: 500px;
		margin: 0 auto;
	}

	.gen-desktop .gen-heading {
		font-size: 1.6rem;
	}

	.gen-desktop .gen-scan-bar {
		width: 280px;
		height: 4px;
	}

	.gen-desktop .gen-error-detail {
		max-width: 480px;
		padding: 0.875rem 1.25rem;
		font-size: 0.9rem;
	}

	/* Streak button in footer */
	.gen-streak-btn {
		background: none;
		border: none;
		padding: 0;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-hint);
		cursor: pointer;
		transition: color 0.15s;
	}

	.gen-streak-btn:hover {
		color: var(--accent);
	}

	/* Streak calendar overlay */
	.gen-streak-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 20;
		animation: gen-fade-in 0.15s ease;
	}

	.gen-streak-panel {
		background: var(--bg-base);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		padding: 1rem;
		min-width: 80vw;
	}

	/* Override StreakCalendar's hidden dropdown to show inline */
	.gen-streak-panel :global(.streak-badge) {
		display: none;
	}

	.gen-streak-panel :global(.streak-wrapper) {
		display: block;
	}

	.gen-streak-panel :global(.streak-dropdown) {
		position: static;
		opacity: 1;
		visibility: visible;
		transform: none;
		pointer-events: auto;
		transition: none;
		background: transparent;
		border: none;
		box-shadow: none;
		padding: 0;
		min-width: auto;
		width: 100%;
	}

	.gen-streak-panel :global(.streak-dropdown::before) {
		display: none;
	}

	@keyframes gen-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
