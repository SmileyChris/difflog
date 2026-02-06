<script lang="ts">
	interface Props {
		label: string;
		value?: string;
		icon?: string;
		onedit?: () => void;
		children?: any;
	}

	let { label, value, icon, onedit, children }: Props = $props();
</script>

<div class="detail-row" class:detail-row-editable={onedit}>
	{#if icon}
		<span class="detail-icon">{icon}</span>
	{/if}
	<span class="detail-label">{label}</span>
	<span class="detail-value">
		{#if value}{value}{:else if children}{children}{/if}{#if onedit}<button class="detail-edit" onclick={(e) => { e.stopPropagation(); onedit(); }}>&#9998;</button>{/if}
	</span>
</div>

<style>
	.detail-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.9rem;
	}

	.detail-icon {
		font-size: 1rem;
		color: var(--text-subtle);
		flex-shrink: 0;
	}

	.detail-label {
		color: var(--text-subtle);
		font-size: 0.85rem;
		flex-shrink: 0;
		min-width: 80px;
	}

	.detail-value {
		color: var(--text-secondary);
		flex: 1;
	}

	.detail-edit {
		background: none;
		border: none;
		color: var(--text-subtle);
		cursor: pointer;
		padding: 0 0.25rem;
		margin-left: 0.5rem;
		font-size: 0.85rem;
		opacity: 0;
		transition: opacity 0.15s, color 0.15s;
		vertical-align: middle;
	}

	.detail-row-editable:hover .detail-edit {
		opacity: 1;
	}

	.detail-edit:hover {
		color: var(--accent);
	}
</style>
