<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { getCachedPassword, hasPendingChanges } from '$lib/stores/sync.svelte';
	import { openSyncDropdown, generating } from '$lib/stores/ui.svelte';
	import { HeaderNav, ShareDropdown, DiffContent, SiteFooter, PageHeader } from '$lib/components';
	import StreakCalendar from './StreakCalendar.svelte';
	import { timeAgo, daysSince, getCurrentDateFormatted } from '$lib/utils/time';

	let { data } = $props();

	let diff = $state<Diff | null>(null);

	// Initialize from page data (reactive to data changes from navigation)
	$effect.pre(() => {
		diff = data.initialDiff ?? null;
	});

	let currentDate = getCurrentDateFormatted();
	let syncBannerDismissed = $state(false);


	onMount(() => {
		// If generation is active and we're not viewing a diff, go to /generate
		if (generating.value && !diff) {
			goto('/generate');
			return;
		}

		// Handle scroll-to from deep link
		if (data.scrollToPIndex !== null) {
			scrollToAndHighlight(data.scrollToPIndex);
		}
	});

	function goToDiffOnDate(isoDate: string) {
		const history = getHistory();
		const matches = history.filter((d) => {
			const diffDate = new Date(d.generated_at);
			const diffIso = `${diffDate.getFullYear()}-${String(diffDate.getMonth() + 1).padStart(2, '0')}-${String(diffDate.getDate()).padStart(2, '0')}`;
			return diffIso === isoDate;
		});
		if (matches.length === 0) return;

		const currentIdx = matches.findIndex((d) => d.id === diff?.id);
		if (currentIdx >= 0) {
			diff = matches[(currentIdx + 1) % matches.length];
		} else {
			diff = matches[0];
		}
	}

	function prevDiff(): Diff | null {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff?.id);
		return idx >= 0 && idx < history.length - 1 ? history[idx + 1] : null;
	}

	function nextDiff(): Diff | null {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff?.id);
		return idx > 0 ? history[idx - 1] : null;
	}

	const diffPosition = $derived.by(() => {
		const history = getHistory();
		if (!diff || history.length === 0) return '';
		const idx = history.findIndex((d) => d.id === diff?.id);
		if (idx < 0) return '';
		return `${idx + 1} of ${history.length}`;
	});

	const lastDiffDays = $derived(getHistory().length > 0 ? daysSince(getHistory()[0].generated_at) : Infinity);

	const isTodayDiff = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return false;
		return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
	});

	const welcomeHeading = $derived.by(() => {
		const name = getProfile()?.name || 'Developer';
		const history = getHistory();

		if (diff && history.length > 0 && diff.id !== history[0].id) {
			return `From the archives, ${name}`;
		}

		const days = lastDiffDays;
		const hour = new Date().getHours();
		const timeGreeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

		if (days <= 1) return `Good ${timeGreeting}, ${name}`;
		if (days <= 3) return `Hey again, ${name}`;
		if (days <= 7) return `Welcome back, ${name}`;
		if (days <= 14) return `Missed you, ${name}`;
		return `Long time no see, ${name}`;
	});

	const isArchive = $derived(diff != null && getHistory().length > 0 && diff.id !== getHistory()[0].id);

	const isStale = $derived(lastDiffDays > 5);

	const staleText = $derived.by(() => {
		const days = lastDiffDays;
		if (days <= 7) return "The dev world moves fast — time to catch up.";
		if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
		return "You've got weeks of ecosystem changes to unpack.";
	});

	function scrollToAndHighlight(pIndex: number) {
		setTimeout(() => {
			const container = document.querySelector('.diff-content');
			if (!container) return;

			const paragraph = container.querySelector(`[data-p="${pIndex}"]`) as HTMLElement;
			if (!paragraph) return;

			const section = paragraph.closest('details.md-section');
			if (section && !section.hasAttribute('open')) {
				section.setAttribute('open', '');
			}

			paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
			paragraph.classList.add('bookmark-highlight');
			paragraph.addEventListener(
				'animationend',
				() => {
					paragraph.classList.remove('bookmark-highlight');
				},
				{ once: true }
			);
		}, 100);
	}

	function needsSyncPrompt(): boolean {
		if (syncBannerDismissed) return false;
		if (!getProfile()?.syncedAt) return false;
		if (getCachedPassword()) return false;
		return hasPendingChanges();
	}
