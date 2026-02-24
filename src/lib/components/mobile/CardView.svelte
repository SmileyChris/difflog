<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { isStarred, getStars } from '$lib/stores/stars.svelte';
	import { addStar, removeStar } from '$lib/stores/operations.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { buildDiffContent, timeAgoFrom } from '$lib/utils/time';
	import { onMount } from 'svelte';
	import { mobileDiff } from '$lib/stores/mobile.svelte';
	import type { FlatCard } from './types';
	import '../../../styles/focus.css';

	interface Props {
		diff: Diff;
		basePath?: string;
		onExit: () => void;
		visibleCard?: number;
		onFlatCards?: (cards: FlatCard[]) => void;
		onNewest?: () => void;
	}

	let {
		diff,
		basePath = '/d',
		onExit,
		visibleCard = $bindable(0),
		onFlatCards,
		onNewest
	}: Props = $props();

	const fullContent = $derived(diff ? buildDiffContent(diff) : '');

	const html = $derived(fullContent ? renderMarkdown(fullContent) : '');

	// Extract articles from rendered HTML by splitting on <details class="md-section">
	const articles = $derived.by(() => {
		if (!html) return [];

		const parts: { title: string; html: string }[] = [];
		const sectionRegex = /<details class="md-section" open>\s*<summary class="md-h2">(.*?)<\/summary>\s*<div class="md-section-content">([\s\S]*?)<\/div>\s*<\/details>/g;

		let match: RegExpExecArray | null;
		while ((match = sectionRegex.exec(html)) !== null) {
			const title = match[1].replace(/<[^>]+>/g, '').trim();
			if (/^sources$/i.test(title)) continue;

			parts.push({
				title: match[1],
				html: match[2]
			});
		}

		return parts;
	});

	// --- Flat cards: one entry per [data-p] element ---
	const flatCards = $derived.by((): FlatCard[] => {
		if (!browser || !articles.length) return [];

		const cards: FlatCard[] = [];
		const tmp = document.createElement('div');

		for (const art of articles) {
			tmp.innerHTML = art.title;
			const catTitle = tmp.textContent?.trim() ?? '';
			tmp.innerHTML = art.html;
			const items = tmp.querySelectorAll('[data-p]');
			items.forEach((el) => {
				const pIndex = parseInt(el.getAttribute('data-p') ?? '-1', 10);
				cards.push({
					categoryTitle: catTitle,
					html: el.outerHTML,
					globalIndex: cards.length,
					pIndex
				});
			});
		}

		return cards;
	});

	const starredCount = $derived(getStars().filter((s) => s.diff_id === diff.id).length);

	// Current card index is visibleCard - 1 in flatCards (0-based)
	const prevStarIndex = $derived.by(() => {
		if (!flatCards.length) return -1;
		const current = visibleCard - 1; // flatCards index
		for (let i = current - 1; i >= 0; i--) {
			if (flatCards[i] && isStarred(diff.id, flatCards[i].pIndex)) return i + 1; // card index
		}
		return -1;
	});

	const nextStarIndex = $derived.by(() => {
		if (!flatCards.length) return -1;
		const current = visibleCard - 1;
		for (let i = current + 1; i < flatCards.length; i++) {
			if (flatCards[i] && isStarred(diff.id, flatCards[i].pIndex)) return i + 1;
		}
		return -1;
	});

	// Notify parent when flatCards change
	$effect(() => {
		onFlatCards?.(flatCards);
	});

	// --- Card state ---
	let cardsContainerEl: HTMLElement | null = $state(null);
	let showJumpMenu = $state(false);
	let arrivedViaSlide = $state(false);

	const POSITIONS_KEY = 'difflog-card-positions';

	function loadPositions(): Record<string, number> {
		if (!browser) return {};
		try {
			return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}');
		} catch {
			return {};
		}
	}

	function savePosition(diffId: string, index: number) {
		if (!browser) return;
		const positions = loadPositions();
		positions[diffId] = index;
		localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
	}

	function getSavedPosition(diffId: string): number {
		return loadPositions()[diffId] ?? 0;
	}

	// Category jump targets: first card index for each category
	const categoryJumps = $derived.by(() => {
		if (!flatCards.length) return [];
		const jumps: { label: string; cardIndex: number; count: number }[] = [];
		let currentCat = '';
		for (let i = 0; i < flatCards.length; i++) {
			if (flatCards[i].categoryTitle !== currentCat) {
				currentCat = flatCards[i].categoryTitle;
				jumps.push({ label: currentCat, cardIndex: i + 1, count: 0 });
			}
			jumps[jumps.length - 1].count++;
		}
		return jumps;
	});

	// Which category jump is active based on visibleCard
	const activeCategoryJump = $derived(
		visibleCard < 1 || visibleCard > flatCards.length
			? -1
			: categoryJumps.findIndex((j, i) => {
				const next = categoryJumps[i + 1];
				return visibleCard >= j.cardIndex && (!next || visibleCard < next.cardIndex);
			})
	);

	function jumpToCard(index: number) {
		showJumpMenu = false;
		const card = cardsContainerEl?.querySelector(`[data-card-index="${index}"]`);
		if (card) card.scrollIntoView({ behavior: 'smooth' });
	}

	// Prev/next diffs for end card
	const prevDiff = $derived.by(() => {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff.id);
		return idx >= 0 && idx < history.length - 1 ? history[idx + 1] : null;
	});

	const nextDiff = $derived.by(() => {
		const history = getHistory();
		const idx = history.findIndex((d) => d.id === diff.id);
		return idx > 0 ? history[idx - 1] : null;
	});

	// Horizontal swipe to navigate between diffs with slide animation
	let touchStartX = 0;
	let touchStartY = 0;
	let slideDirection: 'left' | 'right' | null = $state(null);
	let swiping = false;
	let slideInDirection: 'left' | 'right' | null = $state(null);

	function triggerSlideIn(dir: 'left' | 'right') {
		slideInDirection = dir;
		setTimeout(() => { slideInDirection = null; }, 300);
	}

	// Pick up pending slide-in from cross-route navigation
	onMount(() => {
		const pending = mobileDiff.pendingSlideIn;
		if (pending) {
			arrivedViaSlide = true;
			mobileDiff.pendingSlideIn = null;
			requestAnimationFrame(() => triggerSlideIn(pending));
		}
	});

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function slideTo(target: Diff, dir: 'left' | 'right') {
		if (swiping) return;
		swiping = true;
		savePosition(diff.id, visibleCard);
		slideDirection = dir;
		const inDir = dir === 'left' ? 'right' : 'left';

		setTimeout(() => {
			goto(`${basePath}/${target.id}`).then(() => {
				requestAnimationFrame(() => {
					slideDirection = null;
					triggerSlideIn(inDir);
					setTimeout(() => { swiping = false; }, 250);
				});
			});
		}, 200);
	}

	function slideOut(dir: 'left' | 'right', then: () => void) {
		if (swiping) return;
		swiping = true;
		savePosition(diff.id, visibleCard);
		slideDirection = dir;
		mobileDiff.pendingSlideIn = dir === 'left' ? 'right' : 'left';

		setTimeout(() => {
			// Don't reset slideDirection — keeps cards hidden during navigation
			then();
		}, 200);
	}

	// Double-tap to star/unstar
	let lastTapTime = 0;

	function handleDoubleTap(e: TouchEvent) {
		const now = Date.now();
		if (now - lastTapTime < 300) {
			e.preventDefault();
			toggleCurrentStar();
			lastTapTime = 0;
		} else {
			lastTapTime = now;
		}
	}

	function toggleCurrentStar() {
		if (visibleCard < 1 || visibleCard > flatCards.length) return;
		const card = flatCards[visibleCard - 1];
		if (card.pIndex < 0) return;

		if (isStarred(diff.id, card.pIndex)) {
			removeStar(diff.id, card.pIndex);
		} else {
			addStar({
				diff_id: diff.id,
				p_index: card.pIndex,
				added_at: new Date().toISOString()
			});
		}
	}

	function handleTouchEnd(e: TouchEvent) {
		if (swiping) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

		if (dx > 0) {
			// Swipe right → older diff
			if (prevDiff) slideTo(prevDiff, 'right');
		} else {
			// Swipe left → newer diff, or onNewest if at latest
			if (nextDiff) {
				slideTo(nextDiff, 'left');
			} else if (onNewest) {
				slideOut('left', onNewest);
			}
		}
	}

	// Track which card is visible via scroll position (more reliable than
	// IntersectionObserver with scroll-snap on mobile).
	$effect(() => {
		if (!cardsContainerEl) return;

		function updateVisibleCard() {
			const el = cardsContainerEl!;
			const cardHeight = el.clientHeight;
			if (cardHeight <= 0) return;
			const idx = Math.round(el.scrollTop / cardHeight);
			if (idx !== visibleCard) {
				visibleCard = idx;
				savePosition(diff.id, idx);
			}
		}

		cardsContainerEl.addEventListener('scroll', updateVisibleCard, { passive: true });
		return () => cardsContainerEl?.removeEventListener('scroll', updateVisibleCard);
	});

	// Reset when diff changes — restore saved card position if available
	$effect(() => {
		const id = diff?.id;
		if (!id) return;
		const saved = getSavedPosition(id);
		visibleCard = saved;
		if (cardsContainerEl) {
			// Set scroll position synchronously using card height so it's
			// correct before the first paint (avoids fighting slide animation)
			const cardHeight = cardsContainerEl.clientHeight;
			if (cardHeight > 0 && saved > 0) {
				cardsContainerEl.scrollTop = saved * cardHeight;
			} else {
				cardsContainerEl.scrollTop = 0;
			}
			// Fine-tune with scrollIntoView after new content renders
			if (saved > 0) {
				tick().then(() => {
					const card = cardsContainerEl?.querySelector(`[data-card-index="${saved}"]`);
					if (card) card.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
				});
			}
		}
	});


