<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDiffDate } from '$lib/utils/time';
	import '../../../styles/focus.css';

	let { data } = $props();

	const diff = $derived(data.diff as Diff);

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

	// --- Mobile detection ---
	let isMobile = $state(false);

	onMount(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		isMobile = mq.matches;
		const handler = (e: MediaQueryListEvent) => { isMobile = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	// --- Flat cards for mobile: one entry per [data-p] element ---
	type FlatCard = { categoryTitle: string; html: string; globalIndex: number };

	const flatCards = $derived.by((): FlatCard[] => {
		if (!browser || !articles.length) return [];

		const cards: FlatCard[] = [];
		const tmp = document.createElement('div');

		for (const art of articles) {
			// Decode HTML entities (e.g. &amp; → &) by going through textContent
			tmp.innerHTML = art.title;
			const catTitle = tmp.textContent?.trim() ?? '';
			tmp.innerHTML = art.html;
			const items = tmp.querySelectorAll('[data-p]');
			items.forEach((el) => {
				cards.push({
					categoryTitle: catTitle,
					html: el.outerHTML,
					globalIndex: cards.length
				});
			});
		}

		return cards;
	});

	// --- Mobile state ---
	let visibleCard = $state(0);
	let cardsContainerEl: HTMLElement | null = $state(null);
	const cardPositions = new Map<string, number>();

	const currentCategory = $derived(
		visibleCard > 0 && visibleCard <= flatCards.length
			? flatCards[visibleCard - 1]?.categoryTitle ?? ''
			: ''
	);

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

	function handleTouchEnd(e: TouchEvent) {
		if (swiping) return;
		const dx = e.changedTouches[0].clientX - touchStartX;
		const dy = e.changedTouches[0].clientY - touchStartY;

		// Only trigger if horizontal swipe is dominant and long enough
		if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

		const target = dx > 0 ? prevDiff : nextDiff;
		if (!target) return;

		swiping = true;
		cardPositions.set(diff.id, visibleCard);
		const dir = dx > 0 ? 'right' : 'left';
		slideDirection = dir;

		// After slide-out animation, navigate and slide in
		setTimeout(() => {
			slideIn = dir === 'left' ? 'right' : 'left';
			slideDirection = null;
			goto(`/focus/${target.id}`).then(() => {
				// Slide-in clears after animation
				setTimeout(() => {
					slideIn = null;
					swiping = false;
				}, 250);
			});
		}, 200);
	}

	// IntersectionObserver to track which card is visible
	$effect(() => {
		if (!isMobile || !cardsContainerEl) return;

		const cards = cardsContainerEl.querySelectorAll('.focus-card');
		if (!cards.length) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						const idx = Number((entry.target as HTMLElement).dataset.cardIndex);
						if (!isNaN(idx)) visibleCard = idx;
					}
				}
			},
			{ root: cardsContainerEl, threshold: 0.5 }
		);

		cards.forEach((card) => observer.observe(card));

		return () => observer.disconnect();
	});

	// --- Desktop state ---
	let currentIndex = $state(0);
	let focusedItem = $state(0);
	let articleEl: HTMLElement | null = $state(null);
	let bodyEl: HTMLElement | null = $state(null);
	let topOffset = $state(0);

	// Reset when diff changes — restore saved card position if available
	$effect(() => {
		const id = diff?.id;
		if (!id) return;
		currentIndex = 0;
		focusedItem = 0;
		const saved = cardPositions.get(id) ?? 0;
		visibleCard = saved;
		if (cardsContainerEl) {
			if (saved > 0) {
				// Scroll to saved card after DOM updates
				tick().then(() => {
					const card = cardsContainerEl?.querySelector(`[data-card-index="${saved}"]`);
					if (card) card.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
				});
			} else {
				cardsContainerEl.scrollTop = 0;
			}
		}
	});

	const article = $derived(articles[currentIndex]);

	function wrapEmoji(html: string): string {
		return html.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, '<span class="focus-cat-emoji">$1</span>');
	}

	// Calculate fixed top offset: center the tallest article group in the viewport
	$effect(() => {
		if (!bodyEl || articles.length === 0) return;

		// Measure using a clone of the actual article container for accurate styling
		const existing = bodyEl.querySelector('.focus-article');
		if (!existing) return;

		const clone = existing.cloneNode(false) as HTMLElement;
		clone.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-top:0;padding-bottom:0';
		clone.removeAttribute('onfocusin');
		bodyEl.appendChild(clone);

		// Clone the category nav
		const catNav = existing.querySelector('.focus-categories');
		if (catNav) clone.appendChild(catNav.cloneNode(true));

		// Measure each article's content
		const contentDiv = document.createElement('div');
		contentDiv.className = 'focus-article-content';
		clone.appendChild(contentDiv);

		let tallest = 0;
		for (const art of articles) {
			contentDiv.innerHTML = art.html;
			tallest = Math.max(tallest, clone.scrollHeight);
		}

		bodyEl.removeChild(clone);

		const bodyHeight = bodyEl.clientHeight;
		const offset = Math.max(0, (bodyHeight - tallest) / 2);
		topOffset = offset;
	});

	// Get focusable items from the DOM after render
	function getItems(): Element[] {
		if (!articleEl) return [];
		return Array.from(articleEl.querySelectorAll('[data-p]'));
	}

	// Track focus origin to avoid fighting with Tab navigation
	let focusFromTab = false;
	let settingFocus = false;

	// Apply dimming classes based on focusedItem
	$effect(() => {
		if (!articleEl) return;
		const items = getItems();
		items.forEach((el, i) => {
			el.classList.toggle('focus-active', i === focusedItem);
		});

		// Scroll focused item into view and focus its first link (unless Tab triggered this)
		const active = items[focusedItem];
		if (active) {
			active.scrollIntoView({ behavior: 'smooth', block: 'center' });
			if (!focusFromTab) {
				settingFocus = true;
				const link = active.querySelector('a');
				if (link instanceof HTMLElement) link.focus({ preventScroll: true });
				settingFocus = false;
			}
			focusFromTab = false;
		}
	});

	// When Tab/Shift-Tab moves focus to a link in a different article, follow it
	function handleFocusIn(e: FocusEvent) {
		if (settingFocus) return;
		const target = e.target as HTMLElement;
		if (!target?.closest?.('[data-p]')) return;

		const item = target.closest('[data-p]')!;
		const items = getItems();
		const idx = items.indexOf(item);
		if (idx >= 0 && idx !== focusedItem) {
			focusFromTab = true;
			focusedItem = idx;
		}
	}

	function handleContentClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const item = target.closest('[data-p]');
		if (!item) return;
		const items = getItems();
		const idx = items.indexOf(item);
		if (idx >= 0 && idx !== focusedItem) {
			focusedItem = idx;
		}
	}

	async function prevSection() {
		if (currentIndex > 0) {
			currentIndex--;
			focusedItem = -1;
			await tick();
			focusedItem = 0;
		}
	}

	async function nextSection() {
		if (currentIndex < articles.length - 1) {
			currentIndex++;
			focusedItem = -1;
			await tick();
			focusedItem = 0;
		}
	}

	function prevItem() {
		const count = getItems().length;
		if (count === 0) return;
		if (focusedItem > 0) {
			focusedItem--;
		} else if (currentIndex > 0) {
			// Cross to previous category's last item
			currentIndex--;
			// Need to defer to after DOM updates with new section content
			focusedItem = -1; // sentinel: will be corrected by effect below
		}
	}

	function nextItem() {
		const count = getItems().length;
		if (count === 0) return;
		if (focusedItem < count - 1) {
			focusedItem++;
		} else if (currentIndex < articles.length - 1) {
			// Cross to next category's first item
			currentIndex++;
			focusedItem = 0;
		}
	}

	// When crossing to previous category, snap to last item once DOM is ready
	$effect(() => {
		if (focusedItem === -1 && articleEl) {
			const count = getItems().length;
			focusedItem = count > 0 ? count - 1 : 0;
		}
	});

	function exit() {
		goto(`/d/${diff.id}`);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (isMobile) return;
		switch (e.key) {
			case 'ArrowLeft':
			case 'h':
				prevSection();
				break;
			case 'ArrowRight':
			case 'l':
				nextSection();
				break;
			case 'ArrowUp':
			case 'k':
				e.preventDefault();
				prevItem();
				break;
			case 'ArrowDown':
			case 'j':
				e.preventDefault();
				nextItem();
				break;
			case 'Escape':
			case 'q':
				exit();
				break;
		}
	}

	const itemCount = $derived.by(() => {
		// Re-derive when article changes (can't call getItems reactively since it needs DOM)
		void article;
		// Will be correct after effect runs; use a fallback for display
		return articleEl ? getItems().length : 0;
	});

