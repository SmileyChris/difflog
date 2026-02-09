---
icon: lucide/server
---

# API Endpoints

SvelteKit API routes (`+server.ts` files under `src/routes/api/`). Sync endpoints use D1 database with [client-side encryption](encryption.md).

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

---

## Sync Endpoints

The following endpoints support the [sync system](sync.md).

## `POST /api/profile/create`

Create or re-upload a profile. Used for initial share. If the profile already exists, the password must match before the update is applied.

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

**Response** (201):
```json
{
  "id": "uuid",
  "name": "Profile Name"
}
```

## `GET /api/profile/{id}?password_hash=...`

Get full profile data including encrypted API key. Requires password. Supports `include_data=true` query param to also return encrypted diffs and stars.

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
  "stars_hash": "hex..."
}
```

The `diffs_hash` and `stars_hash` fields are optional. When provided, the server skips fetching that collection if the hash matches, returning `diffs_skipped: true` or `stars_skipped: true` instead.

**Response:**
```json
{
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "diffs_skipped": false,
  "stars_skipped": false,
  "content_hash": null,
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
  "deleted_diff_ids": ["uuid"],
  "deleted_star_ids": ["uuid"],
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "resolved_sources": {},
  "profile": { "name": "...", "languages": [], "..." : "..." }
}
```

!!! note "Public Diffs"
    For [public diffs](public-diff-sharing.md), `encrypted_data` contains plaintext JSON (starts with `{`) instead of an encrypted base64 blob. The server detects this format and serves public diffs via `/api/diff/{id}/public`.

**Response:**
```json
{
  "success": true,
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "synced": {
    "diffs": 5,
    "stars": 3,
    "deleted_diffs": 1,
    "deleted_stars": 0
  }
}
```

## `GET /api/profile/{id}/sync?diffs_hash=...&stars_hash=...`

Quick sync check — compares client hashes against server to determine if sync is needed. **No auth required.**

**Response:**
```json
{
  "needs_sync": true,
  "diffs_sync_needed": true,
  "stars_sync_needed": false,
  "server_diffs_hash": "hex...",
  "server_stars_hash": "hex...",
  "server_updated_at": "2026-01-26T04:13:00Z"
}
```

## `POST /api/profile/{id}/password`

Change sync password. Re-encrypts all data (API key, diffs, stars) with the new password client-side, then uploads everything in an atomic batch.

**Request:**
```json
{
  "old_password_hash": "salt:hash",
  "new_password_hash": "salt:hash",
  "new_encrypted_api_key": "base64...",
  "new_salt": "base64...",
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }]
}
```

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
  "profile_name": "Chris"
}
```

**Cache Headers:** `Cache-Control: public, max-age=86400`, `Cache-Tag: diff-{id}`

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
