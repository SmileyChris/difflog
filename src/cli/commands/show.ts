import { getDiffs, getSession } from '../config';
import { renderMarkdown } from '../render';
import { startInteractive } from '../interactive';
import { formatDiffDate } from '../time';

export function showCommand(args: string[]): void {
	const session = getSession();
	if (!session) {
		process.stderr.write('Not logged in. Run: difflog login\n');
		process.exit(1);
	}

	// Parse arguments
	let query = '';
	let forceFullMode = false;

	for (const arg of args) {
		if (arg === '--full' || arg === '-f') {
			forceFullMode = true;
		} else {
			query = arg;
		}
	}

	if (!query) {
		process.stderr.write('Usage: difflog show <number|id> [--full]\n');
		process.exit(1);
	}

	const diffs = getDiffs();
	if (diffs.length === 0) {
		process.stderr.write('No diffs found.\n');
		process.exit(1);
	}

	let diff;

	// Try as 1-based index
	const idx = parseInt(query, 10);
	if (!isNaN(idx) && idx >= 1 && idx <= diffs.length) {
		diff = diffs[idx - 1];
	} else {
		// Try as UUID prefix match
		const lower = query.toLowerCase();
		const matches = diffs.filter((d) => d.id.toLowerCase().startsWith(lower));
		if (matches.length === 1) {
			diff = matches[0];
		} else if (matches.length > 1) {
			process.stderr.write(`Ambiguous ID prefix "${query}" — matches ${matches.length} diffs.\n`);
			process.exit(1);
		}
	}

	if (!diff) {
		process.stderr.write(`Diff not found: ${query}\n`);
		process.exit(1);
	}

	// Decide on display mode
	// Interactive requires both stdin (for input) and stdout (for output) to be TTY
	const isInteractiveTTY = process.stdin.isTTY && process.stdout.isTTY && !forceFullMode;

	if (isInteractiveTTY) {
		// Interactive mode
		const title = diff.title || `Diff ${diff.generated_at}`;

		// Get window_days from metadata or parse from content as fallback
		let windowDays = diff.window_days;
		if (!windowDays && diff.content) {
			// Parse from content for backward compatibility
			const match = diff.content.match(/Past (\d+) days?|Past 24 hours/i);
			if (match) {
				windowDays = match[1] ? parseInt(match[1], 10) : 1;
			}
		}

		const dateInfo = diff.generated_at ? formatDiffDate(diff.generated_at, windowDays) : '';

		// Calculate diff position in history
		const diffIndex = diffs.findIndex((d) => d.id === diff.id);
		const diffPosition =
			diffIndex >= 0 ? { current: diffIndex + 1, total: diffs.length } : undefined;

		// Check if this diff is from today
		const isTodayDiff = diff.generated_at
			? new Date(diff.generated_at).toDateString() === new Date().toDateString()
			: false;

		startInteractive(diff.id, diff.content, title, dateInfo, diffPosition, isTodayDiff);
	} else {
		// Full mode (piped or --full flag)
		process.stdout.write(renderMarkdown(diff.content) + '\n');
	}
}
