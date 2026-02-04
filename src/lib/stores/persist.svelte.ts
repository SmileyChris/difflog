import { browser } from '$app/environment';

/**
 * Creates a persisted state that syncs to localStorage.
 * The returned object has a `value` property that can be read/written.
 */
export function persist<T>(key: string, initialValue: T): { value: T } {
	let value = $state(initialValue);

	if (browser) {
		const stored = localStorage.getItem(key);
		if (stored) {
			try {
				value = JSON.parse(stored);
			} catch {
				// Invalid JSON, use initial value
			}
		}
	}

	return {
		get value() {
			return value;
		},
		set value(newValue: T) {
			value = newValue;
			if (browser) {
				localStorage.setItem(key, JSON.stringify(newValue));
			}
		}
	};
}

/**
 * Creates a session-scoped reactive state that syncs to sessionStorage.
 * Used for temporary state that should persist across page reloads but not browser sessions.
 * Replaces the _passwordVersion hack pattern for reactive session state.
 */
export function sessionState<T>(key: string, initialValue: T): { value: T } {
	let value = $state(initialValue);

	if (browser) {
		const stored = sessionStorage.getItem(key);
		if (stored) {
			try {
				value = JSON.parse(stored);
			} catch {
				// Invalid JSON, use initial value
			}
		}
	}

	return {
		get value() {
			return value;
		},
		set value(newValue: T) {
			value = newValue;
			if (browser) {
				if (newValue === null || newValue === undefined) {
					sessionStorage.removeItem(key);
				} else {
					sessionStorage.setItem(key, JSON.stringify(newValue));
				}
			}
		}
	};
}
