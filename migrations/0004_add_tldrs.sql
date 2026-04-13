-- Add TLDRs sync support
-- TLDRs are user-generated article summaries keyed by "diffId:pIndex"
-- Each is encrypted client-side like diffs and stars

CREATE TABLE IF NOT EXISTS tldrs (
  id TEXT PRIMARY KEY,              -- "diffId:pIndex"
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  encrypted_data TEXT NOT NULL,     -- base64(AES-GCM encrypted JSON of TldrEntry)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tldrs_profile ON tldrs(profile_id);

ALTER TABLE profiles ADD COLUMN tldrs_hash TEXT;
