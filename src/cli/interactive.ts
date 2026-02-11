/**
 * Interactive diff viewer with keyboard navigation.
 */

import { spawn } from 'node:child_process';
import { renderMarkdown } from './render';
import { parseDiff, flattenTopics, type Topic } from './parser';
import { isTopicRead, markTopicRead, toggleTopicRead } from './config';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';
const UNDERLINE = '\x1b[4m';
const GREEN = '\x1b[32m';
const BRIGHT_YELLOW = '\x1b[93m';

/**
 * Open URL in default browser
 */
function openUrl(url: string): void {
	const platform = process.platform;
	let command: string;
	let args: string[];

	if (platform === 'darwin') {
		command = 'open';
		args = [url];
	} else if (platform === 'win32') {
		command = 'cmd';
		args = ['/c', 'start', url];
	} else {
		command = 'xdg-open';
		args = [url];
	}

	// Spawn detached process so it doesn't block
	spawn(command, args, {
		detached: true,
		stdio: 'ignore'
	}).unref();
}

/**
 * Clear screen and move cursor to top
 */
function clearScreen() {
	process.stdout.write('\x1b[2J\x1b[H');
}

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
	process.stdout.write(`  ${CYAN}End${RESET}        Last article\n\n`);
	process.stdout.write(`${DIM}Reading${RESET}\n`);
	process.stdout.write(`  ${CYAN}Space${RESET}      Mark as read & jump to next\n`);
	process.stdout.write(`  ${CYAN}a${RESET}          Toggle show/hide read articles\n\n`);
	process.stdout.write(`${DIM}Links${RESET}\n`);
	process.stdout.write(`  ${CYAN}Tab${RESET}        Cycle through links\n`);
	process.stdout.write(`  ${CYAN}Enter${RESET}      Open link in browser\n\n`);
	process.stdout.write(`${DIM}View${RESET}\n`);
	process.stdout.write(`  ${CYAN}f${RESET}          Show full diff\n`);
	process.stdout.write(`  ${CYAN}q  Esc${RESET}     Quit\n\n`);
	process.stdout.write(`${DIM}Press any key to return${RESET}\n`);
}

/**
 * Hide cursor
 */
function hideCursor() {
	process.stdout.write('\x1b[?25l');
}

/**
 * Show cursor
 */
