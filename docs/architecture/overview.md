---
icon: lucide/layers
---

# Architecture Overview

diff·log is built as a multi-page app with optional cloud sync capabilities.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Alpine.js |
| **Styling** | Custom CSS with CSS variables |
| **Bundling** | Bun HTML imports |
| **Backend** | Cloudflare Pages Functions |
| **Database** | Cloudflare D1 (SQLite) |
| **AI** | Multi-provider (Anthropic, DeepSeek, Gemini, Perplexity, Serper — see [AI Pipeline](../ai.md)) |

## Client Architecture

### Module Structure

The client code is organized into focused modules:

```
src/
├── app.ts              # Entry point (Alpine plugin setup)
├── store.ts            # Alpine store (state management)
├── components/
│   ├── index.ts        # Barrel export
│   ├── dashboard.ts    # Main dashboard component
│   ├── profiles.ts     # Profile management component
│   ├── setup.ts        # Setup wizard component
│   └── share-profile.ts
└── lib/
    ├── sync.ts         # Sync service
    ├── time.ts         # Time utilities
    ├── api.ts          # Fetch utilities
    ├── constants.ts    # Shared constants
    ├── crypto.ts       # Encryption
    ├── prompt.ts       # Prompt building
    ├── feeds.ts        # Feed fetching
    └── markdown.ts     # Markdown rendering
```

### Alpine.js Store

The central state management (`src/store.ts`) uses Alpine's `$persist` plugin for localStorage persistence:

```typescript
Alpine.store('app', {
  // Persisted state
  profiles: Alpine.$persist({}).as('difflog-profiles'),
  histories: Alpine.$persist({}).as('difflog-histories'),
  bookmarks: Alpine.$persist({}).as('difflog-bookmarks'),
  activeProfileId: Alpine.$persist(null).as('difflog-active-profile'),
  pendingSync: Alpine.$persist({}).as('difflog-pending-sync'),

  // Session state (not persisted)
  syncing: false,
  syncError: null,
  syncStatus: null,

  // Computed
  get profile() { return this.profiles[this.activeProfileId]; },
  get history() { return this.histories[this.activeProfileId] || []; },
  get stars() { return this.bookmarks[this.activeProfileId] || []; },

  // Helper methods for templates
  get starCountLabel() { ... },
  formatTimeAgo(dateStr) { ... },
});
```

### Page Structure

Each page is a full HTML document that works standalone:

```
pages/
├── splash.html      # Landing page (/welcome)
├── setup.html       # Profile setup wizard (/setup)
├── dashboard.html   # Main app (/)
├── archive.html     # Past diffs list (/archive)
├── stars.html       # Bookmarked items (/stars)
└── profiles.html    # Profile management (/profiles)
```

CSS View Transitions provide smooth cross-document navigation.

## Server Architecture

### Cloudflare Pages Functions

API endpoints are TypeScript functions in the `functions/` directory:

```
functions/
├── api/
│   ├── generate.ts           # Generate diff via Claude
│   ├── profile/
│   │   ├── create.ts         # Create/update profile
│   │   ├── [id].ts           # Get/update/delete profile
│   │   └── [id]/
│   │       ├── content.ts    # Download encrypted content
│   │       ├── status.ts     # Sync status check
│   │       └── sync.ts       # Upload content
│   └── share/
│       └── [id].ts           # Public profile info
└── types.ts                  # Shared types
```

### D1 Database Schema

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  salt TEXT NOT NULL,
  languages TEXT,           -- JSON array
  frameworks TEXT,          -- JSON array
  tools TEXT,               -- JSON array
  topics TEXT,              -- JSON array
  depth TEXT DEFAULT 'standard',
  custom_focus TEXT,
  resolved_sources TEXT,    -- JSON object
  diffs_hash TEXT,
  stars_hash TEXT,
  content_updated_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  -- Rate limiting
  failed_attempts INTEGER DEFAULT 0,
  lockout_until TEXT,
  last_failed_at TEXT
);

CREATE TABLE diffs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE TABLE stars (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  encrypted_data TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
```

## Data Flow

### Generating a Diff

``` mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant F as /api/feeds
    participant AI as AI Providers

    U->>C: Click "Generate"
    C->>C: Resolve unmapped custom items (curation provider)
    par Parallel fetch
        C->>AI: Web search for profile topics (search provider)
        C->>F: Fetch feeds (grouped by source)
    end
    AI-->>C: Web search results
    F-->>C: HN, Lobsters, Reddit, GitHub, Dev.to items
    C->>AI: Curate HN/Lobsters for relevance (curation provider)
    AI-->>C: Filtered feed items
    C->>C: Build prompt with web results + curated feeds
    C->>AI: Generate diff (synthesis provider)
    AI-->>C: Markdown response
    C->>C: Store markdown in history
    C->>C: Render HTML client-side
    C->>C: Track as modified
    Note over C: Auto-sync if password cached
```

See [AI Pipeline](../ai.md) for details on web search, feed curation, and source resolution.

!!! note "Client-Side Rendering"
    Diffs store only markdown content. HTML is rendered client-side on display using `renderDiff()`. This reduces storage by ~50% and keeps paragraph indices (`data-p` attributes) always in sync with the current renderer.

### Profile Lifecycle

``` mermaid
stateDiagram-v2
    [*] --> Local: Create Profile
    Local --> Shared: Share (set password)
    Shared --> Synced: Import on another device
    Synced --> Synced: Auto-sync changes
    Local --> [*]: Delete
    Shared --> [*]: Delete
```

## Key Files

### Entry & State

| File | Purpose |
|------|---------|
| `src/app.ts` | Entry point — Alpine plugin setup, imports store and components |
| `src/store.ts` | Alpine store — profile/history/sync state management |

### Components

| File | Purpose |
|------|---------|
| `src/components/dashboard.ts` | Main dashboard — diff generation, display, starring |
| `src/components/profiles.ts` | Profile management — switch, import, share, sync |
| `src/components/setup.ts` | Setup wizard — profile creation/editing |
| `src/components/share-profile.ts` | Share profile page component |
| `src/components/index.ts` | Barrel export for all components |

### Libraries

| File | Purpose |
|------|---------|
| `src/lib/sync.ts` | Sync service — upload, download, change tracking |
| `src/lib/time.ts` | Time utilities — `timeAgo()`, `daysSince()`, `formatDate()` |
| `src/lib/api.ts` | Fetch utilities — `fetchJson()`, `postJson()`, `ApiError` |
| `src/lib/constants.ts` | Shared constants — LANGUAGES, FRAMEWORKS, DEPTHS, etc. |
| `src/lib/crypto.ts` | Encryption utilities — AES-GCM, PBKDF2 |
| `src/lib/prompt.ts` | Claude prompt construction |
| `src/lib/feeds.ts` | Feed fetching, AI source resolution, and curation |
| `src/lib/markdown.ts` | Client-side markdown rendering with `data-p` indices |

### Styles

| File | Purpose |
|------|---------|
| `styles.css` | All styles (dark theme) |
