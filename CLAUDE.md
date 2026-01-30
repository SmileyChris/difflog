# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**difflog** — A multi-page app that generates personalized developer intelligence diffs using the Anthropic Claude API. Shows you what's changed in the dev ecosystem since you last checked in. Uses Alpine.js for client-side reactivity, CSS View Transitions for smooth page navigation, and Bun for bundling/dev server.

## Commands

```bash
bun install          # Install dependencies
bun run dev          # Full dev with wrangler (D1 database, functions, Stripe webhooks)
bun run dev:static   # Quick dev server (no D1)
bun test             # Run tests
bun run build        # Build to dist/ (also verifies TypeScript compiles)
bun run cleanup      # List stale profiles (--days, --remote, --confirm flags)
bun run db:migrate   # Apply D1 migrations
bun run docs         # Serve architecture documentation locally
```

**Note:** This project has no tsconfig.json. Use `bun run build` to verify TypeScript compiles correctly. Do not use `npx tsc`.

**Stripe webhooks:** `bun run dev` automatically starts `stripe listen` to forward webhooks locally. Requires [Stripe CLI](https://stripe.com/docs/stripe-cli) to be installed and logged in (`stripe login`).

## Architecture

**Multi-page with View Transitions** — each page is a full HTML document in `public/`. CSS View Transitions provide smooth cross-document animations. Each page works standalone on direct load.

### Pages (in `public/`)
- `index.html` (`/`) — Dashboard: profile summary, generate button, diff display
- `welcome.html` (`/welcome`) — Landing page for new users
- `setup.html` (`/setup`) — 7-step profile setup wizard
- `profiles.html` (`/profiles`) — Profile management, sync, sharing
- `archive.html` (`/archive`) — Past diffs list
- `stars.html` (`/stars`) — Bookmarked paragraphs

### Client-Side State
Alpine.js with `$persist` plugin for localStorage persistence. Keys: `difflog-profiles`, `difflog-histories`, `difflog-bookmarks`, `difflog-active-profile`.

### API Flow
1. User clicks Generate → fetches `/api/feeds` for context
2. Builds prompt with `src/lib/prompt.ts`
3. Calls Anthropic API directly from browser (API key in localStorage)
4. Stores markdown in history, renders with `src/lib/markdown.ts`

### Sync System
Local-first with optional password-protected cloud sync via Cloudflare D1. All data encrypted client-side (AES-GCM) before upload. See `src/lib/sync.ts` and `src/lib/crypto.ts`.

## Key Directories

- `src/` — TypeScript source (components, lib utilities, styles)
- `public/` — HTML pages served directly
- `partials/` — HTML snippets inlined at build time via `<!-- @include partials/filename.html -->`
- `functions/` — Cloudflare Pages Functions (D1 API endpoints)
- `dist/` — Built output, do not edit (generated from src/ and public/)
- `docs/` — Architecture documentation (Zensical/MkDocs format)

## Key Files

- `server.ts` — Bun.serve() for local dev
- `build.ts` — Build script (bundles JS, processes HTML includes)
- `src/app.ts` — Entry point, Alpine plugin registration
- `src/store.ts` — Central Alpine store (profiles, histories, bookmarks, sync state)
- `src/components/dashboard.ts` — Main diff generation and display logic
- `src/components/setup.ts` — Profile setup wizard
- `src/lib/prompt.ts` — Prompt construction for Claude API
- `src/lib/sync.ts` — Sync service (upload, download, change tracking)
- `src/lib/crypto.ts` — Client-side encryption (AES-GCM, PBKDF2)
- `src/lib/markdown.ts` — Markdown-to-HTML renderer with `data-p` indices for bookmarking
- `functions/api/profile/` — D1 endpoints for profile sync

## Testing

```bash
bun test                           # Run all tests
bun test src/lib/sync.test.ts      # Run specific test file
```

## Styling

Class-based CSS in `src/styles.css` with CSS custom properties. Dark theme with `#00d4aa` accent color.

## Documentation

Docs use [Zensical](https://zensical.com/) (MkDocs-based). Config in `zensical.toml`.

- `docs/architecture/` — System design (encryption, sync, API)
- `docs/operations/` — Deployment, cleanup, migrations
