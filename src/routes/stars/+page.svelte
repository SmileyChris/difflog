<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel, getStarContent, type Star } from '$lib/stores/stars.svelte';
	import { addStar, removeStar } from '$lib/stores/operations.svelte';
	import { createSwipeState } from '$lib/actions/swipeToReveal.svelte';
	import { timeAgo } from '$lib/utils/time.svelte';
	import { HeaderNav, SiteFooter, PageHeader } from '$lib/components';
	import { isMobile } from '$lib/stores/mobile.svelte';
	import MobileHeader from '$lib/components/mobile/MobileHeader.svelte';

	const swipe = createSwipeState();
	let listEl: HTMLDivElement;

	// Removed stars kept locally for undo
	let removedStars = $state<Map<string, Star>>(new Map());

	function starKey(star: Star) {
		return `${star.diff_id}:${star.p_index}`;
	}

	function isRemoved(key: string) {
		return removedStars.has(key);
	}

	function doRemove(star: Star) {
		const key = starKey(star);
		removedStars.set(key, star);
		removedStars = new Map(removedStars);
		removeStar(star.diff_id, star.p_index);
	}

	function undoRemove(key: string) {
		const star = removedStars.get(key);
		if (!star) return;
		removedStars.delete(key);
		removedStars = new Map(removedStars);
		addStar(star);
	}

	// Merged list: active stars + removed placeholders, sorted by added_at
	const displayStars = $derived.by(() => {
		const active = getStars();
		const removed = [...removedStars.values()];
		const all = removed.length > 0 ? [...active, ...removed] : [...active];
		all.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
		return all;
	});

	function goToStar(star: Star) {
		if (swipe.didSwipe) return;
		goto(`/d/${star.diff_id}`, { state: { scrollToPIndex: star.p_index } });
	}

	function handleUnstar(e: MouseEvent, star: Star) {
		e.stopPropagation();
		removeStar(star.diff_id, star.p_index);
	}

	function handleSwipeEnd() {
		swipe.end((id) => {
			const star = displayStars.find(s => starKey(s) === id);
			if (!star || isRemoved(id)) return;
			const hasContent = !!getStarContent(star);
			if (hasContent) {
				doRemove(star);
			} else {
				removeStar(star.diff_id, star.p_index);
			}
		});
	}

	onMount(() => {
		if (!listEl) return;
		const handler = (e: TouchEvent) => swipe.move(e);
		listEl.addEventListener('touchmove', handler, { passive: false });
		return () => listEl.removeEventListener('touchmove', handler);
	});

	function shortDate(dateStr: string): string {
		const d = new Date(dateStr);
		const day = d.getDate();
		const month = d.toLocaleDateString('en-US', { month: 'short' });
		if (d.getFullYear() !== new Date().getFullYear()) {
			return `${day} ${month} ${d.getFullYear()}`;
		}
		return `${day} ${month}`;
	}

	const stars = $derived(getStars());
</script>

<svelte:head>
	<title>diff·log - Stars</title>
</svelte:head>

