<script lang="ts">
	import { getStars, isStarred } from '$lib/stores/stars.svelte';
	import { toggleStar, isDiffPublic, getPublicDiffUrl, addTldr, deleteTldr } from '$lib/stores/operations.svelte';
	import { getTldr } from '$lib/stores/tldrs.svelte';
	import { getProfile } from '$lib/stores/profiles.svelte';
	import { type Diff } from '$lib/stores/history.svelte';
	import { renderMarkdown, parseInline } from '$lib/utils/markdown';
	import { buildDiffContent, formatDiffDate } from '$lib/utils/time';
	import { extractFirstUrl, fetchArticleText, summarizeArticle } from '$lib/utils/tldr';
	import type { Snippet } from 'svelte';

	interface Props {
		diff: Diff;
		hideBookmarks?: boolean;
		copyLinkUrl?: (pIndex: number) => string;
		titleRow?: Snippet;
	}

	let { diff, hideBookmarks = false, copyLinkUrl, titleRow }: Props = $props();

	const fullContent = $derived(diff ? buildDiffContent(diff) : '');
	const html = $derived(fullContent ? renderMarkdown(fullContent) : '');
	const stars = $derived(getStars());
	const hasSections = $derived(html.includes('class="md-section"'));
	let contentElement: HTMLElement | null = $state(null);

	// TLDR state: tracks per-paragraph loading/expanded/error status
	let tldrStates = $state(new Map<number, 'loading' | 'expanded' | string>());

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

	function onToggleStar(pIndex: number) {
		pendingFocusPIndex = pIndex;
		toggleStar(diff.id, pIndex);
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
				onToggleStar(pIndex);
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

	async function handleTldrClick(pIndex: number, el: Element) {
		const state = tldrStates.get(pIndex);

		// Toggle off if already expanded
		if (state === 'expanded') {
			tldrStates.delete(pIndex);
			tldrStates = new Map(tldrStates);
			el.querySelector('.tldr-summary')?.remove();
			el.querySelector('.tldr-btn')?.classList.remove('tldr-btn-active');
			return;
		}

		// Check cache first
		const cached = getTldr(diff.id, pIndex);
		if (cached) {
			showTldrSummary(el, pIndex, cached.summary);
			return;
		}

		// Fetch and summarize
		tldrStates.set(pIndex, 'loading');
		tldrStates = new Map(tldrStates);
		const btn = el.querySelector('.tldr-btn') as HTMLElement | null;
		if (btn) {
			btn.classList.add('tldr-btn-loading');
			btn.textContent = '\u2234 loading...';
		}

		try {
			const url = extractFirstUrl(el.innerHTML);
			if (!url) throw new Error('No URL found');

			const profile = getProfile();
			const keys = profile?.apiKeys ?? {};
			const curationProvider = profile?.providerSelections?.curation ?? null;

			const paragraphText = el.textContent?.replace(/tldr$/, '').trim() || '';
			const text = await fetchArticleText(url);
			const summary = await summarizeArticle(keys, text, paragraphText, curationProvider);
			if (!summary) throw new Error('Summarization failed');

			addTldr(diff.id, pIndex, { summary, url });
			showTldrSummary(el, pIndex, summary);
		} catch (e) {
			console.warn('TLDR error:', e);
			const msg = e instanceof Error && e.message === 'Article content not accessible'
				? 'Could not access article — try clicking through directly'
				: 'Failed to generate summary';
			tldrStates.set(pIndex, `error:${msg}`);
			tldrStates = new Map(tldrStates);
		}
	}

	function buildTldrSummaryDom(el: Element, pIndex: number, summary: string) {
		el.querySelector('.tldr-summary')?.remove();
		const div = document.createElement('div');
		div.className = 'tldr-summary';

		const trashBtn = document.createElement('button');
		trashBtn.className = 'tldr-trash';
		trashBtn.textContent = '\uD83D\uDDD1\uFE0F';
		trashBtn.title = 'Delete summary';
		trashBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			deleteTldr(diff.id, pIndex);
			tldrStates.delete(pIndex);
			tldrStates = new Map(tldrStates);
			div.remove();
			const tldrBtn = el.querySelector('.tldr-btn');
			tldrBtn?.classList.remove('tldr-btn-active', 'tldr-btn-cached');
		});
		div.appendChild(trashBtn);

		for (const block of summary.split(/\n\n+/).filter(Boolean)) {
			const p = document.createElement('p');
			p.innerHTML = block.split('\n').map(line => parseInline(line)).join('<br>');
			div.appendChild(p);
		}
		el.appendChild(div);
	}

	function showTldrSummary(el: Element, pIndex: number, summary: string) {
		buildTldrSummaryDom(el, pIndex, summary);

		tldrStates.set(pIndex, 'expanded');
		tldrStates = new Map(tldrStates);

		const btn = el.querySelector('.tldr-btn');
		btn?.classList.remove('tldr-btn-loading');
		btn?.classList.add('tldr-btn-active');
	}

	// Inject TLDR buttons into paragraphs containing links
	$effect(() => {
		if (!contentElement || hideBookmarks) return;
		void html;

		contentElement.querySelectorAll('.tldr-btn').forEach((btn) => btn.remove());
		contentElement.querySelectorAll('.tldr-summary').forEach((s) => s.remove());

		contentElement.querySelectorAll('[data-p]').forEach((el) => {
			if (!el.querySelector('a')) return;

			const pIndex = parseInt(el.getAttribute('data-p') || '0', 10);

			const btn = document.createElement('button');
			btn.className = 'tldr-btn';
			btn.textContent = '\u2234 tldr';

			const cached = getTldr(diff.id, pIndex);
			if (cached) btn.classList.add('tldr-btn-cached');

			const state = tldrStates.get(pIndex);
			if (state === 'loading') btn.classList.add('tldr-btn-loading');
			if (state === 'expanded') btn.classList.add('tldr-btn-active');

			btn.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				handleTldrClick(pIndex, el);
			});

			// Insert after the last link in the paragraph text
			el.appendChild(btn);

			// Re-show cached summary if expanded
			if (state === 'expanded') {
				const cached = getTldr(diff.id, pIndex);
				if (cached) buildTldrSummaryDom(el, pIndex, cached.summary);
			}

			// Show error message
			if (state?.startsWith('error:')) {
				const div = document.createElement('div');
				div.className = 'tldr-summary tldr-error';
				div.textContent = state.slice(6);
				el.appendChild(div);
			}
		});
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
	{#if diff.window_days}
		<div class="diff-date-banner">{formatDiffDate(diff.generated_at, diff.window_days)}</div>
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

	:global(.diff-date-banner) {
		padding: 1rem 2rem 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-subtle);
		letter-spacing: -0.01em;
		border-bottom: 1px solid var(--border-subtle);
		padding-bottom: 1rem;
	}

	:global(.diff-content) {
		padding: 1.5rem 2rem 2rem;
		overflow: visible;
	}
</style>
