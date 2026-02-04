<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		icon?: string;
		message: string;
		description?: string;
		action?: Snippet;
	}

	let { icon = '◇', message, description, action }: Props = $props();
</script>

<div class="empty-state">
	<div class="empty-icon">{icon}</div>
	<p class="empty-message">{message}</p>
	{#if description}
		<p class="empty-description">{description}</p>
	{/if}
	{#if action}
		<div class="empty-action">
			{@render action()}
		</div>
	{/if}
</div>

<style>
	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		color: var(--text-subtle);
	}

	.empty-icon {
		font-size: 3rem;
		color: var(--text-disabled);
		margin-bottom: 1rem;
		opacity: 0.5;
	}

	.empty-message {
		font-size: 1rem;
		color: var(--text-secondary);
		margin: 0 0 0.5rem 0;
	}

	.empty-description {
		font-size: 0.9rem;
		color: var(--text-subtle);
		margin: 0 0 1.5rem 0;
		max-width: 400px;
		margin-left: auto;
		margin-right: auto;
	}

	.empty-action {
		margin-top: 1.5rem;
	}
</style>
