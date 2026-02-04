<script lang="ts">
	interface Props {
		icon: string;
		title?: string;
		variant?: 'default' | 'danger' | 'subtle';
		size?: 'sm' | 'md';
		disabled?: boolean;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		icon,
		title,
		variant = 'default',
		size = 'md',
		disabled = false,
		onclick
	}: Props = $props();
</script>

<button
	class="icon-btn"
	class:icon-btn-danger={variant === 'danger'}
	class:icon-btn-subtle={variant === 'subtle'}
	class:icon-btn-sm={size === 'sm'}
	{title}
	{disabled}
	{onclick}
>
	{icon}
</button>

<style>
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius);
		color: var(--text-subtle);
		cursor: pointer;
		font-size: 1rem;
		transition: all 0.15s;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		flex-shrink: 0;
	}

	.icon-btn:hover:not(:disabled) {
		border-color: var(--text-subtle);
		color: var(--text-primary);
		background: var(--bg-card-hover);
	}

	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.icon-btn-danger {
		color: var(--danger);
	}

	.icon-btn-danger:hover:not(:disabled) {
		border-color: var(--danger);
		background: rgba(255, 100, 100, 0.1);
	}

	.icon-btn-subtle {
		border: none;
		color: var(--text-disabled);
	}

	.icon-btn-subtle:hover:not(:disabled) {
		color: var(--text-subtle);
		background: var(--bg-chip);
	}

	.icon-btn-sm {
		width: 1.5rem;
		height: 1.5rem;
		font-size: 0.875rem;
	}
</style>
