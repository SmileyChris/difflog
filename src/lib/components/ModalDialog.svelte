<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		error?: string;
		size?: 'sm' | 'default' | 'lg';
		dark?: boolean;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	}

	let {
		title,
		subtitle,
		error,
		size = 'default',
		dark = false,
		onclose,
		children,
		footer
	}: Props = $props();

	let dialogEl: HTMLDialogElement;

	export function open() {
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	function handleDialogClick(event: MouseEvent) {
		// Close on backdrop click (clicking the dialog element itself, not its children)
		if (event.target === dialogEl) {
			close();
		}
	}

	function handleClose() {
		onclose?.();
	}
</script>

<dialog
	bind:this={dialogEl}
	class={size !== 'default' ? size : ''}
	class:dark
	onclick={handleDialogClick}
	onclose={handleClose}
>
	<header>
		<div>
			<h2 class="unlock-title">{title}</h2>
			{#if subtitle}
				<p class="unlock-subtitle">{subtitle}</p>
			{/if}
		</div>
		<button class="dialog-close" onclick={close} aria-label="Close">&times;</button>
	</header>
	<div class="dialog-body padded">
		{@render children()}
		{#if error}
			<div class="unlock-error">{error}</div>
		{/if}
	</div>
	{#if footer}
		<footer>
			{@render footer()}
		</footer>
	{/if}
</dialog>

<style>
	dialog {
		width: 500px;
		max-width: calc(100% - 2rem);
		max-height: 80vh;
		background: var(--bg-card);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		padding: 0;
		flex-direction: column;
		overflow: hidden;
		color: var(--text-primary);
	}

	dialog[open] {
		display: flex;
	}

	dialog::backdrop {
		background: rgba(0, 0, 0, 0.8);
	}

	dialog.sm {
		max-width: 400px;
	}

	dialog.lg {
		width: 800px;
		max-height: 90vh;
	}

	dialog.dark {
		background: var(--bg-surface);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		flex-wrap: nowrap;
		gap: 1rem;
		padding: 2rem 2rem 0;
	}

	.dialog-close {
		flex-shrink: 0;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 1.5rem;
		line-height: 1;
		color: var(--text-disabled);
		padding: 0;
		transition: color 0.15s;
	}

	.dialog-close:hover {
		color: var(--text-primary);
	}

	.dialog-body {
		padding: 1.25rem;
		overflow-y: auto;
	}

	.dialog-body.padded {
		padding: 2rem;
	}

	.unlock-title {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-heading);
		margin: 0;
	}

	.unlock-subtitle {
		font-size: 0.9rem;
		color: var(--accent);
		margin: 0.25rem 0 0;
	}

	.unlock-error {
		margin-top: 0.75rem;
		padding: 0.75rem;
		background: rgba(255, 100, 100, 0.1);
		border: 1px solid rgba(255, 100, 100, 0.3);
		border-radius: var(--radius);
		font-size: 0.85rem;
		color: var(--danger);
	}

	footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1.25rem 2rem;
		border-top: 1px solid var(--border);
	}
</style>
