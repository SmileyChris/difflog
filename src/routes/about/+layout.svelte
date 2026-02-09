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

<main id="content">
	{@render children()}
</main>

<footer class="about-footer">
	{#if profile}
		<a href="/" class="about-footer-link">&larr; back home</a>
		<span class="about-footer-sep">&#9670;</span>
	{/if}
	<a href="https://smileychris.github.io/difflog/" class="about-footer-link" target="_blank" rel="noopener">&hearts; opensource</a>
</footer>

<style>
	.about-nav {
		position: sticky;
		top: 1rem;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		text-transform: lowercase;
		background: var(--bg-card);
		border: 1px solid var(--accent-border);
		border-radius: 2rem;
		padding: 0.5rem 1rem;
		width: fit-content;
		margin-left: auto;
		margin-right: auto;
		box-shadow: 0 0 20px var(--accent-bg), 0 0 40px var(--accent-bg);
	}

	.about-nav-link {
		color: var(--text-subtle);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	.about-nav-link:hover {
		color: var(--accent);
	}

	.about-nav-link-active {
		color: var(--text-heading);
	}

	.about-nav-sep {
		color: var(--accent);
		opacity: 0.5;
		font-size: 0.5em;
	}

	.about-nav-inline {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.about-nav-inline .about-nav-link {
		padding: 0;
	}

	.about-nav-inline .about-nav-sep {
		font-size: 0.4em;
	}

	.about-footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: auto;
		padding: 1.5rem 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: lowercase;
	}

	.about-footer-link {
		color: var(--text-disabled);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	.about-footer-link:hover {
		color: var(--accent);
	}

	.about-footer-sep {
		color: var(--accent);
		opacity: 0.5;
		font-size: 0.5em;
		vertical-align: middle;
	}

	:global(.splash-cta) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1rem 2.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		background: var(--accent);
		color: var(--bg-base);
		border: none;
		border-radius: var(--radius-md);
		text-decoration: none;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	:global(.splash-cta:hover) {
		background: var(--accent-muted);
	}

	:global(.splash-cta-icon) {
		font-size: 1rem;
	}

	:global(.about-cta) {
		margin-top: 2.5rem;
		text-align: center;
	}
</style>
