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

	let ctrlHeld = $state(false);
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

		// Keyboard listeners for Ctrl key tracking
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Control') ctrlHeld = true;
		};
		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key === 'Control') ctrlHeld = false;
		};
		const handleBlur = () => {
			ctrlHeld = false;
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		window.addEventListener('blur', handleBlur);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
			window.removeEventListener('blur', handleBlur);
		};
	});

	const trackingText = $derived.by(() => {
		const p = getProfile();
		if (!p) return '';
		return [...(p.languages || []), ...(p.frameworks || []), ...(p.tools || [])].join(' · ');
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

		if (history.length === 0) return `Welcome, ${name}`;

		const days = lastDiffDays;
		const hour = new Date().getHours();
		const timeGreeting = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

		if (days <= 1) return `Good ${timeGreeting}, ${name}`;
		if (days <= 3) return `Hey again, ${name}`;
		if (days <= 7) return `Welcome back, ${name}`;
		if (days <= 14) return `Missed you, ${name}`;
		return `Long time no see, ${name}`;
	});

	const welcomeText = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0)
			return "A diff is your personalized changelog for the developer ecosystem — releases, announcements, and developments filtered to what you care about.<br><br>Hit the button to generate your first one.";

		if (isTodayDiff)
			return 'Your diff is current. Regenerate to get the latest <small>(or hold <kbd>Ctrl</kbd> to generate another)</small>';
		const days = lastDiffDays;
		if (days <= 1) return 'A lot can change overnight. Ready to catch you up.';
		if (days <= 3) return 'A few days of updates are waiting for you.';
		if (days <= 7) return "The dev world moves fast — time to catch up.";
		if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
		return "You've got weeks of ecosystem changes to unpack.";
	});

	const isArchive = $derived(diff != null && getHistory().length > 0 && diff.id !== getHistory()[0].id);

	const isStale = $derived(lastDiffDays > 5);

	const staleText = $derived.by(() => {
		const days = lastDiffDays;
		if (days <= 7) return "The dev world moves fast — time to catch up.";
		if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
		return "You've got weeks of ecosystem changes to unpack.";
	});

	function generate() {
		const forceNew = ctrlHeld;
		goto(forceNew ? '/generate?force=1' : '/generate');
	}

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

<main id="content">
	<PageHeader subtitle={currentDate} iconSpinning={generating.value}>
		<div class="header-profile-group">
			{#if getStars()?.length > 0}
				<a href="/stars" class="header-link">
					<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
				</a>
			{/if}
			<HeaderNav />
		</div>
	</PageHeader>

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
	{:else}
		<div class="welcome-area">
			<div class="logo-mark">&#9670;</div>
			<h2 class="welcome-heading-lg">{welcomeHeading}</h2>
			<p class="welcome-text">{@html welcomeText}</p>

			{#if trackingText}
				<div class="first-time-tracking">
					<span class="first-time-tracking-label">Tracking</span>
					<span class="first-time-tracking-items">{trackingText}</span>
					<a href="/profiles" class="first-time-tracking-edit">Edit</a>
				</div>
			{/if}

			<button class="btn-primary btn-lg btn-branded" onclick={generate} disabled={generating.value}>
				{isTodayDiff && !ctrlHeld ? 'Regenerate Diff' : 'Generate Diff'}
			</button>

			{#if getHistory().length > 0}
				<div class="recent-archive">
					{#each getHistory().slice(0, 3) as h (h.id)}
						<button class="recent-archive-item" onclick={() => (diff = h)}>
							<span class="recent-archive-date">{timeAgo(h.generated_at)}</span>
							<span class="recent-archive-preview">{h.title || h.content.slice(0, 60).replace(/[#*\[\]]/g, '') + '...'}</span>
						</button>
					{/each}
					{#if getHistory().length > 3}
						<a href="/archive" class="recent-archive-more">View all {getHistory().length} diffs</a>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
