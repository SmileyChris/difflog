---
icon: lucide/layers
---

# Architecture Overview

diff·log is a SvelteKit SPA with optional cloud sync capabilities.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | SvelteKit with Svelte 5 runes |
| **Styling** | Global CSS (`app.css`) + scoped component styles |
| **Build** | Vite via SvelteKit (Cloudflare adapter) |
| **Backend** | SvelteKit API routes on Cloudflare Pages |
| **Database** | Cloudflare D1 (SQLite) |
| **AI** | Multi-provider (Anthropic, DeepSeek, Gemini, Perplexity, Serper — see [AI Pipeline](../ai.md)) |

## Client Architecture

### Module Structure

```
src/
├── routes/                    # SvelteKit file-based routing
│   ├── +layout.svelte         # Root layout (CSS, View Transitions)
│   ├── +page.svelte           # Dashboard
│   ├── about/                 # Landing, privacy, terms
│   ├── setup/                 # Profile creation/editing wizard
│   ├── profiles/              # Profile management, sync, sharing
│   ├── archive/               # Past diffs list
│   ├── stars/                 # Bookmarked paragraphs
│   ├── generate/              # Diff generation page
│   ├── d/[id]/                # Public diff view
│   ├── design/                # Design system (dev only)
│   └── api/                   # Server endpoints
├── lib/
│   ├── stores/                # Svelte 5 state management
│   │   ├── profiles.svelte.ts # Profile CRUD
│   │   ├── history.svelte.ts  # Diff history, streaks
│   │   ├── stars.svelte.ts    # Bookmarks
│   │   ├── sync.svelte.ts     # Cloud sync state
│   │   ├── ui.svelte.ts       # Transient UI state
│   │   ├── operations.svelte.ts # Cross-domain composite operations
│   │   └── persist.svelte.ts  # localStorage/sessionStorage helpers
│   ├── components/            # Reusable Svelte components
│   ├── utils/                 # Pure utility functions
│   │   ├── providers.ts       # AI provider configuration
│   │   ├── llm.ts             # Multi-provider LLM abstraction
│   │   ├── search.ts          # Web search providers
│   │   ├── feeds.ts           # Feed fetching and curation
│   │   ├── prompt.ts          # Prompt construction
│   │   ├── sync.ts            # Sync utilities, types
│   │   ├── crypto.ts          # Client-side encryption
│   │   ├── markdown.ts        # Markdown rendering
│   │   └── ...                # api, constants, time, pricing, etc.
│   └── actions/               # Svelte actions
│       ├── clickOutside.ts    # Click-outside detection
│       └── generateDiff.ts    # Diff generation orchestration
└── app.css                    # Global styles and design system
```

### Store Architecture

Domain-driven store modules using Svelte 5 `$state()` runes. State is exposed via accessor objects with `get/set value()`. Derived state uses functions. Actions are plain functions that mutate state.

```typescript
// Reading state
const profile = getProfile();
const history = getHistory();

// Mutating state
addDiff(entry);
updateProfile({ name: 'New Name' });
```

localStorage keys: `difflog-profiles`, `difflog-histories`, `difflog-bookmarks`, `difflog-active-profile`, `difflog-pending-sync`.

## Server Architecture

### SvelteKit API Routes

API endpoints are `+server.ts` files under `src/routes/api/`:

```
src/routes/api/
├── feeds/+server.ts              # Fetch developer news feeds
├── diff/[id]/public/+server.ts   # Public diff view
├── profile/
│   ├── create/+server.ts         # Create/update profile
│   ├── [id]/+server.ts           # Get/update/delete profile
│   └── [id]/
│       ├── content/+server.ts    # Download encrypted content
│       ├── password/+server.ts   # Update password
│       ├── status/+server.ts     # Sync status check
│       └── sync/+server.ts       # Upload content
├── share/[id]/+server.ts         # Public profile info
├── auth.ts                       # Shared auth helpers
└── types.ts                      # Shared types
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
  keys_hash TEXT,
  password_salt TEXT,
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
