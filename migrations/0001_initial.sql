-- Initial schema for difflog Cloudflare D1 database
-- All content (diffs, stars) is encrypted client-side with user's password

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,              -- UUID
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,      -- PBKDF2 server-side hash (v2:serverSalt:hash format)
  encrypted_api_key TEXT NOT NULL,  -- base64(AES-GCM encrypted)
  salt TEXT NOT NULL,               -- base64(random salt for PBKDF2)
  languages TEXT,                   -- JSON array
  frameworks TEXT,                  -- JSON array
  tools TEXT,                       -- JSON array
  topics TEXT,                      -- JSON array
  depth TEXT DEFAULT 'standard',
  custom_focus TEXT,
  resolved_sources TEXT,            -- JSON (cached resolution)
  -- Content sync hashes (SHA-256 of all encrypted diff/star data)
  diffs_hash TEXT,                  -- Hash of encrypted diffs collection
  stars_hash TEXT,                  -- Hash of encrypted stars collection
  content_updated_at TEXT,          -- When content was last synced
  -- Rate limiting for brute force protection
  failed_attempts INTEGER DEFAULT 0,
  lockout_until TEXT,               -- ISO timestamp, null if not locked
  last_failed_at TEXT,              -- ISO timestamp of last failed attempt
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Encrypted diffs (only uploaded when user shares/syncs)
CREATE TABLE IF NOT EXISTS diffs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Encrypted blob containing: title, content, html, generated_at, duration_seconds, cost
  encrypted_data TEXT NOT NULL,     -- base64(AES-GCM encrypted JSON)
  created_at TEXT DEFAULT (datetime('now'))
);

-- Encrypted stars (only uploaded when user shares/syncs)
CREATE TABLE IF NOT EXISTS stars (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Encrypted blob containing: content, html, diff_id, diff_title, diff_date, added_at
  encrypted_data TEXT NOT NULL,     -- base64(AES-GCM encrypted JSON)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diffs_profile ON diffs(profile_id);
CREATE INDEX IF NOT EXISTS idx_stars_profile ON stars(profile_id);
