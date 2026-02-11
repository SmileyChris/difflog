import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'difflog');

function ensureDir(): void {
	mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

function readJson<T>(filename: string): T | null {
	try {
		return JSON.parse(readFileSync(join(CONFIG_DIR, filename), 'utf-8'));
	} catch {
		return null;
	}
}

function writeJson(filename: string, data: unknown): void {
	ensureDir();
	writeFileSync(join(CONFIG_DIR, filename), JSON.stringify(data, null, 2), { mode: 0o600 });
}

function removeFile(filename: string): void {
	try {
		unlinkSync(join(CONFIG_DIR, filename));
	} catch {
		// ignore if not exists
	}
}

// Session

export interface Session {
	profileId: string;
	password: string;
	passwordSalt: string;
	salt: string;
}

export function getSession(): Session | null {
	return readJson<Session>('session.json');
}

export function saveSession(session: Session): void {
	writeJson('session.json', session);
}

export function clearSession(): void {
	removeFile('session.json');
	removeFile('profile.json');
	removeFile('diffs.json');
}

// Profile

export interface Profile {
	id: string;
	name: string;
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	depth: string;
	customFocus: string;
}

export function getProfile(): Profile | null {
	return readJson<Profile>('profile.json');
}

export function saveProfile(profile: Profile): void {
	writeJson('profile.json', profile);
}

// Diffs

export interface Diff {
	id: string;
	content: string;
	generated_at: string;
	title?: string;
	duration_seconds?: number;
	cost?: number;
	isPublic?: boolean;
	window_days?: number;
}

export function getDiffs(): Diff[] {
	return readJson<Diff[]>('diffs.json') || [];
}

export function saveDiffs(diffs: Diff[]): void {
	writeJson('diffs.json', diffs);
}
