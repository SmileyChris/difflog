---
icon: lucide/server
---

# API Endpoints

API endpoints implemented as Cloudflare Pages Functions. Sync endpoints use D1 database with [client-side encryption](encryption.md).

## `POST /api/feeds`

Fetch developer news feeds from multiple sources. Returns items grouped by source for client-side curation. **No auth required.**

**Request:**
```json
{
  "languages": ["JavaScript", "Rust"],
  "frameworks": ["React"],
  "tools": ["Docker"],
  "topics": ["AI/ML & LLMs"],
  "resolvedMappings": {
    "Homelab": {
      "subreddits": ["selfhosted", "homelab"],
      "lobstersTags": ["selfhosted"],
      "devtoTags": ["homelab"]
    }
  }
}
```

**Response:**
```json
{
  "feeds": {
    "hn": [{ "title": "...", "url": "...", "score": 100, "source": "HN" }],
    "lobsters": [{ "title": "...", "url": "...", "score": 50, "source": "Lobsters" }],
    "reddit": [{ "title": "...", "url": "...", "score": 200, "source": "r/rust" }],
    "github": [{ "title": "...", "url": "...", "score": 1000, "source": "GitHub (Rust)" }],
    "devto": [{ "title": "...", "url": "...", "score": 30, "source": "Dev.to" }]
  }
}
```

The client curates HN/Lobsters items via Haiku before including in the prompt. Reddit, GitHub, and Dev.to are already profile-targeted.

---

## Sync Endpoints

The following endpoints support the [sync system](sync.md).

## `POST /api/profile/create`

Create or re-upload a profile. Used for initial share.

**Request:**
```json
{
  "id": "uuid",
  "name": "Profile Name",
  "password_hash": "salt:hash",
  "encrypted_api_key": "base64...",
  "salt": "base64...",
  "languages": ["JavaScript"],
  "frameworks": ["React"],
  "tools": ["Docker"],
  "topics": ["AI/ML"],
  "depth": "standard",
  "custom_focus": "optional text"
}
```

## `GET /api/profile/{id}?password_hash=...`

Get full profile data including encrypted API key. Requires password.

**Response:**
```json
{
  "id": "uuid",
  "name": "Profile Name",
  "encrypted_api_key": "base64...",
  "salt": "base64...",
  "languages": [],
  "frameworks": [],
  "tools": [],
  "topics": [],
  "depth": "standard",
  "custom_focus": null
}
```

## `GET /api/profile/{id}/status`

Check if profile exists and get content hashes. **No auth required.**

**Response:**
```json
{
  "exists": true,
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "content_updated_at": "2026-01-26T04:13:00Z"
}
```

## `POST /api/profile/{id}/content`

Download all encrypted content. Requires password.

**Request:**
```json
{ "password_hash": "salt:hash" }
```

**Response:**
```json
{
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "salt": "base64...",
  "profile": {
    "name": "...",
    "languages": [],
    "frameworks": [],
    "tools": [],
    "topics": [],
    "depth": "standard",
    "custom_focus": null
  }
}
```

## `POST /api/profile/{id}/sync`

Upload content and deletions. Requires password.

**Request:**
```json
{
  "password_hash": "salt:hash",
  "diffs": [{ "id": "uuid", "encrypted_data": "base64 or JSON" }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "deleted_diff_ids": ["uuid"],
  "deleted_star_ids": ["uuid"],
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "profile": { "name": "...", "languages": [], ... }
}
```

!!! note "Public Diffs"
    For [public diffs](public-diff-sharing.md), `encrypted_data` contains plaintext JSON (starts with `{`) instead of an encrypted base64 blob. The server detects this format and serves public diffs via `/api/diff/{id}/public`.
```

## `GET /api/diff/{id}/public`

Retrieve a publicly shared diff. Returns 404 if the diff doesn't exist or is private. See [Public Diff Sharing](public-diff-sharing.md) for details. **No auth required.**

**Response:**
```json
{
  "id": "abc123",
  "content": "# Your Dev Digest\n\n...",
  "title": "Weekly Update",
  "generated_at": "2026-01-28T10:00:00Z",
  "profile_name": "Chris"
}
```

**Cache Headers:** `Cache-Control: public, max-age=86400`

---

## `GET /api/share/{id}`

Get public profile info for import flow. **No auth required.**

**Response:**
```json
{
  "id": "uuid",
  "name": "Profile Name",
  "languages": [],
  "frameworks": [],
  "tools": [],
  "topics": [],
  "depth": "standard",
  "password_salt": "base64..."
}
```

---

## Creds Endpoints

The following endpoints support the [creds system](creds.md).

## `POST /api/creds/request`

Request email verification code. **No auth required.**

**Request:**
```json
{ "email": "user@example.com" }
```

**Response:**
```json
{ "success": true }
```

## `POST /api/creds/verify`

Verify code and login/create account. New users get 5 free creds. **No auth required.**

**Request:**
```json
{ "email": "user@example.com", "code": "123456" }
```

**Response:**
```json
{ "success": true, "creds": 5 }
```

## `GET /api/creds/history`

Get transaction history. Requires email+code auth.

**Request:**
```
GET /api/creds/history?email=...&code=...&filter=topups
```

Filter: `topups` (purchases/bonuses) or `usage` (diff generation).

**Response:**
```json
{
  "transactions": [
    { "id": "uuid", "type": "purchase", "amount": 10, "description": "Starter Pack", "created_at": "..." }
  ],
  "creds": 42
}
```

## `POST /api/creds/pending`

Claim pending diffs (marks them as received by client). Requires email+code auth.

**Request:**
```json
{ "email": "...", "code": "...", "diff_ids": ["uuid1", "uuid2"] }
```

**Response:**
```json
{ "success": true }
```

## `POST /api/generate`

Generate diff using 1 cred. Requires email+code auth.

**Request:**
```json
{ "email": "...", "code": "...", "prompt": "..." }
```

**Response (success):**
```json
{
  "id": "uuid",
  "title": "Your Diff Title",
  "content": "# Markdown content...",
  "usage": { "input_tokens": 2000, "output_tokens": 2500 },
  "creds": 4
}
```

**Response (402 - insufficient creds):**
```json
{ "error": "Insufficient creds" }
```

## `POST /api/purchase/create`

Create Stripe payment intent. **No auth required** (email passed in body).

**Request:**
```json
{ "pack": "starter", "email": "user@example.com" }
```

Packs: `starter` (10 creds, $2), `value` (50 creds, $7).

**Response:**
```json
{ "clientSecret": "pi_..." }
```

## `POST /api/purchase/webhook`

Stripe webhook for payment confirmation. **Called by Stripe**, verifies signature.

Adds creds to user account and creates transaction record on successful payment.
