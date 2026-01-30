-- Accounts and transactions for creds system
-- See docs/architecture/accounts.md for full specification

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,                -- UUID
  email TEXT UNIQUE NOT NULL,         -- Verified email address
  creds INTEGER DEFAULT 0,            -- Current creds balance
  stripe_customer_id TEXT,            -- Stripe customer ID (nullable until first purchase)
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_stripe ON accounts(stripe_customer_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,                -- UUID
  account_id TEXT NOT NULL REFERENCES accounts(id),
  type TEXT NOT NULL,                 -- 'purchase', 'usage', 'refund', 'bonus'
  amount INTEGER NOT NULL,            -- Positive for credits, negative for debits
  balance_after INTEGER NOT NULL,     -- Running balance after this transaction
  description TEXT,                   -- Human-readable description
  stripe_payment_id TEXT,             -- Stripe payment intent ID (for purchases)
  metadata TEXT,                      -- JSON blob for additional data
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe ON transactions(stripe_payment_id);
