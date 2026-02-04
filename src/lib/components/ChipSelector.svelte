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

	<div class="chip-grid">
		{#each options as item}
			<button
				class="chip"
				class:chip-selected={selected.includes(item)}
				onclick={() => toggle(item)}
			>
				{item}
			</button>
		{/each}
	</div>

	{#if customItems.length > 0}
		<div class="custom-items">
			{#each customItems as item}
				<span class="chip chip-selected">
					{item}
					<button class="chip-remove" onclick={() => removeCustom(item)}>&times;</button>
				</span>
			{/each}
		</div>
	{/if}

	<div class="input-group">
		<input
			type="text"
			class="text-input"
			{placeholder}
			bind:value={customInput}
			onkeydown={(e) => e.key === 'Enter' && addCustom()}
		/>
	</div>
</div>

<style>
	.custom-items {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}

	.chip-remove {
		background: none;
		border: none;
		color: currentColor;
		cursor: pointer;
		padding: 0;
		margin-left: 0.25rem;
		font-size: 1rem;
		line-height: 1;
	}

	.chip-remove:hover {
		color: var(--danger);
	}
</style>
