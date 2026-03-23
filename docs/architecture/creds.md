# Credits System

The creds system lets users generate diffs without their own API keys by purchasing credits. The server calls Anthropic on their behalf.

## Dual-Mode Profiles

Each profile chooses its API source during setup:

- **BYOK** (Bring Your Own Key) — existing flow, client-side API calls
- **Creds** — server-side generation via `/api/generate`

The choice is stored as `profile.apiSource: 'byok' | 'creds'`.

## Account Model

Creds auth is stored **per-profile** (`credsEmail`, `credsCode`, `credBalance` on the Profile object), not as a separate global account. This means:

- Switching profiles switches creds accounts automatically
- Multiple profiles can share the same email (setup wizard detects and offers reuse)
- The server-side account (in D1 `accounts` table) is keyed by email

The `account.svelte.ts` store derives all state from the active profile — it has no separate persistence.

## Email Verification

1. User enters email → POST `/api/creds/request`
2. Server generates deterministic 6-digit code via SHA-256(email + secret) and logs to console (dev mode)
3. User enters code → POST `/api/creds/verify`
4. Server verifies code, creates account with 5 free creds if new, returns balance

**Production TODO:** Replace console logging with real email delivery (SES/Resend).

## Generation Flow

```
Client                          Server (/api/generate)
  |                                |
  |-- Build prompt client-side --> |
  |   (no feeds/search)           |
  |                                |-- Verify email+code
  |                                |-- Check cred balance
  |                                |-- Check daily limit (5/UTC day)
  |                                |-- Call Anthropic API
  |                                |-- Deduct creds, log transaction
  |                                |-- Store in pending_diffs
  |<-- { id, title, content } ----|
  |                                |
  |-- Add to local history         |
```

Creds mode skips web search and feed curation (no client API keys for those). The prompt is built client-side and sent to the server.

Cost: 1 cred for quick/standard, 2 creds for deep.

## Pending Diff Recovery

Generated diffs are stored server-side in `pending_diffs` so users don't lose them if they disconnect. On app init (`initApp()`), creds profiles call POST `/api/creds/pending` to fetch and claim any uncollected diffs.

## Stripe Payments

Packs:

| Pack | Creds | Price |
|------|-------|-------|
| Starter | 10 | $2 |
| Value | 50 | $7 |

Flow:

1. POST `/api/purchase/create` — creates Stripe PaymentIntent with metadata (email, pack, creds)
2. Client mounts Stripe Payment Element, confirms payment
3. Stripe sends webhook to POST `/api/purchase/webhook`
4. Server verifies HMAC-SHA256 signature, credits account on `payment_intent.succeeded`
5. Client polls `/api/creds/history` to detect balance update

Uses direct `fetch()` to Stripe API (no SDK) for Cloudflare Workers compatibility.

## Database Tables

**`accounts`** — id, email (unique), creds, stripe_customer_id, created_at, updated_at

**`transactions`** — id, account_id (FK), type (purchase/usage/bonus/refund), amount, balance_after, description, stripe_payment_id, metadata, created_at

**`pending_diffs`** — id, account_id (FK), title, content, created_at

## Rate Limiting

- 5 generations per UTC day per account (checked via transaction count)
- Server returns 429 when limit reached
- Client shows daily limit modal

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/creds/request` | POST | Send verification code |
| `/api/creds/verify` | POST | Verify code, create/return account |
| `/api/creds/history` | GET | Transaction history (filter: topups\|usage) |
| `/api/creds/pending` | POST | Fetch/claim pending diffs |
| `/api/purchase/create` | POST | Create Stripe PaymentIntent |
| `/api/purchase/webhook` | POST | Stripe webhook handler |
| `/api/generate` | POST | Server-side diff generation |

All creds endpoints authenticate via email+code. The code is a deterministic SHA-256 hash (dev mode) — production should use time-limited codes sent via email.
