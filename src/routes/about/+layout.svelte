<script lang="ts">
	import { page } from "$app/state";
	import { getProfile } from "$lib/stores/profiles.svelte";
	import { PageHeader, HeaderNav } from "$lib/components";

	interface Props {
		children: import("svelte").Snippet;
	}

	let { children }: Props = $props();

	const currentPath = $derived(page.url.pathname);
	const profile = $derived(getProfile());

	function isActive(path: string): boolean {
		return currentPath === path;
	}
</script>

{#snippet aboutNav(labels: { about: string })}
	{#if isActive("/about")}
		<span class="about-nav-link about-nav-link-active">{labels.about}</span>
	{:else}
		<a href="/about" class="about-nav-link">{labels.about}</a>
	{/if}
	<span class="about-nav-sep">&#9670;</span>
	{#if isActive("/about/privacy")}
		<span class="about-nav-link about-nav-link-active">privacy</span>
	{:else}
		<a href="/about/privacy" class="about-nav-link">privacy</a>
	{/if}
	<span class="about-nav-sep">&#9670;</span>
	{#if isActive("/about/terms")}
		<span class="about-nav-link about-nav-link-active">terms</span>
	{:else}
		<a href="/about/terms" class="about-nav-link">terms</a>
	{/if}
{/snippet}

{#if !profile}
	<nav class="about-nav">
		{@render aboutNav({ about: "welcome" })}
	</nav>
{/if}

{#if profile}
	<PageHeader>
		{#snippet subtitleContent()}
			<nav class="about-nav-inline">
				{@render aboutNav({ about: "about" })}
			</nav>
		{/snippet}
		<HeaderNav />
	</PageHeader>
{/if}

<main id="content">
	{@render children()}
</main>

<footer>
	{#if profile}
		<a href="/">&larr; back home</a>
		<span class="about-footer-sep">&#9670;</span>
	{/if}
	<a
		href="https://smileychris.github.io/difflog/"
		target="_blank"
		rel="noopener"><span class="heart-red">&hearts;</span> opensource</a
	>
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
		box-shadow:
			0 0 20px var(--accent-bg),
			0 0 40px var(--accent-bg);
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

	footer {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		margin-top: auto;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: lowercase;
	}

	footer a {
		color: var(--text-disabled);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	footer a:hover {
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

	/* About page content styles */
	:global(article) {
		width: 100%;
	}

	:global(.brand-inline) {
		color: var(--text-heading);
		font-weight: 600;
	}

	:global(.brand-diamond) {
		color: var(--accent);
		font-size: 0.5em;
		vertical-align: middle;
		margin: 0 0.05em;
	}

	:global(.about-intro) {
		font-size: 1rem;
		color: var(--text-secondary);
		margin-bottom: 2rem;
		line-height: 1.6;
	}

	:global(.about-tldr) {
		background: var(--bg-card);
		border: 1px solid var(--accent-border);
		border-radius: var(--radius-lg);
		padding: 1.25rem 1.5rem;
		margin-bottom: 2rem;
	}

	:global(.about-tldr-title) {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--accent);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin: 0 0 0.75rem 0;
	}

	:global(.about-tldr-list) {
		margin: 0;
		padding-left: 1.25rem;
		list-style: disc;
	}

	:global(.about-tldr-list li) {
		font-size: 0.9rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0.4rem 0;
	}

	:global(article section) {
		margin-bottom: 1.75rem;
	}

	:global(article section h3) {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-heading);
		margin: 0 0 0.5rem 0;
	}

	:global(article section h3::before) {
		content: '◆';
		color: var(--accent);
		margin-right: 0.5rem;
		font-size: 0.7em;
	}

	:global(article section h4) {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-heading);
		margin: 1.25rem 0 0.5rem 0;
	}

	:global(article section p) {
		font-size: 0.9rem;
		color: var(--text-secondary);
		line-height: 1.6;
		margin: 0 0 0.75rem 0;
	}

	:global(article section p:last-child) {
		margin-bottom: 0;
	}

	:global(article section ul) {
		margin: 0.5rem 0;
		padding-left: 1.25rem;
		list-style: none;
	}

	:global(article section li) {
		font-size: 0.9rem;
		color: var(--text-secondary);
		line-height: 1.5;
		margin: 0.35rem 0;
		position: relative;
	}

	:global(article section li::before) {
		content: '–';
		color: var(--text-disabled);
		position: absolute;
		left: -1rem;
	}

	:global(article section strong) {
		color: var(--text-heading);
		font-weight: 600;
	}

	:global(.about-updated) {
		font-size: 0.8rem;
		color: var(--text-disabled);
		margin-top: 2rem;
		text-align: center;
	}

	:global(.about-centered) {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 3rem 1rem;
		flex: 1;
	}

	:global(.about-back) {
		margin-top: 2.5rem;
		text-align: center;
	}

	:global(.about-back-link) {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-subtle);
		text-decoration: none;
		transition: color 0.15s;
	}

	:global(.about-back-link:hover) {
		color: var(--accent);
	}
</style>
