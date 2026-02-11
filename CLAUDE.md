# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**difflog** — A SvelteKit app that generates personalized developer intelligence diffs using multiple AI providers (Anthropic, DeepSeek, Gemini, Perplexity, Serper). Shows you what's changed in the dev ecosystem since you last checked in.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Dev server with Vite (includes D1 via wrangler)
bun test             # Run tests
bun run build        # Production build
bun run cleanup      # List stale profiles (--days, --remote, --confirm flags)
bun run db:migrate   # Apply D1 migrations
bun run docs         # Serve documentation (Zensical/MkDocs)
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
1. User clicks Generate → resolves custom sources (curation provider), fetches `/api/feeds` + web search in parallel
2. Curates general feeds for relevance (curation provider)
3. Builds prompt with `src/lib/utils/prompt.ts`
4. Calls selected synthesis provider directly from browser (API keys in localStorage)
5. Stores markdown in history, renders with `src/lib/utils/markdown.ts`

Pipeline steps use configurable providers: search (Serper/Perplexity/Anthropic, optional), curation (DeepSeek/Gemini/Anthropic), synthesis (DeepSeek/Gemini/Anthropic/Perplexity). See `src/lib/utils/providers.ts` and `src/lib/utils/llm.ts`.

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
- `src/lib/utils/providers.ts` — Provider capabilities and step configuration
- `src/lib/utils/llm.ts` — Multi-provider LLM abstraction (curation + synthesis)
- `src/lib/utils/search.ts` — Web search providers (Serper, Perplexity, Anthropic)
- `src/lib/utils/prompt.ts` — Prompt construction for diff generation
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

**Hybrid CSS architecture**: Global CSS in `src/app.css` + scoped styles in component `<style>` blocks.

### Global Styles (`src/app.css`)
- Design system variables (CSS custom properties)
- Base element styles (html, body, buttons, links)
- Input styles (`.text-input`, `.input-group`, `.input-label`)
- Chip styles (`.chip`, `.chip-selected`, `.chip-grid`)
- Markdown rendering (`.md-h1`, `.md-p`, etc.) — dynamically generated
- Animations and keyframes

### Scoped Styles (Component `<style>` blocks)
- Component-specific styles that don't need to be shared
- Prefer scoped styles for new components
- Use `:global()` sparingly for dynamic content styling

### Actions (`src/lib/actions/`)
- `clickOutside.ts` — Svelte action for click-outside detection (dropdowns, modals)
- `generateDiff.ts` — Diff generation orchestration logic

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
