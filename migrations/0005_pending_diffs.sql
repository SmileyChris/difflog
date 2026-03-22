-- Store generated diffs so users don't lose them if they disconnect
-- Diffs are claimed by the client and deleted after delivery

CREATE TABLE IF NOT EXISTS pending_diffs (
  id TEXT PRIMARY KEY,                -- UUID (becomes the diff id on client)
  account_id TEXT NOT NULL REFERENCES accounts(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pending_diffs_account ON pending_diffs(account_id);
