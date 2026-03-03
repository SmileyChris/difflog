<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { daysSince } from '$lib/utils/time.svelte';
	import { deleteDiff } from '$lib/stores/operations.svelte';
	import { createSwipeState } from '$lib/actions/swipeToReveal.svelte';
	import { matchArticles, highlightTerms, getSnippet } from '$lib/utils/archive-search';
	import { archiveSearch } from '$lib/stores/ui.svelte';
	import { buildDiffContent } from '$lib/utils/time';
	import { extractSections, renderMarkdown } from '$lib/utils/markdown';
	import { SEARCH_DEBOUNCE_MS } from '$lib/constants/mobile';

	const history = $derived(getHistory());

	// Search state — debounced from archiveSearch store
	let searchQuery = $state(archiveSearch.value);

	$effect(() => {
		const value = archiveSearch.value;
		const timeout = setTimeout(() => { searchQuery = value; }, SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timeout);
	});

	// Use buildDiffContent so extractArticles sees the same content (including
	// any prepended date line) that renderMarkdown receives — keeps pIndex in sync
	// with the rendered data-p attributes.
	const searchableHistory = $derived(history.map(d => ({ ...d, content: buildDiffContent(d) })));
	const searchResults = $derived(searchQuery ? matchArticles(searchableHistory, searchQuery) : null);
	const totalMatches = $derived(searchResults?.reduce((sum, r) => sum + r.matches.length, 0) ?? 0);

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

	// Group diffs by month
	interface MonthGroup {
		key: string;
		label: string;
		count: number;
		diffs: Diff[];
	}

	const monthGroups = $derived.by((): MonthGroup[] => {
		const groups: MonthGroup[] = [];
		const allDiffs = history;
		const currentYear = new Date().getFullYear();
		for (const diff of allDiffs) {
			const d = new Date(diff.generated_at);
			const key = `${d.getFullYear()}-${d.getMonth()}`;
			const label = d.getFullYear() === currentYear
				? d.toLocaleDateString('en-US', { month: 'long' })
				: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
			let group = groups.find(g => g.key === key);
			if (!group) {
				group = { key, label, count: 0, diffs: [] };
				groups.push(group);
			}
			group.count++;
			group.diffs.push(diff);
		}
		return groups;
	});

	const swipe = createSwipeState();
	let timelineEl: HTMLDivElement;

	function handleSwipeEnd() {
		swipe.end((id) => {
			if (confirm('Delete this diff?')) {
				deleteDiff(id);
			}
		});
	}

	function goToDiff(diffId: string) {
		if (swipe.didSwipe) return;
		goto(`/d/${diffId}`);
	}

	// Attach non-passive touchmove to allow preventDefault
	onMount(() => {
		const handler = (e: TouchEvent) => swipe.move(e);
		timelineEl.addEventListener('touchmove', handler, { passive: false });
		return () => timelineEl.removeEventListener('touchmove', handler);
	});

	function getTitle(diff: Diff): string {
		return diff.title || 'Untitled diff';
	}

	function getCategories(diff: Diff): string[] {
		const html = renderMarkdown(buildDiffContent(diff));
		return extractSections(html).map(s =>
			s.title.replace(/<[^>]+>/g, '').replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+/u, '').trim()
		);
	}

	function formatTimelineDate(dateStr: string): { day: string; time: string } {
		const d = new Date(dateStr);
		const raw = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		const time = raw.replace(/\s?(AM|PM)/i, (_, p) => p.toLowerCase().charAt(0));
		return {
			day: d.getDate().toString(),
			time,
		};
	}

	function getAgeLabel(dateStr: string): string | null {
		const days = daysSince(dateStr);
		if (days === 0) return 'today';
		if (days === 1) return 'yesterday';
		return null;
	}

	function isSameDay(a: string, b: string): boolean {
		return new Date(a).toDateString() === new Date(b).toDateString();
	}
</script>

