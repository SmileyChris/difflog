<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel, getStarContent, type Star } from '$lib/stores/stars.svelte';
	import { removeStar } from '$lib/stores/operations.svelte';
	import { timeAgo } from '$lib/utils/time';
	import { SyncDropdown, SiteFooter, PageHeader } from '$lib/components';

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
		<a href="/profiles" class="profile-badge">
			<svg class="profile-badge-icon" viewBox="0 0 24 24" fill="currentColor">
				<circle cx="12" cy="11" r="4" />
				<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
			</svg>
			<span>{getProfile()?.name || 'Profile'}</span>
		</a>
		<SyncDropdown />
	</PageHeader>

	{#if !stars?.length}
		<div class="empty-state">
			<p>No stars yet.</p>
			<p class="empty-hint">Hover over paragraphs in your diffs and click the star button to save them here.</p>
		</div>
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
								<button class="btn-delete" onclick={() => removeStar(star.diff_id, star.p_index)}>Remove</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
