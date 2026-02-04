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
	<div class="dialog-body padded">
		<h2 class="unlock-title">{title}</h2>
		{#if subtitle}
			<p class="unlock-subtitle">{subtitle}</p>
		{/if}
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
