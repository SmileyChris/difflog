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

	// Track stars to trigger reactivity
	const stars = $derived(getStars());

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

	// Svelte action to inject bookmark buttons
	function bookmarkable(node: HTMLElement) {
		function injectButtons() {
			if (!showBookmarks) return;

			node.querySelectorAll('[data-p]').forEach((el) => {
				el.querySelector('.bookmark-btn')?.remove();

				const pIndex = parseInt(el.getAttribute('data-p') || '0', 10);
				const starred = isStarred(diff.id, pIndex);

				const btn = document.createElement('button');
				btn.className = `bookmark-btn${isStarred ? ' bookmark-btn-existing' : ''}`;
				btn.title = isStarred ? 'Remove star' : 'Star this';
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					toggleStar(pIndex);
				});

				el.appendChild(btn);
			});
		}

		// Initial injection
		injectButtons();

		return {
			update() {
				injectButtons();
			},
			destroy() {
				node.querySelectorAll('.bookmark-btn').forEach((btn) => btn.remove());
			}
		};
	}
</script>

<div class="diff-container">
	{#if titleRow}
		{@render titleRow()}
	{/if}
	<div class="diff-content" use:bookmarkable={{ html, stars }}>
		{@html html}
	</div>
</div>
