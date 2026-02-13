import { basename } from 'path';

// Binary name: reflects actual invocation (compiled binary name, or 'bun cli' when run via bun)
const argv0 = basename(process.argv[0]);
export const BIN = ['bun', 'node'].includes(argv0) ? 'bun cli' : argv0;

// ANSI codes
export const RESET = '\x1b[0m';
export const DIM = '\x1b[2m';
export const BOLD = '\x1b[1m';
export const ITALIC = '\x1b[3m';
export const UNDERLINE = '\x1b[4m';
export const CYAN = '\x1b[36m';
export const GREEN = '\x1b[32m';
export const RED = '\x1b[31m';
export const YELLOW = '\x1b[33m';
export const BLUE = '\x1b[34m';
export const MAGENTA = '\x1b[35m';
export const BRIGHT_YELLOW = '\x1b[93m';
export const BRIGHT_BLUE = '\x1b[94m';

// Keychain service name
export const SERVICE_NAME = 'difflog-cli';

/** Print help text and exit if args contain --help or -h */
export function showHelp(args: string[], text: string): void {
	if (args.includes('--help') || args.includes('-h')) {
		process.stdout.write(text);
		process.exit(0);
	}
}

/** Read a line from stdin. Uses raw mode for masked input when isTTY. */
export async function prompt(label: string, mask = false): Promise<string> {
	process.stderr.write(label);

	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		const line = typeof value === 'string' ? value : new TextDecoder().decode(value);
		return line.trimEnd();
	}

	return new Promise((resolve) => {
		const buf: string[] = [];
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (ch: string) => {
			if (ch === '\r' || ch === '\n') {
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.removeListener('data', onData);
				process.stderr.write('\n');
				resolve(buf.join(''));
			} else if (ch === '\x03') {
				process.stdin.setRawMode(false);
				process.stderr.write('\n');
				process.exit(130);
			} else if (ch === '\x7f' || ch === '\b') {
				if (buf.length > 0) {
					buf.pop();
					if (mask) process.stderr.write('\b \b');
				}
			} else {
				buf.push(ch);
				process.stderr.write(mask ? '*' : ch);
			}
		};

		process.stdin.on('data', onData);
	});
}