</script>

<svelte:head>
	<title>diff·log</title>
</svelte:head>

<PageHeader subtitle={currentDate}>
	<div class="header-profile-group">
		{#if getStars()?.length > 0}
			<a href="/stars" class="header-link">
				<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
			</a>
		{/if}
		<HeaderNav />
	</div>
</PageHeader>

<main id="content">
	{#if needsSyncPrompt()}
		<div class="sync-banner">
			<span>You have unsynced changes.</span>
			<button class="sync-banner-btn" onclick={() => openSyncDropdown()}>Sync now</button>
			<button class="sync-banner-dismiss" onclick={() => (syncBannerDismissed = true)}>&times;</button>
		</div>
	{/if}

	{#if diff}
		<div class="welcome-bar">
			<h2 class="welcome-heading-lg">{welcomeHeading}</h2>
			<div class="diff-info-bar">
				<div class="diff-info-left">
					<span class="diff-label">{isArchive ? 'From the archives' : "Here's your latest diff"}</span>
					<span class="diff-time">{timeAgo(diff.generated_at)}</span>
					<StreakCalendar onDayClick={goToDiffOnDate} />
					{#if generating.value}
						<button class="btn-ghost btn-branded" onclick={() => goto('/generate')} aria-busy="true">
							Generating…
						</button>
					{:else if isArchive}
						<button class="btn-ghost" onclick={() => (diff = getHistory()[0])}>
							Latest diff &rarr;
						</button>
					{:else if !isTodayDiff && !isStale}
						<button class="btn-ghost btn-branded" onclick={() => goto('/generate')}>
							New Diff
						</button>
					{/if}
				</div>
				<div class="diff-info-right">
					<button
						class="diff-nav-btn"
						class:diff-nav-btn-disabled={!prevDiff()}
						onclick={() => (diff = prevDiff())}
						disabled={!prevDiff()}
					>
						&#8249;
					</button>
					<a href="/archive" class="diff-position-link">{diffPosition}</a>
					<button
						class="diff-nav-btn"
						class:diff-nav-btn-disabled={!nextDiff()}
						onclick={() => (diff = nextDiff())}
						disabled={!nextDiff()}
					>
						&#8250;
					</button>
				</div>
			</div>
		</div>

		{#if isStale && !isArchive}
			<div class="stale-banner">
				<span>{staleText}</span>
				{#if generating.value}
					<button class="btn-ghost btn-branded" onclick={() => goto('/generate')} aria-busy="true">
						Generating…
					</button>
				{:else}
					<button class="btn-primary btn-branded stale-banner-btn" onclick={() => goto('/generate')}>
						Generate new diff
					</button>
				{/if}
			</div>
		{/if}

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
			{#if prevDiff()}
				<button class="btn-secondary btn-sm" onclick={() => (diff = prevDiff())}>
					&#8249; Older
				</button>
			{:else}
				<span></span>
			{/if}
			{#if nextDiff()}
				<button class="btn-secondary btn-sm" onclick={() => (diff = nextDiff())}>
					Newer &#8250;
				</button>
			{:else if !isArchive}
				<button class="btn-primary btn-sm btn-branded" onclick={() => goto('/generate')} aria-busy={generating.value || undefined}>
					{generating.value ? 'Generating…' : isTodayDiff ? 'Regenerate' : 'Generate'}
				</button>
			{/if}
		</div>
	{/if}
</main>

<SiteFooter />

<style>
	/* Welcome Bar (above diff) */
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
		background: none;
		border: none;
		color: var(--text-subtle);
		font-size: 1.1rem;
		padding: 0 0.35rem;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.15s, color 0.15s;
		line-height: 1;
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

	.sync-banner-btn {
		padding: 0.4rem 0.75rem;
		background: var(--accent);
		border: none;
		border-radius: var(--radius);
		color: var(--bg-base);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s;
	}

	.sync-banner-btn:hover {
		background: var(--accent-muted);
	}

	.sync-banner-dismiss {
		background: none;
		border: none;
		color: var(--text-subtle);
		font-size: 1.2rem;
		cursor: pointer;
		padding: 0.25rem;
		line-height: 1;
		transition: color 0.15s;
	}

	.sync-banner-dismiss:hover {
		color: var(--text-secondary);
	}
</style>
