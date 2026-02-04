<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { deleteDiff } from '$lib/stores/operations.svelte';
	import { SyncDropdown, ShareDropdown, SiteFooter, PageHeader } from '$lib/components';

	function goToDiff(diffId: string) {
		sessionStorage.setItem('viewDiffId', diffId);
		goto('/');
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getPreview(diff: Diff): string {
		return diff.title || diff.content.slice(0, 120).replace(/[#*\[\]]/g, '') + '...';
	}

	function handleDeleteDiff(id: string) {
		if (confirm('Delete this diff?')) {
			deleteDiff(id);
		}
	}

	const history = $derived(getHistory());
	const stars = $derived(getStars());
</script>

<svelte:head>
	<title>diff·log - Archive</title>
</svelte:head>

<main id="content">
	<PageHeader pageTitle="archive" subtitle="{history.length} saved diffs" icon="square">
		{#if stars?.length > 0}
			<a href="/stars" class="header-link">
				<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
			</a>
		{/if}
		<a href="/profiles" class="profile-badge">
			<svg class="profile-badge-icon" viewBox="0 0 24 24" fill="currentColor">
				<circle cx="12" cy="11" r="4" />
				<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
			</svg>
			<span>{getProfile()?.name || 'Profile'}</span>
		</a>
		<SyncDropdown />
	</PageHeader>

	{#if history.length === 0}
		<div class="empty-state">
			<p>No diffs yet. Generate your first one!</p>
		</div>
	{:else}
		<div class="archive-list">
			{#each history as diff (diff.id)}
				<div class="archive-card">
					<div class="archive-card-content" onclick={() => goToDiff(diff.id)}>
						<div class="archive-date">
							<span>{formatDate(diff.generated_at)}</span>
							{#if diff.cost}
								<span class="archive-cost">${diff.cost.toFixed(3)}</span>
							{/if}
						</div>
						<div class="archive-preview">{getPreview(diff)}</div>
					</div>
					<div class="archive-card-actions">
						<ShareDropdown {diff} />
						<button class="btn-delete" onclick={(e) => { e.stopPropagation(); handleDeleteDiff(diff.id); }}>
							&times;
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
