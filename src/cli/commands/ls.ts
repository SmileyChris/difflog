import { getDiffs, getSession } from '../config';
import { timeAgo } from '../time';

export function lsCommand(): void {
	const session = getSession();
	if (!session) {
		process.stderr.write('Not logged in. Run: difflog login\n');
		process.exit(1);
	}

	const diffs = getDiffs();
	if (diffs.length === 0) {
		process.stderr.write('No diffs found.\n');
		process.exit(0);
	}

	// Column widths
	const idxWidth = String(diffs.length).length;

	for (let i = 0; i < diffs.length; i++) {
		const diff = diffs[i];
		const idx = String(i + 1).padStart(idxWidth);
		const ago = timeAgo(diff.generated_at);
		const title = diff.title || diff.content.split('\n').find(l => l.startsWith('# '))?.replace(/^#\s+/, '') || 'Untitled';

		process.stdout.write(`  ${idx}  ${ago.padEnd(16)}  ${title}\n`);
	}
}
