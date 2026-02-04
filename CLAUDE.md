# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**difflog** — A SvelteKit app that generates personalized developer intelligence diffs using the Anthropic Claude API. Shows you what's changed in the dev ecosystem since you last checked in.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server with Vite (includes D1 via wrangler)
bun test             # Run tests
bun run build        # Production build
bun run cleanup      # List stale profiles (--days, --remote, --confirm flags)
bun run db:migrate   # Apply D1 migrations
```

## Architecture

**SvelteKit SPA** with file-based routing. Uses Svelte 5 runes for reactivity.

### Routes (in `src/routes/`)
- `/` — Dashboard: profile summary, generate button, diff display
- `/about` — Landing/about pages (with `/privacy`, `/terms` sub-routes)
- `/setup` — Profile setup wizard
- `/profiles` — Profile management, sync, sharing
- `/archive` — Past diffs list
- `/stars` — Bookmarked paragraphs
- `/api/*` — Server endpoints for D1 database

### Store Architecture (in `src/lib/stores/`)

Domain-driven store modules using Svelte 5 `$state()` runes:

- `persist.svelte.ts` — Shared persistence helpers (localStorage/sessionStorage)
- `profiles.svelte.ts` — Profile state and CRUD operations
- `history.svelte.ts` — Diff history and streak calculations
- `stars.svelte.ts` — Bookmarks management
- `sync.svelte.ts` — Cloud sync state and operations
- `ui.svelte.ts` — Transient UI state (dropdowns, modals)
- `operations.svelte.ts` — Cross-domain composite operations

**Pattern:** State is exposed via accessor objects with `get/set value()`. Derived state uses functions. Actions are plain functions that mutate state.

```typescript
// Reading state
const profile = getProfile();
const history = getHistory();

// Mutating state
addDiff(entry);
updateProfile({ name: 'New Name' });
```

### Client-Side State

localStorage keys: `difflog-profiles`, `difflog-histories`, `difflog-bookmarks`, `difflog-active-profile`, `difflog-pending-sync`.

### API Flow
1. User clicks Generate → fetches `/api/feeds` for context
2. Builds prompt with `src/lib/utils/prompt.ts`
3. Calls Anthropic API directly from browser (API key in localStorage)
4. Stores markdown in history, renders with `src/lib/utils/markdown.ts`

### Sync System
Local-first with optional password-protected cloud sync via Cloudflare D1. All data encrypted client-side (AES-GCM) before upload. See `src/lib/utils/sync.ts` and `src/lib/utils/crypto.ts`.

## Key Directories

- `src/routes/` — SvelteKit pages and API endpoints
- `src/lib/stores/` — Svelte 5 state management modules
- `src/lib/components/` — Reusable Svelte components
- `src/lib/utils/` — Utility functions (API, crypto, markdown, etc.)
- `static/` — Static assets (favicon, changelog.json)
- `docs/` — Architecture documentation (Zensical/MkDocs format)

## Key Files

- `src/routes/+page.svelte` — Main dashboard with diff generation
- `src/routes/+layout.svelte` — Root layout with global styles
- `src/lib/stores/operations.svelte.ts` — Composite operations (addDiff, deleteDiff, etc.)
- `src/lib/utils/prompt.ts` — Prompt construction for Claude API
- `src/lib/utils/sync.ts` — Sync utilities (encryption, API calls)
- `src/lib/utils/crypto.ts` — Client-side encryption (AES-GCM, PBKDF2)
- `src/lib/utils/markdown.ts` — Markdown-to-HTML renderer with `data-p` indices for bookmarking
- `svelte.config.js` — SvelteKit configuration (Cloudflare adapter)
- `vite.config.ts` — Vite configuration

## Testing

```bash
bun test                                # Run all tests
bun test src/lib/utils/sync.test.ts     # Run specific test file
```

## Styling

Class-based CSS in `src/app.css` with CSS custom properties.
Use and update the design system at `/design` (dev-only route).

## Documentation

Docs use [Zensical](https://zensical.com/) (MkDocs-based). Config in `zensical.toml`.

- `docs/architecture/` — System design (encryption, sync, API)
- `docs/operations/` — Deployment, cleanup, migrations

## Releasing

When ready to cut a release:

1. **Bump version** in `package.json` (patch for fixes, minor for features)
2. **Update changelog** in `static/changelog.json`:
   - For patches: add entries to existing version's `changes` array with `"in": "x.y.z"`
   - For minor: add new version object at top of `versions` array
3. **Commit**: `release: vX.Y.Z`
4. **Tag**: `git tag vX.Y.Z && git push --tags`

See `docs/operations/changelog.md` for changelog format details.
