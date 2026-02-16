/**
 * Interactive diff viewer with keyboard navigation.
 */

import { renderMarkdown } from './render';
import { parseDiff, flattenTopics, type Topic } from './parser';
import { isTopicRead, markTopicRead, toggleTopicRead, getDiffs, saveDiffs, trackDiffModified } from './config';
import { syncUpload } from './sync';
import { RESET, DIM, BOLD, CYAN, UNDERLINE, GREEN, BRIGHT_YELLOW, clearScreen, hideCursor, showCursor, openUrl, copyToClipboard } from './ui';

/**
 * Display help overlay
 */
function displayHelp(): void {
	clearScreen();
	process.stdout.write(`${BOLD}Keyboard Shortcuts${RESET}\n\n`);
	process.stdout.write(`${DIM}Navigation${RESET}\n`);
	process.stdout.write(`  ${CYAN}←  →  j  k${RESET}  Navigate articles\n`);
	process.stdout.write(`  ${CYAN}↑  ↓  h  l${RESET}  Navigate categories\n`);
	process.stdout.write(`  ${CYAN}Home${RESET}       First article\n`);
	process.stdout.write(`  ${CYAN}End${RESET}        Last article\n`);
	process.stdout.write(`  ${CYAN}PgUp${RESET}       Previous diff (older)\n`);
	process.stdout.write(`  ${CYAN}PgDn${RESET}       Next diff (newer)\n\n`);
	process.stdout.write(`${DIM}Reading${RESET}\n`);
	process.stdout.write(`  ${CYAN}Space${RESET}      Mark as read & jump to next\n`);
	process.stdout.write(`  ${CYAN}a${RESET}          Toggle show/hide read articles\n\n`);
	process.stdout.write(`${DIM}Links${RESET}\n`);
	process.stdout.write(`  ${CYAN}Tab${RESET}        Cycle through links\n`);
	process.stdout.write(`  ${CYAN}Enter${RESET}      Open link in browser\n\n`);
	process.stdout.write(`${DIM}Actions${RESET}\n`);
	process.stdout.write(`  ${CYAN}g${RESET}          Generate new diff\n`);
	process.stdout.write(`  ${CYAN}s${RESET}          Share/unshare diff\n`);
	process.stdout.write(`  ${CYAN}f${RESET}          Show full diff\n`);
	process.stdout.write(`  ${CYAN}q  Esc${RESET}     Quit\n\n`);
	process.stdout.write(`${DIM}Press any key to return${RESET}\n`);
}

/**
 * Display share menu overlay
 */
function displayShareMenu(diffId: string, menuSelection: number, currentlyPublic: boolean, flash?: string): void {
	clearScreen();
	const currentStatus = currentlyPublic ? 'public' : 'private';
	process.stdout.write(`${BOLD}Sharing${RESET} ${DIM}(currently ${currentStatus})${RESET}\n\n`);

	const privateRadio = menuSelection === 0 ? `${CYAN}●${RESET}` : `${DIM}○${RESET}`;
	const publicRadio = menuSelection === 1 ? `${CYAN}●${RESET}` : `${DIM}○${RESET}`;

	const privateLabel = menuSelection === 0 ? 'private' : `${DIM}private${RESET}`;
	const publicLabel = menuSelection === 1 ? 'public' : `${DIM}public${RESET}`;

	process.stdout.write(`  ${privateRadio} ${privateLabel}    ${DIM}Encrypted, only you can see it${RESET}\n`);
	process.stdout.write(`  ${publicRadio} ${publicLabel}     ${DIM}Anyone with the link can view${RESET}\n`);

	if (menuSelection === 1) {
		process.stdout.write(`\n  ${CYAN}https://difflog.dev/d/${diffId}${RESET}\n`);
		if (flash) {
			process.stdout.write(`\n  ${GREEN}${flash}${RESET}\n`);
		}
		process.stdout.write(`\n${DIM}b open in browser · c copy link · enter to save · esc to cancel${RESET}\n`);
	} else {
		process.stdout.write(`\n${DIM}enter to save · esc to cancel${RESET}\n`);
	}
}

