<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel, getStarContent, type Star } from '$lib/stores/stars.svelte';
	import { removeStar } from '$lib/stores/operations.svelte';
	import { timeAgo } from '$lib/utils/time';
	import { HeaderNav, EmptyState, IconButton, SiteFooter, PageHeader } from '$lib/components';

	function goToStar(star: Star) {
		sessionStorage.setItem('viewDiffId', star.diff_id);
		sessionStorage.setItem('scrollToPIndex', star.p_index.toString());
	}

	const stars = $derived(getStars());
</script>

<svelte:head>
	<title>diff·log - Stars</title>
</svelte:head>

<main id="content">
	<PageHeader pageTitle="stars" subtitle={getStarCountLabel()} icon="star">
		<HeaderNav />
	</PageHeader>

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
				<div class="bookmark-card">
					{#if starContent}
						<div class="bookmark-card-content">
							<div class="bookmark-meta">
								<span class="diff-title-icon">&#9632;</span>
								<a href="/" class="bookmark-source" onclick={() => goToStar(star)}>
									{starContent.diff_title}
								</a>
								<span class="bookmark-dot">&middot;</span>
								<span class="bookmark-date">{timeAgo(starContent.diff_date)}</span>
							</div>
							<div class="bookmark-preview">
								{@html starContent.html}
							</div>
							<div class="bookmark-added">
								Saved {timeAgo(star.added_at)}
							</div>
						</div>
					{:else}
						<div class="bookmark-card-content bookmark-orphan">
							<div class="bookmark-meta">
								<span class="diff-title-icon">&#9632;</span>
								<span class="bookmark-source">Diff deleted</span>
							</div>
							<div class="bookmark-preview bookmark-orphan-message">
								The diff containing this star has been deleted.
							</div>
							<div class="bookmark-orphan-footer">
								<span class="bookmark-added">Saved {timeAgo(star.added_at)}</span>
								<IconButton
									icon="×"
									variant="danger"
									title="Remove star"
									onclick={() => removeStar(star.diff_id, star.p_index)}
								/>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
