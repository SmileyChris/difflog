import { getDiffs, getStars, getReadState, type Diff, type Star } from '../config';
import { parseDiff, flattenTopics } from '../parser';
import { timeAgo } from '../time';
import { RESET, DIM, BOLD, CYAN, BRIGHT_YELLOW, clearScreen, hideCursor, showCursor, readKey } from '../ui';

export type ArchiveAction = 'quit' | 'back' | 'open-diff' | 'generate';

export interface ArchiveResult {
	action: ArchiveAction;
	diffIndex?: number;  // 1-based index for show command
	topicIndex?: number; // p_index to focus on (from star)
}

type Row =
	| { type: 'diff'; diffIdx: number; diff: Diff; selectable: boolean }
	| { type: 'star'; diffIdx: number; diff: Diff; star: Star; selectable: boolean };

/** Get the first line of a topic at p_index from diff content */
function getStarSnippet(diff: Diff, pIndex: number): string {
	const parsed = parseDiff(diff.content);
	const items = flattenTopics(parsed);
	if (pIndex >= items.length) return 'Unknown article';
	const firstLine = items[pIndex].topic.lines[0] || '';
	return firstLine
		.replace(/^\s*[-*]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/`([^`]+)`/g, '$1');
}

/** Get unread count for a diff */
function getUnreadCount(diffId: string, totalTopics: number): number {
	const readState = getReadState();
	const readTopics = readState[diffId] ?? [];
	return totalTopics - readTopics.length;
}

/** Get total topic count (with links) for a diff */
function getTopicCount(diff: Diff): number {
	const parsed = parseDiff(diff.content);
	return flattenTopics(parsed).filter(item => item.topic.links.length > 0).length;
}

// Persist state across archive visits within a session
let persistedShowStars = false;
let persistedCursor = 0;

export async function archiveCommand(): Promise<ArchiveResult> {
	const diffs = getDiffs();
	if (diffs.length === 0) {
		process.stderr.write('No diffs found.\n');
		return { action: 'quit' };
	}

	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		for (let i = 0; i < diffs.length; i++) {
			const diff = diffs[i];
			const title = diff.title || 'Untitled';
			const ago = timeAgo(diff.generated_at);
			process.stdout.write(`  ${i + 1}  ${ago.padEnd(16)}  ${title}\n`);
		}
		return { action: 'quit' };
	}

	let cursor = persistedCursor;
	let showStars = persistedShowStars;
	let allStars: Star[] = [];
	let starsByDiff: Map<string, Star[]> = new Map();

	function refreshStars() {
		allStars = getStars();
		starsByDiff = new Map();
		for (const star of allStars) {
			if (!diffs.some(d => d.id === star.diff_id)) continue;
			const list = starsByDiff.get(star.diff_id) || [];
			list.push(star);
			starsByDiff.set(star.diff_id, list);
		}
	}

	function buildRows(): Row[] {
		const rows: Row[] = [];
		if (showStars) {
			// Stars mode: only diffs with stars, stars are selectable, diffs are headers
			for (let i = 0; i < diffs.length; i++) {
				const diff = diffs[i];
				const diffStars = starsByDiff.get(diff.id) || [];
				if (diffStars.length === 0) continue;

				rows.push({ type: 'diff', diffIdx: i, diff, selectable: false });
				for (const star of diffStars) {
					rows.push({ type: 'star', diffIdx: i, diff, star, selectable: true });
				}
			}
		} else {
			// Diffs mode: all diffs, all selectable
			for (let i = 0; i < diffs.length; i++) {
				rows.push({ type: 'diff', diffIdx: i, diff: diffs[i], selectable: true });
			}
		}
		return rows;
	}

	/** Move cursor to the next selectable row in the given direction */
	function moveCursor(rows: Row[], direction: -1 | 1) {
		let next = cursor + direction;
		while (next >= 0 && next < rows.length && !rows[next].selectable) {
			next += direction;
		}
		if (next >= 0 && next < rows.length) cursor = next;
	}

	/** Snap cursor to nearest selectable row */
	function snapCursor(rows: Row[]) {
		if (rows.length === 0) return;
		if (rows[cursor]?.selectable) return;
		// Search forward then backward
		for (let i = cursor; i < rows.length; i++) {
			if (rows[i].selectable) { cursor = i; return; }
		}
		for (let i = cursor; i >= 0; i--) {
			if (rows[i].selectable) { cursor = i; return; }
		}
		cursor = 0;
	}

	function render(rows: Row[]) {
		clearScreen();

		// Header
		const starCount = allStars.length;
		if (showStars) {
			const diffLabel = `${DIM}${diffs.length} ${RESET}${CYAN}d${RESET}${DIM}iff${diffs.length === 1 ? '' : 's'}${RESET}`;
			const starLabel = `${BRIGHT_YELLOW}${starCount} star${starCount === 1 ? '' : 's'}${RESET}`;
			process.stdout.write(`${BOLD}Archive${RESET}  ${diffLabel} ${DIM}·${RESET} ${starLabel}\n\n`);
		} else {
			const diffLabel = `${DIM}${diffs.length} diff${diffs.length === 1 ? '' : 's'}${RESET}`;
			const starLabel = `${DIM}${starCount} ${RESET}${CYAN}s${RESET}${DIM}tar${starCount === 1 ? '' : 's'}${RESET}`;
			process.stdout.write(`${BOLD}Archive${RESET}  ${diffLabel} ${DIM}·${RESET} ${starLabel}\n\n`);
		}

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const isSelected = cursor === i;

			if (row.type === 'diff') {
				const { diff } = row;
				const title = diff.title || 'Untitled';
				const ago = timeAgo(diff.generated_at);

				if (showStars) {
					// Non-selectable header in stars mode
					process.stdout.write(`  ${BOLD}${title}${RESET}  ${DIM}${ago}${RESET}\n`);
				} else {
					const topicCount = getTopicCount(diff);
					const unread = getUnreadCount(diff.id, topicCount);
					const pointer = isSelected ? `${CYAN}>${RESET} ` : '  ';
					const titleStr = isSelected ? `${BOLD}${title}${RESET}` : title;
					const unreadStr = unread > 0 ? `  ${DIM}${unread} unread${RESET}` : '';
					const publicStr = diff.isPublic ? `  ${CYAN}public${RESET}` : '';

					process.stdout.write(`${pointer}${titleStr}  ${DIM}${ago}${RESET}${unreadStr}${publicStr}\n`);
				}
			} else {
				const { diff, star } = row;
				const snippet = getStarSnippet(diff, star.p_index);
				const cols = process.stdout.columns || 80;
				const maxSnippet = cols - 8;
				const truncated = snippet.length > maxSnippet
					? snippet.slice(0, maxSnippet - 1) + '\u2026'
					: snippet;

				const pointer = isSelected ? `${CYAN}>${RESET}   ` : '    ';
				const starIcon = `${BRIGHT_YELLOW}★${RESET} `;
				const snippetStr = isSelected ? `${BOLD}${truncated}${RESET}` : `${DIM}${truncated}${RESET}`;

				process.stdout.write(`${pointer}${starIcon}${snippetStr}\n`);
			}
		}

		if (rows.length === 0) {
			process.stdout.write(`${DIM}  No stars yet${RESET}\n`);
		}
	}

	refreshStars();
	let rows = buildRows();
	if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
	snapCursor(rows);
	hideCursor();
	render(rows);

	try {
		while (true) {
			const key = await readKey();

			// Esc / a: go back to viewer
			if (key === '\u001b' || key === 'a') {
				persistedShowStars = showStars; persistedCursor = cursor;
				return { action: 'back' };
			}

			// q / Ctrl+C: quit
			if (key === 'q' || key === '\u0003') {
				persistedShowStars = showStars; persistedCursor = cursor;
				return { action: 'quit' };
			}

			if (key === 'g') {
				persistedShowStars = showStars; persistedCursor = cursor;
				return { action: 'generate' };
			}

			// Toggle: 's' for stars, 'd' for diffs
			if ((key === 's' && !showStars) || (key === 'd' && showStars)) {
				showStars = !showStars;
				if (showStars) refreshStars();
				rows = buildRows();
				cursor = 0;
				snapCursor(rows);
				render(rows);
				continue;
			}

			// Navigate up
			if (key === '\u001b[A' || key === 'k') {
				moveCursor(rows, -1);
				render(rows);
				continue;
			}

			// Navigate down
			if (key === '\u001b[B' || key === 'j') {
				moveCursor(rows, 1);
				render(rows);
				continue;
			}

			// Home
			if (key === '\u001b[H') {
				cursor = 0;
				snapCursor(rows);
				render(rows);
				continue;
			}

			// End
			if (key === '\u001b[F') {
				cursor = rows.length - 1;
				snapCursor(rows);
				render(rows);
				continue;
			}

			// Enter: open diff
			if (key === '\r' || key === '\n') {
				const row = rows[cursor];
				if (row?.selectable) {
					persistedShowStars = showStars; persistedCursor = cursor;
					const topicIndex = row.type === 'star' ? row.star.p_index : undefined;
					return { action: 'open-diff', diffIndex: row.diffIdx + 1, topicIndex };
				}
				continue;
			}
		}
	} finally {
		showCursor();
		clearScreen();
	}
}
