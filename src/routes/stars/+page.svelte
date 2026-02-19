<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel, getStarContent, type Star } from '$lib/stores/stars.svelte';
	import { removeStar } from '$lib/stores/operations.svelte';
	import { timeAgo } from '$lib/utils/time.svelte';
	import { HeaderNav, SiteFooter, PageHeader } from '$lib/components';
	import { isMobile } from '$lib/stores/mobile.svelte';
	import MobileHeader from '$lib/components/mobile/MobileHeader.svelte';

	function goToStar(star: Star) {
		goto(`/d/${star.diff_id}`, { state: { scrollToPIndex: star.p_index } });
	}

	function handleUnstar(e: MouseEvent, star: Star) {
		e.stopPropagation();
		removeStar(star.diff_id, star.p_index);
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
	{#if !stars?.length}
		<p class="stars-empty">No stars yet</p>
	{:else}
		<div class="passages">
			{#each stars as star, i (star.diff_id + ':' + star.p_index)}
				{@const starContent = getStarContent(star)}
				{#if starContent}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="passage"
						style="animation-delay: {Math.min(i * 30, 300)}ms"
						onclick={() => goToStar(star)}
					>
						<div class="passage-content">
							{@html starContent.html}
						</div>
						<div class="passage-meta">
							<span class="passage-origin">
								<span class="passage-star">&#9733;</span>
								{starContent.diff_title}
							</span>
							<span class="passage-sep">/</span>
							<span class="passage-time">{timeAgo(starContent.diff_date)}</span>
							<button
								class="passage-unstar"
								title="Remove star"
								onclick={(e) => handleUnstar(e, star)}
							>unstar</button>
						</div>
					</div>
				{:else}
					<div
						class="passage passage-orphan"
						style="animation-delay: {Math.min(i * 30, 300)}ms"
					>
						<div class="passage-content passage-content-orphan">
							The diff containing this star has been deleted.
						</div>
						<div class="passage-meta">
							<span class="passage-origin">
								<span class="passage-star passage-star-dim">&#9733;</span>
								Deleted diff
							</span>
							<button
								class="passage-unstar passage-unstar-visible"
								title="Remove star"
								onclick={(e) => handleUnstar(e, star)}
							>remove</button>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	{#if isMobile.value}
		<p class="stars-hint" class:stars-hint-faded={!stars?.length}>Double-tap an article to star/unstar it</p>
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
	}

	/* Each passage */
	.passage {
		position: relative;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--border-subtle);
		cursor: pointer;
		transition: background 0.15s;
		animation: passage-in 0.25s ease both;
	}

	.passage:first-child {
		padding-top: 0.75rem;
	}

	.passage:last-child {
		border-bottom: none;
	}

	.passage:hover {
		background: var(--accent-bg);
		padding-left: 1rem;
		margin-left: -1rem;
		padding-right: 1rem;
		margin-right: -1rem;
		border-radius: var(--radius);
	}

	/* Content — single line truncated */
	.passage-content {
		font-size: 0.85rem;
		color: var(--text-primary);
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.passage-content :global(.md-p),
	.passage-content :global(.md-list-item) {
		margin: 0;
		font-size: inherit;
		padding-left: 0;
		border-left: none;
		display: inline;
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
		display: inline;
	}

	.passage-content :global(li) {
		padding-left: 0;
		display: inline;
	}

	.passage-content :global(li)::marker {
		content: none;
	}

	.passage-content-orphan {
		font-style: italic;
		color: var(--text-disabled);
	}

	/* Meta line beneath content */
	.passage-meta {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.5rem;
		font-size: 0.7rem;
		color: var(--text-hint);
	}

	.passage-origin {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}

	.passage-star {
		color: var(--accent);
		font-size: 0.6rem;
	}

	.passage-star-dim {
		color: var(--text-disabled);
	}

	.passage-sep {
		color: var(--border-strong);
	}

	.passage-time {
		color: var(--text-disabled);
	}

	/* Unstar link */
	.passage-unstar {
		margin-left: auto;
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
