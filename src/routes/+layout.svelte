<script lang="ts">
	import '../app.css';
	import '../styles/mobile.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { initApp } from '$lib/stores/operations.svelte';
	import { startClock } from '$lib/stores/tick.svelte';
	import { isMobile, initMobileDetection, mobileDiff } from '$lib/stores/mobile.svelte';
	import TabBar from '$lib/components/mobile/TabBar.svelte';

	let { children } = $props();

	onMount(() => {
		initApp();
		startClock();
		initMobileDetection();
	});

	// Enable View Transitions API
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	// Clear diff context on navigation
	onNavigate(() => {
		mobileDiff.diff = null;
		mobileDiff.flatCards = [];
	});

	// Routes that handle their own mobile chrome (no tab bar)
	const excludedRoutes = ['/focus', '/cli'];
	const isExcluded = $derived(excludedRoutes.some((r) => page.url.pathname.startsWith(r)));

	const showMobileChrome = $derived(isMobile.value && !isExcluded);
</script>

<svelte:head>
	<title>difflog</title>
	<meta name="description" content="Personalized developer intelligence diffs" />
</svelte:head>

{#if showMobileChrome}
	<div class="mobile-layout">
		{@render children()}
	</div>

	<TabBar />
{:else}
	{@render children()}
{/if}
