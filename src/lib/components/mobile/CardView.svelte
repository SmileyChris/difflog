<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { browser } from '$app/environment';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDiffDate } from '$lib/utils/time';
	import type { FlatCard } from './types';
	import '../../../styles/focus.css';

	interface Props {
		diff: Diff;
		basePath?: string;
		onExit: () => void;
		visibleCard?: number;
		tabBarHeight?: number;
		onFlatCards?: (cards: FlatCard[]) => void;
		onNewest?: () => void;
	}

	let {
		diff,
		basePath = '/d',
		onExit,
		visibleCard = $bindable(0),
		tabBarHeight = 0,
		onFlatCards,
		onNewest
	}: Props = $props();

	function formatDateLine(d: Diff): string {
		if (!d.window_days) return '';
		return `**${formatDiffDate(d.generated_at, d.window_days)}**\n\n---`;
	}

	const fullContent = $derived.by(() => {
		if (!diff) return '';
		const dateLine = formatDateLine(diff);
		return dateLine && diff.content
			? `${dateLine}\n\n${diff.content}`
			: (diff.content ?? '');
	});

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

	// Notify parent when flatCards change
	$effect(() => {
		onFlatCards?.(flatCards);
	});

	// --- Card state ---
	let cardsContainerEl: HTMLElement | null = $state(null);
	let showJumpMenu = $state(false);

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
	let slideIn: 'left' | 'right' | null = $state(null);
	let swiping = false;

	function handleTouchStart(e: TouchEvent) {
		touchStartX = e.touches[0].clientX;
		touchStartY = e.touches[0].clientY;
	}

	function slideTo(target: Diff, dir: 'left' | 'right') {
		if (swiping) return;
		swiping = true;
		savePosition(diff.id, visibleCard);
		slideDirection = dir;

		setTimeout(() => {
			slideIn = dir === 'left' ? 'right' : 'left';
			slideDirection = null;
			goto(`${basePath}/${target.id}`).then(() => {
				setTimeout(() => {
					slideIn = null;
					swiping = false;
				}, 250);
			});
		}, 200);
	}

	function slideOut(dir: 'left' | 'right', then: () => void) {
		if (swiping) return;
		swiping = true;
		savePosition(diff.id, visibleCard);
		slideDirection = dir;

		setTimeout(() => {
			slideDirection = null;
			then();
			swiping = false;
		}, 200);
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

	// IntersectionObserver to track which card is visible
	$effect(() => {
		if (!cardsContainerEl) return;

		const cards = cardsContainerEl.querySelectorAll('.focus-card');
		if (!cards.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = Number((entry.target as HTMLElement).dataset.cardIndex);
						if (!isNaN(idx)) {
							visibleCard = idx;
							savePosition(diff.id, idx);
						}
					}
				}
			},
			{ root: cardsContainerEl, threshold: 0.5 }
		);

		cards.forEach((card) => observer.observe(card));

		return () => observer.disconnect();
	});

	// Reset when diff changes — restore saved card position if available
	$effect(() => {
		const id = diff?.id;
		if (!id) return;
		const saved = getSavedPosition(id);
		visibleCard = saved;
		if (cardsContainerEl) {
			if (saved > 0) {
				tick().then(() => {
					const card = cardsContainerEl?.querySelector(`[data-card-index="${saved}"]`);
					if (card) card.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
				});
			} else {
				cardsContainerEl.scrollTop = 0;
			}
		}
	});

	const cardMinHeight = $derived(tabBarHeight > 0
		? `calc(100vh - 6.5rem - ${tabBarHeight}px)`
		: 'calc(100vh - 6.5rem)');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="focus-cards"
	class:focus-slide-out-left={slideDirection === 'left'}
	class:focus-slide-out-right={slideDirection === 'right'}
	class:focus-slide-in-left={slideIn === 'left'}
	class:focus-slide-in-right={slideIn === 'right'}
	bind:this={cardsContainerEl}
	ontouchstart={handleTouchStart}
	ontouchend={handleTouchEnd}
