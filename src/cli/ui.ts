import { basename } from 'path';
import { spawn } from 'node:child_process';

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

// --- Terminal utilities ---

/** Clear screen and move cursor to top */
export function clearScreen(): void {
	process.stdout.write('\x1b[2J\x1b[H');
}

/** Hide terminal cursor */
export function hideCursor(): void {
	process.stdout.write('\x1b[?25l');
}

/** Show terminal cursor */
export function showCursor(): void {
	process.stdout.write('\x1b[?25h');
}

/** Open URL in default browser */
export function openUrl(url: string): void {
	const platform = process.platform;
	let command: string;
	let args: string[];

	if (platform === 'darwin') {
		command = 'open';
		args = [url];
	} else if (platform === 'win32') {
		command = 'cmd';
		args = ['/c', 'start', url];
	} else {
		command = 'xdg-open';
		args = [url];
	}

	spawn(command, args, {
		detached: true,
		stdio: 'ignore'
	}).unref();
}

/** Read a line from stdin with raw mode. Returns null on Esc/Ctrl+C. */
export async function readLine(promptText: string, opts?: { mask?: boolean }): Promise<string | null> {
	process.stdout.write(promptText);

	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		const line = typeof value === 'string' ? value : new TextDecoder().decode(value);
		return line.trimEnd();
	}

	const mask = opts?.mask ?? false;
	showCursor();
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
				process.stdout.write('\n');
				hideCursor();
				resolve(buf.join(''));
			} else if (ch === '\x03' || ch === '\x1b') {
				// Ctrl+C or Esc - cancel input
				process.stdin.setRawMode(false);
				process.stdin.pause();
				process.stdin.removeListener('data', onData);
				process.stdout.write('\n');
				hideCursor();
				resolve(null);
			} else if (ch === '\x7f' || ch === '\b') {
				if (buf.length > 0) {
					buf.pop();
					if (!mask) process.stdout.write('\b \b');
				}
			} else {
				buf.push(ch);
				process.stdout.write(mask ? '*' : ch);
			}
		};

		process.stdin.on('data', onData);
	});
}

/** Read a single keypress */
export async function readKey(): Promise<string> {
	if (!process.stdin.isTTY) {
		const reader = process.stdin[Symbol.asyncIterator]();
		const { value } = await reader.next();
		return typeof value === 'string' ? value : new TextDecoder().decode(value);
	}

	return new Promise((resolve) => {
		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding('utf-8');

		const onData = (key: string) => {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener('data', onData);
			resolve(key);
		};

		process.stdin.on('data', onData);
	});
}
