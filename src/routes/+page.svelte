<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { getProfile, getApiKey } from '$lib/stores/profiles.svelte';
	import { getHistory, type Diff } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { updateProfile, autoSync, getCachedPassword, hasPendingChanges } from '$lib/stores/sync.svelte';
	import { openSyncDropdown } from '$lib/stores/ui.svelte';
	import { addDiff, deleteDiff, removeStar } from '$lib/stores/operations.svelte';
	import { HeaderNav, SyncDropdown, ShareDropdown, DiffContent, StreakCalendar, SiteFooter, PageHeader } from '$lib/components';
	import { SCAN_MESSAGES, DEPTHS, WAIT_TIPS } from '$lib/utils/constants';
	import { timeAgo, daysSince, getCurrentDateFormatted } from '$lib/utils/time';
	import { generateDiffContent } from '$lib/actions/generateDiff';

	let { data } = $props();

	let generating = $state(false);
	let ctrlHeld = $state(false);
	let error = $state<string | null>(null);
	let waitTip = $state('');
	let diff = $state<Diff | null>(null);
	let scanIndex = $state(0);
	let selectedDepth = $state<string>('standard');

	// Initialize from page data (reactive to data changes from navigation)
	$effect.pre(() => {
		diff = data.initialDiff ?? null;
		selectedDepth = data.selectedDepth ?? 'standard';
	});
	let scanMessages = $state([...SCAN_MESSAGES]);
	let scanInterval: ReturnType<typeof setInterval> | null = null;
	let currentDate = getCurrentDateFormatted();
	let syncBannerDismissed = $state(false);

	onMount(() => {
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

	const depthLabel = $derived.by(() => {
		const p = getProfile();
		if (!p) return '';
		const d = DEPTHS.find((d) => d.id === p.depth);
		return d ? d.label : 'Standard Brief';
	});

	function showLastDiff() {
		const history = getHistory();
		if (history.length > 0) diff = history[0];
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

	function getLastDiffDate(): string | undefined {
		const history = getHistory();
		return history.length > 0 ? history[0].generated_at : undefined;
	}

	function estimatedTime(): string {
		const history = getHistory();
		const durations = history.map((h) => h.duration_seconds).filter((d) => d && d > 0);
		let timeStr: string;
		if (durations.length === 0) {
			timeStr = 'This usually takes 30–60 seconds...';
		} else {
			const avg = Math.round(durations.reduce((a, b) => (a || 0) + (b || 0), 0) / durations.length);
			if (avg < 60) {
				timeStr = `Usually takes about ${avg} seconds...`;
			} else {
				const mins = Math.floor(avg / 60);
				const secs = avg % 60;
				timeStr = secs > 0 ? `Usually takes about ${mins}m ${secs}s...` : `Usually takes about ${mins} minute${mins > 1 ? 's' : ''}...`;
			}
		}
		return waitTip ? `${timeStr} ${waitTip}` : timeStr;
	}

	async function generate() {
		const forceNew = ctrlHeld;
		const apiKey = getApiKey();

		if (apiKey === 'demo-key-placeholder') {
			error = 'This is a demo profile. To generate real diffs, go to Profiles and add your Anthropic API key, or create a new profile with a valid key.';
			return;
		}

		const profile = getProfile();
		if (!profile) {
			error = 'No profile found';
			return;
		}

		generating = true;
		error = null;
		diff = null;
		scanIndex = 0;
		scanMessages = [...SCAN_MESSAGES].sort(() => Math.random() - 0.5);
		waitTip = WAIT_TIPS[Math.floor(Math.random() * WAIT_TIPS.length)];

		if (browser) {
			window.onbeforeunload = (e) => {
				e.preventDefault();
				e.returnValue = '';
				return '';
			};
		}

		scanInterval = setInterval(() => {
			scanIndex = (scanIndex + 1) % scanMessages.length;
		}, 4400);

		try {
			const lastDiff = getHistory()[0];

			const result = await generateDiffContent({
				profile,
				apiKey: apiKey || '',
				selectedDepth,
				lastDiffDate: getLastDiffDate() ?? null,
				lastDiffContent: lastDiff?.content,
				onMappingsResolved: (mappings) => updateProfile({ resolvedMappings: mappings })
			});

			diff = result.diff;

			// Handle replacing today's existing diff (unless Ctrl held)
			const today = new Date().toDateString();
			const history = getHistory();
			if (!forceNew && history.length > 0 && new Date(history[0].generated_at).toDateString() === today) {
				const oldDiffId = history[0].id;
				const starsToRemove = getStars().filter((s) => s.diff_id === oldDiffId);
				for (const star of starsToRemove) {
					removeStar(star.diff_id, star.p_index);
				}
				deleteDiff(oldDiffId);
			}
			addDiff(result.diff);
			autoSync();
		} catch (e: unknown) {
			error = `Failed to generate diff: ${e instanceof Error ? e.message : 'Unknown error'}`;
		} finally {
			generating = false;
			if (scanInterval) {
				clearInterval(scanInterval);
				scanInterval = null;
			}
			if (browser) {
				window.onbeforeunload = null;
			}
		}
	}

	function scrollToAndHighlight(pIndex: number) {
		setTimeout(() => {
			const container = document.querySelector('.diff-content');
			if (!container) return;

			const paragraph = container.querySelector(`[data-p="${pIndex}"]`) as HTMLElement;
			if (!paragraph) return;

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
</script>

<svelte:head>
	<title>diff·log</title>
</svelte:head>

<main id="content">
	<PageHeader subtitle={currentDate} iconSpinning={generating}>
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

	{#if generating}
		<div class="generating-state">
			<div class="logo-mark logo-mark-spinning">&#9670;</div>
			<p class="generating-message">{scanMessages[scanIndex].icon} {scanMessages[scanIndex].text}</p>
			<p class="generating-time">{estimatedTime()}</p>
		</div>
	{:else if error}
		<div class="error-state">
			<p class="error-message">{error}</p>
			<button class="btn-retry" onclick={generate}>Try Again</button>
		</div>
	{:else if diff}
		<div class="welcome-bar">
			<h2 class="welcome-heading-lg">{welcomeHeading}</h2>
			<div class="diff-info-bar">
				<div class="diff-info-left">
					<span class="diff-label">Here's your latest diff</span>
					<span class="diff-time">{timeAgo(diff.generated_at)}</span>
					<StreakCalendar />
					<button class="btn-generate-inline" onclick={generate}>
						<span class="btn-generate-diamond">&#9670;</span> New Diff
					</button>
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

			<button class="btn-generate" onclick={generate} disabled={generating}>
				<span>&#9670;</span> Generate your diff
			</button>

			{#if getHistory().length > 0}
				<div class="recent-archive">
					{#each getHistory().slice(0, 3) as h (h.id)}
						<div class="recent-archive-item" onclick={() => (diff = h)}>
							<span class="recent-archive-date">{timeAgo(h.generated_at)}</span>
							<span class="recent-archive-preview">{h.title || h.content.slice(0, 60).replace(/[#*\[\]]/g, '') + '...'}</span>
						</div>
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
