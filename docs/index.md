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

**Client:** [Alpine.js](https://alpinejs.dev/) with [@alpinejs/persist](https://alpinejs.dev/plugins/persist) for localStorage. CSS View Transitions for smooth page navigation.

**Server:** [Bun](https://bun.sh/) for local dev, [Cloudflare Pages](https://pages.cloudflare.com/) for production hosting, [Cloudflare D1](https://developers.cloudflare.com/d1/) for sync storage.

**Build:** Bun's HTML imports automatically bundle TypeScript and CSS. No webpack or vite needed.

## Architecture Overview

``` mermaid
graph TB
    subgraph Client ["Client (Browser)"]
        Store[Alpine.js Store]
        Crypto[Web Crypto API]
        Storage[localStorage]
    end

    subgraph Server ["Cloudflare Pages"]
        API["/api/* Functions"]
    end

    subgraph DB ["Cloudflare D1"]
        Profiles[(profiles)]
        Diffs[(diffs)]
        Stars[(stars)]
    end

    Store <--> Crypto
    Store <--> Storage
    Store <--> API
    API <--> Profiles
    API <--> Diffs
    API <--> Stars
```

## Getting Started

```bash
bun install          # Install dependencies
bun run dev          # Start dev server at localhost:3000
```
