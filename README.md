# diff·log

[difflog.dev](https://difflog.dev) | [Developer Docs](https://smileychris.github.io/difflog/)

**diff·log** is a multi-page web application that generates personalized "diffs" for the developer ecosystem. It scans for updates in languages, frameworks, and tools you care about, using the Anthropic Claude API to summarize what's changed since you last checked in.

![License](https://img.shields.io/badge/license-MIT-blue.svg)

## Features

- **Personalized Intelligence**: Generates a custom textual "diff" of the dev world based on your profile (languages, tools, interests).
- **Local-First**: All profile data stored in your browser's local storage.
- **Two API Modes**: Bring your own Anthropic API key (BYOK) for client-side generation, or use creds with an email-based account for server-side generation.
- **Sync (Optional)**: Optional Cloudflare D1 backend to sync profiles across devices.
- **SPA Feel**: Built with Alpine.js and Alpine AJAX for smooth transitions between server-rendered HTML pages.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Frontend**: [Alpine.js](https://alpinejs.dev)
- **Styling**: Vanilla CSS (Dark Theme)
- **Backend (Sync)**: Cloudflare Pages + D1

## Quick Start

1.  **Install dependencies**:

    ```bash
    bun install
    ```

2.  **Start development server**:

    ```bash
    bun run dev
    ```

    This starts the local server at `http://localhost:3000`.

3.  **Build for production**:
    ```bash
    bun run build
    ```
    Outputs to `dist/`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
