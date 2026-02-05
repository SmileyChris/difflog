<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goto } from '$app/navigation';
	import { isGenerating } from '$lib/stores/ui.svelte';

	interface Props {
		pageTitle?: string;
		subtitle?: string;
		icon?: 'diamond' | 'user' | 'square' | 'star';
		iconSpinning?: boolean;
		children?: Snippet;
	}

	let { pageTitle, subtitle, icon = 'diamond', iconSpinning = false, children }: Props = $props();

	const spinning = $derived(isGenerating() || iconSpinning);
</script>

<header>
	<div class="header-left">
		{#if isGenerating()}
			<button class="logo-mark-header logo-mark-spinning logo-mark-clickable" onclick={() => goto('/generate')} title="View generation progress">
				&#9670;
			</button>
		{:else if icon === 'diamond'}
			<div class="logo-mark-header" class:logo-mark-spinning={spinning}>&#9670;</div>
		{:else if icon === 'user'}
			<div class="logo-mark-header logo-mark-user">
				<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
					<circle cx="12" cy="11" r="4" />
					<path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" />
				</svg>
			</div>
		{:else if icon === 'square'}
			<div class="logo-mark-header logo-mark-square">&#9632;</div>
		{:else if icon === 'star'}
			<div class="logo-mark-header logo-mark-star">&#9733;</div>
		{/if}
		<div>
			<h1 class="main-title">
				<a href="/" class="main-title-link">diff<span class="title-diamond">&#9670;</span>log</a>
				{#if pageTitle}
					{pageTitle}
				{/if}
			</h1>
			{#if subtitle}
				<p class="header-date">{subtitle}</p>
			{/if}
		</div>
	</div>
	{#if children}
		<div class="header-right">
			{@render children()}
		</div>
	{/if}
</header>

<style>
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 2rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		justify-content: flex-end;
		flex: 1;
	}

	.main-title {
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		margin: 0;
		color: var(--text-heading);
	}

	.main-title-link {
		text-decoration: none;
		color: inherit;
	}

	.main-title-link:hover {
		color: var(--accent);
	}

	.title-diamond {
		font-size: 0.4em;
		vertical-align: 0.3em;
		margin: 0 0.05em;
		opacity: 0.7;
	}

	.header-date {
		font-size: 0.75rem;
		font-family: var(--font-mono);
		color: var(--text-hint);
		margin: 0;
	}

	.logo-mark-header {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		font-size: 1.1rem;
		color: var(--accent);
		transform-origin: center center;
	}

	.logo-mark-header::after {
		content: '\25C7';
		position: absolute;
		font-size: 2rem;
		color: var(--accent);
	}

	.logo-mark-star {
		font-size: 1.2rem;
	}

	.logo-mark-star::after {
		content: '\25C7';
		position: absolute;
		font-size: 2rem;
		color: var(--accent);
	}

	.logo-mark-square {
		font-size: 0.9rem;
	}

	.logo-mark-square::after {
		content: '\25C7';
		position: absolute;
		font-size: 2rem;
		color: var(--accent);
	}

	.logo-mark-user {
		font-size: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logo-mark-user svg {
		width: 1rem;
		height: 1rem;
		margin-top: -0.15rem;
	}

	.logo-mark-user::after {
		content: '\25C7';
		position: absolute;
		font-size: 2rem;
		color: var(--accent);
	}

	.logo-mark-spinning {
		animation: diamond-spin 2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite;
	}

	.logo-mark-clickable {
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
		font-family: inherit;
	}

	.logo-mark-clickable:hover::after {
		color: var(--accent-hover, var(--accent));
	}

	@keyframes diamond-spin {
		0% {
			transform: rotateY(0deg);
		}
		100% {
			transform: rotateY(360deg);
		}
	}
</style>
