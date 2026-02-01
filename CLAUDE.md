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

**Note:** No tsconfig.json. Use `bun run build` to verify TypeScript.

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

Dark theme with `#00d4aa` accent. Class-based CSS in `src/styles.css` and `src/css/`.
