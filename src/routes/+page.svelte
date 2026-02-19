<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getProfile, isDemoProfile } from '$lib/stores/profiles.svelte';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { getStreak } from '$lib/stores/history.svelte';
	import { getCachedPassword, hasPendingChanges } from '$lib/stores/sync.svelte';
	import { openSyncDropdown, generating } from '$lib/stores/ui.svelte';
	import { isMobile, mobileDiff } from '$lib/stores/mobile.svelte';
	import { HeaderNav, DiffView, SiteFooter, PageHeader } from '$lib/components';
	import CardView from '$lib/components/mobile/CardView.svelte';
	import MobileHeader from '$lib/components/mobile/MobileHeader.svelte';
	import StreakCalendar from './StreakCalendar.svelte';
	import { daysSince } from '$lib/utils/time.svelte';

	let syncBannerDismissed = $state(false);

	const diff = $derived(getHistory()[0] ?? null);

	// Set mobile diff context for layout
	$effect(() => {
		mobileDiff.diff = diff;
	});

	onMount(() => {
		if (generating.value && !diff) {
			goto('/generate');
		}
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
	let showGenerateCard = $state(false);
	$effect(() => { showGenerateCard = isStale; });

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

	// Swipe on generate card
	let genTouchStartX = 0;
	let genTouchStartY = 0;

	function handleGenTouchStart(e: TouchEvent) {
		genTouchStartX = e.touches[0].clientX;
		genTouchStartY = e.touches[0].clientY;
	}

	function handleGenTouchEnd(e: TouchEvent) {
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
				<div class="mobile-gen-cta">
					{#if catchUpLabel}
						<span class="mobile-gen-ago">{catchUpLabel}</span>
					{/if}
					{#if isStale}
						<p class="mobile-gen-text">{staleText}</p>
					{/if}
					{#if generating.value}
						<a href="/generate" class="btn-primary btn-branded" aria-busy="true">Generating…</a>
					{:else}
						<a href="/generate" class="btn-primary btn-branded">{isTodayDiff ? 'Regenerate' : 'Generate new diff'}</a>
					{/if}
				</div>
			</div>

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
		</div>

		<footer class="mobile-gen-footer">
			<span class="mobile-gen-nav">
				<button class="mobile-gen-arrow" onclick={slideToCards}>&#8249;</button>
			</span>
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
</style>