>
	<!-- Title card -->
	<div class="focus-card focus-title-card" data-card-index="0" style:min-height={cardMinHeight}>
		<div class="focus-title-card-content">
			<span class="focus-logo-mark">&#9670;</span>
			<h1 class="focus-title-card-heading">{diff.title}</h1>
			<span class="focus-title-card-meta">{flatCards.length} articles · {articles.length} categories</span>
		</div>
	</div>

	{#each flatCards as card, i (card.globalIndex)}
		<div class="focus-card" data-card-index={i + 1} style:min-height={cardMinHeight}>
			<div class="focus-card-category">{card.categoryTitle}</div>
			<div class="focus-card-content">
				{@html card.html}
			</div>
		</div>
	{/each}

	<!-- End card -->
	<div class="focus-card focus-end-card" data-card-index={flatCards.length + 1} style:min-height={cardMinHeight}>
		<div class="focus-end-content">
			<span class="focus-end-diamond"><span class="focus-end-check">&#10004;</span></span>
			<span class="focus-end-caught-up">All caught up</span>
			<h2 class="focus-end-title">{diff.title}</h2>
			<nav class="focus-end-actions">
				{#if nextDiff}
					<button class="focus-end-btn" onclick={() => slideTo(nextDiff, 'left')}>Newer diff &rarr;</button>
				{/if}
				{#if prevDiff}
					<button class="focus-end-btn" onclick={() => slideTo(prevDiff, 'right')}>&larr; Older diff</button>
				{/if}
				{#if new Date(diff.generated_at).toDateString() !== new Date().toDateString()}
					<a href="/generate" class="focus-end-btn focus-end-btn-accent">Generate new diff</a>
				{/if}
			</nav>
		</div>
	</div>
</div>

<footer
	class="focus-footer focus-footer-mobile"
	class:focus-slide-out-left={slideDirection === 'left'}
	class:focus-slide-out-right={slideDirection === 'right'}
	class:focus-slide-in-left={slideIn === 'left'}
	class:focus-slide-in-right={slideIn === 'right'}
>
	<span class="focus-card-category-label">
		<button class="focus-nav-arrow" class:focus-nav-disabled={!prevDiff} disabled={!prevDiff} onclick={() => prevDiff && slideTo(prevDiff, 'right')}>&#8249;</button>
		{new Date(diff.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
		{#if !nextDiff && onNewest}
			<button class="focus-nav-arrow" onclick={() => onNewest?.()}>&#8250;<span class="focus-nav-diamond">&#9670;</span></button>
		{:else}
			<button class="focus-nav-arrow" class:focus-nav-disabled={!nextDiff} disabled={!nextDiff} onclick={() => nextDiff && slideTo(nextDiff, 'left')}>&#8250;</button>
		{/if}
	</span>
	{#if visibleCard === 0}<span class="focus-swipe-hint">swipe &uarr;</span>{:else}<span></span>{/if}
	{#if visibleCard > 0 && visibleCard <= flatCards.length}
		<button class="focus-card-position" onclick={() => showJumpMenu = !showJumpMenu}>{visibleCard} / {flatCards.length} <span class="focus-card-hamburger">&#9776;</span></button>
	{:else}
		<button class="focus-card-position" onclick={() => showJumpMenu = !showJumpMenu}><span class="focus-card-hamburger">&#9776;</span></button>
	{/if}
</footer>

{#if showJumpMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="focus-jump-backdrop" onclick={() => showJumpMenu = false}></div>
	<nav class="focus-jump-menu">
		<button class="focus-jump-item" class:focus-jump-active={visibleCard === 0} onclick={() => jumpToCard(0)}>
			<span class="focus-jump-label">&#9670; Cover</span>
		</button>
		{#each categoryJumps as cat, i}
			<button class="focus-jump-item" class:focus-jump-active={i === activeCategoryJump} onclick={() => jumpToCard(cat.cardIndex)}>
				<span class="focus-jump-label">{cat.label}</span>
				<span class="focus-jump-count">{cat.count}</span>
			</button>
		{/each}
		<button class="focus-jump-item" class:focus-jump-active={visibleCard > flatCards.length} onclick={() => jumpToCard(flatCards.length + 1)}>
			<span class="focus-jump-label">&#10003; Complete</span>
		</button>
	</nav>
{/if}