/**
 * Display a topic in interactive mode
 */
function displayTopic(
	diffTitle: string,
	dateInfo: string,
	categoryHeader: string,
	categoryTopicIndex: number,
	categoryTopicTotal: number,
	topic: Topic,
	globalIndex: number,
	globalTotal: number,
	linkIndex: number,
	prevCategories: Array<{ name: string; count: number }>,
	nextCategories: Array<{ name: string; count: number }>,
	diffPosition?: { current: number; total: number },
	isTodayDiff: boolean = false,
	isRead: boolean = false,
	unreadCount: number = 0,
	showRead: boolean = false,
	currentUnreadPos: number = 0,
	isPublic: boolean = false,
	syncEnabled: boolean = false
): void {
	clearScreen();

	// Diff title with counts
	if (!showRead && unreadCount > 0) {
		if (isRead) {
			// On a read article: just show total unread count
			process.stdout.write(
				`${BOLD}${diffTitle}${RESET} ${DIM}[${unreadCount} unread]${RESET}\n`
			);
		} else {
			// On an unread article: show position in unread articles
			process.stdout.write(
				`${BOLD}${diffTitle}${RESET} ${DIM}[${currentUnreadPos}/${unreadCount} unread]${RESET}\n`
			);
		}
	} else if (showRead) {
		// Show all mode: show read/unread breakdown
		const readCount = globalTotal - unreadCount;
		if (unreadCount === 0) {
			// Highlight 0 unread in yellow
			process.stdout.write(
				`${BOLD}${diffTitle}${RESET} ${DIM}[${readCount} read, ${RESET}${BRIGHT_YELLOW}0 unread${RESET}${DIM}]${RESET}\n`
			);
		} else {
			process.stdout.write(
				`${BOLD}${diffTitle}${RESET} ${DIM}[${readCount} read, ${unreadCount} unread]${RESET}\n`
			);
		}
	} else {
		process.stdout.write(`${BOLD}${diffTitle}${RESET}\n`);
	}

	// Date info
	if (dateInfo) {
		let line = `${DIM}${dateInfo}${RESET}`;
		if (syncEnabled) {
			const status = isPublic
				? `${CYAN}public${RESET}`
				: `${DIM}private${RESET}`;
			line += `${DIM} · ${RESET}${status}`;
		}
		process.stdout.write(line + '\n');
	}
	process.stdout.write('\n');

	// Previous categories (or status line when on first category)
	if (prevCategories.length >= 2) {
		process.stdout.write(
			`${DIM}  ${RESET}${GREEN}${prevCategories[1].name}${RESET}  ${DIM}${prevCategories[1].count}${RESET}\n`
		);
		process.stdout.write(
			`${DIM}↑ ${RESET}${GREEN}${prevCategories[0].name}${RESET}  ${DIM}${prevCategories[0].count}${RESET}\n`
		);
	} else if (prevCategories.length === 1) {
		process.stdout.write('\n');
		process.stdout.write(
			`${DIM}↑ ${RESET}${GREEN}${prevCategories[0].name}${RESET}  ${DIM}${prevCategories[0].count}${RESET}\n`
		);
	} else if (showRead && unreadCount === 0) {
		// All read: show "All articles read" as virtual previous category
		process.stdout.write('\n');
		process.stdout.write(
			`${DIM}↑ ${RESET}${BRIGHT_YELLOW}✓${RESET} ${BOLD}All articles read${RESET}\n`
		);
	} else {
		// Show status line when on first category
		let statusLine = '';
		if (diffPosition) {
			const isLatest = diffPosition.current === 1;
			if (unreadCount > 0) {
				const unreadText = `${unreadCount}/${globalTotal} unread`;
				if (isLatest) {
					if (isTodayDiff) {
						statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total}) • ${unreadText}  •  ? for keys${RESET}`;
					} else {
						statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total}) • ${unreadText}  •  g to generate new  •  ? for keys${RESET}`;
					}
				} else {
					statusLine = `${DIM}From the archives [${diffPosition.current}/${diffPosition.total}] • ${unreadText}  •  ? for keys${RESET}`;
				}
			} else {
				// All read - no unread count in status line
				if (isLatest) {
					if (isTodayDiff) {
						statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total})  •  ? for keys${RESET}`;
					} else {
						statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total})  •  g to generate new  •  ? for keys${RESET}`;
					}
				} else {
					statusLine = `${DIM}From the archives [${diffPosition.current}/${diffPosition.total}]  •  ? for keys${RESET}`;
				}
			}
		} else {
			statusLine = `${DIM}? for keys${RESET}`;
		}
		process.stdout.write(statusLine + '\n\n');
	}

	// Category header with category progress and navigation indicators
	const isFirstTopic = globalIndex === 0;
	const isLastTopic = globalIndex === globalTotal - 1;
	const prevArrow = !isFirstTopic ? `${DIM}← ${RESET}` : '  ';
	const nextArrow = !isLastTopic ? `${DIM} →${RESET}` : '  ';
	const categoryProgress = `${prevArrow}${DIM}${categoryTopicIndex + 1}/${categoryTopicTotal}${RESET}${nextArrow}`;
	// Format current category same as prev/next (with spacing for alignment)
	const categoryName = categoryHeader.replace(/^##\s*/, '').trim();
	const categoryLine = `${BOLD}${GREEN}${categoryName}${RESET}`;
	process.stdout.write(`${DIM}  ${RESET}${categoryLine} ${categoryProgress}\n\n`);

	// Render topic content with highlighted link
	const topicMarkdown = topic.lines.join('\n').trim();
	const highlightIndex = topic.links.length > 0 ? linkIndex : undefined;
	const rendered = renderMarkdown(topicMarkdown, highlightIndex, true);
	process.stdout.write(rendered + '\n\n');

	// Show URL for selected link or read indicator
	if (topic.links.length > 0) {
		if (isRead) {
			process.stdout.write(`${BRIGHT_YELLOW}✓ Article read${RESET}\n`);
		} else {
			const currentLink = topic.links[linkIndex];
			const linkHint = topic.links.length > 1 ? ` ${DIM}(tab to cycle)${RESET}` : '';
			process.stdout.write(`${DIM}↵ ${RESET}${CYAN}${currentLink.url}${RESET}${linkHint}\n`);
		}
	}

	// Next categories (always show 2 lines to prevent shift)
	if (nextCategories.length >= 2) {
		process.stdout.write(
			`\n${DIM}↓ ${RESET}${GREEN}${nextCategories[0].name}${RESET}  ${DIM}${nextCategories[0].count}${RESET}\n`
		);
		process.stdout.write(
			`${DIM}  ${RESET}${GREEN}${nextCategories[1].name}${RESET}  ${DIM}${nextCategories[1].count}${RESET}\n`
		);
	} else if (nextCategories.length === 1) {
		process.stdout.write(
			`\n${DIM}↓ ${RESET}${GREEN}${nextCategories[0].name}${RESET}  ${DIM}${nextCategories[0].count}${RESET}\n`
		);
		process.stdout.write('\n');
	} else {
		process.stdout.write('\n\n');
	}
}

