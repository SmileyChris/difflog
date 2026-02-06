<script lang="ts">
	interface Props {
		title: string;
		description: string;
		options: string[];
		selected: string[];
		customItems: string[];
		placeholder?: string;
	}

	let {
		title,
		description,
		options,
		selected = $bindable(),
		customItems = $bindable(),
		placeholder = 'Add custom item...'
	}: Props = $props();

	let customInput = $state('');

	function toggle(item: string) {
		const idx = selected.indexOf(item);
		if (idx >= 0) {
			selected = selected.filter((i) => i !== item);
		} else {
			selected = [...selected, item];
		}
	}

	function addCustom() {
		const value = customInput.trim();
		if (!value) return;
		if (!customItems.some((i) => i.toLowerCase() === value.toLowerCase())) {
			customItems = [...customItems, value];
			selected = [...selected, value];
		}
		customInput = '';
	}

	function removeCustom(item: string) {
		customItems = customItems.filter((i) => i !== item);
		selected = selected.filter((i) => i !== item);
	}
</script>

<div>
	<h2 class="step-title">{title}</h2>
	<p class="step-desc">{description}</p>

	<div class="chip-grid" role="group" aria-label={title}>
		{#each options as item}
			<button
				class="chip"
				class:chip-selected={selected.includes(item)}
				onclick={() => toggle(item)}
				aria-pressed={selected.includes(item)}
				type="button"
			>
				{item}
			</button>
		{/each}

		{#each customItems as item}
			<span class="chip chip-selected chip-custom">
				{item}
				<button
					class="chip-remove"
					onclick={() => removeCustom(item)}
					aria-label="Remove {item}"
					type="button"
				>
					&times;
				</button>
			</span>
		{/each}

		<span class="chip-add-inline">
			<input
				type="text"
				class="chip-add-input"
				class:chip-add-input-active={customInput.length > 0}
				placeholder="+ custom"
				bind:value={customInput}
				onkeydown={(e) => e.key === 'Enter' && addCustom()}
				aria-label="Add custom {title.toLowerCase()}"
			/>
		</span>
	</div>
</div>

<style>
	.chip-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		background: var(--bg-chip);
		border: 1px solid var(--border-subtle);
		border-radius: 9999px;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.chip:hover {
		border-color: var(--text-disabled);
	}

	.chip-selected {
		background: var(--accent-bg);
		border-color: var(--accent);
		color: var(--accent);
	}

	.chip-custom {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding-right: 0.5rem;
	}

	.chip-remove {
		background: none;
		border: none;
		color: var(--accent);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		padding: 0;
		opacity: 0.7;
	}

	.chip-remove:hover {
		opacity: 1;
		color: var(--danger);
	}

	.chip-add-inline {
		display: inline-flex;
	}

	.chip-add-input {
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		background: var(--bg-chip);
		border: 1px dashed var(--border-subtle);
		border-radius: 9999px;
		color: var(--text-muted);
		font-family: inherit;
		width: 7em;
		outline: none;
		transition: width 0.15s ease, border-color 0.15s ease;
	}

	.chip-add-input:focus,
	.chip-add-input-active {
		width: 10em;
		border-color: var(--accent);
		color: var(--text-primary);
	}

	.chip-add-input::placeholder {
		color: var(--text-disabled);
	}
</style>
