<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel, getStarContent, type Star } from '$lib/stores/stars.svelte';
	import { removeStar } from '$lib/stores/operations.svelte';
	import { timeAgo } from '$lib/utils/time.svelte';
	import { Card, HeaderNav, EmptyState, IconButton, SiteFooter, PageHeader } from '$lib/components';
	import { isMobile } from '$lib/stores/mobile.svelte';
	import MobileHeader from '$lib/components/mobile/MobileHeader.svelte';

	function goToStar(star: Star) {
		goto(`/d/${star.diff_id}`, { state: { scrollToPIndex: star.p_index } });
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
	{#if !stars?.length}
		<EmptyState
			icon="★"
			message="No stars yet"
			description="Hover over paragraphs in your diffs and click the star button to save them here."
		/>
	{:else}
		<div class="bookmarks-list">
			{#each stars as star (star.diff_id + ':' + star.p_index)}
				{@const starContent = getStarContent(star)}
				<Card variant={starContent ? 'default' : 'subtle'}>
					{#if starContent}
						<div class="bookmark-meta">
							<span class="diff-title-icon">&#9632;</span>
							<button onclick={() => goToStar(star)} class="bookmark-source">
								{starContent.diff_title}
							</button>
							<span class="bookmark-dot">&middot;</span>
							<span class="bookmark-date">{timeAgo(starContent.diff_date)}</span>
						</div>
						<div class="bookmark-preview">
							{@html starContent.html}
						</div>
						<div class="bookmark-added">
							Saved {timeAgo(star.added_at)}
						</div>
					{:else}
						<div class="bookmark-meta">
							<span class="diff-title-icon">&#9632;</span>
							<span class="bookmark-source">Diff deleted</span>
						</div>
						<div class="bookmark-preview bookmark-orphan-message">
							The diff containing this star has been deleted.
						</div>
						{#snippet actions()}
							<span class="bookmark-added">Saved {timeAgo(star.added_at)}</span>
							<IconButton
								icon="×"
								variant="danger"
								title="Remove star"
								onclick={() => removeStar(star.diff_id, star.p_index)}
							/>
						{/snippet}
					{/if}
				</Card>
			{/each}
		</div>
	{/if}
</main>

<SiteFooter />

<style>
	.bookmarks-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.bookmark-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
		font-size: 0.75rem;
	}

	.bookmark-source {
		color: var(--accent);
		font-weight: 500;
		background: none;
		border: none;
		padding: 0;
		font-size: inherit;
		font-family: inherit;
		cursor: pointer;
	}

	.bookmark-source:hover {
		text-decoration: underline;
	}

	.bookmark-dot {
		color: var(--text-disabled);
	}

	.bookmark-date {
		color: var(--text-hint);
	}

	.bookmark-preview {
		font-size: 0.85rem;
		color: var(--text-secondary);
		line-height: 1.5;
	}

	.bookmark-preview :global(.md-p),
	.bookmark-preview :global(.md-list-item) {
		margin: 0;
		font-size: inherit;
		padding-left: 0;
		border-left: none;
	}

	.bookmark-preview :global(.md-p)::after,
	.bookmark-preview :global(.md-list-item)::after {
		display: none !important;
	}

	.bookmark-preview :global(ul),
	.bookmark-preview :global(ol) {
		list-style: none;
		padding-left: 0;
		margin: 0;
	}

	.bookmark-preview :global(li) {
		padding-left: 0;
	}

	.bookmark-preview :global(li)::marker {
		content: none;
	}

	.bookmark-added {
		margin-top: 0.5rem;
		font-size: 0.7rem;
		color: var(--text-disabled);
	}

	.bookmark-orphan {
		opacity: 0.6;
	}

	.bookmark-orphan-message {
		font-style: italic;
	}
</style>
