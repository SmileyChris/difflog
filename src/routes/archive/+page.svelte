<script lang="ts">
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { deleteDiff } from '$lib/stores/operations.svelte';
	import { Card, HeaderNav, EmptyState, IconButton, ShareDropdown, SiteFooter, PageHeader } from '$lib/components';
	import { matchArticles, highlightTerms, getSnippet, stripEmojiPrefix } from '$lib/utils/archive-search';
	import { archiveSearch } from '$lib/stores/ui.svelte';

	function goToDiff(diffId: string) {
		goto(`/d/${diffId}`);
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

	function relativeDate(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const days = Math.floor(diff / 86400000);
		if (days === 0) return 'today';
		if (days === 1) return '1d ago';
		if (days < 7) return `${days}d ago`;
		const weeks = Math.floor(days / 7);
		if (weeks < 5) return `${weeks}w ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months}mo ago`;
		return `${Math.floor(days / 365)}y ago`;
	}

	function getTitle(diff: Diff): string {
		return diff.title || 'Untitled diff';
	}

	function getCategories(diff: Diff): string[] {
		const matches = diff.content.match(/^## (.+)$/gm);
		if (!matches) return [];
		return matches.map(m => stripEmojiPrefix(m.replace(/^## /, '')));
	}

	function handleDeleteDiff(id: string) {
		if (confirm('Delete this diff?')) {
			deleteDiff(id);
		}
	}

	let searchQuery = $state(archiveSearch.value);
	let searchRef: HTMLInputElement | undefined = $state();

	$effect(() => {
		const value = archiveSearch.value;
		const timeout = setTimeout(() => { searchQuery = value; }, 250);
		return () => clearTimeout(timeout);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && archiveSearch.value) {
			archiveSearch.value = '';
			searchQuery = '';
			searchRef?.blur();
		}
	}

	const history = $derived(getHistory());
	const stars = $derived(getStars());
	const searchResults = $derived(searchQuery ? matchArticles(history, searchQuery) : null);
	const totalMatches = $derived(searchResults?.reduce((sum, r) => sum + r.matches.length, 0) ?? 0);
</script>

<svelte:head>
	<title>diff·log - Archive</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<PageHeader pageTitle="archive" subtitle={searchResults ? `${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ${searchResults.length} diff${searchResults.length === 1 ? '' : 's'}` : `${history.length} saved diffs`} icon="square">
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
		<input
			bind:this={searchRef}
			bind:value={archiveSearch.value}
			class="text-input search-input"
			type="search"
			placeholder="Search diffs..."
		/>

		{#if searchResults}
			{#if searchResults.length === 0}
				<div class="search-empty">No matches for "{searchQuery}"</div>
			{:else}
				<div class="archive-list">
					{#each searchResults as { item: diff, matches } (diff.id)}
						{@const titleMatchesQuery = searchQuery.toLowerCase().split(/\s+/).filter(Boolean).every(t => getTitle(diff).toLowerCase().includes(t))}
						<Card>
							<div class="search-title-row">
								{#if titleMatchesQuery}
									<button class="archive-title archive-title-link" onclick={() => goToDiff(diff.id)}>{@html highlightTerms(getTitle(diff), searchQuery)}</button>
								{:else}
									<span class="archive-title">{@html highlightTerms(getTitle(diff), searchQuery)}</span>
								{/if}
								<span class="search-date">{relativeDate(diff.generated_at)}</span>
							</div>
							<div class="search-matches">
								{#each matches as article}
									{@const snippet = getSnippet(article.body, searchQuery)}
									{#if article.pIndex != null}
										<button class="search-match search-match-link" onclick={() => goto(`/d/${diff.id}`, { state: { scrollToPIndex: article.pIndex } })}>
											{#if article.category}<span class="search-match-category">{article.category}</span>{/if}
											<span class="search-match-heading">{@html highlightTerms(article.heading, searchQuery)}</span>
											{#if snippet}
												<div class="search-match-snippet">{@html highlightTerms(snippet, searchQuery)}</div>
											{/if}
										</button>
									{:else}
										<div class="search-match">
											{#if article.category}<span class="search-match-category">{article.category}</span>{/if}
											<span class="search-match-heading">{@html highlightTerms(article.heading, searchQuery)}</span>
											{#if snippet}
												<div class="search-match-snippet">{@html highlightTerms(snippet, searchQuery)}</div>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						</Card>
					{/each}
				</div>
			{/if}
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

	button.archive-title-link {
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	button.archive-title-link:hover {
		color: var(--accent);
	}

	.search-title-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.search-date {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--text-subtle);
		opacity: 0.6;
		white-space: nowrap;
	}

	.archive-title :global(mark) {
		background: color-mix(in srgb, var(--accent) 25%, transparent);
		color: inherit;
		border-radius: 0.125rem;
		padding: 0 0.0625rem;
	}

	.archive-categories {
		font-size: 0.8rem;
		color: var(--text-subtle);
		margin-top: 0.25rem;
	}

	.search-input {
		margin-bottom: 0.75rem;
	}

	.search-empty {
		text-align: center;
		color: var(--text-subtle);
		padding: 2rem 0;
	}

	.search-matches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.375rem;
	}

	.search-match {
		font-size: 0.75rem;
		color: var(--text-subtle);
		background: var(--bg-card-hover, var(--bg-secondary));
		padding: 0.125rem 0.5rem;
		border-radius: 0.25rem;
	}

	button.search-match-link {
		border: none;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
	}

	.search-match-category {
		opacity: 0.6;
		margin-right: 0.25rem;
	}

	.search-match-category::after {
		content: ' /';
	}

	.search-match :global(mark) {
		background: color-mix(in srgb, var(--accent) 25%, transparent);
		color: inherit;
		border-radius: 0.125rem;
		padding: 0 0.0625rem;
	}

	.search-match-snippet {
		width: 100%;
		font-size: 0.7rem;
		color: var(--text-subtle);
		opacity: 0.8;
		margin-top: 0.125rem;
	}
</style>