{#if isMobile.value}
	<MobileHeader />
{:else}
	<PageHeader pageTitle="stars" subtitle={getStarCountLabel()} icon="star">
		<HeaderNav />
	</PageHeader>
{/if}

<main id="content">
	<div class="stars-section-header">
		<span class="stars-section-label">Stars</span>
		<span class="stars-section-count">{stars.length} {stars.length === 1 ? 'star' : 'stars'}</span>
	</div>
	{#if !displayStars?.length}
		<p class="stars-empty">No stars yet</p>
	{:else}
		<div class="passages" bind:this={listEl}>
			{#each displayStars as star, i (star.diff_id + ':' + star.p_index)}
				{@const starContent = getStarContent(star)}
				{@const key = starKey(star)}
				{#if isRemoved(key) && starContent}
					<div class="swipe-container" style="animation-delay: {Math.min(i * 30, 300)}ms">
						<div class="passage passage-removed">
							<div class="passage-content">
								{@html starContent.html}
							</div>
							<div class="passage-meta">
								<span class="passage-origin">
									<span class="passage-diamond">&#9670;</span>
									{starContent.diff_title}
								</span>
								<span class="passage-date">{shortDate(starContent.diff_date)}</span>
							</div>
							<div class="passage-removed-overlay">
								<div class="passage-removed-pill">
									<span class="passage-removed-label">Removed</span>
									<button class="passage-undo" onclick={() => undoRemove(key)}>Undo</button>
								</div>
							</div>
						</div>
					</div>
				{:else if starContent}
					<div class="swipe-container" style="animation-delay: {Math.min(i * 30, 300)}ms">
						{#if isMobile.value && swipe.current?.id === key && swipe.current.direction === 'horizontal'}
							<div class="swipe-delete-zone" class:swipe-delete-zone-active={swipe.isPastThreshold(key)}>
								<span class="swipe-delete-icon">&#9734;</span>
							</div>
						{/if}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="passage"
							style:transform={isMobile.value ? `translateX(${swipe.offset(key)}px)` : undefined}
							style:transition={swipe.isAnimating(key) ? 'transform 0.2s ease-out' : 'none'}
							ontouchstart={isMobile.value ? (e) => swipe.start(e, key) : undefined}
							ontouchend={isMobile.value ? handleSwipeEnd : undefined}
							onclick={() => goToStar(star)}
						>
							<div class="passage-content">
								{#if star.added_at}<span class="passage-starred"><span class="passage-starred-icon">&#9733;</span> {timeAgo(star.added_at)}</span>{/if}
								{@html starContent.html}
							</div>
							<div class="passage-meta">
								<span class="passage-origin">
									<span class="passage-diamond">&#9670;</span>
									{starContent.diff_title}
								</span>
								<span class="passage-date">{shortDate(starContent.diff_date)}</span>
								{#if !isMobile.value}
									<button
										class="passage-unstar"
										title="Remove star"
										onclick={(e) => handleUnstar(e, star)}
									>unstar</button>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<div class="swipe-container" style="animation-delay: {Math.min(i * 30, 300)}ms">
						{#if isMobile.value && swipe.current?.id === key && swipe.current.direction === 'horizontal'}
							<div class="swipe-delete-zone" class:swipe-delete-zone-active={swipe.isPastThreshold(key)}>
								<span class="swipe-delete-icon">&#9734;</span>
							</div>
						{/if}
						<div
							class="passage passage-orphan"
							style:transform={isMobile.value ? `translateX(${swipe.offset(key)}px)` : undefined}
							style:transition={swipe.isAnimating(key) ? 'transform 0.2s ease-out' : 'none'}
							ontouchstart={isMobile.value ? (e) => swipe.start(e, key) : undefined}
							ontouchend={isMobile.value ? handleSwipeEnd : undefined}
						>
							<div class="passage-content passage-content-orphan">
								The diff containing this star has been deleted.
							</div>
							<div class="passage-meta">
								<span class="passage-origin">
									<span class="passage-diamond passage-diamond-dim">&#9670;</span>
									Deleted diff
								</span>
								{#if !isMobile.value}
									<button
										class="passage-unstar passage-unstar-visible"
										title="Remove star"
										onclick={(e) => handleUnstar(e, star)}
									>remove</button>
								{/if}
							</div>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	{#if isMobile.value}
		<p class="stars-hint stars-hint-touch" class:stars-hint-faded={!stars?.length}>Double-tap an article to star/unstar it</p>
		<p class="stars-hint stars-hint-pointer" class:stars-hint-faded={!stars?.length}>Click the small star to star/unstar an article</p>
	{/if}
</main>

<SiteFooter />

<style>
	/* Section header — matches archive month header */
	.stars-section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0 0.5rem;
		margin-bottom: 0.25rem;
	}

	.stars-section-label {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--text-heading);
	}

	.stars-section-count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-disabled);
	}

	.passages {
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	/* Each passage */
	.passage {
		position: relative;
		z-index: 1;
		cursor: pointer;
		background: var(--bg-base);
		transition: background 0.15s;
	}

	.swipe-container {
		animation: passage-in 0.25s ease both;
	}

	:global(.mobile-layout) .swipe-container {
		margin: 0 -1rem;
	}

	:global(.mobile-layout) .passage {
		padding: 0 1rem;
	}

	@media (pointer: fine) {
		.passage:hover {
			background: var(--accent-bg);
			padding-left: 1rem;
			margin-left: -1rem;
			padding-right: 1rem;
			margin-right: -1rem;
			border-radius: var(--radius);
		}
	}

	/* Removed state — faded content with overlay */
	.passage-removed {
		cursor: default;
	}

	.passage-removed:hover {
		background: transparent;
		padding-left: 0;
		margin-left: 0;
		padding-right: 0;
		margin-right: 0;
	}

	.passage-removed > .passage-content,
	.passage-removed > .passage-meta {
		opacity: 0.3;
		pointer-events: none;
	}

	.passage-removed-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.passage-removed-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--bg-surface);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		padding: 0.3rem 0.65rem;
	}

	.passage-removed-label {
		font-size: 0.75rem;
		color: var(--text-disabled);
	}

	.passage-undo {
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: 0.75rem;
		color: var(--accent);
		cursor: pointer;
		transition: opacity 0.15s;
	}

	.passage-undo:hover {
		opacity: 0.7;
	}

	/* Content — 2 line clamp */
	.passage-content {
		font-size: 0.85rem;
		color: var(--text-primary);
		line-height: 1.5;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.passage-content :global(.md-p),
	.passage-content :global(.md-list-item) {
		margin: 0;
		font-size: inherit;
		padding-left: 0;
		border-left: none;
	}

	.passage-content :global(.md-p)::after,
	.passage-content :global(.md-list-item)::after {
		display: none !important;
	}

	.passage-content :global(ul),
	.passage-content :global(ol) {
		list-style: none;
		padding-left: 0;
		margin: 0;
	}

	.passage-content :global(li) {
		padding-left: 0;
	}

	.passage-content :global(li)::marker {
		content: none;
	}

	.passage-content :global(a) {
		color: inherit;
		text-decoration: none;
		pointer-events: none;
	}

	/* Starred time — floated right of article text */
	.passage-starred {
		float: right;
		font-size: 0.65rem;
		color: var(--text-disabled);
		margin-left: 1rem;
		line-height: 2;
	}

	.passage-starred-icon {
		color: #d4a017;
	}

	.passage-content-orphan {
		font-style: italic;
		color: var(--text-disabled);
	}

	/* Meta row below content */
	.passage-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.35rem;
		font-size: 0.7rem;
		color: var(--text-hint);
	}

	.passage-origin {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-width: 0;
	}

	.passage-diamond {
		color: var(--accent);
		font-size: 0.5rem;
		flex-shrink: 0;
	}

	.passage-diamond-dim {
		color: var(--text-disabled);
	}

	.passage-date {
		margin-left: auto;
		color: var(--text-disabled);
		flex-shrink: 0;
	}

	/* Unstar link */
	.passage-unstar {
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
		font-size: 0.65rem;
		color: var(--text-disabled);
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
	}

	.passage:hover .passage-unstar {
		opacity: 1;
	}

	.passage-unstar:hover {
		color: var(--danger);
	}

	.passage-unstar-visible {
		opacity: 1;
	}

	/* Orphan */
	.passage-orphan {
		opacity: 0.5;
		cursor: default;
	}

	.passage-orphan:hover {
		background: transparent;
		padding-left: 0;
		margin-left: 0;
		padding-right: 0;
		margin-right: 0;
	}

	/* Empty state */
	.stars-empty {
		padding: 3rem 0;
		text-align: center;
		color: var(--text-disabled);
		font-size: 0.85rem;
		margin: 0;
	}

	/* Mobile hint */
	.stars-hint {
		margin: 1.5rem 0 0;
		font-size: 0.7rem;
		color: var(--text-disabled);
		text-align: center;
	}

	.stars-hint-faded {
		opacity: 0.5;
	}

	.stars-hint-pointer {
		display: none;
	}

	@media (pointer: fine) {
		.stars-hint-touch {
			display: none;
		}
		.stars-hint-pointer {
			display: block;
		}
	}

	/* Entrance */
	@keyframes passage-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
</style>
