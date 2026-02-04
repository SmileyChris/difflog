// Transient UI state - not persisted

let _syncDropdownOpen = $state(false);
let _syncDropdownPassword = $state('');
let _syncDropdownRemember = $state(false);
let _syncResult = $state<{ uploaded: number; downloaded: number } | null>(null);
let _syncResultTimeout: ReturnType<typeof setTimeout> | null = null;

// State accessors
export const syncDropdownOpen = {
	get value() { return _syncDropdownOpen; },
	set value(val: boolean) { _syncDropdownOpen = val; }
};

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
export function openSyncDropdown(): void {
	_syncDropdownOpen = true;
	_syncResult = null;
	_syncDropdownPassword = '';
	_syncDropdownRemember = false;
}

export function closeSyncDropdown(): void {
	_syncDropdownOpen = false;
	_syncDropdownPassword = '';
	if (_syncResultTimeout) {
		clearTimeout(_syncResultTimeout);
		_syncResultTimeout = null;
	}
}

export function toggleSyncDropdown(): void {
	if (_syncDropdownOpen) {
		closeSyncDropdown();
	} else {
		openSyncDropdown();
	}
}

export function setSyncResultWithTimeout(result: { uploaded: number; downloaded: number }): void {
	_syncResult = result;
	_syncDropdownPassword = '';

	if (_syncResultTimeout) {
		clearTimeout(_syncResultTimeout);
	}

	_syncResultTimeout = setTimeout(() => {
		_syncResult = null;
		_syncDropdownOpen = false;
	}, 2000);
}

export function clearSyncResultTimeout(): void {
	if (_syncResultTimeout) {
		clearTimeout(_syncResultTimeout);
		_syncResultTimeout = null;
	}
}
