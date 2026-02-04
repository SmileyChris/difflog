<script lang="ts">
	interface Props {
		label?: string;
		type?: 'text' | 'password' | 'email';
		placeholder?: string;
		value: string;
		hint?: string;
		status?: 'valid' | 'invalid' | 'checking' | null;
		disabled?: boolean;
		required?: boolean;
		rows?: number;
		onblur?: () => void;
		onkeydown?: (e: KeyboardEvent) => void;
	}

	let {
		label,
		type = 'text',
		placeholder = '',
		value = $bindable(),
		hint,
		status = null,
		disabled = false,
		required = false,
		rows,
		onblur,
		onkeydown
	}: Props = $props();

	const isMultiline = $derived(rows !== undefined && rows > 0);
</script>

<div class="input-group">
	{#if label}
		<label class="input-label">
			{label}
			{#if required}<span class="input-required">*</span>{/if}
		</label>
	{/if}

	{#if isMultiline}
		<textarea
			class="text-input"
			{placeholder}
			{disabled}
			{rows}
			bind:value
			{onblur}
			{onkeydown}
		></textarea>
	{:else if status}
		<div class="input-with-status">
			<input
				{type}
				class="text-input"
				{placeholder}
				{disabled}
				bind:value
				{onblur}
				{onkeydown}
			/>
			{#if status === 'valid'}
				<span class="input-status input-status-valid">&#10003;</span>
			{:else if status === 'invalid'}
				<span class="input-status input-status-invalid">&#10007;</span>
			{:else if status === 'checking'}
				<span class="input-status">...</span>
			{/if}
		</div>
	{:else}
		<input
			{type}
			class="text-input"
			{placeholder}
			{disabled}
			bind:value
			{onblur}
			{onkeydown}
		/>
	{/if}

	{#if hint}
		<span class="input-hint">{hint}</span>
	{/if}
</div>

<style>
	.input-required {
		color: var(--danger);
		margin-left: 0.25rem;
	}

	.input-hint {
		font-size: 0.85rem;
		color: var(--text-hint);
		margin-top: 0.25rem;
		display: block;
	}

	.input-hint :global(a) {
		color: var(--accent);
	}
</style>
