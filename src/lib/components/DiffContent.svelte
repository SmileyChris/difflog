<script lang="ts">
	import { getStars, isStarred } from '$lib/stores/stars.svelte';
	import { addStar, removeStar, isDiffPublic, getPublicDiffUrl } from '$lib/stores/operations.svelte';
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

	// Track which pIndex to refocus after effect recreates buttons
	let pendingFocusPIndex: number | null = null;

	function toggleStar(pIndex: number) {
		pendingFocusPIndex = pIndex;
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

	function copyParagraphLink(e: MouseEvent, pIndex: number) {
		const url = `${getPublicDiffUrl(diff.id)}?p=${pIndex}`;
		navigator.clipboard.writeText(url);

		// "👁 Copied" that zooms and fades from cursor
		const toast = document.createElement('span');
		toast.className = 'copy-toast';
		toast.textContent = '\u{1F517} Copied';
		toast.style.left = `${e.clientX}px`;
		toast.style.top = `${e.clientY}px`;
		document.body.appendChild(toast);
		toast.addEventListener('animationend', () => toast.remove());
	}

	// Reactively inject bookmark buttons when html, stars, or diff changes
	$effect(() => {
		if (!contentElement || !showBookmarks) return;

		// Subscribe to stars changes
		void stars;

		const isPublic = isDiffPublic(diff.id);

		// Clean up existing buttons and handlers
		contentElement.querySelectorAll('.bookmark-btn').forEach((btn) => btn.remove());
		contentElement.querySelectorAll('.copy-toast').forEach((t) => t.remove());

		contentElement.querySelectorAll('[data-p]').forEach((el) => {
			// Only allow starring paragraphs that contain a link
			if (!el.querySelector('a')) return;

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

			// For public diffs, clicking the paragraph copies the share link
			if (isPublic) {
				el.addEventListener('click', ((e: MouseEvent) => {
					const target = e.target as HTMLElement;
					if (target.closest('a') || target.closest('.bookmark-btn')) return;
					if (window.getSelection()?.toString()) return;
					copyParagraphLink(e, pIndex);
				}) as EventListener);
			}
		});

		// Restore focus after buttons are recreated (e.g. after toggle)
		if (pendingFocusPIndex !== null) {
			const targetBtn = contentElement.querySelector(
				`[data-p="${pendingFocusPIndex}"] .bookmark-btn`
			);
			if (targetBtn instanceof HTMLElement) {
				targetBtn.focus();
			}
			pendingFocusPIndex = null;
		}
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
