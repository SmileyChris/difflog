<script lang="ts">
	import type { Diff } from '$lib/stores/history.svelte';
	import CardView from '$lib/components/mobile/CardView.svelte';
	import '../../styles/focus.css';

	interface Props {
		diff: Diff;
		onExit: () => void;
		visibleCard?: number;
		onNewest?: () => void;
	}

	let {
		diff,
		onExit,
		visibleCard = $bindable(0),
		onNewest
	}: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		if (e.key === 'Escape' || e.key === 'q' || e.key === 'f') {
			e.preventDefault();
			onExit();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="focus-page">
	<header class="focus-header focus-header-mobile">
		<span class="focus-header-group">
			<span class="focus-logo-mark focus-logo-faded">&#9670;</span>
			<span class="focus-wordmark focus-wordmark-faded">diff<span class="focus-diamond">&#9670;</span>log</span>
			<span class="focus-mode-label-mobile"><span class="focus-mode-f">f</span>ocus</span>
		</span>
		<button class="focus-close-btn" class:focus-close-bright={visibleCard > 0} onclick={onExit} aria-label="Close focus mode">&#10005;</button>
	</header>

	<CardView
		{diff}
		basePath="/d"
		onExit={onExit}
		bind:visibleCard
		{onNewest}
	/>

	<footer class="focus-footer focus-footer-desktop">
		<span class="focus-hints">
			<span class="focus-key">esc</span> exit
			<span class="focus-dot">·</span>
			<span class="focus-key">&uarr; &darr;</span> navigate
			<span class="focus-dot">·</span>
			<span class="focus-key">s</span> star
		</span>
	</footer>
</div>
