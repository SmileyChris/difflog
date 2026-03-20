import { persist } from './persist.svelte';
import { activeProfileId } from './profiles.svelte';

export interface TldrEntry {
	summary: string;
	url: string;
	created_at: string;
}

// Persisted state: Record<profileId, Record<"diffId:pIndex", TldrEntry>>
const _tldrs = persist<Record<string, Record<string, TldrEntry>>>('difflog-tldrs', {});

// State accessors
export const tldrs = {
	get value() { return _tldrs.value; },
	set value(val: Record<string, Record<string, TldrEntry>>) { _tldrs.value = val; }
};

function tldrKey(diffId: string, pIndex: number): string {
	return `${diffId}:${pIndex}`;
}

function getProfileTldrs(): Record<string, TldrEntry> {
	return activeProfileId.value ? _tldrs.value[activeProfileId.value] ?? {} : {};
}

function setProfileTldrs(val: Record<string, TldrEntry>): void {
	if (activeProfileId.value) {
		_tldrs.value = { ..._tldrs.value, [activeProfileId.value]: val };
	}
}

export function getTldr(diffId: string, pIndex: number): TldrEntry | null {
	return getProfileTldrs()[tldrKey(diffId, pIndex)] ?? null;
}

export function setTldr(diffId: string, pIndex: number, entry: TldrEntry): void {
	const current = getProfileTldrs();
	setProfileTldrs({ ...current, [tldrKey(diffId, pIndex)]: entry });
}

export function removeTldr(diffId: string, pIndex: number): void {
	const current = getProfileTldrs();
	const { [tldrKey(diffId, pIndex)]: _, ...rest } = current;
	setProfileTldrs(rest);
}

export function removeTldrsForDiff(diffId: string): void {
	const current = getProfileTldrs();
	const prefix = `${diffId}:`;
	const filtered = Object.fromEntries(
		Object.entries(current).filter(([key]) => !key.startsWith(prefix))
	);
	setProfileTldrs(filtered);
}

export function deleteTldrsForProfile(id: string): void {
	const { [id]: _, ...rest } = _tldrs.value;
	_tldrs.value = rest;
}
