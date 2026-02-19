<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { generating } from '$lib/stores/ui.svelte';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { isMobile, mobileDiff } from '$lib/stores/mobile.svelte';
	import { HeaderNav, DiffView, DiffContent, SiteFooter, PageHeader } from '$lib/components';
	import CardView from '$lib/components/mobile/CardView.svelte';

	let { data } = $props();

	const diff = $derived(data.diff as Diff | undefined);
	const error = $derived(data.error);
	const isLocal = $derived(data.isLocal === true);
	const viewAsPublic = $derived((page.state as Record<string, unknown>)?.viewAsPublic === true);
	const showLocalMode = $derived(isLocal && !viewAsPublic);
	const forceScroll = $derived(page.url?.searchParams?.get('scroll') === '1');

	// Set mobile diff context for layout's Actions panel
	$effect(() => {
		mobileDiff.diff = showLocalMode && diff ? diff : null;
	});

	afterNavigate(() => {
		const pIndex = (page.state as Record<string, unknown>)?.scrollToPIndex as number | null
			?? data.scrollToPIndex
			?? null;
		if (pIndex === null) return;

		setTimeout(() => {
			const el = document.querySelector(`[data-p="${pIndex}"]`) as HTMLElement;
			if (!el) return;

			const section = el.closest('details.md-section');
			if (section && !section.hasAttribute('open')) {
				section.setAttribute('open', '');
			}

			el.classList.add('bookmark-highlight');
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			el.addEventListener(
				'animationend',
				() => el.classList.remove('bookmark-highlight'),
				{ once: true }
			);
		}, 200);
	});

	const showMobileCards = $derived(showLocalMode && isMobile.value && !forceScroll && diff);

	// Check if this is the latest diff — show ◆ to navigate to generate card
	const isLatest = $derived.by(() => {
		if (!diff) return false;
		const history = getHistory();
		return history.length > 0 && history[0].id === diff.id;
	});

	function handleExit() {
		// no-op in diff view — user is already on the diff page
	}

	function handleNewest() {
		goto('/');
	}
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

{#if showMobileCards}
	<div class="mobile-diff-page">
		<CardView
			diff={diff}
			basePath="/d"
			onExit={handleExit}
			bind:visibleCard={mobileDiff.visibleCard}
			tabBarHeight={48}
			onFlatCards={(cards) => { mobileDiff.flatCards = cards; }}
			onNewest={isLatest ? handleNewest : undefined}
		/>
	</div>
{:else if showLocalMode}
	<PageHeader>
		{#if getStars()?.length > 0}
			<a href="/stars" class="header-link">
				<span class="header-link-icon">&#9733;</span> {getStarCountLabel()}
			</a>
		{/if}
		<HeaderNav />
	</PageHeader>

	<main id="content">
		{#if diff}
			<DiffView {diff}>
				{#snippet infoExtra()}
					{#if generating.value}
						<a href="/generate" class="btn-ghost btn-branded" aria-busy="true">Generating…</a>
					{:else}
						<a href="/" class="btn-ghost">Latest diff &rarr;</a>
					{/if}
				{/snippet}
			</DiffView>
		{/if}
	</main>
	<SiteFooter />
{:else}
	<PageHeader subtitle={viewAsPublic
		? `shared by ${getProfile()?.name || 'Anonymous'}`
		: (diff?.profile_name ? `shared by ${diff.profile_name}` : 'Shared Diff')} />

	<main id="content" class="public-diff-page">
		{#if error}
			<div class="error-box">
				<div class="error-icon">&#9888;&#65039;</div>
				<p class="error-text">{error}</p>
				<a href="/" class="btn-primary" style="margin-top: 1rem;">Go to Home</a>
			</div>
		{/if}

		{#if diff && !error}
			{#if diff.title}
				<h1 class="public-diff-title">{diff.title}</h1>
			{/if}
			<DiffContent
				diff={diff as Diff}
				hideBookmarks
				copyLinkUrl={(pIndex) => `${window.location.origin}/d/${diff.id}?p=${pIndex}`}
			/>
		{/if}
	</main>
	<SiteFooter />
{/if}

<style>
	.public-diff-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
	}

	.public-diff-title {
		font-size: 2rem;
		font-weight: 600;
		margin-bottom: 1.5rem;
		color: var(--text-primary);
		line-height: 1.2;
	}
</style>
