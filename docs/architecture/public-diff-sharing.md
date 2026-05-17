---
icon: lucide/eye
---

# Public Diff Sharing

Individual diffs can be shared publicly via a URL, allowing anyone to view a specific diff without authentication.

## Overview

| Aspect | Detail |
|--------|--------|
| **URL Format** | `/d/{diffId}` (e.g., `/d/abc123`) |
| **Requirement** | Profile must be synced |
| **Storage** | Plaintext JSON (not encrypted) |
| **Caching** | 24-hour CDN cache |

## How It Works

### Storage Format

Public and private diffs are distinguished by their storage format in the database:

```
Public diff:  {"content": "...", "title": "...", "generated_at": "..."}  (JSON)
Private diff: U2FsdGVkX1...base64...  (encrypted blob)
```

The server detects public diffs by checking if `encrypted_data` starts with `{`.

### Share Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server

    U->>C: Click eye icon → "Share publicly"
    C->>C: Set diff.isPublic = true
    C->>S: POST /api/profile/{id}/sync
    Note over C,S: Diff sent as plaintext JSON<br/>(not encrypted)
    S->>S: Store in diffs table
    S->>S: Purge CDN cache (if configured)
    C->>U: Show public URL
```

### Unshare Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant S as Server

    U->>C: Click "Unshare"
    C->>C: Set diff.isPublic = false
    C->>S: POST /api/profile/{id}/sync
    Note over C,S: Diff sent as encrypted blob
    S->>S: Store encrypted version
    S->>S: Purge CDN cache
    C->>U: Show private status
```

## UI

The share status is displayed with an eye icon in the diff header:

| Icon | State | Description |
|------|-------|-------------|
| 👁 (open) | Public | Anyone with the URL can view |
| 👁‍🗨 (closed) | Private | Only accessible via sync |

Clicking the icon opens a dropdown:

- **Private diff**: "Share publicly" button (requires active sync session)
- **Public diff**: Shows URL, copy button, and "Unshare" button

!!! note "Sync Required"
    The share dropdown only appears for synced profiles. Users must have an active sync password to modify share status.

### CLI Share Menu

The interactive CLI viewer (`difflog show`) has an equivalent share menu (`src/cli/interactive.ts`):

| Key | Action |
|-----|--------|
| `s` | Toggle share state (private ↔ public) |
| `b` | Open public URL in default browser |
| `c` | Copy public URL to clipboard |
| `p` | Direct toggle of public/private from the main viewer |

The CLI uses the same `shareDiff` / `unshareDiff` sync path as the web client.

## API

### `GET /api/diff/{id}/public`

Retrieve a public diff. Returns 404 for private diffs.

**Response (200):**
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

`profile_name` falls back to `"Anonymous"` if the profile lookup returns no name (`src/routes/api/diff/[id]/public/+server.ts:80`). `window_days` is optional and only included when the source diff records it.

**Response (404):**
```json
{ "error": "Diff not found" }
```

**Cache Headers:**
```
Cache-Control: public, max-age=86400
Cache-Tag: diff-{id}
```

### Cache Invalidation

When a diff is modified or unshared, the server purges the CDN cache using Cloudflare's Cache Tag API. Requires `CF_ZONE_ID` and `CF_API_TOKEN` environment variables.

## Client Implementation

### Store Methods

```typescript
// Mark diff as public (triggers sync)
shareDiff(diffId: string): boolean

// Mark diff as private (triggers sync)
unshareDiff(diffId: string): boolean

// Check if diff is public
isDiffPublic(diffId: string): boolean

// Get shareable URL
getPublicDiffUrl(diffId: string): string  // → "https://difflog.app/d/{id}"
```

### Sync Serialization

During sync, diffs are serialized based on their `isPublic` flag:

```typescript
if (diff.isPublic) {
  // Store as plaintext JSON
  const { isPublic, ...diffData } = diff;
  encrypted_data = JSON.stringify(diffData);
} else {
  // Store as encrypted blob
  encrypted_data = await encryptData(diff, password, salt);
}
```

On download, the format is detected and `isPublic` is restored:

```typescript
if (encrypted_data.startsWith('{')) {
  diff = JSON.parse(encrypted_data);
  diff.isPublic = true;
} else {
  diff = await decryptData(encrypted_data, password, salt);
  diff.isPublic = false;
}
```

## Security Considerations

!!! warning "Public Content"
    Public diffs are **not encrypted**. The full diff content (markdown) is stored in plaintext and accessible to anyone with the URL.

- Diff IDs are UUIDs — not guessable, but not secret if shared
- Profile name is included in the public response (falls back to `"Anonymous"`)
- API keys and other profile data remain encrypted
- Stars (bookmarks) are always encrypted
- Password rotation preserves public status: the password-change flow reuses the shared `encryptDiffs` helper, which branches on `isPublic` and keeps public diffs as plaintext JSON
