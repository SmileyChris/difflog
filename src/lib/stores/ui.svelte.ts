// Transient UI state - not persisted

import type { Diff } from './history.svelte';
import { generateDiffContent, hasStageCache, clearStageCache, type GenerateOptions, type GenerateResult } from '$lib/actions/generateDiff';
export { hasStageCache, clearStageCache };

// Track the active generation promise at module level so it survives navigation
let _activeGeneration: Promise<GenerateResult> | null = null;

let _generating = $state(false);
let _generationError = $state<string | null>(null);
let _generationResult = $state<Diff | null>(null);
let _syncDropdownPassword = $state('');
let _syncDropdownRemember = $state(false);
let _syncResult = $state<{ uploaded: number; downloaded: number } | null>(null);
let _syncResultTimeout: ReturnType<typeof setTimeout> | null = null;
let _syncButtonEl: HTMLElement | null = null;

// State accessors
export const generating = {
	get value() { return _generating; },
	set value(val: boolean) { _generating = val; }
};

export function isGenerating(): boolean {
	return _generating;
}

export const generationError = {
	get value() { return _generationError; },
	set value(val: string | null) { _generationError = val; }
};

export const generationResult = {
	get value() { return _generationResult; },
	set value(val: Diff | null) { _generationResult = val; }
};

export function clearGenerationState(): void {
	_generationError = null;
	_generationResult = null;
}

export function hasActiveGeneration(): boolean {
	return _activeGeneration !== null;
}

/**
 * Run generation at module level so it survives navigation.
 * Returns the result or throws an error.
 */
export async function runGeneration(options: GenerateOptions): Promise<GenerateResult> {
	// Don't start if already generating
	if (_generating) {
		throw new Error('Generation already in progress');
	}

	_generating = true;
	_generationError = null;
	_generationResult = null;

	// Create the promise at module level
	_activeGeneration = generateDiffContent(options);

	try {
		const result = await _activeGeneration;
		_generationResult = result.diff;
		return result;
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : 'Unknown error';
		_generationError = `Generation failed: ${message}`;
		throw e;
	} finally {
		_generating = false;
		_activeGeneration = null;
	}
}

export const syncDropdownPassword = {
	get value() { return _syncDropdownPassword; },
	set value(val: string) { _syncDropdownPassword = val; }
};

export const syncDropdownRemember = {
	get value() { return _syncDropdownRemember; },
	set value(val: boolean) { _syncDropdownRemember = val; }
};

export const syncResult = {
	get value() { return _syncResult; },
	set value(val: { uploaded: number; downloaded: number } | null) { _syncResult = val; }
};

// Actions

/** Register the sync button element so openSyncDropdown can focus it */
export function registerSyncButton(el: HTMLElement | null): void {
	_syncButtonEl = el;
}

/** Open the sync dropdown by focusing its trigger button */
export function openSyncDropdown(): void {
	_syncResult = null;
	_syncDropdownPassword = '';
	_syncDropdownRemember = false;
	_syncButtonEl?.focus();
}

export function setSyncResultWithTimeout(result: { uploaded: number; downloaded: number }): void {
	_syncResult = result;
	_syncDropdownPassword = '';

	if (_syncResultTimeout) {
		clearTimeout(_syncResultTimeout);
	}

	_syncResultTimeout = setTimeout(() => {
		_syncResult = null;
	}, 2000);
}
