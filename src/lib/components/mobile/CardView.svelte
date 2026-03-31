<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { isStarred, getStars } from '$lib/stores/stars.svelte';
	import { toggleStar } from '$lib/stores/operations.svelte';
	import { renderMarkdown, extractParagraphs, extractSummary } from '$lib/utils/markdown';
	import { buildDiffContent } from '$lib/utils/time';
	import { timeAgo } from '$lib/utils/time.svelte';
	import { onMount } from 'svelte';
	import { mobileDiff } from '$lib/stores/mobile.svelte';
	import {
		SWIPE_MIN_DISTANCE, SWIPE_DIAGONAL_RATIO,
		SLIDE_OUT_DURATION, SLIDE_IN_DURATION, SLIDE_IN_DELAY,
		DOUBLE_TAP_THRESHOLD
	} from '$lib/constants/mobile';
	import type { FlatCard } from './types';
	import JumpMenu from './JumpMenu.svelte';
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

	const summary = $derived(html ? extractSummary(html) : null);

	// --- Flat cards: one entry per [data-p] element ---
	const flatCards = $derived.by((): FlatCard[] => {
		if (!html) return [];
		return extractParagraphs(html).map((p, i) => ({
			categoryTitle: p.sectionTitle,
			html: p.html,
			globalIndex: i,
			pIndex: p.pIndex
		}));
	});

	// Unique category list for jump menu and title card
	const articles = $derived.by(() => {
		const seen = new Set<string>();
		return flatCards.filter(c => {
			if (seen.has(c.categoryTitle)) return false;
			seen.add(c.categoryTitle);
			return true;
		}).map(c => c.categoryTitle);
	});

	const starredCount = $derived(getStars().filter((s) => s.diff_id === diff.id).length);

	// Find nearest starred card in a given direction, returning card index (1-based) or -1
	function findStarIndex(direction: 'prev' | 'next'): number {
		if (!flatCards.length) return -1;
		const current = visibleCard - 1;
		if (direction === 'prev') {
			for (let i = current - 1; i >= 0; i--) {
				if (flatCards[i] && isStarred(diff.id, flatCards[i].pIndex)) return i + 1;
			}
		} else {
			for (let i = current + 1; i < flatCards.length; i++) {
				if (flatCards[i] && isStarred(diff.id, flatCards[i].pIndex)) return i + 1;
			}
		}
		return -1;
	}

	const prevStarIndex = $derived(findStarIndex('prev'));
	const nextStarIndex = $derived(findStarIndex('next'));

	// Notify parent when flatCards change
	$effect(() => {
		onFlatCards?.(flatCards);
	});

	// --- Card state ---
	let cardsContainerEl: HTMLElement | null = $state(null);
	let showJumpMenu = $state(false);
	let arrivedViaSlide = $state(false);
	let scrollLocked = false;

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
		setTimeout(() => { slideInDirection = null; }, SLIDE_IN_DELAY);
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
					setTimeout(() => { swiping = false; }, SLIDE_IN_DURATION);
				});
			});
		}, SLIDE_OUT_DURATION);
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
		}, SLIDE_OUT_DURATION);
	}

	// Double-tap to star/unstar
	let lastTapTime = 0;

	function handleDoubleTap(e: TouchEvent) {
		const now = Date.now();
		if (now - lastTapTime < DOUBLE_TAP_THRESHOLD) {
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
		toggleStar(diff.id, card.pIndex);
	}

	function handleTouchEnd(e: TouchEvent) {
		if (swiping) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		if (Math.abs(dx) < SWIPE_MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_DIAGONAL_RATIO) return;

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
				scrollLocked = false;
				// Focus the current card so tab order follows the visible card
				const card = el.querySelector(`[data-card-index="${idx}"]`) as HTMLElement | null;
				card?.focus({ preventScroll: true });
			}
		}

		cardsContainerEl.addEventListener('scroll', updateVisibleCard, { passive: true });
		return () => cardsContainerEl?.removeEventListener('scroll', updateVisibleCard);
	});

	// Shrink font on cards whose content overflows the viewport
	const BASE_FONT_REM = 1.35;
	const MIN_FONT_REM = 0.85;

	function fitCardFonts() {
		if (!cardsContainerEl) return;
		const cards = cardsContainerEl.querySelectorAll('.focus-content-card');
		cards.forEach((card) => {
			const content = card.querySelector('.focus-card-content') as HTMLElement;
			if (!content) return;
			// Reset to measure natural height
			content.style.fontSize = '';
			content.style.lineHeight = '';

			const cardEl = card as HTMLElement;
			const style = getComputedStyle(cardEl);
			const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
			const catRow = card.querySelector('.focus-card-category-row') as HTMLElement;
			const catH = catRow ? catRow.offsetHeight + parseFloat(getComputedStyle(catRow).marginBottom || '0') : 0;

			const available = cardEl.clientHeight - padY - catH;
			const natural = content.scrollHeight;

			if (natural > available && available > 0) {
				const ratio = available / natural;
				const scaled = BASE_FONT_REM * ratio;
				const clamped = Math.max(MIN_FONT_REM, scaled);
				content.style.fontSize = `${clamped}rem`;
				// Tighten line-height proportionally when shrinking a lot
				if (clamped < 1.05) {
					content.style.lineHeight = '1.55';
				} else if (clamped < 1.2) {
					content.style.lineHeight = '1.65';
				}
			}
		});
	}

	$effect(() => {
		flatCards; // re-run when content changes
		if (!cardsContainerEl) return;
		tick().then(fitCardFonts);
	});

	// Auto-focus the visible card's first link (or the card itself) so keyboard works immediately
	onMount(() => {
		tick().then(() => {
			const card = cardsContainerEl?.querySelector(`[data-card-index="${visibleCard}"]`) as HTMLElement | null;
			if (!card) return;
			const link = card.querySelector('a') as HTMLElement | null;
			(link || card).focus({ preventScroll: true });
		});
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

<svelte:window onkeydown={(e) => {
	if (e.key === 's') toggleCurrentStar();
	if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp') {
		e.preventDefault();
		if (scrollLocked) return;
		const dir = (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1 : -1;
		const target = visibleCard + dir;
		const card = cardsContainerEl?.querySelector(`[data-card-index="${target}"]`) as HTMLElement | null;
		if (!card) return;
		scrollLocked = true;
		card.scrollIntoView({ behavior: 'smooth' });
		// Focus first link in the target card after scroll settles
		const link = card.querySelector('a') as HTMLElement | null;
		if (link) {
			setTimeout(() => link.focus({ preventScroll: true }), 350);
		}
	}
	if (e.key === 'ArrowRight') {
		e.preventDefault();
		if (nextDiff) slideTo(nextDiff, 'left');
		else if (onNewest) slideOut('left', onNewest);
	}
	if (e.key === 'ArrowLeft') {
		e.preventDefault();
		if (prevDiff) slideTo(prevDiff, 'right');
	}
}} onresize={fitCardFonts} />

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
	<div class="focus-card focus-title-card" data-card-index="0" tabindex="-1">
		<div class="focus-title-card-content">
			<span class="focus-logo-mark">&#9670;</span>
			<h1 class="focus-title-card-heading">{diff.title}</h1>
			{#if summary}
				<p class="focus-title-card-summary">{summary}</p>
			{/if}
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
			<span class="focus-title-card-generated">Generated {timeAgo(diff.generated_at)}</span>
			<span class="focus-title-card-swipe">{'ontouchstart' in globalThis ? '\u2191 swipe' : '\u2193 scroll'} to read</span>
		</div>
	</div>

	{#each flatCards as card, i (card.globalIndex)}
		<div class="focus-card focus-content-card" class:focus-card-starred={isStarred(diff.id, card.pIndex)} data-card-index={i + 1} tabindex="-1">
			<div class="focus-card-category-row">
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span class="focus-card-category" onclick={() => showJumpMenu = !showJumpMenu}>{card.categoryTitle}</span>
				<span class="focus-star-nav">
					<button class="focus-star-nav-btn" disabled={prevStarIndex < 0} onclick={() => jumpToCard(prevStarIndex)}>&#8249;</button>
					<button class="focus-star-nav-icon" class:focus-star-nav-icon-active={isStarred(diff.id, card.pIndex)} title={isStarred(diff.id, card.pIndex) ? 'Unstar (s)' : 'Star (s)'} onclick={() => {
						if (card.pIndex < 0) return;
						toggleStar(diff.id, card.pIndex);
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
	<div class="focus-card focus-end-card" data-card-index={flatCards.length + 1} tabindex="-1">
		<div class="focus-end-content">
			<span class="focus-end-diamond"><span class="focus-end-check">&#10004;</span></span>
			<span class="focus-end-caught-up">All caught up</span>
			<h2 class="focus-end-title">{diff.title}</h2>
			<span class="focus-title-card-generated">Generated {timeAgo(diff.generated_at)}</span>
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
	<JumpMenu
		{categoryJumps}
		{activeCategoryJump}
		{visibleCard}
		totalCards={flatCards.length}
		onJump={jumpToCard}
		onClose={() => showJumpMenu = false}
	/>
{/if}

<style>
	.focus-content-card::before {
		content: '★';
		position: absolute;
		top: 0;
		right: -20vw;
		font-size: 120vw;
		color: var(--star-color);
		opacity: 0;
		pointer-events: none;
		line-height: 1;
		transform: rotate(15deg) translateX(30vw);
		transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
	}

	.focus-card-starred::before {
		opacity: 0.18;
		transform: rotate(15deg) translateX(0);
		background: radial-gradient(circle at center, var(--star-color), transparent 90%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}


</style>
