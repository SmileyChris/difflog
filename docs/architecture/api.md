---
icon: lucide/server
---

# API Endpoints

SvelteKit API routes (`+server.ts` files under `src/routes/api/`). Sync endpoints use the D1 database with [client-side encryption](encryption.md).

## Cross-cutting Behavior

These responses can be returned from any password-protected endpoint:

| Status | Body | Meaning |
|--------|------|---------|
| `401` | `{ "error": "Invalid password" }` | Wrong or missing `password_hash` |
| `429` | `{ "error": "Too many failed attempts", "retry_after_seconds": number }` | Rate-limit lockout (5 failed attempts → 10 min lockout, see [Sync System: Rate Limiting](sync.md#rate-limiting)) |
| `500` | `{ "error": "..." }` | D1 unreachable or internal error |

Successful authentication transparently upgrades legacy v1 password hashes to v2 PBKDF2-based hashes. See [Encryption: Password Hashing](encryption.md#password-hashing).

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
    "hn": [{ "title": "...", "url": "...", "discussionUrl": "...", "score": 100, "source": "HN", "date": 1706000000000 }],
    "lobsters": [{ "title": "...", "url": "...", "score": 50, "source": "Lobsters" }],
    "reddit": [{ "title": "...", "url": "...", "score": 200, "source": "r/rust" }],
    "github": [{ "title": "...", "url": "...", "score": 1000, "source": "GitHub (Rust)" }],
    "devto": [{ "title": "...", "url": "...", "score": 30, "source": "Dev.to" }]
  }
}
```

Feed items have `title`, `url`, `score`, and `source`. HN, Lobsters, and Reddit items also include `discussionUrl` (link to comments when the primary URL is an article) and `date` (Unix timestamp in milliseconds). Items older than 7 days are filtered out server-side.

The client curates HN/Lobsters items via a lightweight call to the configured curation provider before including in the prompt. Reddit, GitHub, and Dev.to are already profile-targeted.

Responses set CORS headers (`Access-Control-Allow-Origin: *`, etc.) so the endpoint can be hit from any origin. An `OPTIONS /api/feeds` handler answers preflight requests. On fetch failure the endpoint still returns HTTP 200 with `{ items: 0, context: '', error: '...' }` to keep the client pipeline non-fatal.

## `GET /api/fetch-article?url=...`

Server-side article text extraction used as the second-tier fallback for TLDR summaries (first tier is Jina Reader from the browser). **No auth required.**

**Response:**
```json
{ "text": "extracted article body" }
```

The response body is capped at ~5000 characters server-side to keep client LLM calls cheap.

---

## Sync Endpoints

The following endpoints support the [sync system](sync.md).

## `POST /api/profile/create`

Create or re-upload a profile. Used for initial share. If the profile already exists, the password must match before the update is applied.

**Request:**
```json
{
  "id": "uuid (optional - auto-generated if omitted)",
  "name": "Profile Name",
  "password_hash": "salt:hash",
  "encrypted_api_key": "base64...",
  "salt": "base64...",
  "keys_hash": "base64... (optional)",
  "languages": ["JavaScript"],
  "frameworks": ["React"],
  "tools": ["Docker"],
  "topics": ["AI/ML"],
  "depth": "standard",
  "custom_focus": "optional text"
}
```

Required fields: `name`, `password_hash`, `encrypted_api_key`, `salt`. Missing required fields return `400 { "error": "Missing required fields" }`.

!!! note "`encrypted_api_key` Format"
    The `encrypted_api_key` field contains **all API keys** (Anthropic, DeepSeek, Gemini, Perplexity, Serper) plus `providerSelections` and `modelSelections` encrypted as a JSON blob. The field name is singular for backward compatibility, but it stores the full bundle.

**Response** (201):
```json
{
  "id": "uuid",
  "name": "Profile Name"
}
```

## `GET /api/profile/{id}?password_hash=...`

Get full profile data including encrypted API keys. Requires password. Supports `include_data=true` query param to also return encrypted diffs and stars.

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
  "custom_focus": null,
  "resolved_sources": null,
  "content_hash": null,
  "content_updated_at": "2026-01-26T04:13:00Z"
}
```

With `include_data=true`, the response also includes `encrypted_diffs` and `encrypted_stars` arrays.

## `PUT /api/profile/{id}`

Update profile metadata. Requires password in request body.

**Request:**
```json
{
  "password_hash": "salt:hash",
  "name": "New Name",
  "languages": ["TypeScript"],
  "frameworks": ["Svelte"],
  "tools": [],
  "topics": [],
  "depth": "detailed",
  "custom_focus": "...",
  "resolved_sources": {}
}
```

Only fields present in the request are updated. Allowed fields: `name`, `languages`, `frameworks`, `tools`, `topics`, `depth`, `custom_focus`, `resolved_sources`.

**Response:**
```json
{ "success": true }
```

## `DELETE /api/profile/{id}?password_hash=...`

Delete a profile and all associated diffs and stars (cascade). Requires password.

**Response:**
```json
{ "success": true }
```

## `GET /api/profile/{id}/status`

Check if profile exists and get content hashes. **No auth required.**

**Response:**
```json
{
  "exists": true,
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "tldrs_hash": "hex...",
  "keys_hash": "base64...",
  "content_updated_at": "2026-01-26T04:13:00Z"
}
```

Returns `{ "exists": false }` if the profile doesn't exist.

## `POST /api/profile/{id}/content`

Download encrypted content. Requires password. Supports selective download — pass local hashes to skip unchanged collections.

**Request:**
```json
{
  "password_hash": "salt:hash",
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "tldrs_hash": "hex...",
  "keys_hash": "base64..."
}
```

All `*_hash` fields are optional. When provided, the server skips returning that collection if the hash matches, setting the corresponding `*_skipped: true` flag instead.

**Response:**
```json
{
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "tldrs": [{ "id": "diffId:pIndex", "encrypted_data": "base64..." }],
  "encrypted_api_key": "base64...",
  "diffs_skipped": false,
  "stars_skipped": false,
  "tldrs_skipped": false,
  "keys_skipped": false,
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

Upload content and deletions. Requires password. The server enforces a cap of 50 diffs per profile, deleting the oldest beyond that limit.

**Request:**
```json
{
  "password_hash": "salt:hash",
  "diffs": [{ "id": "uuid", "encrypted_data": "base64 or JSON" }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "tldrs": [{ "id": "diffId:pIndex", "encrypted_data": "base64..." }],
  "encrypted_api_key": "base64... (when keysModified)",
  "deleted_diff_ids": ["uuid"],
  "deleted_star_ids": ["uuid"],
  "deleted_tldr_ids": ["diffId:pIndex"],
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "tldrs_hash": "hex...",
  "keys_hash": "base64...",
  "resolved_sources": {},
  "profile": { "name": "...", "languages": [], "..." : "..." }
}
```

!!! note "Public Diffs"
    For [public diffs](public-diff-sharing.md), `encrypted_data` contains plaintext JSON (starts with `{`) instead of an encrypted base64 blob. The server detects this format and serves public diffs via `/api/diff/{id}/public`.

!!! info "CDN Cache Purge"
    When any public diffs are touched (created, modified, or unshared), the server issues a Cloudflare Cache Tag purge for the affected `diff-{id}` tags. Requires `CF_ZONE_ID` and `CF_API_TOKEN` env vars; the purge is best-effort and does not block the response.

**Response:**
```json
{
  "success": true,
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "tldrs_hash": "hex...",
  "synced": {
    "diffs": 5,
    "stars": 3,
    "tldrs": 2,
    "deleted_diffs": 1,
    "deleted_stars": 0,
    "deleted_tldrs": 0
  }
}
```

## `GET /api/profile/{id}/sync?diffs_hash=...&stars_hash=...&tldrs_hash=...`

Quick sync check — compares client hashes against server to determine if sync is needed. **No auth required.** Returns 404 if the profile doesn't exist.

**Response:**
```json
{
  "needs_sync": true,
  "diffs_sync_needed": true,
  "stars_sync_needed": false,
  "tldrs_sync_needed": false,
  "server_diffs_hash": "hex...",
  "server_stars_hash": "hex...",
  "server_tldrs_hash": "hex...",
  "server_updated_at": "2026-01-26T04:13:00Z"
}
```

## `POST /api/profile/{id}/password`

Change sync password. Re-encrypts all data (all API keys, diffs, stars) with the new password client-side, then uploads everything in an atomic batch.

**Request:**
```json
{
  "old_password_hash": "salt:hash",
  "new_password_hash": "salt:hash",
  "new_encrypted_api_key": "base64...",
  "new_salt": "base64...",
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "tldrs": [{ "id": "diffId:pIndex", "encrypted_data": "base64..." }]
}
```

!!! note "Public Diffs and Password Change"
    The password-change client preserves the `isPublic` flag: public diffs are re-serialized as plaintext JSON (not re-encrypted), so `GET /api/diff/{id}/public` keeps working after rotation. See [Public Diff Sharing](public-diff-sharing.md).

**Response:**
```json
{
  "success": true,
  "message": "Password updated successfully"
}
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
  "profile_name": "Chris",
  "window_days": 7
}
```

`profile_name` falls back to `"Anonymous"` when the profile lookup returns no name. `window_days` is optional.

**Cache Headers:** `Cache-Control: public, max-age=86400`, `Cache-Tag: diff-{id}`

---

## `GET /api/share/{id}`

Get public profile info for import flow. **No auth required.** Response includes `Cache-Control: no-cache`.

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
  "password_salt": "base64... or null"
}
```

`password_salt` may be `null` for local-only profiles that were briefly published without a password (legacy data). Importers should treat `null` as "not shareable."

---

## Share Code Endpoints

Short-lived 4-character codes for cross-device profile imports without typing the full UUID. Backed by KV with a 120-second TTL.

### `POST /api/share-code`

Mint a new share code for a profile. **No auth required at the endpoint** — possession of the profile ID is the only gate, and the resulting code is single-use within 120 seconds.

**Request:**
```json
{ "profile_id": "uuid" }
```

**Response:**
```json
{ "code": "AB12", "expires_in": 120 }
```

### `GET /api/share-code/{code}`

Resolve and **consume** a share code. The KV entry is deleted after a successful read.

**Response:**
```json
{ "profile_id": "uuid" }
```

Returns `404 { "error": "Code not found" }` if expired or already consumed.

### `HEAD /api/share-code/{code}`

Liveness check without consuming the code. Returns `200` if the code is valid, `404` otherwise.

---

## CLI Auth Relay Endpoints

Ephemeral relay used by `difflog login` to hand off a profile ID from browser to terminal. See [CLI Login Architecture](cli-login.md). **No auth required.**

### `GET /api/cli/auth/{code}`

CLI polls this endpoint after generating an auth `code`. `code` must match `/^[0-9a-f]{12}$/` or the endpoint returns `400`.

**Response:**

- `{ "pending": true }` — relay blob not yet uploaded
- `{ "session": "<base64 ciphertext>" }` — encrypted `{ profileId }` blob (KV entry is deleted after this read)

### `POST /api/cli/auth/{code}`

Browser uploads the encrypted relay blob.

**Request:**
```json
{ "encrypted_session": "<base64 ciphertext>", "expires": 1735689600000 }
```

KV TTL is clamped to `min(300, max(1, ceil((expires - now) / 1000)))` seconds (≤5 minutes).
