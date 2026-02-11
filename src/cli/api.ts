import { hashPasswordForTransport, decryptApiKey, decryptData } from '../lib/utils/crypto';
import type { Diff, Profile, Session } from './config';

export const BASE = process.env.DIFFLOG_URL || 'https://difflog.dev';

/** Fetch with localhost IPv6 fallback (Bun resolves localhost to ::1 on some Linux systems) */
export async function localAwareFetch(url: string, init?: RequestInit): Promise<Response> {
	try {
		return await fetch(url, init);
	} catch {
		const ipv6 = url.replace(/\/\/localhost([:\/])/, '//[::1]$1');
		if (ipv6 !== url) return fetch(ipv6, init);
		throw new Error(`Unable to connect to ${url}`);
	}
}

class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await localAwareFetch(url, init);
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string; attempts_remaining?: number };
		let message = data.error || `Request failed: ${res.status}`;
		if (res.status === 401 && typeof data.attempts_remaining === 'number') {
			message = `Invalid password (${data.attempts_remaining} attempts remaining)`;
		}
		throw new ApiError(message, res.status);
	}
	return res.json() as Promise<T>;
}

/** GET /api/share/{id} — returns password_salt (public, no auth) */
async function getShareInfo(profileId: string): Promise<{ password_salt: string }> {
	const data = await fetchJson<{ password_salt?: string | null }>(
		`${BASE}/api/share/${profileId}`
	);
	if (!data.password_salt) {
		throw new Error('Profile has no sync password configured');
	}
	return { password_salt: data.password_salt };
}

/** GET /api/profile/{id}?password_hash=... — returns encrypted profile */
async function downloadProfile(profileId: string, password: string, passwordSalt: string) {
	const passwordHash = await hashPasswordForTransport(password, passwordSalt);
	return fetchJson<{
		id: string;
		name: string;
		encrypted_api_key: string;
		salt: string;
		languages: string[];
		frameworks: string[];
		tools: string[];
		topics: string[];
		depth: string;
		custom_focus: string | null;
	}>(`${BASE}/api/profile/${profileId}?password_hash=${encodeURIComponent(passwordHash)}`);
}

/** POST /api/profile/{id}/content — returns encrypted diffs + stars */
async function downloadContent(profileId: string, password: string, passwordSalt: string) {
	const passwordHash = await hashPasswordForTransport(password, passwordSalt);
	return fetchJson<{
		diffs: { id: string; encrypted_data: string }[];
		stars: { id: string; encrypted_data: string }[];
		salt: string;
		profile?: {
			name: string;
			languages: string[];
			frameworks: string[];
			tools: string[];
			topics: string[];
			depth: string;
			custom_focus: string | null;
		};
	}>(`${BASE}/api/profile/${profileId}/content`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ password_hash: passwordHash })
	});
}

/**
 * Full login flow: fetch share info, download profile + content, decrypt everything.
 * Returns session credentials, profile metadata, and decrypted diffs.
 */
export async function login(
	profileId: string,
	password: string
): Promise<{ session: Session; profile: Profile; diffs: Diff[] }> {
	// 1. Get password salt (public endpoint)
	const { password_salt } = await getShareInfo(profileId);

	// 2. Download profile (verifies password)
	const profileData = await downloadProfile(profileId, password, password_salt);

	// 3. Decrypt API key (validates password against encryption)
	await decryptApiKey(profileData.encrypted_api_key, profileData.salt, password);

	// 4. Download encrypted content
	const content = await downloadContent(profileId, password, password_salt);
	const salt = content.salt || profileData.salt;

	// 5. Decrypt diffs
	const diffs: Diff[] = [];
	for (const item of content.diffs) {
		try {
			let diff: Diff;
			if (item.encrypted_data.startsWith('{')) {
				diff = JSON.parse(item.encrypted_data);
			} else {
				diff = await decryptData<Diff>(item.encrypted_data, password, salt);
			}
			diffs.push(diff);
		} catch {
			// skip diffs that fail to decrypt
		}
	}

	// Sort newest first
	diffs.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

	const profile: Profile = {
		id: profileData.id,
		name: profileData.name,
		languages: profileData.languages || [],
		frameworks: profileData.frameworks || [],
		tools: profileData.tools || [],
		topics: profileData.topics || [],
		depth: profileData.depth || 'standard',
		customFocus: profileData.custom_focus || ''
	};

	const session: Session = {
		profileId,
		password,
		passwordSalt: password_salt,
		salt
	};

	return { session, profile, diffs };
}
