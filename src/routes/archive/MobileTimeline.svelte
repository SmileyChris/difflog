<script lang="ts">
	import { goto } from '$app/navigation';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { daysSince } from '$lib/utils/time.svelte';
	import { deleteDiff } from '$lib/stores/operations.svelte';

	const history = $derived(getHistory());

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

	function goToDiff(diffId: string) {
		goto(`/d/${diffId}`);
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

<div class="timeline">
	{#if history.length === 0}
		<div class="timeline-empty">
			<span class="timeline-empty-icon">&#9670;</span>
			<span>No diffs yet</span>
			<a href="/" class="timeline-empty-action">Generate your first diff</a>
		</div>
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
					<button class="timeline-item" class:timeline-item-latest={isLatest} onclick={() => goToDiff(diff.id)}>
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
			{/each}
		{/each}
	{/if}
</div>

<style>
	.timeline {
		padding: 0.5rem 1.25rem 2rem;
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
		display: flex;
		align-items: stretch;
		gap: 0;
		width: 100%;
		background: none;
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
