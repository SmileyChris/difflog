<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getHistory } from '$lib/stores/history.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { getCachedPassword, hasPendingChanges } from '$lib/stores/sync.svelte';
	import { openSyncDropdown, generating } from '$lib/stores/ui.svelte';
	import { HeaderNav, DiffView, SiteFooter, PageHeader } from '$lib/components';
	import StreakCalendar from './StreakCalendar.svelte';
	import { daysSince } from '$lib/utils/time.svelte';

	let syncBannerDismissed = $state(false);

	const diff = $derived(getHistory()[0] ?? null);

	onMount(() => {
		if (generating.value && !diff) {
			goto('/generate');
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

		// If the match is the latest diff, stay on dashboard
		if (matches[0].id === diff?.id) return;

		goto(`/d/${matches[0].id}`);
	}

	const lastDiffDays = $derived(getHistory().length > 0 ? daysSince(getHistory()[0].generated_at) : Infinity);

	const isTodayDiff = $derived.by(() => {
		const history = getHistory();
		if (history.length === 0) return false;
		return new Date(history[0].generated_at).toDateString() === new Date().toDateString();
	});

	const isStale = $derived(lastDiffDays > 5);

	const staleText = $derived.by(() => {
		const days = lastDiffDays;
		if (days <= 7) return "The dev world moves fast — time to catch up.";
		if (days <= 14) return "Quite a bit has happened. Let's get you back up to speed.";
		return "You've got weeks of ecosystem changes to unpack.";
	});

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

<PageHeader>
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
		<DiffView {diff}>
			{#snippet infoExtra()}
				<StreakCalendar onDayClick={goToDiffOnDate} />
				{#if generating.value}
					<a href="/generate" class="btn-ghost btn-branded" aria-busy="true">Generating…</a>
				{:else if !isTodayDiff && !isStale}
					<a href="/generate" class="btn-ghost btn-branded">New Diff</a>
				{/if}
			{/snippet}
			{#snippet banners()}
				{#if isStale}
					<div class="stale-banner">
						<span>{staleText}</span>
						{#if generating.value}
							<a href="/generate" class="btn-ghost btn-branded" aria-busy="true">Generating…</a>
						{:else}
							<a href="/generate" class="btn-primary btn-branded stale-banner-btn">Generate new diff</a>
						{/if}
					</div>
				{/if}
			{/snippet}
			{#snippet footerAction()}
				<a href="/generate" class="btn-primary btn-sm btn-branded" aria-busy={generating.value || undefined}>
					{generating.value ? 'Generating…' : isTodayDiff ? 'Regenerate' : 'Generate'}
				</a>
			{/snippet}
		</DiffView>
	{/if}
</main>

<SiteFooter />

<style>
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
