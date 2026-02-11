<script lang="ts">
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import DiffContent from './DiffContent.svelte';
	import ShareDropdown from './ShareDropdown.svelte';
	import { timeAgo, daysSince } from '$lib/utils/time';
	import type { Snippet } from 'svelte';

	interface Props {
		diff: Diff;
		infoExtra?: Snippet;
		banners?: Snippet;
		footerAction?: Snippet;
	}

	let { diff, infoExtra, banners, footerAction }: Props = $props();

	const isArchive = $derived(getHistory().length > 0 && diff.id !== getHistory()[0].id);

	function prevDiff(): Diff | null {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff.id);
		return idx >= 0 && idx < history.length - 1 ? history[idx + 1] : null;
	}

	function nextDiff(): Diff | null {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff.id);
		return idx > 0 ? history[idx - 1] : null;
	}

	const prevUrl = $derived.by(() => {
		const p = prevDiff();
		return p ? `/d/${p.id}` : null;
	});

	const nextUrl = $derived.by(() => {
		const n = nextDiff();
		if (!n) return null;
		const history = getHistory();
		return history.length > 0 && n.id === history[0].id ? '/' : `/d/${n.id}`;
	});

	const diffPosition = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return '';
		const idx = history.findIndex((d) => d.id === diff.id);
		if (idx < 0) return '';
		return `${idx + 1} of ${history.length}`;
	});

	const lastDiffDays = $derived(
		getHistory().length > 0 ? daysSince(getHistory()[0].generated_at) : Infinity
	);

	const welcomeHeading = $derived.by(() => {
		const name = getProfile()?.name || 'Developer';
		if (isArchive) return `From the archives, ${name}`;
		const days = lastDiffDays;
		const hour = new Date().getHours();
		const timeGreeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
		if (days <= 1) return `Good ${timeGreeting}, ${name}`;
		if (days <= 3) return `Hey again, ${name}`;
		if (days <= 7) return `Welcome back, ${name}`;
		if (days <= 14) return `Missed you, ${name}`;
		return `Long time no see, ${name}`;
	});

	const diffLabel = $derived(isArchive ? 'From the archives' : "Here's your latest diff");
</script>

<div class="welcome-bar">
	<h2 class="welcome-heading-lg">{welcomeHeading}</h2>
	<div class="diff-info-bar">
		<div class="diff-info-left">
			<span class="diff-label">{diffLabel}</span>
			<span class="diff-time">{timeAgo(diff.generated_at)}</span>
			{#if infoExtra}{@render infoExtra()}{/if}
		</div>
		<div class="diff-info-right">
			{#if prevUrl}
				<a href={prevUrl} class="diff-nav-btn">&#8249;</a>
			{:else}
				<span class="diff-nav-btn diff-nav-btn-disabled">&#8249;</span>
			{/if}
			<a href="/archive" class="diff-position-link">{diffPosition}</a>
			{#if nextUrl}
				<a href={nextUrl} class="diff-nav-btn">&#8250;</a>
			{:else}
				<span class="diff-nav-btn diff-nav-btn-disabled">&#8250;</span>
			{/if}
		</div>
	</div>
</div>

{#if banners}{@render banners()}{/if}

<DiffContent {diff}>
	{#snippet titleRow()}
		{#if diff.title}
			<div class="diff-title-row">
				<h1 class="diff-title">
					<span class="diff-title-icon">&#9632;</span>
					<span>{diff.title}</span>
				</h1>
				<ShareDropdown {diff} />
			</div>
		{/if}
	{/snippet}
</DiffContent>

<div class="diff-footer">
	{#if prevUrl}
		<a href={prevUrl} class="btn-secondary btn-sm">&#8249; Older</a>
	{:else}
		<span></span>
	{/if}
	{#if nextUrl}
		<a href={nextUrl} class="btn-secondary btn-sm">Newer &#8250;</a>
	{:else if isArchive}
		<a href="/" class="btn-secondary btn-sm">Latest &#8250;</a>
	{:else if footerAction}
		{@render footerAction()}
	{:else}
		<span></span>
	{/if}
</div>

<style>
	.welcome-bar {
		padding: 1rem 0;
		margin-bottom: 1rem;
	}

	.diff-info-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.75rem;
		position: relative;
	}

	.diff-info-left {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		color: var(--text-subtle);
		font-size: 0.95rem;
	}

	.diff-info-right {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: var(--text-subtle);
		font-size: 0.9rem;
	}

	.diff-label {
		color: var(--text-secondary);
	}

	.diff-time {
		font-family: var(--font-mono);
		font-size: 0.85em;
		opacity: 0.7;
	}

	.diff-nav-btn {
		color: var(--text-subtle);
		font-size: 1.1rem;
		padding: 0 0.35rem;
		opacity: 0.7;
		transition: opacity 0.15s, color 0.15s;
		line-height: 1;
		text-decoration: none;
	}

	.diff-nav-btn:hover:not(.diff-nav-btn-disabled) {
		opacity: 1;
		color: var(--accent);
	}

	.diff-nav-btn-disabled {
		opacity: 0.25;
		cursor: default;
	}

	.diff-position-link {
		color: var(--text-disabled);
		text-decoration: none;
		transition: color 0.15s;
		font-size: 0.9rem;
	}

	.diff-position-link:hover {
		color: var(--accent);
	}

	.diff-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.5rem 2rem 0;
		gap: 1rem;
	}

	.diff-title-row .diff-title {
		padding: 0;
	}

	.diff-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 0;
		border-top: 1px solid var(--border);
	}
</style>