</script>

<svelte:window onkeydown={(e) => { if (e.key === 's') toggleCurrentStar(); }} />

<div
	class="focus-slide-wrapper"
	class:focus-slide-out-left={slideDirection === 'left'}
	class:focus-slide-out-right={slideDirection === 'right'}
	class:focus-slide-in-left={slideInDirection === 'left'}
	class:focus-slide-in-right={slideInDirection === 'right'}
>
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="focus-cards"
	bind:this={cardsContainerEl}
	ontouchstart={handleTouchStart}
	ontouchend={(e) => { handleDoubleTap(e); handleTouchEnd(e); }}
>
	<!-- Title card -->
	<div class="focus-card focus-title-card" data-card-index="0">
		<div class="focus-title-card-content">
			<span class="focus-logo-mark">&#9670;</span>
			<h1 class="focus-title-card-heading">{diff.title}</h1>
			<span class="focus-title-card-meta">
				<span>{flatCards.length} articles</span>
				{#if starredCount > 0}
					<span class="focus-title-card-dot"></span>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<span class="focus-title-card-link" onclick={() => { const i = flatCards.findIndex((c) => isStarred(diff.id, c.pIndex)); if (i >= 0) jumpToCard(i + 1); }}>{starredCount} starred</span>
				{/if}
				<span class="focus-title-card-dot"></span>
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="focus-title-card-link" onclick={() => showJumpMenu = !showJumpMenu}>{articles.length} categories</span>
			</span>
			<span class="focus-title-card-generated">Generated {timeAgoFrom(diff.generated_at, Date.now())}</span>
			<span class="focus-title-card-swipe">&uarr; {'ontouchstart' in globalThis ? 'swipe' : 'scroll'} to read</span>
		</div>
	</div>

	{#each flatCards as card, i (card.globalIndex)}
		<div class="focus-card focus-content-card" class:focus-card-starred={isStarred(diff.id, card.pIndex)} data-card-index={i + 1}>
			<div class="focus-card-category-row">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="focus-card-category" onclick={() => showJumpMenu = !showJumpMenu}>{card.categoryTitle}</span>
				<span class="focus-star-nav">
					<button class="focus-star-nav-btn" disabled={prevStarIndex < 0} onclick={() => jumpToCard(prevStarIndex)}>&#8249;</button>
					<button class="focus-star-nav-icon" class:focus-star-nav-icon-active={isStarred(diff.id, card.pIndex)} title={isStarred(diff.id, card.pIndex) ? 'Unstar (s)' : 'Star (s)'} onclick={() => {
						if (card.pIndex < 0) return;
						if (isStarred(diff.id, card.pIndex)) {
							removeStar(diff.id, card.pIndex);
						} else {
							addStar({ diff_id: diff.id, p_index: card.pIndex, added_at: new Date().toISOString() });
						}
					}}>★</button>
					<button class="focus-star-nav-btn" disabled={nextStarIndex < 0} onclick={() => jumpToCard(nextStarIndex)}>&#8250;</button>
				</span>
			</div>
			<div class="focus-card-content">
				{@html card.html}
			</div>
		</div>
	{/each}

	<!-- End card -->
	<div class="focus-card focus-end-card" data-card-index={flatCards.length + 1}>
		<div class="focus-end-content">
			<span class="focus-end-diamond"><span class="focus-end-check">&#10004;</span></span>
			<span class="focus-end-caught-up">All caught up</span>
			<h2 class="focus-end-title">{diff.title}</h2>
			<span class="focus-title-card-generated">Generated {timeAgoFrom(diff.generated_at, Date.now())}</span>
			{#if !arrivedViaSlide}
				{#if 'ontouchstart' in globalThis}
					<span class="focus-end-swipe-hint" class:focus-end-swipe-both={!!prevDiff} class:focus-end-swipe-right-only={!prevDiff}>{#if prevDiff}<span class="focus-end-swipe-arrow">&larr;</span>{/if} swipe <span class="focus-end-swipe-arrow">&rarr;</span></span>
				{:else}
					<nav class="focus-end-actions">
						{#if nextDiff}
							<button class="focus-end-btn" onclick={() => slideTo(nextDiff, 'left')}>Newer diff &rarr;</button>
						{/if}
						{#if prevDiff}
							<button class="focus-end-btn" onclick={() => slideTo(prevDiff, 'right')}>&larr; Older diff</button>
						{/if}
						{#if !nextDiff && new Date(diff.generated_at).toDateString() !== new Date().toDateString()}
							<a href="/generate" class="focus-end-btn focus-end-btn-accent">Generate new diff</a>
						{/if}
					</nav>
				{/if}
			{/if}
		</div>
	</div>
</div>

<footer class="focus-footer focus-footer-mobile">
	<span class="focus-card-category-label">
		<button class="focus-nav-arrow" class:focus-nav-disabled={!prevDiff} disabled={!prevDiff} onclick={() => prevDiff && slideTo(prevDiff, 'right')}>&#8249;</button>
		{new Date(diff.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
		{#if !nextDiff && onNewest}
			<button class="focus-nav-arrow" onclick={() => slideOut('left', onNewest!)}><span class="focus-nav-diamond">&#9670;</span> <span class="focus-nav-gen-label">Generate</span> &#8250;</button>
		{:else}
			<button class="focus-nav-arrow" class:focus-nav-disabled={!nextDiff} disabled={!nextDiff} onclick={() => nextDiff && slideTo(nextDiff, 'left')}>&#8250;</button>
		{/if}
	</span>
	<span></span>
	{#if visibleCard > 0 && visibleCard <= flatCards.length}
		<button class="focus-card-position" onclick={() => showJumpMenu = !showJumpMenu}>{visibleCard} / {flatCards.length} <span class="focus-card-hamburger">&#9776;</span></button>
	{:else}
		<button class="focus-card-position" onclick={() => showJumpMenu = !showJumpMenu}><span class="focus-card-hamburger">&#9776;</span></button>
	{/if}
</footer>
</div><!-- .focus-slide-wrapper -->

{#if showJumpMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="focus-jump-backdrop" onclick={() => showJumpMenu = false}></div>
	<nav class="focus-jump-menu">
		<button class="focus-jump-item" class:focus-jump-active={visibleCard === 0} onclick={() => jumpToCard(0)}>
			<span class="focus-jump-icon">&#9670;</span>
			<span class="focus-jump-label">Cover</span>
		</button>
		{#each categoryJumps as cat, i}
			<button class="focus-jump-item" class:focus-jump-active={i === activeCategoryJump} onclick={() => jumpToCard(cat.cardIndex)}>
				<span class="focus-jump-icon">{cat.label.match(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u)?.[0] ?? ''}</span>
				<span class="focus-jump-label">{cat.label.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/u, '')}</span>
				<span class="focus-jump-count">{cat.count}</span>
			</button>
		{/each}
		<button class="focus-jump-item" class:focus-jump-active={visibleCard > flatCards.length} onclick={() => jumpToCard(flatCards.length + 1)}>
			<span class="focus-jump-icon">&#10003;</span>
			<span class="focus-jump-label">Complete</span>
		</button>
	</nav>
{/if}

<style>
	.focus-content-card::before {
		content: '★';
		position: absolute;
		top: 0;
		right: -20vw;
		font-size: 120vw;
		color: gold;
		opacity: 0;
		pointer-events: none;
		line-height: 1;
		transform: rotate(15deg) translateX(30vw);
		transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.focus-card-starred::before {
		opacity: 0.18;
		transform: rotate(15deg) translateX(0);
		background: radial-gradient(circle at center, gold, transparent 90%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}


</style>
