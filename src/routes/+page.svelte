<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getProfile, isDemoProfile } from '$lib/stores/profiles.svelte';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { getStreak } from '$lib/stores/history.svelte';
	import { getCachedPassword, hasPendingChanges } from '$lib/stores/sync.svelte';
	import { openSyncDropdown, generating, generationError, hasStageCache, clearStageCache, clearGenerationState } from '$lib/stores/ui.svelte';
	import { isMobile, mobileDiff } from '$lib/stores/mobile.svelte';
	import { HeaderNav, DiffView, SiteFooter, PageHeader } from '$lib/components';
	import CardView from '$lib/components/mobile/CardView.svelte';
	import MobileHeader from '$lib/components/mobile/MobileHeader.svelte';
	import StreakCalendar from './StreakCalendar.svelte';
	import { daysSince } from '$lib/utils/time.svelte';
	import { SCAN_MESSAGES } from '$lib/utils/constants';
	import { startGeneration, estimatedTime, randomWaitTip } from '$lib/actions/startGeneration';

	let syncBannerDismissed = $state(false);

	const diff = $derived(getHistory()[0] ?? null);

	// Set mobile diff context for layout
	$effect(() => {
		mobileDiff.diff = diff;
	});

	// --- Mobile inline generation state ---
	let mScanIndex = $state(0);
	let mScanMessages = $state([...SCAN_MESSAGES].sort(() => Math.random() - 0.5));
	let mWaitTip = $state(randomWaitTip());
	let mScanInterval: ReturnType<typeof setInterval> | null = null;

	function mStartScan() {
		mScanInterval = setInterval(() => {
			mScanIndex = (mScanIndex + 1) % mScanMessages.length;
		}, 4400);
	}

	function mStopScan() {
		if (mScanInterval) {
			clearInterval(mScanInterval);
			mScanInterval = null;
		}
	}

	async function handleMobileGenerate() {
		generationError.value = null;
		mScanIndex = 0;
		mScanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
		mWaitTip = randomWaitTip();

		await startGeneration({
			onScanStart: mStartScan,
			onScanStop: mStopScan,
			onSuccess: () => {
				mStopScan();
				slideToCards();
			},
		});
	}

	function handleMobileRetry() {
		handleMobileGenerate();
	}

	function handleMobileStartFresh() {
		clearStageCache();
		handleMobileGenerate();
	}

	// Mobile generation state: 'ready' | 'generating' | 'error'
	const mobileGenState = $derived.by(() => {
		if (generating.value) return 'generating' as const;
		if (generationError.value) return 'error' as const;
		return 'ready' as const;
	});

	onMount(() => {
		// On mobile, resume scan animation on the card instead of redirecting
		if (isMobile.value && generating.value) {
			showGenerateCard = true;
			mStartScan();
		} else if (generating.value && !diff) {
			goto('/generate');
		}
	});

	onDestroy(() => {
		mStopScan();
	});

	function goToDiffOnDate(isoDate: string) {
		const history = getHistory();
		const matches = history.filter((d) => {
			const diffDate = new Date(d.generated_at);
			const diffIso = `${diffDate.getFullYear()}-${String(diffDate.getMonth() + 1).padStart(2, '0')}-${String(diffDate.getDate()).padStart(2, '0')}`;
			return diffIso === isoDate;
		});
		if (matches.length === 0) return;
		if (matches[0].id === diff?.id) return;
		goto(`/d/${matches[0].id}`);
	}

	const lastDiffDays = $derived(getHistory().length > 0 ? daysSince(getHistory()[0].generated_at) : Infinity);

	const isTodayDiff = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return false;
		return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
	});

	const isStale = $derived(lastDiffDays > 5);

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

	function needsSyncPrompt(): boolean {
		if (syncBannerDismissed) return false;
		if (!getProfile()?.syncedAt) return false;
		if (getCachedPassword()) return false;
		return hasPendingChanges();
	}

	// Profile context for generate card
	const profile = $derived(getProfile());
	const streak = $derived(getStreak());
	const historyCount = $derived(getHistory().length);

	const profileInterests = $derived.by(() => {
		const p = profile;
		if (!p) return [];
		const items: string[] = [];
		if (p.languages?.length) items.push(...p.languages);
		if (p.frameworks?.length) items.push(...p.frameworks);
		if (p.tools?.length) items.push(...p.tools);
		return items.slice(0, 6);
	});

	const forceScroll = $derived(page.url?.searchParams?.get('scroll') === '1');

	// Mobile state: toggle between generate card and diff card view
	// Start on generate card when stale, on diff cards when fresh
	// Only auto-set on initial load (not after generation completes, which would fight the slide)
	let showGenerateCard = $state(false);
	let initialShowSet = false;
	$effect(() => {
		// Read isStale to track it
		const stale = isStale;
		if (!initialShowSet) {
			initialShowSet = true;
			showGenerateCard = stale;
		}
	});

	// Slide animation state for generate card transitions
	let slideDirection: 'left' | 'right' | null = $state(null);
	let slideIn: 'left' | 'right' | null = $state(null);

	function slideToCards() {
		slideDirection = 'right';
		setTimeout(() => {
			slideDirection = null;
			slideIn = 'left';
			showGenerateCard = false;
			setTimeout(() => { slideIn = null; }, 250);
		}, 200);
	}

	function slideToGenerate() {
		slideIn = 'right';
		showGenerateCard = true;
		setTimeout(() => { slideIn = null; }, 250);
	}

	// Swipe on generate card — disabled during generation
	let genTouchStartX = 0;
	let genTouchStartY = 0;

	function handleGenTouchStart(e: TouchEvent) {
		genTouchStartX = e.touches[0].clientX;
		genTouchStartY = e.touches[0].clientY;
	}

	function handleGenTouchEnd(e: TouchEvent) {
		if (mobileGenState !== 'ready') return;
		const dx = e.changedTouches[0].clientX - genTouchStartX;
		const dy = e.changedTouches[0].clientY - genTouchStartY;
		// Swipe right → go to latest diff (older direction)
		if (dx > 80 && Math.abs(dx) > Math.abs(dy) * 1.5 && diff) {
			slideToCards();
		}
	}

	const showMobile = $derived(isMobile.value && diff && !forceScroll);

	function handleExit() {
		// no-op — already on dashboard
	}
