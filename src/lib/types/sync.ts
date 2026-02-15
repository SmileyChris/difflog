import type { GenerationDepth } from '../utils/constants';

// --- Shared types used by both web and CLI ---

export interface Diff {
  id: string;
  content: string;
  generated_at: string;
  title?: string;
  duration_seconds?: number;
  cost?: number;
  isPublic?: boolean;
  window_days?: number;
  [key: string]: unknown;
}

export interface Star {
  diff_id: string;
  p_index: number;
  added_at: string;
  [key: string]: unknown;
}

export interface PendingChanges {
  modifiedDiffs: string[];
  modifiedStars: string[];
  deletedDiffs: string[];
  deletedStars: string[];
  profileModified?: boolean;
  keysModified?: boolean;
}

export interface ApiKeys {
  anthropic?: string;
  serper?: string;
  perplexity?: string;
  deepseek?: string;
  gemini?: string;
}

export interface ProviderSelections {
  search?: string | null;
  curation?: string | null;
  synthesis?: string | null;
}

/** Shape of the expanded encrypted blob (apiKeys + providerSelections) */
export interface EncryptedKeysBlob {
  apiKeys: Record<string, string>;
  providerSelections?: ProviderSelections;
}

/** Core profile fields shared between web and CLI */
export interface ProfileCore {
  id: string;
  name: string;
  languages?: string[];
  frameworks?: string[];
  tools?: string[];
  topics?: string[];
  depth: GenerationDepth | string;
  customFocus: string;
  providerSelections?: ProviderSelections;
}

// --- Web-only types (co-located for convenience) ---

export interface ResolvedMapping {
  subreddits: string[];
  lobstersTags: string[];
  devtoTags: string[];
}

export interface SyncStatus {
  exists: boolean;
  diffs_hash?: string;
  stars_hash?: string;
  keys_hash?: string;
  content_updated_at?: string;
  error?: string;
  localDiffsHash?: string | null;
  localStarsHash?: string | null;
  localKeysHash?: string | null;
  needsSync?: boolean;
  hasPassword?: boolean;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  status: 'synced' | 'uploaded' | 'downloaded';
}
