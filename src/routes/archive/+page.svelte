<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { deleteDiff } from '$lib/stores/operations.svelte';
	import { Card, HeaderNav, EmptyState, IconButton, ShareDropdown, SiteFooter, PageHeader } from '$lib/components';

	function goToDiff(diffId: string) {
		goto(`/?diff=${diffId}`);
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

	function getTitle(diff: Diff): string {
		return diff.title || 'Untitled diff';
	}

	function getCategories(diff: Diff): string[] {
		const matches = diff.content.match(/^## (.+)$/gm);
		if (!matches) return [];
		return matches.map(m => m
			.replace(/^## /, '')
			.replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '')
			.trim()
		);
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

<PageHeader pageTitle="archive" subtitle="{history.length} saved diffs" icon="square">
	{#if stars?.length > 0}
		<a href="/stars" class="header-link">
			<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
		</a>
	{/if}
	<HeaderNav />
</PageHeader>

<main id="content">
	{#if history.length === 0}
		<EmptyState icon="◼" message="No diffs yet">
			{#snippet action()}
				<a href="/" class="btn-primary">Generate your first diff</a>
			{/snippet}
		</EmptyState>
	{:else}
		<div class="archive-list">
			{#each history as diff (diff.id)}
				<Card clickable={true} onclick={() => goToDiff(diff.id)}>
					{#snippet header()}
						<span class="archive-date">{formatDate(diff.generated_at)}</span>
						{#if diff.cost}
							<span class="archive-cost">${diff.cost.toFixed(3)}</span>
						{/if}
						<div class="archive-actions">
							<ShareDropdown {diff} />
							<IconButton
								icon="×"
								variant="danger"
								title="Delete diff"
								onclick={(e) => { e.stopPropagation(); handleDeleteDiff(diff.id); }}
							/>
						</div>
					{/snippet}
					<div class="archive-title">{getTitle(diff)}</div>
					{#if getCategories(diff).length > 0}
						<div class="archive-categories">{getCategories(diff).join(', ')}</div>
					{/if}
				</Card>
			{/each}
		</div>
	{/if}
</main>

<SiteFooter />

<style>
	.archive-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.archive-date {
		font-size: 0.8rem;
		color: var(--accent);
	}

	.archive-cost {
		color: var(--text-subtle);
		font-size: 0.7rem;
		opacity: 0.6;
	}

	.archive-actions {
		margin-left: auto;
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.archive-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.4;
	}

	.archive-categories {
		font-size: 0.8rem;
		color: var(--text-subtle);
		margin-top: 0.25rem;
	}
</style>
