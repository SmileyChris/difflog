# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**difflog** — A multi-page app that generates personalized developer intelligence diffs using the Anthropic Claude API. Shows you what's changed in the dev ecosystem since you last checked in. Uses Alpine.js for client-side reactivity, Alpine AJAX for SPA-like page navigation, and Bun's built-in HTTP server with HTML imports for bundling.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Start Bun dev server at localhost:3000
bun test             # Run tests
bun run build        # Build to dist/ (also verifies TypeScript compiles)
bun run cleanup      # List stale profiles (--days, --remote, --confirm flags)
```

**Note:** This project has no tsconfig.json. Use `bun run build` to verify TypeScript compiles correctly. Do not use `npx tsc` - it won't work.

## Architecture

**Multi-page with Alpine AJAX navigation** — each page is a full HTML document. Alpine AJAX swaps the `#content` area on navigation, giving SPA-like transitions while pages work standalone on direct load.

- **Splash** (`pages/splash.html`): Landing page for new users at `/welcome`
- **Setup** (`pages/setup.html`): 6-step profile setup with chip toggling at `/setup`
- **Dashboard** (`pages/dashboard.html`): Main app at `/` — profile summary, generate button, diff display
- **History** (`pages/history.html`): Past diffs list at `/history`
- **Stars** (`pages/stars.html`): Bookmarked paragraphs at `/stars`
- **Server** (`server.ts`): Bun.serve() with page routes + `/api/generate` endpoint

**Client-side state**: Alpine.js with `$persist` plugin for localStorage persistence across pages. Keys are `difflog-profiles`, `difflog-histories`, `difflog-bookmarks`, `difflog-active-profile`.

**Styling**: Class-based CSS (`styles.css`) with CSS custom properties (dark theme, `#00d4aa` accent).

**Bundling**: Bun's HTML imports automatically bundle `app.ts` and `styles.css` referenced in each page.

**Partials**: Build-time includes via `<!-- @include partials/filename.html -->`. Processed during build, inlined into dist/.

## API Integration

- Server-side `@anthropic-ai/sdk` (no browser access needed)
- Client-side API integration (keys stored in localStorage)
- `/api/generate` POST endpoint accepts profile JSON, calls Claude, returns `{ content, html }`

## Key Directories

- `src/` — Source files (TypeScript, CSS, HTML pages)
- `public/` — Static HTML pages served directly
- `partials/` — Reusable HTML snippets (inlined at build time via `<!-- @include -->`)
- `functions/` — Cloudflare Pages Functions (API endpoints)
- `dist/` — **Built output, do not edit directly** (generated from src/)
- `docs/` — Architecture documentation (MkDocs format)

## Key Files

- `server.ts` — Bun.serve() entry with routes (local dev)
- `src/app.ts` — Entry point, Alpine plugin setup
- `src/store.ts` — Alpine store with profile/history/sync state
- `src/styles.css` — All styles (dark theme)
- `src/components/` — Alpine components (dashboard, profiles, setup, share-profile)
- `src/lib/sync.ts` — Sync service (upload, download, change tracking)
- `src/lib/sync.test.ts` — Bun tests for sync logic (hash determinism, change tracking)
- `src/lib/time.ts` — Time utilities (timeAgo, daysSince)
- `src/lib/api.ts` — Fetch utilities, ApiError class
- `src/lib/constants.ts` — Shared constants (LANGUAGES, FRAMEWORKS, DEPTHS, etc.)
- `src/lib/markdown.ts` — Markdown-to-HTML renderer
- `src/lib/prompt.ts` — Prompt construction for Claude API
- `src/lib/crypto.ts` — Client-side encryption (AES-GCM, PBKDF2)
- `functions/api/` — Cloudflare D1 API endpoints for sync

## Documentation

Docs use [Zensical](https://zensical.com/) (MkDocs-based). Config in `zensical.toml`. Run `bun run docs` to serve locally.

- `docs/architecture/` — System design docs (encryption, sync, API endpoints)
- `docs/operations/` — Deployment and maintenance (cleanup command, migrations)
- `docs/concepts/` — Core concepts

Don't verify the server starts
