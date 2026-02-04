<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		pageTitle?: string;
		subtitle?: string;
		icon?: 'diamond' | 'user' | 'square' | 'star';
		iconSpinning?: boolean;
		children?: Snippet;
	}

	let { pageTitle, subtitle, icon = 'diamond', iconSpinning = false, children }: Props = $props();
</script>

<header>
	<div class="header-left">
		{#if icon === 'diamond'}
			<div class="logo-mark-header" class:logo-mark-spinning={iconSpinning}>&#9670;</div>
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
