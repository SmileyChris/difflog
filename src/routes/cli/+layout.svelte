<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>CLI - diff·log</title>
</svelte:head>

<div class="cli-auth">
	<div class="cli-brand">
		<span class="cli-logo">diff<span class="cli-diamond">&#9670;</span>log</span>
		<span class="cli-subtitle">CLI Login</span>
	</div>

	{@render children()}
</div>

<style>
	.cli-auth {
		max-width: 22rem;
		margin: 0 auto;
		padding: 4rem 1rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
	}

	/* Branding */
	.cli-brand {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.cli-logo {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-heading);
		letter-spacing: -0.02em;
	}

	.cli-diamond {
		color: var(--accent);
		font-size: 0.35em;
		vertical-align: 0.35em;
		margin: 0 0.05em;
	}

	.cli-subtitle {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.15em;
		color: var(--text-hint);
	}

	/* Card */
	:global(.cli-card) {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 2rem 1.5rem;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		text-align: center;
	}

	/* Text */
	:global(.cli-message) {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-heading);
		margin: 0;
	}

	:global(.cli-hint) {
		font-size: 0.85rem;
		color: var(--text-hint);
		margin: 0;
		line-height: 1.5;
	}

	:global(.cli-hint code) {
		background: var(--bg-chip);
		padding: 0.125rem 0.4rem;
		border-radius: 0.25rem;
		font-size: 0.85em;
	}

	/* Success */
	:global(.cli-checkmark) {
		font-size: 2rem;
		color: var(--accent);
	}

	/* Action button */
	:global(.cli-action) {
		width: 100%;
		justify-content: center;
		margin-top: 0.25rem;
	}
</style>
