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

/** Copy text to system clipboard. Returns true on success. */
export function copyToClipboard(text: string): boolean {
	const platform = process.platform;
	let command: string;
	let args: string[];

	if (platform === 'darwin') {
		command = 'pbcopy';
		args = [];
	} else if (platform === 'win32') {
		command = 'clip';
		args = [];
	} else {
		command = 'xclip';
		args = ['-selection', 'clipboard'];
	}

	try {
		const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'ignore'] });
		child.stdin!.write(text);
		child.stdin!.end();
		return true;
	} catch {
		return false;
	}
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

// --- Menu loop helper ---

export interface MenuLoopOptions {
	/** Number of items for cursor clamping */
	itemCount: number;
	/** Wrap cursor around (default: false = clamp) */
	wrap?: boolean;
	/** Called on each render with current cursor position */
	render: (cursor: number) => void;
	/** Handle Enter key. Return 'break' to exit loop. */
	onEnter?: (cursor: number) => Promise<void | 'break'> | void | 'break';
	/** Handle Space key. */
	onSpace?: (cursor: number) => void;
	/** Handle Esc. Return 'break' to exit loop. Default: break. */
	onEsc?: (cursor: number) => Promise<void | 'break'> | void | 'break';
	/** Handle Ctrl+C. Return 'break' to exit loop. Default: same as onEsc. */
	onCtrlC?: (cursor: number) => Promise<void | 'break'> | void | 'break';
	/** Handle q key. Return 'break' to exit loop. Default: same as onEsc. */
	onQuit?: (cursor: number) => Promise<void | 'break'> | void | 'break';
	/** Handle horizontal navigation (left/right/h/l). */
	onHorizontal?: (cursor: number, direction: 'left' | 'right') => void;
}

/** Reusable menu loop: renders, reads keys, navigates cursor, delegates actions to callbacks. */
export async function menuLoop(options: MenuLoopOptions, initialCursor = 0): Promise<void> {
	let cursor = initialCursor;
	const { itemCount, wrap = false, render, onEnter, onSpace, onEsc, onCtrlC, onQuit, onHorizontal } = options;

	render(cursor);

	while (true) {
		const key = await readKey();

		if (key === '\u001b[A' || key === 'k') {
			cursor = wrap
				? (cursor === 0 ? itemCount - 1 : cursor - 1)
				: Math.max(0, cursor - 1);
			render(cursor);
		} else if (key === '\u001b[B' || key === 'j') {
			cursor = wrap
				? (cursor === itemCount - 1 ? 0 : cursor + 1)
				: Math.min(itemCount - 1, cursor + 1);
			render(cursor);
		} else if (key === '\u001b[C' || key === 'l') {
			if (onHorizontal) { onHorizontal(cursor, 'right'); render(cursor); }
		} else if (key === '\u001b[D' || key === 'h') {
			if (onHorizontal) { onHorizontal(cursor, 'left'); render(cursor); }
		} else if (key === '\r' || key === '\n') {
			if (onEnter && await onEnter(cursor) === 'break') return;
		} else if (key === ' ') {
			if (onSpace) { onSpace(cursor); render(cursor); }
		} else if (key === '\u001b') {
			const handler = onEsc ?? (() => 'break' as const);
			if (await handler(cursor) === 'break') return;
		} else if (key === '\u0003') {
			const handler = onCtrlC ?? onEsc ?? (() => 'break' as const);
			if (await handler(cursor) === 'break') return;
		} else if (key === 'q') {
			const handler = onQuit ?? onEsc ?? (() => 'break' as const);
			if (await handler(cursor) === 'break') return;
		}
	}
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
