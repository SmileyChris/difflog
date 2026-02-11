/**
 * Interactive diff viewer with keyboard navigation.
 */

import { renderMarkdown } from './render';
import { parseDiff, flattenTopics } from './parser';

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

/**
 * Clear screen and move cursor to top
 */
function clearScreen() {
	process.stdout.write('\x1b[2J\x1b[H');
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
	categoryHeader: string,
	topicLines: string[],
	index: number,
	total: number
): void {
	clearScreen();

	// Render category header
	process.stdout.write(renderMarkdown(categoryHeader) + '\n');

	// Visual separator
	process.stdout.write(`${DIM}${'─'.repeat(60)}${RESET}\n\n`);

	// Render topic content
	const topicMarkdown = topicLines.join('\n');
	process.stdout.write(renderMarkdown(topicMarkdown) + '\n\n');

	// Navigation hints
	const progress = `${DIM}[${index + 1}/${total}]${RESET}`;
	const nav = `${DIM}←/↑/k prev  →/↓/j next  home/end jump  q quit  f full${RESET}`;
	process.stdout.write(`\n${progress} ${nav}\n`);
}

/**
 * Start interactive viewer
 */
export function startInteractive(markdown: string): void {
	const parsed = parseDiff(markdown);
	const items = flattenTopics(parsed);

	if (items.length === 0) {
		process.stderr.write('No topics found in diff.\n');
		process.exit(1);
	}

	let currentIndex = 0;
	let running = true;

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

	// Display first topic
	const item = items[currentIndex];
	displayTopic(item.category.header, item.topic.lines, currentIndex, items.length);

	// Handle keypresses
	const dataHandler = (key: string) => {
		if (!running) return;

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

		// Navigation
		let moved = false;

		// Next: Right arrow, Down arrow, or j
		if (key === '\u001b[C' || key === '\u001b[B' || key === 'j') {
			currentIndex = (currentIndex + 1) % items.length;
			moved = true;
		}

		// Previous: Left arrow, Up arrow, or k
		if (key === '\u001b[D' || key === '\u001b[A' || key === 'k') {
			currentIndex = (currentIndex - 1 + items.length) % items.length;
			moved = true;
		}

		// Home: jump to first
		if (key === '\u001b[H') {
			currentIndex = 0;
			moved = true;
		}

		// End: jump to last
		if (key === '\u001b[F') {
			currentIndex = items.length - 1;
			moved = true;
		}

		if (moved) {
			const item = items[currentIndex];
			displayTopic(item.category.header, item.topic.lines, currentIndex, items.length);
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
