<script lang="ts">
	import '../../../styles/focus.css';

	interface CategoryJump {
		label: string;
		cardIndex: number;
		count: number;
	}

	interface Props {
		categoryJumps: CategoryJump[];
		activeCategoryJump: number;
		visibleCard: number;
		totalCards: number;
		onJump: (index: number) => void;
		onClose: () => void;
	}

	let { categoryJumps, activeCategoryJump, visibleCard, totalCards, onJump, onClose }: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="focus-jump-backdrop" onclick={onClose}></div>
<nav class="focus-jump-menu">
	<button class="focus-jump-item" class:focus-jump-active={visibleCard === 0} onclick={() => onJump(0)}>
		<span class="focus-jump-icon">&#9670;</span>
		<span class="focus-jump-label">Cover</span>
	</button>
	{#each categoryJumps as cat, i}
		<button class="focus-jump-item" class:focus-jump-active={i === activeCategoryJump} onclick={() => onJump(cat.cardIndex)}>
			<span class="focus-jump-icon">{cat.label.match(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u)?.[0] ?? ''}</span>
			<span class="focus-jump-label">{cat.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '')}</span>
			<span class="focus-jump-count">{cat.count}</span>
		</button>
	{/each}
	<button class="focus-jump-item" class:focus-jump-active={visibleCard > totalCards} onclick={() => onJump(totalCards + 1)}>
		<span class="focus-jump-icon">&#10003;</span>
		<span class="focus-jump-label">Complete</span>
	</button>
</nav>