</script>

<svelte:head>
	<title>diff·log</title>
</svelte:head>

{#if showMobile}
	{#if showGenerateCard}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="mobile-gen"
			class:mobile-slide-out-left={slideDirection === 'left'}
			class:mobile-slide-out-right={slideDirection === 'right'}
			class:mobile-slide-in-left={slideIn === 'left'}
			class:mobile-slide-in-right={slideIn === 'right'}
			ontouchstart={handleGenTouchStart}
			ontouchend={handleGenTouchEnd}
		>
			<MobileHeader />

			<div class="mobile-gen-body">
				{#if mobileGenState === 'generating'}
					<div class="mobile-gen-cta">
						<div class="m-scan-animation">
							<div class="m-scan-line"></div>
						</div>
						<div class="m-scan-message">
							<span class="m-scan-icon">{mScanMessages[mScanIndex].icon}</span>
							<p class="m-scan-text">{mScanMessages[mScanIndex].text}</p>
						</div>
						<div class="m-scan-progress">
							{#each Array(8) as _, i}
								<div class="m-progress-dot" class:m-progress-dot-active={i <= mScanIndex % 8}></div>
							{/each}
						</div>
						<p class="m-scan-subtext">{estimatedTime(mWaitTip)}</p>
					</div>
				{:else if mobileGenState === 'error'}
					<div class="mobile-gen-cta">
						<span class="m-error-icon">&#9670;</span>
						<span class="mobile-gen-ago">Generation failed</span>
						<p class="m-error-detail">
							{generationError.value?.replace(/^Generation failed:\s*/, '') ?? 'Unknown error'}
						</p>
						<button class="btn-primary btn-branded" onclick={handleMobileRetry}>
							{hasStageCache() ? 'Resume' : 'Try Again'}
						</button>
						{#if hasStageCache()}
							<button class="btn-secondary" onclick={handleMobileStartFresh}>Start Fresh</button>
						{/if}
						{#if diff}
							<button class="btn-secondary" onclick={() => { clearGenerationState(); slideToCards(); }}>View last diff</button>
						{/if}
					</div>
				{:else}
					<div class="mobile-gen-cta">
						{#if catchUpLabel}
							<span class="mobile-gen-ago">{catchUpLabel}</span>
						{/if}
						{#if isStale}
							<p class="mobile-gen-text">{staleText}</p>
						{/if}
						<button class="btn-primary btn-branded" onclick={handleMobileGenerate}>{isTodayDiff ? 'Regenerate' : 'Generate new diff'}</button>
					</div>
				{/if}
			</div>

			{#if mobileGenState === 'ready'}
				<div class="mobile-gen-meta">
					{#if profileInterests.length > 0}
						<div class="mobile-gen-tags">
							{#each profileInterests as tag}
								<span class="mobile-gen-tag">{tag}</span>
							{/each}
						</div>
					{/if}
					<div class="mobile-gen-stats">
						{#if streak.streak > 0}
							<span class="mobile-gen-stat"><span class="mobile-gen-stat-val">{streak.streak}</span> day streak</span>
						{/if}
						<span class="mobile-gen-stat"><span class="mobile-gen-stat-val">{historyCount}</span> {historyCount === 1 ? 'diff' : 'diffs'}</span>
					</div>
				</div>
			{/if}
		</div>

		<footer class="mobile-gen-footer">
			{#if mobileGenState === 'ready'}
				<span class="mobile-gen-nav">
					<button class="mobile-gen-arrow" onclick={slideToCards}>&#8249;</button>
				</span>
			{/if}
		</footer>
	{:else}
		<div
			class="mobile-diff-page"
			class:mobile-slide-in-left={slideIn === 'left'}
			class:mobile-slide-in-right={slideIn === 'right'}
		>
			<CardView
				{diff}
				basePath="/d"
				onExit={handleExit}
				bind:visibleCard={mobileDiff.visibleCard}
				tabBarHeight={48}
				onFlatCards={(cards) => { mobileDiff.flatCards = cards; }}
				onNewest={slideToGenerate}
			/>
		</div>
	{/if}
{:else}
	<PageHeader>
		<div class="header-profile-group">
			{#if getStars()?.length > 0}
				<a href="/stars" class="header-link">
					<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
				</a>
			{/if}
			<HeaderNav />
		</div>
	</PageHeader>

	<main id="content">
		{#if isDemoProfile()}
			<div class="demo-banner">
				<span>This is a demo profile with sample data.</span>
				<a href="/setup" class="demo-banner-link">Create your own profile</a>
			</div>
		{:else if needsSyncPrompt()}
			<div class="sync-banner">
				<span>You have unsynced changes.</span>
				<button class="sync-banner-btn" onclick={() => openSyncDropdown()}>Sync now</button>
				<button class="sync-banner-dismiss" onclick={() => (syncBannerDismissed = true)}>&times;</button>
			</div>
		{/if}

		{#if diff}
			<DiffView {diff}>
				{#snippet infoExtra()}
					<StreakCalendar onDayClick={goToDiffOnDate} />
					{#if generating.value}
						<a href="/generate" class="btn-ghost btn-branded" aria-busy="true">Generating…</a>
					{:else if !isTodayDiff && !isStale}
						<a href="/generate" class="btn-ghost btn-branded">New Diff</a>
					{/if}
				{/snippet}
				{#snippet banners()}
					{#if isStale}
						<div class="stale-banner">
							<span>{staleText}</span>
							{#if generating.value}
								<a href="/generate" class="btn-ghost btn-branded" aria-busy="true">Generating…</a>
							{:else}
								<a href="/generate" class="btn-primary btn-branded stale-banner-btn">Generate new diff</a>
							{/if}
						</div>
					{/if}
				{/snippet}
				{#snippet footerAction()}
					<a href="/generate" class="btn-primary btn-sm btn-branded" aria-busy={generating.value || undefined}>
						{generating.value ? 'Generating…' : isTodayDiff ? 'Regenerate' : 'Generate'}
					</a>
				{/snippet}
			</DiffView>
		{/if}
	</main>

	<SiteFooter />
{/if}

<style>
	.sync-banner-btn {
		padding: 0.4rem 0.75rem;
		background: var(--accent);
		border: none;
		border-radius: var(--radius);
		color: var(--bg-base);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.sync-banner-btn:hover {
		background: var(--accent-muted);
	}

	.sync-banner-dismiss {
		background: none;
		border: none;
		color: var(--text-subtle);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		transition: color 0.15s;
	}

	.sync-banner-dismiss:hover {
		color: var(--text-secondary);
	}

	.demo-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: var(--bg-chip);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md);
		margin-bottom: 1rem;
		font-size: 0.9rem;
		color: var(--text-subtle);
	}

	.demo-banner-link {
		margin-left: auto;
		color: var(--accent);
		font-size: 0.85rem;
		white-space: nowrap;
	}

	/* Mobile generate card */
	.mobile-gen {
		position: fixed;
		inset: 0;
		bottom: 3rem;
		background: var(--bg-base);
		display: flex;
		flex-direction: column;
		z-index: 50;
	}

	.mobile-gen-body {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 2rem;
	}

	.mobile-gen-cta {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		text-align: center;
		max-width: 18rem;
	}

	.mobile-gen-ago {
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-heading);
		line-height: 1.3;
	}

	.mobile-gen-text {
		font-size: 0.85rem;
		color: var(--text-subtle);
		line-height: 1.5;
		margin: 0;
	}

	.mobile-gen-meta {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0 1.25rem 1rem;
	}

	.mobile-gen-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: center;
	}

	.mobile-gen-tag {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-hint);
		background: var(--bg-chip);
		padding: 0.2rem 0.45rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}

	.mobile-gen-stats {
		display: flex;
		justify-content: center;
		gap: 1rem;
		font-size: 0.7rem;
		color: var(--text-disabled);
	}

	.mobile-gen-stat-val {
		color: var(--text-subtle);
		font-weight: 600;
	}

	/* Generate card footer — matches focus-footer-mobile */
	.mobile-gen-footer {
		position: fixed;
		bottom: 3rem;
		left: 0;
		right: 0;
		padding: 0.5rem 1.25rem 0.75rem;
		display: flex;
		align-items: center;
		background: var(--bg-base);
		z-index: 51;
	}

	.mobile-gen-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: var(--text-disabled);
	}

	.mobile-gen-arrow {
		font-size: 0.9rem;
		color: var(--accent);
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		line-height: 1;
		transition: opacity 0.15s;
	}

	/* Mobile inline generation: scan animation */
	.m-scan-animation {
		width: 200px;
		height: 3px;
		background: var(--bg-chip);
		border-radius: 2px;
		overflow: hidden;
		position: relative;
	}

	.m-scan-line {
		position: absolute;
		width: 40%;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--accent), transparent);
		animation: m-scan 1.5s ease-in-out infinite;
	}

	@keyframes m-scan {
		0% { left: -40%; }
		100% { left: 100%; }
	}

	.m-scan-message {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		min-height: 1.75rem;
	}

	.m-scan-icon {
		font-size: 1.1rem;
		animation: m-pulse 1s ease-in-out infinite;
	}

	@keyframes m-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.m-scan-text {
		font-size: 0.85rem;
		color: var(--accent);
		margin: 0;
		font-weight: 500;
	}

	.m-scan-progress {
		display: flex;
		gap: 0.35rem;
	}

	.m-progress-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--bg-chip);
		transition: background 0.3s;
	}

	.m-progress-dot-active {
		background: var(--accent);
	}

	.m-scan-subtext {
		font-size: 0.75rem;
		color: var(--text-disabled);
		margin: 0;
	}

	/* Mobile inline generation: error state */
	.m-error-icon {
		font-size: 1.5rem;
		color: var(--error, #dc3545);
	}

	.m-error-detail {
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
</style>
