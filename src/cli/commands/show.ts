import { getDiffs, getSession } from '../config';
import { renderMarkdown } from '../render';

export function showCommand(args: string[]): void {
	const session = getSession();
	if (!session) {
		process.stderr.write('Not logged in. Run: difflog login\n');
		process.exit(1);
	}

	const query = args[0];
	if (!query) {
		process.stderr.write('Usage: difflog show <number|id>\n');
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
		const matches = diffs.filter(d => d.id.toLowerCase().startsWith(lower));
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

	process.stdout.write(renderMarkdown(diff.content) + '\n');
}
