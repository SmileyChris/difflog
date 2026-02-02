# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**difflog** — A multi-page app that generates personalized developer intelligence diffs using Claude. Shows developers what's changed in their tech ecosystem since they last checked in.

**Two modes:**
- **BYOK** — User provides Anthropic API key, calls API directly from browser
- **Creds** — User purchases credits, server calls API on their behalf

## Commands

```bash
bun run dev          # Full dev with wrangler (D1, functions, Stripe webhooks)
bun run dev:static   # Quick dev server (no D1/creds features)
bun run build        # Build to dist/ (verifies TypeScript compiles)
bun run docs         # Serve architecture documentation locally
bun test             # Run tests
```

**Note:** This project has no tsconfig.json. Do not use `npx tsc`. Do not build after changes, the development server rebuilds and makes you doing this redundant.

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

- `src/` — TypeScript source (components, lib utilities)
- `public/` — HTML pages (multi-page app, each page standalone)
- `partials/` — HTML snippets inlined at build time via `<!-- @include partials/filename.html -->`
- `functions/` — Cloudflare Pages Functions (API endpoints)
- `docs/` — Architecture documentation (Zensical/MkDocs)

## Architecture Docs

Detailed documentation lives in `docs/`. Key topics:

- `docs/architecture/creds.md` — Creds system, Stripe, rate limits
- `docs/architecture/sync.md` — Cloud sync with client-side encryption
- `docs/architecture/api.md` — All API endpoints
- `docs/operations/changelog.md` — Changelog system

Run `bun run docs` to browse locally.

## Versioning & Changelog

When adding features or making releases:

1. Update `package.json` version
2. Add entry to `public/changelog.json` (see format in `docs/operations/changelog.md`)

The changelog modal shows users what's new. Version from package.json is injected at build time.

## Styling

Class-based CSS in `src/styles.css` with CSS custom properties. Other styles done as part of the build system.
Use and update the design language in `_dev/design.html` where appropriate.

## Documentation

Docs use [Zensical](https://zensical.com/) (MkDocs-based). Config in `zensical.toml`.

- `docs/architecture/` — System design (encryption, sync, API)
- `docs/operations/` — Deployment, cleanup, migrations

## Releasing

When ready to cut a release:

1. **Bump version** in `package.json` (patch for fixes, minor for features)
2. **Update changelog** in `public/changelog.json`:
   - For patches: add entries to existing version's `changes` array with `"in": "x.y.z"`
   - For minor: add new version object at top of `versions` array
3. **Commit**: `release: vX.Y.Z`
4. **Tag**: `git tag vX.Y.Z && git push --tags`

See `docs/operations/changelog.md` for changelog format details.
