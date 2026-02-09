---
icon: lucide/rocket
---

# diff·log

diff·log is an open source app that uses AI to summarize dev news based on your tech stack. These docs are for technical users interested in the underlying technology.

[difflog.dev](https://difflog.dev) (the site) | [GitHub](https://github.com/SmileyChris/difflog) (the code)

## Overview

- **Local-first** — All data stored in browser localStorage; [sync](architecture/sync.md) is optional
- **End-to-end encrypted** — Sync data is [encrypted](architecture/encryption.md) client-side before upload
- **Multi-profile** — Track different tech stacks separately
- **BYOK** — Bring your own API keys for [AI generation](ai.md) (supports Anthropic, DeepSeek, Gemini, Perplexity, Serper)

## Technology Stack

**Client:** [SvelteKit](https://svelte.dev/) SPA with Svelte 5 runes for reactivity. CSS View Transitions for smooth navigation.

**Server:** [Cloudflare Pages](https://pages.cloudflare.com/) for production hosting, [Cloudflare D1](https://developers.cloudflare.com/d1/) for sync storage. SvelteKit API routes for server endpoints.

**Build:** [Vite](https://vite.dev/) via SvelteKit with Cloudflare adapter. [Bun](https://bun.sh/) as package manager and test runner.

## Architecture Overview

``` mermaid
graph TB
    subgraph Client ["Client (Browser)"]
        Stores[Svelte 5 Stores]
        Crypto[Web Crypto API]
        Storage[localStorage]
    end

    subgraph Server ["Cloudflare Pages"]
        API["/api/* Server Routes"]
    end

    subgraph DB ["Cloudflare D1"]
        Profiles[(profiles)]
        Diffs[(diffs)]
        Stars[(stars)]
    end

    Stores <--> Crypto
    Stores <--> Storage
    Stores <--> API
    API <--> Profiles
    API <--> Diffs
    API <--> Stars
```

## Getting Started

```bash
bun install          # Install dependencies
bun run dev          # Start dev server
```
