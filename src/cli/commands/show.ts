import { getDiffs, getSession } from '../config';
import { renderMarkdown } from '../render';
import { startInteractive, type InteractiveAction } from '../interactive';
import { formatDiffDate } from '../time';
import { BIN, showHelp } from '../ui';
import { canSync } from '../sync';

export async function showCommand(args: string[]): Promise<InteractiveAction> {
	showHelp(args, `Show a diff by index or UUID prefix

Usage: ${BIN} show <number|id> [flags]

Flags:
  -f, --full           Full output mode (disable interactive navigation)
`);

	const session = getSession();
	if (!session) {
		process.stderr.write(`Not logged in. Run: ${BIN} login\n`);
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
		process.stderr.write(`Usage: ${BIN} show <number|id> [--full]\n`);
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
		let currentDiffIndex = diffs.findIndex((d) => d.id === diff.id);
		if (currentDiffIndex < 0) currentDiffIndex = 0;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			const currentDiff = diffs[currentDiffIndex];
			const title = currentDiff.title || `Diff ${currentDiff.generated_at}`;

			// Get window_days from metadata or parse from content as fallback
			let windowDays = currentDiff.window_days;
			if (!windowDays && currentDiff.content) {
				const match = currentDiff.content.match(/Past (\d+) days?|Past 24 hours/i);
				if (match) {
					windowDays = match[1] ? parseInt(match[1], 10) : 1;
				}
			}

			const dateInfo = currentDiff.generated_at ? formatDiffDate(currentDiff.generated_at, windowDays) : '';
			const diffPosition = { current: currentDiffIndex + 1, total: diffs.length };
			const isTodayDiff = currentDiff.generated_at
				? new Date(currentDiff.generated_at).toDateString() === new Date().toDateString()
				: false;

			const action = await startInteractive(currentDiff.id, currentDiff.content, title, dateInfo, diffPosition, isTodayDiff, currentDiff.isPublic ?? false, canSync());

			if (action === 'prev-diff') {
				currentDiffIndex++;
				continue;
			}
			if (action === 'next-diff') {
				currentDiffIndex--;
				continue;
			}
			return action;
		}
	} else {
		// Full mode (piped or --full flag)
		process.stdout.write(renderMarkdown(diff.content) + '\n');
		return 'quit';
	}
}
