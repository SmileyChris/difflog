<script lang="ts">
	import { dev } from "$app/environment";
	import { isMobile } from "$lib/stores/mobile.svelte";
	import ChangelogModal from "./ChangelogModal.svelte";

	const version = __APP_VERSION__;

	let changelogEl: ChangelogModal;
	let hasUnseen = $state(false);
	let dotDismissed = $state(false);

	const showDot = $derived(hasUnseen && !dotDismissed);

	function show() {
		dotDismissed = true;
		changelogEl?.open();
	}
</script>

{#if !isMobile.value}
<footer>
	<nav>
		<a href="/about">About diff·log</a>
		<span>&#9670;</span>
		<a href="/about/privacy">Privacy</a>
		<span>&#9670;</span>
		<a href="/about/terms">Terms</a>
		<span>&#9670;</span>
		<a href="/about/opensource">
			<span class="heart-red">&hearts;</span> opensource
		</a>
	</nav>
</footer>

{/if}

{#if !isMobile.value}
	<div class="changelog-wrapper" class:changelog-sticky={showDot}>
		{#if dev}
			<a href="/design" class="design-link">design system</a>
		{/if}
		<button class="changelog-btn" onclick={show}>
			v{version}
			{#if showDot}
				<span class="changelog-dot"></span>
			{/if}
		</button>
	</div>
{/if}

<ChangelogModal bind:this={changelogEl} bind:hasUnseen />

<style>
	footer {
		margin-top: auto;
		padding: 1.5rem 0;
		text-align: center;
	}

	nav {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-transform: lowercase;
	}

	footer a,
	.design-link {
		color: var(--text-disabled);
		text-decoration: none;
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	footer a:hover,
	.design-link:hover {
		color: var(--accent);
	}

	nav > span {
		color: var(--accent);
		opacity: 0.5;
		font-size: 0.5em;
		vertical-align: middle;
	}

	.heart-red {
		transition: color 0.15s;
	}

	footer a:hover .heart-red {
		color: #e25555;
	}

	.design-link {
		margin-right: 0.75rem;
		opacity: 0.6;
		font-family: var(--font-mono);
		font-size: 0.75rem;
	}

	.design-link:hover {
		opacity: 1;
	}

	/* Changelog */
	.changelog-wrapper {
		text-align: right;
		padding: 0 1rem;
	}

	.changelog-sticky {
		position: fixed;
		bottom: 0;
		right: 0;
		z-index: 100;
		padding: 0.5rem 1rem;
		background: var(--bg-surface);
		border-top-left-radius: var(--radius-lg);
	}

	.changelog-btn {
		background: none;
		border: none;
		cursor: pointer;
		position: relative;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-disabled);
		padding: 0.25rem 0.5rem;
		transition: color 0.15s;
	}

	.changelog-btn:hover {
		color: var(--accent);
	}

	.changelog-dot {
		position: absolute;
		top: 0;
		right: 0;
		width: 6px;
		height: 6px;
		background: var(--accent);
		border-radius: 50%;
	}
</style>
