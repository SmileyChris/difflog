<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import { initApp } from '$lib/stores/operations.svelte';

	let { children } = $props();

	onMount(() => {
		initApp();
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
</script>

<svelte:head>
	<title>difflog</title>
	<meta name="description" content="Personalized developer intelligence diffs" />
</svelte:head>

{@render children()}
