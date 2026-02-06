<script lang="ts">
	import { page } from '$app/state';
	import { SiteFooter, PageHeader } from '$lib/components';
</script>

<svelte:head>
	<title>diff·log - {page.status}</title>
</svelte:head>

<main id="content">
	<PageHeader pageTitle="{page.status}" icon="diamond">
		<a href="/" class="header-link">back to home</a>
	</PageHeader>

	<div class="error-content">
		<p class="error-message">{page.error?.message || 'Page not found'}</p>
	</div>

	<SiteFooter />
</main>

<style>
	.error-content {
		text-align: center;
		padding: 4rem 2rem;
	}

	.error-message {
		font-size: 1rem;
		color: var(--text-subtle);
		margin: 0;
	}
</style>
