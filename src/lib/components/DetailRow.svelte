<script lang="ts">
	interface Props {
		label: string;
		value?: string;
		icon?: string;
		children?: any;
	}

	let { label, value, icon, children }: Props = $props();
</script>

<div class="detail-row">
	{#if icon}
		<span class="detail-icon">{icon}</span>
	{/if}
	<span class="detail-label">{label}</span>
	{#if value}
		<span class="detail-value">{value}</span>
	{:else if children}
		<span class="detail-value">{children}</span>
	{/if}
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
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
