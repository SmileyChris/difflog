import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getPassword } from 'cross-keychain';
import { PROVIDER_IDS } from '../lib/utils/providers';
import { SERVICE_NAME } from './ui';
import type { Diff, ProfileCore, PendingChanges as SharedPendingChanges, ResolvedMapping } from '../lib/types/sync';

export type { Diff } from '../lib/types/sync';

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

// API keys

export async function getConfiguredKeys(): Promise<Set<string>> {
	const configured = new Set<string>();
	for (const provider of PROVIDER_IDS) {
		try {
			const key = await getPassword(SERVICE_NAME, provider);
			if (key) configured.add(provider);
		} catch {
			// Not configured
		}
	}
	return configured;
}

export async function getApiKeys(): Promise<Record<string, string>> {
	const keys: Record<string, string> = {};
	for (const provider of PROVIDER_IDS) {
		try {
			const key = await getPassword(SERVICE_NAME, provider);
			if (key) { keys[provider] = key; continue; }
		} catch { /* skip */ }
		const envVar = `${provider.toUpperCase()}_API_KEY`;
		if (process.env[envVar]) keys[provider] = process.env[envVar]!;
	}
	return keys;
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
	removeFile('pending.json');
	removeFile('sync-meta.json');
}

export function clearAll(): void {
	removeFile('session.json');
	removeFile('profile.json');
	removeFile('diffs.json');
	removeFile('read-state.json');
	removeFile('pending.json');
	removeFile('sync-meta.json');
}

// Profile

export interface Profile extends ProfileCore {
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	resolvedMappings?: Record<string, ResolvedMapping>;
}

export function getProfile(): Profile | null {
	return readJson<Profile>('profile.json');
}

export function saveProfile(profile: Profile): void {
	writeJson('profile.json', profile);
}

export function clearProviderSelections(provider: string): void {
	const profile = getProfile();
	if (!profile?.providerSelections) return;
	const sel = profile.providerSelections;
	let changed = false;
	if (sel.search === provider) { sel.search = null; changed = true; }
	if (sel.curation === provider) { sel.curation = null; changed = true; }
	if (sel.synthesis === provider) { sel.synthesis = null; changed = true; }
	if (changed) saveProfile(profile);
}

// Diffs

export function getDiffs(): Diff[] {
	return readJson<Diff[]>('diffs.json') || [];
}

export function saveDiffs(diffs: Diff[]): void {
	writeJson('diffs.json', diffs);
}

// Read state

export interface ReadState {
	// Map of diffId to set of read topic indices
	[diffId: string]: number[];
}

export function getReadState(): ReadState {
	return readJson<ReadState>('read-state.json') || {};
}

export function saveReadState(state: ReadState): void {
	writeJson('read-state.json', state);
}

export function isTopicRead(diffId: string, topicIndex: number): boolean {
	const state = getReadState();
	return state[diffId]?.includes(topicIndex) ?? false;
}

export function markTopicRead(diffId: string, topicIndex: number): void {
	const state = getReadState();
	if (!state[diffId]) {
		state[diffId] = [];
	}
	if (!state[diffId].includes(topicIndex)) {
		state[diffId].push(topicIndex);
		saveReadState(state);
	}
}

export function toggleTopicRead(diffId: string, topicIndex: number): boolean {
	const state = getReadState();
	if (!state[diffId]) {
		state[diffId] = [];
	}
	const index = state[diffId].indexOf(topicIndex);
	if (index >= 0) {
		state[diffId].splice(index, 1);
		saveReadState(state);
		return false; // now unread
	} else {
		state[diffId].push(topicIndex);
		saveReadState(state);
		return true; // now read
	}
}

// Pending changes (sync tracking)

export type PendingChanges = SharedPendingChanges;

export function getPendingChanges(): PendingChanges {
	return readJson<PendingChanges>('pending.json') || {
		modifiedDiffs: [],
		modifiedStars: [],
		deletedDiffs: [],
		deletedStars: [],
		profileModified: false,
		keysModified: false
	};
}

export function savePendingChanges(pending: PendingChanges): void {
	writeJson('pending.json', pending);
}

export function clearPendingChanges(): void {
	removeFile('pending.json');
}

export function trackDiffModified(diffId: string): void {
	const pending = getPendingChanges();
	pending.deletedDiffs = pending.deletedDiffs.filter(id => id !== diffId);
	if (!pending.modifiedDiffs.includes(diffId)) {
		pending.modifiedDiffs.push(diffId);
	}
	savePendingChanges(pending);
}

export function trackDiffDeleted(diffId: string): void {
	const pending = getPendingChanges();
	pending.modifiedDiffs = pending.modifiedDiffs.filter(id => id !== diffId);
	if (!pending.deletedDiffs.includes(diffId)) {
		pending.deletedDiffs.push(diffId);
	}
	savePendingChanges(pending);
}

export function trackProfileModified(): void {
	const pending = getPendingChanges();
	pending.profileModified = true;
	savePendingChanges(pending);
}

export function trackKeysModified(): void {
	const pending = getPendingChanges();
	pending.keysModified = true;
	savePendingChanges(pending);
}

// Sync metadata

export interface SyncMeta {
	diffsHash?: string;
	keysHash?: string;
	lastSyncedAt?: string;
}

export function getSyncMeta(): SyncMeta {
	return readJson<SyncMeta>('sync-meta.json') || {};
}

export function saveSyncMeta(meta: SyncMeta): void {
	writeJson('sync-meta.json', meta);
}
