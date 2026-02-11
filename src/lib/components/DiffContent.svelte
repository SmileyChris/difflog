<script lang="ts">
	import { getStars, isStarred } from '$lib/stores/stars.svelte';
	import { addStar, removeStar, isDiffPublic, getPublicDiffUrl } from '$lib/stores/operations.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Snippet } from 'svelte';

	interface Props {
		diff: Diff;
		hideBookmarks?: boolean;
		copyLinkUrl?: (pIndex: number) => string;
		titleRow?: Snippet;
	}

	let { diff, hideBookmarks = false, copyLinkUrl, titleRow }: Props = $props();

	function formatDateLine(diff: Diff): string {
		if (!diff.window_days) return '';
		const date = new Date(diff.generated_at).toLocaleDateString('en-US', {
			weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
		});
		const windowText = diff.window_days === 1 ? 'Past 24 hours' : `Past ${diff.window_days} days`;
		return `**${date}** \u00b7 ${windowText}\n\n---`;
	}

	const dateLine = $derived(diff ? formatDateLine(diff) : '');
	const fullContent = $derived(
		dateLine && diff?.content
			? `${dateLine}\n\n${diff.content}`
			: (diff?.content ?? '')
	);
	const html = $derived(fullContent ? renderMarkdown(fullContent) : '');
	const stars = $derived(getStars());
	const hasSections = $derived(html.includes('class="md-section"'));
	let contentElement: HTMLElement | null = $state(null);

	const ANIM_MS = 200;

	function animateSection(details: Element, open: boolean) {
		const content = details.querySelector('.md-section-content') as HTMLElement;
		if (!content) {
			// Fallback: just toggle
			if (open) details.setAttribute('open', '');
			else details.removeAttribute('open');
			return;
		}

		if (open) {
			details.setAttribute('open', '');
			details.classList.add('opening');
			const h = content.scrollHeight;
			const anim = content.animate(
				{ height: ['0px', h + 'px'] },
				{ duration: ANIM_MS, easing: 'ease' }
			);
			anim.onfinish = () => {
				details.classList.remove('opening');
			};
		} else {
			details.classList.add('closing');
			const h = content.scrollHeight;
			const anim = content.animate(
				{ height: [h + 'px', '0px'] },
				{ duration: ANIM_MS, easing: 'ease' }
			);
			anim.onfinish = () => {
				details.removeAttribute('open');
				details.classList.remove('closing');
			};
		}
	}

	function handleSummaryClick(e: MouseEvent) {
		const summary = (e.target as HTMLElement).closest('summary.md-h2');
		if (!summary) return;
		const details = summary.parentElement as HTMLDetailsElement;
		if (!details?.classList.contains('md-section')) return;

		e.preventDefault();
		animateSection(details, !details.open);
	}

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

	function showCopyToast(e: MouseEvent) {
		const toast = document.createElement('span');
		toast.className = 'copy-toast';
		toast.textContent = '\u{1F517} Copied';
		toast.style.left = `${e.clientX}px`;
		toast.style.top = `${e.clientY}px`;
		document.body.appendChild(toast);
		toast.addEventListener('animationend', () => toast.remove());
	}

	function copyParagraphLink(e: MouseEvent, pIndex: number) {
		const url = `${getPublicDiffUrl(diff.id)}?p=${pIndex}`;
		navigator.clipboard.writeText(url);
		showCopyToast(e);
	}

	// Inject paragraph counts into section summaries
	$effect(() => {
		if (!contentElement || !hasSections) return;
		void html;

		contentElement.querySelectorAll('.md-section-count').forEach((s) => s.remove());

		contentElement.querySelectorAll('details.md-section').forEach((details) => {
			const summary = details.querySelector('summary.md-h2');
			const content = details.querySelector('.md-section-content');
			if (!summary || !content) return;

			const count = content.querySelectorAll('[data-p]').length;
			if (count === 0) return;

			const span = document.createElement('span');
			span.className = 'md-section-count';
			span.textContent = `${count}`;
			summary.appendChild(span);
		});
	});

	// Reactively inject bookmark buttons when html, stars, or diff changes
	$effect(() => {
		if (!contentElement || hideBookmarks) return;

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

	// Inject copy-link buttons when copyLinkUrl is provided
	$effect(() => {
		if (!contentElement || !copyLinkUrl) return;
		void html; // re-run when rendered content changes (new DOM replaces old buttons)

		contentElement.querySelectorAll('.copy-link-btn').forEach((btn) => btn.remove());

		contentElement.querySelectorAll('[data-p]').forEach((el) => {
			if (!el.querySelector('a')) return;

			const pIndex = parseInt(el.getAttribute('data-p') || '0', 10);
			const urlFn = copyLinkUrl;

			const btn = document.createElement('button');
			btn.className = 'copy-link-btn';
			btn.title = 'Copy link to paragraph';
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				navigator.clipboard.writeText(urlFn(pIndex));
				showCopyToast(e);
			});

			el.appendChild(btn);
		});
	});
</script>

<div class="diff-container">
	{#if titleRow}
		{@render titleRow()}
	{/if}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="diff-content" bind:this={contentElement} onclick={handleSummaryClick}>
		{@html html}
	</div>
</div>

<style>
	:global(.diff-container) {
		background: linear-gradient(
			180deg,
			var(--bg-card) 0%,
			var(--bg-card-bottom) 100%
		);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		overflow: visible;
	}

	:global(.diff-title) {
		padding: 1.5rem 2rem 0;
		margin: 0;
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--text);
		letter-spacing: -0.02em;
	}

	:global(.diff-content) {
		padding: 1.5rem 2rem 2rem;
		overflow: visible;
	}
</style>