<div class="timeline" bind:this={timelineEl}>
	{#if history.length === 0}
		<div class="timeline-empty">
			<span class="timeline-empty-icon">&#9670;</span>
			<span>No diffs yet</span>
			<a href="/" class="timeline-empty-action">Generate your first diff</a>
		</div>
	{:else}
		<div class="search-bar">
			<input
				bind:value={archiveSearch.value}
				class="text-input search-input"
				type="search"
				placeholder="Search diffs..."
			/>
			{#if searchResults}
				<div class="search-summary">
					{totalMatches} match{totalMatches === 1 ? '' : 'es'} in {searchResults.length} diff{searchResults.length === 1 ? '' : 's'}
				</div>
			{/if}
		</div>

		{#if searchResults}
			{#if searchResults.length === 0}
				<div class="search-empty">No matches for "{searchQuery}"</div>
			{:else}
				<div class="search-results">
					{#each searchResults as { item: diff, matches } (diff.id)}
						{@const titleMatchesQuery = searchQuery.toLowerCase().split(/\s+/).filter(Boolean).every(t => getTitle(diff).toLowerCase().includes(t))}
						<div class="search-result-card">
							<div class="search-result-header">
								{#if titleMatchesQuery}
									<button class="search-result-title search-result-title-link" onclick={() => goToDiff(diff.id)}>{@html highlightTerms(getTitle(diff), searchQuery)}</button>
								{:else}
									<span class="search-result-title">{@html highlightTerms(getTitle(diff), searchQuery)}</span>
								{/if}
								<span class="search-result-date">{relativeDate(diff.generated_at)}</span>
							</div>
							{#if matches.length > 0}
								<div class="search-result-matches">
									{#each matches as article}
										{@const snippet = getSnippet(article.body, searchQuery)}
										{#if article.pIndex != null}
											<button class="search-match search-match-tappable" onclick={() => goto(`/d/${diff.id}`, { state: { scrollToPIndex: article.pIndex } })}>
												{#if article.category}<span class="search-match-cat">{article.category} /</span>{/if}
												<span class="search-match-heading">{@html highlightTerms(article.heading, searchQuery)}</span>
												{#if snippet}
													<span class="search-match-snippet">{@html highlightTerms(snippet, searchQuery)}</span>
												{/if}
											</button>
										{:else}
											<div class="search-match">
												{#if article.category}<span class="search-match-cat">{article.category} /</span>{/if}
												<span class="search-match-heading">{@html highlightTerms(article.heading, searchQuery)}</span>
												{#if snippet}
													<span class="search-match-snippet">{@html highlightTerms(snippet, searchQuery)}</span>
												{/if}
											</div>
										{/if}
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		{:else}
		{#each monthGroups as group, gi}
			<div class="timeline-month-header" class:timeline-month-header-sticky={true}>
				<span class="timeline-month-label">{group.label}</span>
				<span class="timeline-month-count">{group.count} {group.count === 1 ? 'diff' : 'diffs'}</span>
			</div>
			{#each group.diffs as diff, di (diff.id)}
				{@const date = formatTimelineDate(diff.generated_at)}
				{@const age = getAgeLabel(diff.generated_at)}
				{@const categories = getCategories(diff)}
				{@const isLatest = gi === 0 && di === 0}
				{@const isLastInGroup = di === group.diffs.length - 1}
				{@const isLastOverall = gi === monthGroups.length - 1 && isLastInGroup}
				{@const sameDay = di > 0 && isSameDay(group.diffs[di - 1].generated_at, diff.generated_at)}
				<div class="swipe-container">
					<div class="swipe-delete-zone" class:swipe-delete-zone-active={swipe.isPastThreshold(diff.id)}>
						<span class="swipe-delete-icon">&#128465;</span>
					</div>
					<button class="timeline-item" class:timeline-item-latest={isLatest}
						style:transform="translateX({swipe.offset(diff.id)}px)"
						style:transition={swipe.isAnimating(diff.id) ? 'transform 0.2s ease-out' : 'none'}
						ontouchstart={(e) => swipe.start(e, diff.id)}
						ontouchend={handleSwipeEnd}
						onclick={() => goToDiff(diff.id)}>
						<div class="timeline-date">
							{#if !sameDay}
								<span class="timeline-date-day">{date.day}</span>
								<span class="timeline-date-time">{date.time}</span>
							{:else}
								<span class="timeline-date-time-only">{date.time}</span>
							{/if}
						</div>
						<div class="timeline-track">
							<span class="timeline-dot" class:timeline-dot-latest={isLatest}>&#9670;</span>
							{#if !isLastOverall}
								<span class="timeline-line" class:timeline-line-dashed={isLastInGroup}></span>
							{/if}
						</div>
						<div class="timeline-content">
							{#if age}
								<div class="timeline-age-row">
									<span class="timeline-age" class:timeline-age-today={age === 'today'}>{age}</span>
								</div>
							{/if}
							<div class="timeline-title">{getTitle(diff)}</div>
							{#if categories.length > 0}
								<div class="timeline-categories">
									{#each categories.slice(0, 3) as cat}
										<span class="timeline-cat">{cat}</span>
									{/each}
									{#if categories.length > 3}
										<span class="timeline-cat timeline-cat-more">+{categories.length - 3}</span>
									{/if}
								</div>
							{/if}
						</div>
					</button>
				</div>
			{/each}
		{/each}
		{/if}
	{/if}
</div>

<style>
	.timeline {
		padding: 0.5rem 1.25rem 2rem;
	}

	/* Search bar */
	.search-bar {
		position: sticky;
		top: 0;
		z-index: 11;
		background: var(--bg-base);
		padding-bottom: 0.5rem;
	}

	.search-input {
		width: 100%;
		font-size: 0.85rem;
	}

	.search-summary {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		color: var(--text-hint);
		margin-top: 0.25rem;
	}

	.search-empty {
		text-align: center;
		color: var(--text-subtle);
		padding: 3rem 1rem;
		font-size: 0.85rem;
	}

	/* Search results */
	.search-results {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.search-result-card {
		background: var(--bg-secondary, var(--bg-card));
		border-radius: var(--radius);
		padding: 0.75rem;
	}

	.search-result-header {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.search-result-title {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-primary);
		line-height: 1.35;
		flex: 1;
		min-width: 0;
	}

	button.search-result-title-link {
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.search-result-title :global(mark),
	.search-match :global(mark) {
		background: color-mix(in srgb, var(--accent) 25%, transparent);
		color: inherit;
		border-radius: 0.125rem;
		padding: 0 0.0625rem;
	}

	.search-result-date {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		color: var(--text-hint);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.search-result-matches {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-top: 0.5rem;
	}

	.search-match {
		font-size: 0.75rem;
		color: var(--text-subtle);
		background: var(--bg-chip, rgba(255, 255, 255, 0.04));
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-sm);
		line-height: 1.4;
	}

	button.search-match-tappable {
		border: none;
		font-family: inherit;
		cursor: pointer;
		text-align: left;
		width: 100%;
		-webkit-tap-highlight-color: transparent;
	}

	button.search-match-tappable:active {
		opacity: 0.7;
	}

	.search-match-cat {
		opacity: 0.5;
		font-size: 0.65rem;
		margin-right: 0.25rem;
	}

	.search-match-heading {
		font-weight: 500;
	}

	.search-match-snippet {
		display: block;
		font-size: 0.65rem;
		color: var(--text-hint);
		margin-top: 0.2rem;
		line-height: 1.35;
	}

	/* Month header — sticky */
	.timeline-month-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0 0.5rem;
		background: var(--bg-base);
	}

	.timeline-month-header-sticky {
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.timeline-month-label {
		font-size: 1.3rem;
		font-weight: 600;
		color: var(--text-heading);
	}

	.timeline-month-count {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-disabled);
	}

	/* Empty state */
	.timeline-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 4rem 1rem;
		color: var(--text-disabled);
		font-size: 0.85rem;
	}

	.timeline-empty-icon {
		font-size: 1.5rem;
		color: var(--accent);
		opacity: 0.4;
	}

	.timeline-empty-action {
		margin-top: 0.5rem;
		color: var(--accent);
		text-decoration: none;
		font-size: 0.8rem;
		font-weight: 500;
	}

	/* Timeline item row */
	.timeline-item {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: stretch;
		gap: 0;
		width: 100%;
		background: var(--bg-base);
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		color: inherit;
		font: inherit;
		-webkit-tap-highlight-color: transparent;
	}

	.timeline-item:active .timeline-content {
		background: rgba(255, 255, 255, 0.03);
	}

	/* Date column */
	.timeline-date {
		width: 3.5rem;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 0.05rem;
		padding-right: 0.375rem;
	}

	.timeline-date-day {
		font-family: var(--font-mono);
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text-secondary);
		line-height: 1;
	}

	.timeline-item-latest .timeline-date-day {
		color: var(--text-heading);
	}

	.timeline-date-time {
		font-family: var(--font-mono);
		font-size: 0.55rem;
		color: var(--text-subtle);
		margin-top: 0.15rem;
	}

	.timeline-date-time-only {
		font-family: var(--font-mono);
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--text-subtle);
		margin-top: 0.1rem;
	}

	/* Track column (dot + line) */
	.timeline-track {
		width: 1.25rem;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		position: relative;
	}

	.timeline-dot {
		flex-shrink: 0;
		margin-top: 0.2rem;
		z-index: 1;
		font-size: 0.5rem;
		color: var(--text-hint);
		line-height: 1;
	}

	.timeline-dot-latest {
		font-size: 0.6rem;
		color: var(--accent);
	}

	.timeline-line {
		flex: 1;
		width: 1px;
		background: var(--border-strong);
		margin-top: 0.3rem;
	}

	.timeline-line-dashed {
		background: none;
		border-left: 1px dashed var(--border-subtle);
	}

	/* Content column */
	.timeline-content {
		flex: 1;
		min-width: 0;
		padding: 0 0 1.25rem 0.5rem;
		border-radius: var(--radius);
		transition: background 0.1s;
	}

	.timeline-age-row {
		margin-bottom: 0.15rem;
	}

	.timeline-age {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-hint);
	}

	.timeline-age-today {
		color: var(--accent);
	}

	.timeline-title {
		font-size: 0.85rem;
		font-weight: 500;
		color: var(--text-primary);
		line-height: 1.35;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.timeline-item:not(.timeline-item-latest) .timeline-title {
		color: var(--text-secondary);
	}

	.timeline-categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.35rem;
	}

	.timeline-cat {
		font-family: var(--font-mono);
		font-size: 0.55rem;
		color: var(--text-hint);
		background: var(--bg-chip);
		padding: 0.1rem 0.35rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.02em;
	}

	.timeline-cat-more {
		color: var(--text-hint);
		background: none;
		padding-left: 0;
	}
</style>