/**
 * Calculate topic index within its category
 */
function getCategoryTopicIndex(
	items: Array<{ category: Category; topic: Topic }>,
	globalIndex: number
): { index: number; total: number } {
	const currentItem = items[globalIndex];
	const currentCategory = currentItem.category;

	// Find all topics in the same category
	const categoryTopics = items.filter((item) => item.category === currentCategory);
	const indexInCategory = categoryTopics.findIndex((item) => item === currentItem);

	return {
		index: indexInCategory,
		total: categoryTopics.length
	};
}

/**
 * Find the first topic of the next category (no wrapping)
 */
function getNextCategoryIndex(
	items: Array<{ category: Category; topic: Topic }>,
	currentIndex: number
): number {
	const currentCategory = items[currentIndex].category;

	// Find next item with different category
	for (let i = currentIndex + 1; i < items.length; i++) {
		if (items[i].category !== currentCategory) {
			return i;
		}
	}

	// No wrapping - return current if at end
	return currentIndex;
}

/**
 * Find the first topic of the previous category (no wrapping)
 */
function getPrevCategoryIndex(
	items: Array<{ category: Category; topic: Topic }>,
	currentIndex: number
): number {
	const currentCategory = items[currentIndex].category;

	// Find the start of current category
	let categoryStart = currentIndex;
	while (categoryStart > 0 && items[categoryStart - 1].category === currentCategory) {
		categoryStart--;
	}

	// If already at first category, don't wrap
	if (categoryStart === 0) {
		return currentIndex;
	}

	// Find start of previous category
	const prevCategory = items[categoryStart - 1].category;
	for (let i = categoryStart - 1; i >= 0; i--) {
		if (items[i].category !== prevCategory) {
			return i + 1;
		}
	}
	return 0;
}

