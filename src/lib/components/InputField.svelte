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
		id?: string;
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
		id,
		onblur,
		onkeydown
	}: Props = $props();

	const isMultiline = $derived(rows !== undefined && rows > 0);

	// Generate a unique ID if not provided
	const inputId = $derived(id ?? `input-${Math.random().toString(36).slice(2, 9)}`);
	const hintId = $derived(hint ? `${inputId}-hint` : undefined);

	// Accessibility attributes for validation state
	const ariaInvalid = $derived(status === 'invalid' ? true : undefined);
	const ariaDescribedBy = $derived(hintId);
</script>

<div class="input-group">
	{#if label}
		<label class="input-label" for={inputId}>
			{label}
			{#if required}<span class="input-required" aria-hidden="true">*</span>{/if}
		</label>
	{/if}

	{#if isMultiline}
		<textarea
			id={inputId}
			class="text-input"
			{placeholder}
			{disabled}
			{rows}
			aria-required={required || undefined}
			aria-invalid={ariaInvalid}
			aria-describedby={ariaDescribedBy}
			bind:value
			{onblur}
			{onkeydown}
		></textarea>
	{:else}
		<div class="input-with-status">
			<input
				id={inputId}
				{type}
				class="text-input"
				class:has-status={!!status}
				{placeholder}
				{disabled}
				aria-required={required || undefined}
				aria-invalid={ariaInvalid}
				aria-describedby={ariaDescribedBy}
				bind:value
				{onblur}
				{onkeydown}
			/>
			{#if status === 'valid'}
				<span class="input-status input-status-valid" aria-hidden="true">&#10003;</span>
			{:else if status === 'invalid'}
				<span class="input-status input-status-invalid" aria-hidden="true">&#10007;</span>
			{:else if status === 'checking'}
				<span class="input-status" aria-hidden="true">...</span>
			{/if}
		</div>
	{/if}

	{#if hint}
		<span id={hintId} class="input-hint">{hint}</span>
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

	/* Status indicator - scoped to this component */
	.input-with-status {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-with-status :global(.text-input.has-status) {
		padding-right: 2.5rem;
	}

	.input-status {
		position: absolute;
		right: 0.875rem;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.input-status-valid {
		color: var(--accent);
	}

	.input-status-invalid {
		color: var(--danger);
	}
</style>
