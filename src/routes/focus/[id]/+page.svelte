<script lang="ts">
	import { goto } from '$app/navigation';
	import { type Diff } from '$lib/stores/history.svelte';
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

	let currentIndex = $state(0);
	let focusedItem = $state(0);
	let articleEl: HTMLElement | null = $state(null);

	// Reset when diff changes
	$effect(() => {
		void diff?.id;
		currentIndex = 0;
		focusedItem = 0;
	});

	const article = $derived(articles[currentIndex]);

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
		const titleRow = articleEl.querySelector('.focus-title-row');

		titleRow?.classList.add('focus-title-dimmed');
		items.forEach((el, i) => {
			if (i === focusedItem) {
				el.classList.add('focus-active');
				el.classList.remove('focus-dimmed');
			} else {
				el.classList.add('focus-dimmed');
				el.classList.remove('focus-active');
			}
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

	function prevSection() {
		if (currentIndex > 0) {
			currentIndex--;
			focusedItem = 0;
		}
	}

	function nextSection() {
		if (currentIndex < articles.length - 1) {
			currentIndex++;
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

	const positionLabel = $derived.by(() => {
		if (articles.length === 0) return '';
		return `${currentIndex + 1} of ${articles.length} categories`;
	});
</script>

<svelte:head>
	<title>{diff?.title ? `${diff.title} - Focus` : 'Focus - diff·log'}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="focus-page">
	<header class="focus-header">
		<span class="focus-header-group">
			<a href="/d/{diff.id}" class="focus-header-link">
				<span class="focus-logo-mark">&#9670;</span>
				<span class="focus-wordmark">diff<span class="focus-diamond">&#9670;</span>log</span>
			</a>
			<span class="focus-mode-label">focus mode</span>
		</span>
	</header>

	<div class="focus-body">
		{#if article}
			{#key currentIndex}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="focus-article" bind:this={articleEl} onfocusin={handleFocusIn}>
					<div class="focus-title-row">
						<h2 class="md-h2">{@html article.title}</h2>
						{#if itemCount > 0}
							<span class="focus-item-position">{Math.max(0, focusedItem) + 1}/{itemCount}</span>
						{/if}
					</div>
					{@html article.html}
				</div>
			{/key}
		{:else}
			<div class="focus-article">
				<p class="md-p" style="color: var(--text-subtle);">No articles found in this diff.</p>
			</div>
		{/if}
	</div>

	<footer class="focus-footer">
		<div class="focus-nav">
			<button class="focus-nav-btn" onclick={prevSection} disabled={currentIndex === 0} aria-label="Previous category">&#8249;</button>
			<span class="focus-position">{positionLabel}</span>
			<button class="focus-nav-btn" onclick={nextSection} disabled={currentIndex >= articles.length - 1} aria-label="Next category">&#8250;</button>
		</div>
		<span class="focus-hints"><span class="focus-key">esc</span> to exit <span class="focus-dot">·</span> <span class="focus-key">← →</span> categories <span class="focus-dot">·</span> <span class="focus-key">↑ ↓</span> articles</span>
	</footer>
</div>
