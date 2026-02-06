<script lang="ts">
	import { page } from '$app/state';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { PageHeader, HeaderNav } from '$lib/components';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const currentPath = $derived(page.url.pathname);
	const profile = $derived(getProfile());

	function isActive(path: string): boolean {
		return currentPath === path;
	}
</script>

{#snippet aboutNav(labels: {about: string})}
	{#if isActive('/about')}
		<span class="about-nav-link about-nav-link-active">{labels.about}</span>
	{:else}
		<a href="/about" class="about-nav-link">{labels.about}</a>
	{/if}
	<span class="about-nav-sep">&#9670;</span>
	{#if isActive('/about/privacy')}
		<span class="about-nav-link about-nav-link-active">privacy</span>
	{:else}
		<a href="/about/privacy" class="about-nav-link">privacy</a>
	{/if}
	<span class="about-nav-sep">&#9670;</span>
	{#if isActive('/about/terms')}
		<span class="about-nav-link about-nav-link-active">terms</span>
	{:else}
		<a href="/about/terms" class="about-nav-link">terms</a>
	{/if}
{/snippet}

<main id="content">
	{#if !profile}
		<nav class="about-nav">
			{@render aboutNav({about: 'welcome'})}
		</nav>
	{/if}

	{#if profile}
		<PageHeader>
			{#snippet subtitleContent()}
				<nav class="about-nav-inline">
					{@render aboutNav({about: 'about'})}
				</nav>
			{/snippet}
			<HeaderNav />
		</PageHeader>
	{/if}

	{@render children()}

	<footer class="about-footer">
		{#if profile}
			<a href="/" class="about-footer-link">&larr; back home</a>
			<span class="about-footer-sep">&#9670;</span>
		{/if}
		<a href="https://smileychris.github.io/difflog/" class="about-footer-link" target="_blank" rel="noopener">&hearts; opensource</a>
	</footer>
</main>
