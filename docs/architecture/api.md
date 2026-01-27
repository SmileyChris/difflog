---
icon: lucide/server
---

# API Endpoints

API endpoints for the [sync system](sync.md). All endpoints are Cloudflare Pages Functions using D1 database. All content fields are [encrypted client-side](encryption.md) before upload.

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
  "diffs": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "stars": [{ "id": "uuid", "encrypted_data": "base64..." }],
  "deleted_diff_ids": ["uuid"],
  "deleted_star_ids": ["uuid"],
  "diffs_hash": "hex...",
  "stars_hash": "hex...",
  "profile": { "name": "...", "languages": [], ... }
}
```

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
