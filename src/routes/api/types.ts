/**
 * Type definitions for SvelteKit API routes
 * All diff/star content is encrypted client-side before upload
 */

export interface ProfileRow {
	id: string;
	name: string;
	password_hash: string;
	encrypted_api_key: string;
	salt: string;
	languages: string | null;
	frameworks: string | null;
	tools: string | null;
	topics: string | null;
	depth: string;
	custom_focus: string | null;
	resolved_sources: string | null;
	diffs_hash: string | null;
	stars_hash: string | null;
	keys_hash: string | null;
	password_salt: string | null;
	content_hash: string | null;
	content_updated_at: string | null;
	failed_attempts: number;
	lockout_until: string | null;
	last_failed_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface EncryptedDiffRow {
	id: string;
	profile_id: string;
	encrypted_data: string; // AES-GCM encrypted JSON blob, or plaintext JSON if public
	created_at: string;
}

export interface EncryptedStarRow {
	id: string;
	profile_id: string;
	encrypted_data: string; // AES-GCM encrypted JSON blob
	created_at: string;
}

// API request/response types
export interface CreateProfileRequest {
	id?: string;
	name: string;
	password_hash: string;
	encrypted_api_key: string;
	salt: string;
	keys_hash?: string;
	languages?: string[];
	frameworks?: string[];
	tools?: string[];
	topics?: string[];
	depth?: string;
	custom_focus?: string;
}

export interface ProfileResponse {
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
	resolved_sources: any | null;
	// Content sync info
	content_hash: string | null;
	content_updated_at: string | null;
	// Encrypted data (client decrypts) - only when include_data=true
	encrypted_diffs?: string[]; // Array of encrypted JSON blobs
	encrypted_stars?: string[]; // Array of encrypted JSON blobs
}

export interface SyncRequest {
	password_hash: string;
	// Diffs: encrypted base64 blob, or plaintext JSON if public (detected by checking if starts with '{')
	diffs?: { id: string; encrypted_data: string }[];
	stars?: { id: string; encrypted_data: string }[];
	deleted_diff_ids?: string[];
	deleted_star_ids?: string[];
	// Client-computed hashes over all local content
	diffs_hash?: string;
	stars_hash?: string;
	// Encrypted API keys + provider selections blob
	encrypted_api_key?: string;
	keys_hash?: string;
	resolved_sources?: any;
	profile?: {
		name?: string;
		languages?: string[];
		frameworks?: string[];
		tools?: string[];
		topics?: string[];
		depth?: string;
		custom_focus?: string;
	};
}

export interface ContentRequest {
	password_hash: string;
	// Optional: skip fetching collections where local hash matches server
	diffs_hash?: string;
	stars_hash?: string;
	keys_hash?: string;
}

export interface ContentResponse {
	diffs: { id: string; encrypted_data: string }[];
	stars: { id: string; encrypted_data: string }[];
	// Indicates which collections were skipped (hash matched)
	diffs_skipped?: boolean;
	stars_skipped?: boolean;
	// Encrypted API keys + provider selections blob (included when keys_hash differs)
	encrypted_api_key?: string;
	keys_skipped?: boolean;
	content_hash: string | null;
	salt: string;
	// Profile metadata for sync
	profile?: {
		name: string;
		languages: string[];
		frameworks: string[];
		tools: string[];
		topics: string[];
		depth: string;
		custom_focus: string | null;
	};
}

export interface ShareResponse {
	id: string;
	name: string;
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	depth: string;
	password_salt: string | null;
}

// Rate limiting constants
export const RATE_LIMIT = {
	MAX_ATTEMPTS: 5, // Lock after 5 failed attempts
	LOCKOUT_MINUTES: 15, // Lock for 15 minutes
	ATTEMPT_WINDOW_MINUTES: 5 // Reset counter after 5 min of no attempts
};

// Storage limits (match client-side caps)
export const STORAGE_LIMITS = {
	MAX_DIFFS: 50 // Max diffs per profile
};
