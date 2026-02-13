/**
 * Markdown-to-ANSI terminal renderer.
 * Handles headers, rules, list items, bold, inline code, and links.
 */

import { RESET, BOLD, DIM, ITALIC, UNDERLINE, CYAN, YELLOW, GREEN, MAGENTA, BRIGHT_BLUE } from './ui';

/** Apply inline formatting: bold, code, links */
function formatInline(text: string, highlightLinkIndex?: number): string {
	let linkCount = 0;

	// Links: [text](url) → text (underlined) + url in dim
	text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
		const isHighlighted = highlightLinkIndex !== undefined && linkCount === highlightLinkIndex;
		linkCount++;

		if (isHighlighted) {
			// Highlighted link: bright blue, bold, underlined
			return `\x1b]8;;${url}\x07${BRIGHT_BLUE}${BOLD}${UNDERLINE}${label}${RESET}\x1b]8;;\x07`;
		} else {
			// Regular link: underlined
			return `\x1b]8;;${url}\x07${UNDERLINE}${label}${RESET}\x1b]8;;\x07`;
		}
	});

	// Bold: **text** or __text__
	text = text.replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}`);
	text = text.replace(/__([^_]+)__/g, `${BOLD}$1${RESET}`);

	// Italic: *text* or _text_ (single)
	text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `${ITALIC}$1${RESET}`);

	// Inline code: `text`
	text = text.replace(/`([^`]+)`/g, `${YELLOW}$1${RESET}`);

	return text;
}

/** Render a full markdown string to ANSI-colored terminal output */
export function renderMarkdown(
	markdown: string,
	highlightLinkIndex?: number,
	interactive: boolean = false
): string {
	const lines = markdown.split('\n');
	const output: string[] = [];
	let inCodeBlock = false;

	for (const line of lines) {
		// Code blocks
		if (line.startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			if (inCodeBlock) {
				output.push(`${DIM}${'─'.repeat(40)}${RESET}`);
			} else {
				output.push(`${DIM}${'─'.repeat(40)}${RESET}`);
			}
			continue;
		}

		if (inCodeBlock) {
			output.push(`${DIM}  ${line}${RESET}`);
			continue;
		}

		// Horizontal rule
		if (/^---+$/.test(line.trim())) {
			output.push(`${DIM}${'─'.repeat(60)}${RESET}`);
			continue;
		}

		// Headers
		const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
		if (headerMatch) {
			const level = headerMatch[1].length;
			const text = headerMatch[2];
			if (level === 1) {
				output.push('');
				output.push(`${BOLD}${CYAN}${text}${RESET}`);
				output.push(`${CYAN}${'═'.repeat(text.length)}${RESET}`);
			} else if (level === 2) {
				output.push('');
				output.push(`${BOLD}${GREEN}${text}${RESET}`);
			} else {
				output.push('');
				output.push(`${BOLD}${MAGENTA}${text}${RESET}`);
			}
			continue;
		}

		// List items
		if (line.match(/^\s*[-*]\s/)) {
			const content = line.replace(/^\s*[-*]\s/, '');
			if (interactive) {
				// In interactive mode, just show the content without bullets
				output.push(formatInline(content, highlightLinkIndex));
			} else {
				const indent = line.match(/^(\s*)/)?.[1] || '';
				output.push(`${indent}  ${DIM}•${RESET} ${formatInline(content, highlightLinkIndex)}`);
			}
			continue;
		}

		// Numbered list items
		if (line.match(/^\s*\d+\.\s/)) {
			const match = line.match(/^(\s*)(\d+)\.\s(.+)/);
			if (match) {
				output.push(`${match[1]}  ${DIM}${match[2]}.${RESET} ${formatInline(match[3], highlightLinkIndex)}`);
				continue;
			}
		}

		// Empty lines
		if (line.trim() === '') {
			output.push('');
			continue;
		}

		// Regular paragraph text
		output.push(formatInline(line, highlightLinkIndex));
	}

	return output.join('\n');
}
