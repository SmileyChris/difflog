<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { type Diff, getHistory } from '$lib/stores/history.svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { formatDiffDate } from '$lib/utils/time';
	import CardView from '$lib/components/mobile/CardView.svelte';
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

	// --- Mobile state ---
	let visibleCard = $state(0);

	// --- Desktop state ---
	let currentIndex = $state(0);
	let focusedItem = $state(0);
	let articleEl: HTMLElement | null = $state(null);
	let bodyEl: HTMLElement | null = $state(null);
	let topOffset = $state(0);

	// Reset when diff changes
	$effect(() => {
		const id = diff?.id;
		if (!id) return;
		currentIndex = 0;
		focusedItem = 0;
	});

	const article = $derived(articles[currentIndex]);

	function wrapEmoji(html: string): string {
		return html.replace(/([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu, '<span class="focus-cat-emoji">$1</span>');
	}

	// Calculate fixed top offset: center the tallest article group in the viewport
	$effect(() => {
		if (!bodyEl || articles.length === 0) return;

		const existing = bodyEl.querySelector('.focus-article');
		if (!existing) return;

		const clone = existing.cloneNode(false) as HTMLElement;
		clone.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-top:0;padding-bottom:0';
		clone.removeAttribute('onfocusin');
		bodyEl.appendChild(clone);

		const catNav = existing.querySelector('.focus-categories');
		if (catNav) clone.appendChild(catNav.cloneNode(true));

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
			currentIndex--;
			focusedItem = -1;
		}
	}

	function nextItem() {
		const count = getItems().length;
		if (count === 0) return;
		if (focusedItem < count - 1) {
			focusedItem++;
		} else if (currentIndex < articles.length - 1) {
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
		void article;
		return articleEl ? getItems().length : 0;
	});

</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - Focus` : 'Focus - diff·log'}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="focus-page" class:focus-page-mobile={isMobile}>
	{#if isMobile}
		<!-- Mobile: swipeable card layout via CardView component -->
		<header class="focus-header focus-header-mobile">
			<span class="focus-header-group">
				<span class="focus-logo-mark focus-logo-faded">&#9670;</span>
				<span class="focus-wordmark focus-wordmark-faded">diff<span class="focus-diamond">&#9670;</span>log</span>
				<span class="focus-mode-label-mobile"><span class="focus-mode-f">f</span>ocus</span>
			</span>
			<button class="focus-close-btn" class:focus-close-bright={visibleCard > 0} onclick={exit} aria-label="Close focus mode">&#10005;</button>
		</header>

		<CardView
			{diff}
			basePath="/focus"
			onExit={exit}
			bind:visibleCard
		/>
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
