<script lang="ts">
	import { onMount } from 'svelte';
	import { SiteFooter, PageHeader, DiffContent } from '$lib/components';
	import type { Diff } from '$lib/utils/sync';

	let { data } = $props();

	const diff = $derived(data.diff);
	const error = $derived(data.error);
	const diffAsDiff = $derived(diff as unknown as Diff);

	onMount(() => {
		if (data.scrollToPIndex !== null) {
			setTimeout(() => {
				const el = document.querySelector(`[data-p="${data.scrollToPIndex}"]`) as HTMLElement;
				if (!el) return;

				const section = el.closest('details.md-section');
				if (section && !section.hasAttribute('open')) {
					section.setAttribute('open', '');
				}

				el.classList.add('bookmark-highlight-persistent');
				el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 200);
		}
	});
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

<PageHeader subtitle={diff?.profile_name ? `shared by ${diff.profile_name}` : 'Shared Diff'} />

<main id="content" class="public-diff-page">
	<!-- Error -->
	{#if error}
		<div class="error-box">
			<div class="error-icon">&#9888;&#65039;</div>
			<p class="error-text">{error}</p>
			<a href="/" class="btn-primary" style="margin-top: 1rem;">Go to Home</a>
		</div>
	{/if}

	<!-- Diff Content -->
	{#if diff && !error}
		{#if diff.title}
			<h1 class="public-diff-title">{diff.title}</h1>
		{/if}
		<DiffContent
			diff={diffAsDiff}
			hideBookmarks
			copyLinkUrl={(pIndex) => `${window.location.origin}/d/${diff.id}?p=${pIndex}`}
		/>
	{/if}
</main>

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
