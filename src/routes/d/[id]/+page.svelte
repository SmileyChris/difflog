<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { getStars, getStarCountLabel } from '$lib/stores/stars.svelte';
	import { generating } from '$lib/stores/ui.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import { HeaderNav, DiffView, DiffContent, SiteFooter, PageHeader } from '$lib/components';

	let { data } = $props();

	const diff = $derived(data.diff as Diff | undefined);
	const error = $derived(data.error);
	const isLocal = $derived(data.isLocal === true);
	const viewAsPublic = $derived((page.state as Record<string, unknown>)?.viewAsPublic === true);
	const showLocalMode = $derived(isLocal && !viewAsPublic);

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
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

{#if showLocalMode}
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
{/if}

<SiteFooter />

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
