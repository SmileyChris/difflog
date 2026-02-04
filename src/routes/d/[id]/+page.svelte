<script lang="ts">
	import { renderMarkdown } from '$lib/utils/markdown';
	import { SiteFooter } from '$lib/components';

	let { data } = $props();

	const diff = $derived(data.diff);
	const error = $derived(data.error);
	const renderedContent = $derived(diff?.content ? renderMarkdown(diff.content) : '');
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - diff·log` : 'diff·log'}</title>
</svelte:head>

<main id="content" class="public-diff-page">
	<header>
		<div class="header-left">
			<div class="logo-mark-header">&#9670;</div>
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
		<div class="diff-container">
			<div class="diff-content">
				{@html renderedContent}
			</div>
		</div>
	{/if}
</main>

<SiteFooter version="2.0.4" />