function showCursor() {
	process.stdout.write('\x1b[?25h');
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
	currentUnreadPos: number = 0
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
		process.stdout.write(`${DIM}${dateInfo}${RESET}\n`);
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

/**
 * Start interactive viewer
 */
export function startInteractive(
	diffId: string,
	markdown: string,
	diffTitle: string,
	dateInfo: string = '',
	diffPosition?: { current: number; total: number },
	isTodayDiff: boolean = false
): void {
	const parsed = parseDiff(markdown);
	const allItems = flattenTopics(parsed);

	// Filter to only show topics with links
	const items = allItems.filter((item) => item.topic.links.length > 0);

	if (items.length === 0) {
		process.stderr.write('No topics with links found in diff.\n');
		process.exit(1);
	}

	let currentIndex = 0;
	let currentLinkIndex = 0;
	let running = true;
	let showingHelp = false;
	let showRead = false; // Toggle to show/hide read topics

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
			currentUnreadPos
		);
	}

	// Check if all articles are read
	const unreadCount = getUnreadCount();
	const allRead = unreadCount === 0;

	// Display first topic (or first unread if hiding read)
	if (!showRead && !allRead) {
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

		// If showing help, any key returns to normal view
		if (showingHelp) {
			showingHelp = false;
			const item = items[currentIndex];
			const categoryPos = getCategoryTopicIndex(items, currentIndex);
			const categoryNav = getCategoryNavigation(items, currentIndex);
			const unreadCount = getUnreadCount();
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
				currentUnreadPos
			);
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
			process.exit(0);
		}

		// Full mode (f)
		if (key === 'f') {
			cleanup();
			// Show full markdown
			process.stdout.write(renderMarkdown(markdown) + '\n');
			process.exit(0);
		}

		// Open link (Enter)
		if (key === '\r' || key === '\n') {
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
				}
			}
			displayCurrentView();
			return;
		}

		// Toggle show/hide read articles with 'a' key
		if (key === 'a') {
			showRead = !showRead;
			// If toggling to hide-read mode, jump to first unread (if any)
			if (!showRead) {
				currentIndex = 0;
				while (currentIndex < items.length && isTopicRead(diffId, currentIndex)) {
					currentIndex++;
				}
				// Reset to first article if all read
				if (currentIndex >= items.length) {
					currentIndex = 0;
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
				const categoryPos = getCategoryTopicIndex(items, currentIndex);
				const categoryNav = getCategoryNavigation(items, currentIndex);
				const unreadCount = getUnreadCount();
				const currentUnreadPos = getCurrentUnreadPosition();
				displayTopic(
					diffTitle,
					dateInfo,
					currentItem.category.header,
					categoryPos.index,
					categoryPos.total,
					currentItem.topic,
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
					currentUnreadPos
				);
			}
			return;
		}

		// Shift+Tab: cycle backwards through links
		if (key === '\x1b[Z') {
			const currentItem = items[currentIndex];
			if (currentItem.topic.links.length > 1) {
				currentLinkIndex =
					(currentLinkIndex - 1 + currentItem.topic.links.length) % currentItem.topic.links.length;
				const categoryPos = getCategoryTopicIndex(items, currentIndex);
				const categoryNav = getCategoryNavigation(items, currentIndex);
				const unreadCount = getUnreadCount();
				const currentUnreadPos = getCurrentUnreadPosition();
				displayTopic(
					diffTitle,
					dateInfo,
					currentItem.category.header,
					categoryPos.index,
					categoryPos.total,
					currentItem.topic,
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
					currentUnreadPos
				);
			}
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

		// Next unread in category: Down arrow or l (hidden)
		if (key === '\u001b[B' || key === 'l') {
			const allRead = getUnreadCount() === 0;
			if (!showRead && !allRead) {
				// In unread mode: find next unread article in same category
				const currentCategory = items[currentIndex].category;
				let nextIndex = currentIndex + 1;
				while (nextIndex < items.length && items[nextIndex].category === currentCategory) {
					if (!isTopicRead(diffId, nextIndex)) {
						currentIndex = nextIndex;
						currentLinkIndex = 0;
						moved = true;
						break;
					}
					nextIndex++;
				}
			} else {
				// In show-all mode: navigate to next category
				const nextIndex = getNextCategoryIndex(items, currentIndex);
				if (nextIndex !== currentIndex) {
					const currentCategory = items[currentIndex].category;
					const nextCategory = items[nextIndex].category;
					if (nextCategory !== currentCategory) {
						currentIndex = nextIndex;
						currentLinkIndex = 0;
						moved = true;
					}
				}
			}
		}

		// Previous unread in category: Up arrow or h (hidden)
		if (key === '\u001b[A' || key === 'h') {
			const allRead = getUnreadCount() === 0;
			if (!showRead && !allRead) {
				// In unread mode: find previous unread article in same category
				const currentCategory = items[currentIndex].category;
				let prevIndex = currentIndex - 1;
				while (prevIndex >= 0 && items[prevIndex].category === currentCategory) {
					if (!isTopicRead(diffId, prevIndex)) {
						currentIndex = prevIndex;
						currentLinkIndex = 0;
						moved = true;
						break;
					}
					prevIndex--;
				}
			} else {
				// In show-all mode: navigate to previous category
				const prevIndex = getPrevCategoryIndex(items, currentIndex);
				if (prevIndex !== currentIndex) {
					const currentCategory = items[currentIndex].category;
					const prevCategory = items[prevIndex].category;
					if (prevCategory !== currentCategory) {
						currentIndex = prevIndex;
						currentLinkIndex = 0;
						moved = true;
					}
				}
			}
		}

		// Home: jump to first
		if (key === '\u001b[H') {
			currentIndex = 0;
			currentLinkIndex = 0;
			moved = true;
		}

		// End: jump to last
		if (key === '\u001b[F') {
			currentIndex = items.length - 1;
			currentLinkIndex = 0;
			moved = true;
		}

		if (moved) {
			const item = items[currentIndex];
			const categoryPos = getCategoryTopicIndex(items, currentIndex);
			const categoryNav = getCategoryNavigation(items, currentIndex);
			const unreadCount = getUnreadCount();
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
				currentUnreadPos
			);
		}
	};

	process.stdin.on('data', dataHandler);

	function cleanup() {
		running = false;
		showCursor();
		clearScreen();
		process.stdin.removeListener('data', dataHandler);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(false);
		}
		process.stdin.pause();
	}

	// Handle process exit
	const exitHandler = () => {
		cleanup();
		process.exit(0);
	};

	process.on('SIGINT', exitHandler);
	process.on('SIGTERM', exitHandler);
}