/**
 * Get category names for navigation hints (up to 2 prev and 2 next)
 */
function getCategoryNavigation(
	items: Array<{ category: Category; topic: Topic }>,
	currentIndex: number
): { prev: Array<{ name: string; count: number }>; next: Array<{ name: string; count: number }> } {
	const currentCategory = items[currentIndex].category;
	const prevCategories: Array<{ name: string; count: number }> = [];
	const nextCategories: Array<{ name: string; count: number }> = [];

	// Collect unique previous categories with counts
	let lastSeenCategory: Category | null = null;
	for (let i = currentIndex - 1; i >= 0 && prevCategories.length < 2; i--) {
		const cat = items[i].category;
		if (cat !== currentCategory && cat !== lastSeenCategory) {
			const count = items.filter((item) => item.category === cat).length;
			prevCategories.push({
				name: cat.header.replace(/^##\s*/, '').trim(),
				count
			});
			lastSeenCategory = cat;
		}
	}

	// Collect unique next categories with counts
	lastSeenCategory = null;
	for (let i = currentIndex + 1; i < items.length && nextCategories.length < 2; i++) {
		const cat = items[i].category;
		if (cat !== currentCategory && cat !== lastSeenCategory) {
			const count = items.filter((item) => item.category === cat).length;
			nextCategories.push({
				name: cat.header.replace(/^##\s*/, '').trim(),
				count
			});
			lastSeenCategory = cat;
		}
	}

	return { prev: prevCategories, next: nextCategories };
}

export type InteractiveAction = 'quit' | 'generate' | 'prev-diff' | 'next-diff';

/**
 * Start interactive viewer. Resolves with the exit action.
 */
export function startInteractive(
	diffId: string,
	markdown: string,
	diffTitle: string,
	dateInfo: string = '',
	diffPosition?: { current: number; total: number },
	isTodayDiff: boolean = false,
	isPublic: boolean = false,
	syncEnabled: boolean = false
): Promise<InteractiveAction> {
	const parsed = parseDiff(markdown);
	const allItems = flattenTopics(parsed);

	// Filter to only show topics with links
	const items = allItems.filter((item) => item.topic.links.length > 0);

	if (items.length === 0) {
		process.stderr.write('No topics with links found in diff.\n');
		process.exit(1);
	}

	return new Promise((resolve) => {

	let currentIndex = 0;
	let currentLinkIndex = 0;
	let running = true;
	let showingHelp = false;
	let showingShareMenu = false;
	let menuSelection = isPublic ? 1 : 0; // 0 = private, 1 = public
	let currentIsPublic = isPublic;
	let showRead = false; // Toggle to show/hide read topics
	let onAllReadScreen = false; // Virtual "all read" category 0 screen

	// Helper to get visible items based on showRead mode
	function getVisibleItems() {
		if (showRead) {
			return items;
		}
		return items.filter((_, index) => !isTopicRead(diffId, index));
	}

	// Helper to get unread count
	function getUnreadCount(): number {
		return items.filter((_, index) => !isTopicRead(diffId, index)).length;
	}

	// Helper to get current position within unread articles (1-based)
	function getCurrentUnreadPosition(): number {
		let position = 0;
		for (let i = 0; i <= currentIndex; i++) {
			if (!isTopicRead(diffId, i)) {
				position++;
			}
		}
		return position;
	}

	// Display the "all articles read" virtual category 0 screen
	function displayAllReadScreen() {
		clearScreen();

		// Title with read/unread breakdown (same as show-all mode)
		const readCount = items.length;
		process.stdout.write(
			`${BOLD}${diffTitle}${RESET} ${DIM}[${readCount} read, ${RESET}${BRIGHT_YELLOW}0 unread${RESET}${DIM}]${RESET}\n`
		);

		// Date info line
		if (dateInfo) {
			let line = `${DIM}${dateInfo}${RESET}`;
			if (syncEnabled) {
				const status = currentIsPublic
					? `${CYAN}public${RESET}`
					: `${DIM}private${RESET}`;
				line += `${DIM} · ${RESET}${status}`;
			}
			process.stdout.write(line + '\n');
		}
		process.stdout.write('\n');

		// Status line (same as first-category status line)
		let statusLine = '';
		if (diffPosition) {
			const isLatest = diffPosition.current === 1;
			if (isLatest) {
				if (isTodayDiff) {
					statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total})  •  ? for keys${RESET}`;
				} else {
					statusLine = `${DIM}Latest diff (${diffPosition.current}/${diffPosition.total})  •  g to generate new  •  ? for keys${RESET}`;
				}
			} else {
				statusLine = `${DIM}From the archives [${diffPosition.current}/${diffPosition.total}]  •  ? for keys${RESET}`;
			}
		} else {
			statusLine = `${DIM}? for keys${RESET}`;
		}
		process.stdout.write(statusLine + '\n\n');

		// Completion message as "category header"
		process.stdout.write(`  ${BRIGHT_YELLOW}✓${RESET} ${BOLD}All articles read${RESET}\n`);

		// Show first 2 real categories below
		const firstCategories: Array<{ name: string; count: number }> = [];
		let lastSeenCategory: typeof items[0]['category'] | null = null;
		for (let i = 0; i < items.length && firstCategories.length < 2; i++) {
			const cat = items[i].category;
			if (cat !== lastSeenCategory) {
				const count = items.filter((item) => item.category === cat).length;
				firstCategories.push({
					name: cat.header.replace(/^##\s*/, '').trim(),
					count
				});
				lastSeenCategory = cat;
			}
		}

		process.stdout.write('\n');
		if (firstCategories.length >= 1) {
			process.stdout.write(
				`${DIM}↓ ${RESET}${GREEN}${firstCategories[0].name}${RESET}  ${DIM}${firstCategories[0].count}${RESET}\n`
			);
		}
		if (firstCategories.length >= 2) {
			process.stdout.write(
				`${DIM}  ${RESET}${GREEN}${firstCategories[1].name}${RESET}  ${DIM}${firstCategories[1].count}${RESET}\n`
			);
		} else {
			process.stdout.write('\n');
		}
	}

	// Ensure we have a TTY
	if (!process.stdin.isTTY) {
		process.stderr.write('Error: Interactive mode requires a TTY\n');
		process.exit(1);
	}

	// Set up raw mode for keyboard input
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding('utf8');

	hideCursor();

	// Helper to display current view
	function displayCurrentView() {
		if (onAllReadScreen) {
			displayAllReadScreen();
			return;
		}

		const unreadCount = getUnreadCount();
		const allRead = unreadCount === 0;

		// If all read and trying to hide read, force show-all mode
		if (allRead && !showRead) {
			showRead = true;
		}

		const item = items[currentIndex];
		const categoryPos = getCategoryTopicIndex(items, currentIndex);
		const categoryNav = getCategoryNavigation(items, currentIndex);
		const currentUnreadPos = getCurrentUnreadPosition();
		displayTopic(
			diffTitle,
			dateInfo,
			item.category.header,
			categoryPos.index,
			categoryPos.total,
			item.topic,
			currentIndex,
			items.length,
			currentLinkIndex,
			categoryNav.prev,
			categoryNav.next,
			diffPosition,
			isTodayDiff,
			isTopicRead(diffId, currentIndex),
			unreadCount,
			showRead,
			currentUnreadPos,
			currentIsPublic,
			syncEnabled
		);
	}

	// Check if all articles are read
	const unreadCount = getUnreadCount();
	const allRead = unreadCount === 0;

	if (allRead) {
		// All read: open on the completion screen
		onAllReadScreen = true;
		showRead = true;
	} else if (!showRead) {
		// Jump to first unread
		while (currentIndex < items.length && isTopicRead(diffId, currentIndex)) {
			currentIndex++;
		}
	}

	// Display initial view
	displayCurrentView();

	// Handle keypresses
	const dataHandler = (key: string) => {
		if (!running) return;

		// If showing help, q quits, any other key returns to normal view
		if (showingHelp) {
			if (key === 'q') {
				cleanup();
				resolve('quit');
				return;
			}
			showingHelp = false;
			displayCurrentView();
			return;
		}

		// If showing share menu, handle menu keys
		if (showingShareMenu) {
			// q: quit app
			if (key === 'q') {
				cleanup();
				resolve('quit');
				return;
			}
			// Esc/Ctrl+C: cancel back to viewer
			if (key === '\u001b' || key === '\u0003') {
				showingShareMenu = false;
				displayCurrentView();
				return;
			}
			// Up/Down arrows or j/k: move cursor
			if (key === '\u001b[A' || key === '\u001b[B' || key === 'k' || key === 'j') {
				menuSelection = menuSelection === 0 ? 1 : 0;
				displayShareMenu(diffId, menuSelection, currentIsPublic);
				return;
			}
			// b: open in browser (when public selected)
			if (key === 'b' && menuSelection === 1) {
				const url = `https://difflog.dev/d/${diffId}`;
				openUrl(url);
				displayShareMenu(diffId, menuSelection, currentIsPublic, 'Opened in browser');
				return;
			}
			// c: copy link (when public selected)
			if (key === 'c' && menuSelection === 1) {
				const url = `https://difflog.dev/d/${diffId}`;
				const ok = copyToClipboard(url);
				displayShareMenu(diffId, menuSelection, currentIsPublic, ok ? 'Copied to clipboard' : 'Copy failed — install xclip');
				return;
			}
			// Enter: save and close
			if (key === '\r' || key === '\n') {
				const newIsPublic = menuSelection === 1;
				if (newIsPublic !== currentIsPublic) {
					currentIsPublic = newIsPublic;
					// Update diff in storage
					const diffs = getDiffs();
					const diff = diffs.find(d => d.id === diffId);
					if (diff) {
						diff.isPublic = currentIsPublic;
						saveDiffs(diffs);
						trackDiffModified(diffId);
						syncUpload(); // fire-and-forget
					}
				}
				showingShareMenu = false;
				displayCurrentView();
				return;
			}
			// Ignore all other keys in share menu
			return;
		}

		// Show help with '?'
		if (key === '?') {
			showingHelp = true;
			displayHelp();
			return;
		}

		// Check for quit (q, Ctrl+C, ESC)
		if (key === 'q' || key === '\u0003' || key === '\u001b') {
			cleanup();
			resolve('quit');
			return;
		}

		// Generate (g)
		if (key === 'g') {
			cleanup();
			resolve('generate');
			return;
		}

		// Share menu (s) — only when sync is available
		if (key === 's' && syncEnabled) {
			showingShareMenu = true;
			menuSelection = currentIsPublic ? 1 : 0;
			displayShareMenu(diffId, menuSelection, currentIsPublic);
			return;
		}

		// Full mode (f)
		if (key === 'f') {
			cleanup();
			// Show full markdown
			process.stdout.write(renderMarkdown(markdown) + '\n');
			resolve('quit');
			return;
		}

		// PageUp: previous diff (older)
		if (key === '\u001b[5~') {
			if (diffPosition && diffPosition.current < diffPosition.total) {
				cleanup();
				resolve('prev-diff');
				return;
			}
			return;
		}

		// PageDown: next diff (newer)
		if (key === '\u001b[6~') {
			if (diffPosition && diffPosition.current > 1) {
				cleanup();
				resolve('next-diff');
				return;
			}
			return;
		}

		// Open link (Enter)
		if (key === '\r' || key === '\n') {
			if (onAllReadScreen) return;
			const currentItem = items[currentIndex];
			if (currentItem.topic.links.length > 0) {
				const link = currentItem.topic.links[currentLinkIndex];
				openUrl(link.url);
			}
			return;
		}

		// Space: mark as read and jump to next unread (or toggle if showing read)
		if (key === ' ') {
			if (showRead) {
				// Just toggle read status without jumping
				toggleTopicRead(diffId, currentIndex);
			} else {
				// Mark as read and jump to next unread
				markTopicRead(diffId, currentIndex);
				// Find next unread
				let nextUnread = -1;
				for (let i = currentIndex + 1; i < items.length; i++) {
					if (!isTopicRead(diffId, i)) {
						nextUnread = i;
						break;
					}
				}
				if (nextUnread >= 0) {
					currentIndex = nextUnread;
					currentLinkIndex = 0;
				} else {
					// Last unread article just read — show completion screen
					onAllReadScreen = true;
					showRead = true;
				}
			}
			displayCurrentView();
			return;
		}

		// Toggle show/hide read articles with 'a' key
		if (key === 'a') {
			if (onAllReadScreen) {
				// From all-read screen: 'a' enters browse-all mode
				onAllReadScreen = false;
				showRead = true;
				currentIndex = 0;
				currentLinkIndex = 0;
				displayCurrentView();
				return;
			}
			showRead = !showRead;
			// If toggling to hide-read mode, jump to first unread (if any)
			if (!showRead) {
				const unread = getUnreadCount();
				if (unread === 0) {
					// All read: go to completion screen
					onAllReadScreen = true;
					showRead = true;
				} else {
					currentIndex = 0;
					while (currentIndex < items.length && isTopicRead(diffId, currentIndex)) {
						currentIndex++;
					}
					if (currentIndex >= items.length) {
						currentIndex = 0;
					}
				}
			}
			displayCurrentView();
			return;
		}

		// Tab: cycle through links
		if (key === '\t') {
			const currentItem = items[currentIndex];
			if (currentItem.topic.links.length > 1) {
				currentLinkIndex = (currentLinkIndex + 1) % currentItem.topic.links.length;
				displayCurrentView();
			}
			return;
		}

		// Shift+Tab: cycle backwards through links
		if (key === '\x1b[Z') {
			const currentItem = items[currentIndex];
			if (currentItem.topic.links.length > 1) {
				currentLinkIndex =
					(currentLinkIndex - 1 + currentItem.topic.links.length) % currentItem.topic.links.length;
				displayCurrentView();
			}
			return;
		}

		// Navigation from the all-read screen
		if (onAllReadScreen) {
			// Right/j/Down/l: leave screen into browse-all mode
			if (key === '\u001b[C' || key === 'j' || key === '\u001b[B' || key === 'l') {
				onAllReadScreen = false;
				showRead = true;
				currentIndex = 0;
				currentLinkIndex = 0;
				displayCurrentView();
			}
			// Left/Up/Home/End: ignore (nothing before this screen)
			return;
		}

		// Navigation
		let moved = false;

		// Next topic: Right arrow or j
		if (key === '\u001b[C' || key === 'j') {
			let nextIndex = currentIndex + 1;
			// Skip read articles if not showing read AND not all read
			const allRead = getUnreadCount() === 0;
			if (!showRead && !allRead) {
				while (nextIndex < items.length && isTopicRead(diffId, nextIndex)) {
					nextIndex++;
				}
			}
			if (nextIndex < items.length) {
				currentIndex = nextIndex;
				currentLinkIndex = 0; // Reset link index on topic change
				moved = true;
			}
		}

		// Previous topic: Left arrow or k
		if (key === '\u001b[D' || key === 'k') {
			if (currentIndex === 0 && showRead && getUnreadCount() === 0) {
				// At article 0 with all read: go to all-read screen
				onAllReadScreen = true;
				moved = true;
			} else {
				let prevIndex = currentIndex - 1;
				// Skip read articles if not showing read AND not all read
				const allRead = getUnreadCount() === 0;
				if (!showRead && !allRead) {
					while (prevIndex >= 0 && isTopicRead(diffId, prevIndex)) {
						prevIndex--;
					}
				}
				if (prevIndex >= 0) {
					currentIndex = prevIndex;
					currentLinkIndex = 0; // Reset link index on topic change
					moved = true;
				}
			}
		}

		// Next category: Down arrow or l (hidden)
		if (key === '\u001b[B' || key === 'l') {
			const nextIndex = getNextCategoryIndex(items, currentIndex);
			if (nextIndex !== currentIndex) {
				const currentCategory = items[currentIndex].category;
				if (items[nextIndex].category !== currentCategory) {
					if (!showRead && getUnreadCount() > 0) {
						// In unread mode: find first unread in next categories
						for (let i = nextIndex; i < items.length; i++) {
							if (!isTopicRead(diffId, i)) {
								currentIndex = i;
								currentLinkIndex = 0;
								moved = true;
								break;
							}
						}
					} else {
						currentIndex = nextIndex;
						currentLinkIndex = 0;
						moved = true;
					}
				}
			}
		}

		// Previous category: Up arrow or h (hidden)
		if (key === '\u001b[A' || key === 'h') {
			const prevIndex = getPrevCategoryIndex(items, currentIndex);
			// At first category with all read: go to all-read screen
			if (prevIndex === currentIndex && showRead && getUnreadCount() === 0) {
				onAllReadScreen = true;
				moved = true;
			} else if (prevIndex !== currentIndex) {
				const currentCategory = items[currentIndex].category;
				if (items[prevIndex].category !== currentCategory) {
					if (!showRead && getUnreadCount() > 0) {
						// In unread mode: find first unread in prev category
						const prevCategory = items[prevIndex].category;
						let found = false;
						for (let i = prevIndex; i < items.length && items[i].category === prevCategory; i++) {
							if (!isTopicRead(diffId, i)) {
								currentIndex = i;
								currentLinkIndex = 0;
								moved = true;
								found = true;
								break;
							}
						}
						// If no unread in prev category, keep searching backwards
						if (!found) {
							for (let i = prevIndex - 1; i >= 0; i--) {
								if (!isTopicRead(diffId, i)) {
									currentIndex = i;
									currentLinkIndex = 0;
									moved = true;
									break;
								}
							}
						}
					} else {
						currentIndex = prevIndex;
						currentLinkIndex = 0;
						moved = true;
					}
				}
			}
		}

		// Home: jump to first (or all-read screen when all read)
		if (key === '\u001b[H') {
			if (getUnreadCount() === 0) {
				onAllReadScreen = true;
			} else {
				currentIndex = 0;
				currentLinkIndex = 0;
			}
			moved = true;
		}

		// End: jump to last
		if (key === '\u001b[F') {
			currentIndex = items.length - 1;
			currentLinkIndex = 0;
			moved = true;
		}

		if (moved) {
			displayCurrentView();
		}
	};

	process.stdin.on('data', dataHandler);

	// Handle process exit
	const exitHandler = () => {
		cleanup();
		resolve('quit');
	};

	function cleanup() {
		running = false;
		showCursor();
		clearScreen();
		process.stdin.removeListener('data', dataHandler);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
		process.removeListener('SIGINT', exitHandler);
		process.removeListener('SIGTERM', exitHandler);
	}

	process.on('SIGINT', exitHandler);
	process.on('SIGTERM', exitHandler);

	}); // end Promise
}
