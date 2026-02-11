import { getDiffs, getSession } from '../config';
import { renderMarkdown } from '../render';
import { startInteractive } from '../interactive';

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
		startInteractive(diff.content);
	} else {
		// Full mode (piped or --full flag)
		process.stdout.write(renderMarkdown(diff.content) + '\n');
	}
}