</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - Focus` : 'Focus - diff·log'}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="focus-page" class:focus-page-mobile={isMobile}>
	{#if isMobile}
		<!-- Mobile: swipeable card layout -->
		<header class="focus-header focus-header-mobile">
			<span class="focus-header-group">
				<span class="focus-logo-mark focus-logo-faded">&#9670;</span>
				<span class="focus-wordmark focus-wordmark-faded">diff<span class="focus-diamond">&#9670;</span>log</span>
				<span class="focus-mode-label-mobile"><span class="focus-mode-f">f</span>ocus</span>
			</span>
			<button class="focus-close-btn" class:focus-close-bright={visibleCard > flatCards.length} onclick={exit} aria-label="Close focus mode">✕</button>
		</header>

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
			<div class="focus-card focus-title-card" data-card-index="0">
				<div class="focus-title-card-content">
					<span class="focus-logo-mark">&#9670;</span>
					<h1 class="focus-title-card-heading">{diff.title}</h1>
					<span class="focus-title-card-meta">{flatCards.length} articles · {articles.length} categories</span>
				</div>
			</div>

			{#each flatCards as card, i (card.globalIndex)}
				<div class="focus-card" data-card-index={i + 1}>
					<div class="focus-card-category">{card.categoryTitle}</div>
					<div class="focus-card-content">
						{@html card.html}
					</div>
				</div>
			{/each}

			<!-- End card -->
			<div class="focus-card focus-end-card" data-card-index={flatCards.length + 1}>
				<div class="focus-end-content">
					<div class="focus-end-logo">
						<span class="focus-logo-mark">&#9670;</span>
					</div>
					<div class="focus-end-status">
						<span class="focus-end-check">✓</span>
						<span class="focus-end-label">All caught up</span>
					</div>
					<nav class="focus-end-actions">
						{#if nextDiff}
							<a href="/focus/{nextDiff.id}" class="focus-end-btn">Newer diff →</a>
						{/if}
						{#if prevDiff}
							<a href="/focus/{prevDiff.id}" class="focus-end-btn">← Older diff</a>
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
				<span class="focus-nav-arrow" class:focus-nav-disabled={!prevDiff}>‹</span>
				{new Date(diff.generated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
				<span class="focus-nav-arrow" class:focus-nav-disabled={!nextDiff}>›</span>
			</span>
			<span></span>
			{#if visibleCard > 0 && visibleCard <= flatCards.length}
				<span class="focus-card-position">{visibleCard} / {flatCards.length}</span>
			{:else}
				<span></span>
			{/if}
		</footer>
	{:else}
		<!-- Desktop: keyboard-driven spotlight layout -->
		<header class="focus-header">
			<span class="focus-header-group">
				<a href="/d/{diff.id}" class="focus-header-link">
					<span class="focus-logo-mark">&#9670;</span>
					<span class="focus-wordmark">diff<span class="focus-diamond">&#9670;</span>log</span>
				</a>
				<span class="focus-mode-label">focus mode</span>
			</span>
		</header>

		<div class="focus-body" bind:this={bodyEl}>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="focus-article" bind:this={articleEl} onfocusin={handleFocusIn} style:padding-top={topOffset + 'px'}>
				<nav class="focus-categories">
					{#each articles as cat, i}
						<button
							class="focus-cat-label"
							class:focus-cat-active={i === currentIndex}
							onclick={async () => { currentIndex = i; focusedItem = -1; await tick(); focusedItem = 0; }}
						>
							{@html wrapEmoji(cat.title)}
						</button>
					{/each}
				</nav>
				{#if article}
					{#key currentIndex}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="focus-article-content" onclick={handleContentClick}>
							{@html article.html}
						</div>
					{/key}
				{/if}
			</div>
		</div>

		<footer class="focus-footer">
			<span class="focus-hints"><span class="focus-key">esc</span> to exit <span class="focus-dot">·</span> <span class="focus-key">← →</span> categories <span class="focus-dot">·</span> <span class="focus-key">↑ ↓</span> articles{#if itemCount > 0} <span class="focus-item-position">{Math.max(0, focusedItem) + 1}/{itemCount}</span>{/if}</span>
		</footer>
	{/if}
</div>
