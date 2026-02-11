/**
 * Parse markdown diffs into structured categories and topics.
 */

export interface Topic {
	content: string; // The full bullet point content (including list marker)
	lines: string[]; // Multi-line topic content
	links: Array<{ text: string; url: string }>; // All links in the topic
}

export interface Category {
	header: string; // e.g., "## 🔓 Open Source Wins"
	topics: Topic[];
}

export interface ParsedDiff {
	preamble: string; // Everything before first category
	categories: Category[];
}

/**
 * Extract all markdown links from text
 */
function extractLinks(text: string): Array<{ text: string; url: string }> {
	const links: Array<{ text: string; url: string }> = [];
	const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
	let match;

	while ((match = linkRegex.exec(text)) !== null) {
		links.push({ text: match[1], url: match[2] });
	}

	return links;
}

/**
 * Parse a markdown diff into categories and topics.
 */
export function parseDiff(markdown: string): ParsedDiff {
	const lines = markdown.split('\n');
	const categories: Category[] = [];
	let preamble: string[] = [];
	let currentCategory: Category | null = null;
	let currentTopic: Topic | null = null;

	for (const line of lines) {
		// Check for ## header (category)
		if (line.match(/^##\s+/)) {
			// Save previous topic if exists
			if (currentTopic && currentCategory) {
				currentCategory.topics.push(currentTopic);
				currentTopic = null;
			}

			// Save previous category if exists
			if (currentCategory) {
				categories.push(currentCategory);
			}

			// Start new category
			currentCategory = {
				header: line,
				topics: []
			};
			continue;
		}

		// Check for bullet point (topic start)
		if (line.match(/^\s*[-*]\s/) && currentCategory) {
			// Save previous topic if exists
			if (currentTopic) {
				// Extract all links from complete topic
				const allText = currentTopic.lines.join('\n');
				currentTopic.links = extractLinks(allText);
				currentCategory.topics.push(currentTopic);
			}

			// Start new topic
			currentTopic = {
				content: line,
				lines: [line],
				links: []
			};
			continue;
		}

		// Continuation of current topic (indented or blank line after topic)
		if (currentTopic) {
			currentTopic.lines.push(line);
			continue;
		}

		// Before first category: preamble
		if (!currentCategory) {
			preamble.push(line);
		}
	}

	// Save final topic and category
	if (currentTopic && currentCategory) {
		// Extract all links from complete topic
		const allText = currentTopic.lines.join('\n');
		currentTopic.links = extractLinks(allText);
		currentCategory.topics.push(currentTopic);
	}
	if (currentCategory) {
		categories.push(currentCategory);
	}

	return {
		preamble: preamble.join('\n'),
		categories
	};
}

/**
 * Flatten categories into a list of (category, topic) pairs for navigation.
 */
export function flattenTopics(parsed: ParsedDiff): Array<{ category: Category; topic: Topic }> {
	const items: Array<{ category: Category; topic: Topic }> = [];

	for (const category of parsed.categories) {
		for (const topic of category.topics) {
			items.push({ category, topic });
		}
	}

	return items;
}
