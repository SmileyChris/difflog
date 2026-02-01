---
icon: lucide/coins
---

# Creds System

Creds are credits for generating diffs without bringing your own API key. Users can use difflog in two modes:

| Mode | How it works |
|------|--------------|
| **BYOK** | User provides their own Anthropic API key, calls API directly from browser |
| **Creds** | User purchases credits, server calls API on their behalf |

## User Flow

1. User enters email on `/creds` page
2. Server sends 6-digit verification code
3. User enters code → account created with 5 free creds
4. User can generate diffs (1 cred each) or purchase more

## Database Schema

Three tables in D1:

### accounts

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  creds INTEGER DEFAULT 0,
  stripe_customer_id TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### transactions

```sql
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  type TEXT NOT NULL,        -- 'purchase', 'usage', 'refund', 'bonus'
  amount INTEGER NOT NULL,   -- positive = credit, negative = debit
  balance_after INTEGER NOT NULL,
  description TEXT,
  stripe_payment_id TEXT,
  metadata TEXT,
  created_at TEXT
);
```

### pending_diffs

Server saves generated diffs temporarily so users can recover them if disconnected:

```sql
CREATE TABLE pending_diffs (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  created_at TEXT,
  claimed_at TEXT
);
```

## API Endpoints

See [API Endpoints — Creds](api.md#creds-endpoints) for full reference:

- `POST /api/creds/request` — request verification code
- `POST /api/creds/verify` — verify code, create account
- `POST /api/generate` — generate diff (1 cred)
- `GET /api/creds/history` — transaction history
- `POST /api/creds/pending` — claim pending diffs
- `POST /api/purchase/create` — create Stripe payment
- `POST /api/purchase/webhook` — Stripe webhook

## Creds Packs

| Pack | Creds | Price | Per-Cred |
|------|-------|-------|----------|
| Starter | 10 | $2 | $0.20 |
| Best Value | 50 | $7 | $0.14 |

Payments via Stripe Elements (embedded in modal).

## Client State

See [Data Models](../concepts/index.md#data-models) for client-side types:

- **User** — logged-in creds account (`difflog-user` in localStorage)
- **Profile.apiSource** — `'byok'` or `'creds'` mode

## Tracking Diff Source

Diffs track whether they were generated via creds or BYOK using the `cost` field:

| cost value | Meaning |
|------------|---------|
| `-1` | Generated with creds |
| `0.05` (positive) | Generated with BYOK (actual API cost in $) |
| `undefined` | Legacy diff (unknown source) |

This allows the UI to show "1 cred" vs "$0.050" in the archive.

## Rate Limits

Creds mode users are limited to **5 diffs per day** (UTC). This prevents abuse while ensuring fair access for all users.

| Limit | Value | Reset |
|-------|-------|-------|
| Daily diffs | 5 per account | Midnight UTC |

When the limit is reached, `/api/generate` returns `429 Too Many Requests` and the client shows a friendly modal suggesting the user wait until tomorrow or switch to BYOK mode.

BYOK users have no daily limit — they call Anthropic directly and pay for their own usage.

## Security

**Dev mode**: Verification codes are deterministically derived from email + secret for easy testing. Check wrangler logs for codes.

**Production**: Will use actual email service (Resend) and rate limiting:

- 5 code requests per email per 15 minutes
- 5 verification attempts per code
- Codes expire after 10 minutes

## Files

| File | Purpose |
|------|---------|
| `src/components/creds.ts` | Checkout modal, transaction history |
| `public/creds.html` | Creds management page |
| `functions/api/creds/request.ts` | Send verification code |
| `functions/api/creds/verify.ts` | Verify code, create account |
| `functions/api/creds/history.ts` | Transaction history |
| `functions/api/creds/pending.ts` | Claim pending diffs |
| `functions/api/generate.ts` | Server-side diff generation |
| `functions/api/purchase/` | Stripe payment handling |
| `migrations/0002_accounts.sql` | accounts + transactions tables |
| `migrations/0003_pending_diffs.sql` | pending_diffs table |
