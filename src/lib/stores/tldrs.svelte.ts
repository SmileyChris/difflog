import { persist } from './persist.svelte';
import { activeProfileId } from './profiles.svelte';
import type { Tldr } from '$lib/types/sync';

export interface TldrEntry {
	summary: string;
	url: string;
	created_at: string;
	updated_at: string;
}

// Persisted state: Record<profileId, Record<"diffId:pIndex", TldrEntry>>
const _tldrs = persist<Record<string, Record<string, TldrEntry>>>('difflog-tldrs', {});

// State accessors
export const tldrs = {
	get value() { return _tldrs.value; },
	set value(val: Record<string, Record<string, TldrEntry>>) { _tldrs.value = val; }
};

export function tldrKey(diffId: string, pIndex: number): string {
	return `${diffId}:${pIndex}`;
}

function parseKey(key: string): { diffId: string; pIndex: number } | null {
	const idx = key.lastIndexOf(':');
	if (idx === -1) return null;
	const diffId = key.slice(0, idx);
	const pIndex = Number(key.slice(idx + 1));
	if (!diffId || Number.isNaN(pIndex)) return null;
	return { diffId, pIndex };
}

function getProfileTldrs(profileId?: string): Record<string, TldrEntry> {
	const id = profileId ?? activeProfileId.value;
	return id ? _tldrs.value[id] ?? {} : {};
}

function setProfileTldrs(val: Record<string, TldrEntry>, profileId?: string): void {
	const id = profileId ?? activeProfileId.value;
	if (id) {
		_tldrs.value = { ..._tldrs.value, [id]: val };
	}
}

export function getTldr(diffId: string, pIndex: number): TldrEntry | null {
	return getProfileTldrs()[tldrKey(diffId, pIndex)] ?? null;
}

/** Low-level setter — does not track sync changes. Prefer `addTldr` from operations. */
export function setTldrBase(diffId: string, pIndex: number, entry: TldrEntry): void {
	const current = getProfileTldrs();
	setProfileTldrs({ ...current, [tldrKey(diffId, pIndex)]: entry });
}

/** Low-level deleter — does not track sync changes. Prefer `deleteTldr` from operations. */
export function removeTldrBase(diffId: string, pIndex: number): void {
	const current = getProfileTldrs();
	const { [tldrKey(diffId, pIndex)]: _, ...rest } = current;
	setProfileTldrs(rest);
}

/** Remove all TLDRs belonging to a diff. Returns the keys that were removed. */
export function removeTldrsForDiff(diffId: string): string[] {
	const current = getProfileTldrs();
	const prefix = `${diffId}:`;
	const removed: string[] = [];
	const filtered: Record<string, TldrEntry> = {};
	for (const [key, value] of Object.entries(current)) {
		if (key.startsWith(prefix)) {
			removed.push(key);
		} else {
			filtered[key] = value;
		}
	}
	if (removed.length > 0) {
		setProfileTldrs(filtered);
	}
	return removed;
}

export function deleteTldrsForProfile(id: string): void {
	const { [id]: _, ...rest } = _tldrs.value;
	_tldrs.value = rest;
}

/** Get all TLDRs for the active profile as a Tldr[] (for sync). */
export function getTldrsAsArray(profileId?: string): Tldr[] {
	const map = getProfileTldrs(profileId);
	const result: Tldr[] = [];
	for (const [key, entry] of Object.entries(map)) {
		const parsed = parseKey(key);
		if (!parsed) continue;
		result.push({
			diff_id: parsed.diffId,
			p_index: parsed.pIndex,
			summary: entry.summary,
			url: entry.url,
			created_at: entry.created_at,
			updated_at: entry.updated_at || entry.created_at
		});
	}
	return result;
}

/** Replace all TLDRs for a profile (used by sync download). */
export function setTldrsFromArray(profileId: string, tldrs: Tldr[]): void {
	const map: Record<string, TldrEntry> = {};
	for (const t of tldrs) {
		map[tldrKey(t.diff_id, t.p_index)] = {
			summary: t.summary,
			url: t.url,
			created_at: t.created_at,
			updated_at: t.updated_at || t.created_at
		};
	}
	_tldrs.value = { ..._tldrs.value, [profileId]: map };
}
