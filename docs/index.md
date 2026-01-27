---
icon: lucide/rocket
---

# Difflog Developer Documentation

Difflog is a personalized developer intelligence app that generates customized diffs showing what's changed in the dev ecosystem since you last checked in.

## Key Features

- **Multi-profile support** - Create multiple profiles with different tech stacks
- **End-to-end encryption** - Your API keys and content are encrypted client-side
- **Cross-device sync** - Sync profiles, diffs, and stars across devices
- **Offline-first** - Works locally, sync is optional

## Technology Stack

**Client:** [Alpine.js](https://alpinejs.dev/) with [@alpinejs/persist](https://alpinejs.dev/plugins/persist) for localStorage and [Alpine AJAX](https://alpine-ajax.js.org/) for SPA-like page transitions.

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
