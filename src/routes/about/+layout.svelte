<script lang="ts">
	import { page } from '$app/state';
	import { getProfile } from '$lib/stores/profiles.svelte';

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

<main id="content">
	<!-- No profile: top nav -->
	{#if !profile}
		<nav class="about-nav">
			{#if isActive('/about')}
				<span class="about-nav-link about-nav-link-active">welcome</span>
			{:else}
				<a href="/about" class="about-nav-link">welcome</a>
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
		</nav>
	{/if}

	<!-- Has profile: header -->
	{#if profile}
		<header>
			<div class="header-left">
				<a href="/" class="main-title-link">
					<div class="logo-mark-header">&#9670;</div>
				</a>
				<div>
					<h1 class="main-title"><a href="/" class="main-title-link">diff<span class="title-diamond">&#9670;</span>log</a></h1>
					<nav class="about-nav-inline">
						{#if isActive('/about')}
							<span class="about-nav-link about-nav-link-active">about</span>
						{:else}
							<a href="/about" class="about-nav-link">about</a>
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
					</nav>
				</div>
			</div>
			<div class="header-right">
				<a href="/profiles" class="profile-badge">
					<svg class="profile-badge-icon" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="11" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
					<span>{profile?.name || 'Profile'}</span>
				</a>
			</div>
		</header>
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
