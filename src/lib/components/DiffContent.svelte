<script lang="ts">
	import { getStars, isStarred } from '$lib/stores/stars.svelte';
	import { addStar, removeStar } from '$lib/stores/operations.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Snippet } from 'svelte';

	interface Props {
		diff: Diff;
		showBookmarks?: boolean;
		titleRow?: Snippet;
	}

	let { diff, showBookmarks = true, titleRow }: Props = $props();

	const html = $derived(diff?.content ? renderMarkdown(diff.content) : '');
	const stars = $derived(getStars());

	let contentElement: HTMLElement | null = $state(null);

	function toggleStar(pIndex: number) {
		if (isStarred(diff.id, pIndex)) {
			removeStar(diff.id, pIndex);
		} else {
			addStar({
				diff_id: diff.id,
				p_index: pIndex,
				added_at: new Date().toISOString()
			});
		}
	}

	// Reactively inject bookmark buttons when html, stars, or diff changes
	$effect(() => {
		if (!contentElement || !showBookmarks) return;

		// Subscribe to stars changes
		void stars;

		// Clean up existing buttons first
		contentElement.querySelectorAll('.bookmark-btn').forEach((btn) => btn.remove());

		contentElement.querySelectorAll('[data-p]').forEach((el) => {
			const pIndex = parseInt(el.getAttribute('data-p') || '0', 10);
			const starred = isStarred(diff.id, pIndex);

			const btn = document.createElement('button');
			btn.className = `bookmark-btn${starred ? ' bookmark-btn-existing' : ''}`;
			btn.title = starred ? 'Remove star' : 'Star this';
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				toggleStar(pIndex);
			});

			el.appendChild(btn);
		});
	});
</script>

<div class="diff-container">
	{#if titleRow}
		{@render titleRow()}
	{/if}
	<div class="diff-content" bind:this={contentElement}>
		{@html html}
	</div>
</div>
