<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SiteFooter } from '$lib/components';

	interface PublicDiff {
		id: string;
		content: string;
		title?: string;
		generated_at: string;
		profile_name: string;
	}

	let loading = $state(true);
	let error = $state('');
	let diff = $state<PublicDiff | null>(null);
	let renderedContent = $state('');

	// Get diff ID from route params
	const diffId = $derived($page.params.id);

	onMount(async () => {
		if (!diffId) {
			error = 'No diff ID provided';
			loading = false;
			return;
		}

		try {
			const res = await fetch(`/api/diff/${diffId}/public`);

			if (!res.ok) {
				if (res.status === 404) {
					error = 'This diff is not available or has been made private.';
				} else {
					error = 'Failed to load diff';
				}
				loading = false;
				return;
			}

			diff = await res.json();
			renderedContent = renderMarkdown(diff!.content);
		} catch (e) {
			error = 'Failed to load diff';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

<main id="content" class="public-diff-page">
	<header>
		<div class="header-left">
			<div class="logo-mark-header" class:logo-mark-spinning={loading}>&#9670;</div>
			<div>
				<h1 class="main-title">
					<a href="/" class="main-title-link">diff<span class="title-diamond">&#9670;</span>log</a>
				</h1>
				{#if diff}
					<p class="header-date">{diff.profile_name ? `shared by ${diff.profile_name}` : 'Shared Diff'}</p>
				{/if}
			</div>
		</div>
	</header>

	<!-- Loading -->
	{#if loading}
		<div class="public-diff-loading">
			<div class="logo-mark-header logo-mark-spinning">&#9670;</div>
			<p>Loading diff...</p>
		</div>
	{/if}

	<!-- Error -->
	{#if error && !loading}
		<div class="error-box">
			<div class="error-icon">&#9888;&#65039;</div>
			<p class="error-text">{error}</p>
			<a href="/" class="btn-primary" style="margin-top: 1rem;">Go to Home</a>
		</div>
	{/if}

	<!-- Diff Content -->
	{#if diff && !loading && !error}
		{#if diff.title}
			<h1 class="public-diff-title">{diff.title}</h1>
		{/if}
		<div class="diff-container">
			<div class="diff-content">
				{@html renderedContent}
			</div>
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
