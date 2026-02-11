---
icon: lucide/terminal
---

# CLI Roadmap

**Status:** In Development

A terminal client for generating and reading diffs without opening a browser.

!!! success "Web-Assisted Login Implemented"
    See [CLI Usage](../cli.md) for user documentation and [CLI Login Architecture](../architecture/cli-login.md) for technical details.

---

## Goals

1. **Frictionless access** — no browser, no login. Just a command.
2. **UNIX-friendly** — text output that works with `grep`, `less`, `glow`, `jq`. `stdout` for content, `stderr` for status.
3. **Local-first** — keys and profile data stay encrypted on disk, same as the browser model.

---

## Usage Examples

```bash
# Zero-friction default: login or show latest diff
$ difflog

# Morning briefing
$ difflog gen --today

# Deep dive on a topic, piped to a markdown reader
$ difflog gen --focus "security" --deep | glow -

# One-line summary for CI/scripts
$ difflog summary --profile team-backend
```

---

## Implementation: Bun vs Rust

### Option A: Bun (TypeScript)

Reuses the existing `src/lib/` codebase (feeds, prompts, crypto, types).

- **Code reuse:** ~90% of logic is shared with the web app. Prompt/AI improvements apply to both instantly.
- **Distribution:** `bun build --compile` produces a single standalone binary (~90MB) — no Bun/Node install required. Cross-compiles to Linux, macOS (ARM + Intel), and Windows.
- **Tradeoff:** Larger binary size, JS runtime under the hood.

### Option B: Rust

Native rewrite for a smaller, faster binary.

- **Distribution:** ~5MB static binary, easy `brew install`.
- **Tradeoff:** Must reimplement everything (WebCrypto → Ring, fetch logic, prompts). Web and CLI logic will drift, doubling maintenance.

### Recommendation

**Option A (Bun) for MVP.** The AI logic and encryption are complex enough that code reuse matters more than binary size. Can revisit Rust later if distribution demands it.

---

## Feature Roadmap

### v0.1: Viewer ✅ Implemented
- ✅ `difflog login` — web-assisted authentication or direct login with credentials
- ✅ `difflog ls` — list past diffs
- ✅ `difflog show <id>` — read a diff in the terminal

### v0.2: Generator
- `difflog gen` — full pipeline: fetch feeds, call AI, render, encrypt, sync
- `--quick` and `--deep` depth flags

### v0.3: Integrator
- `difflog summary` — plain text output for scripts
- `difflog config` — edit profile from the CLI
- `--json` flag on all commands for piping to `jq`

---

## Design Principles

- Detect dark/light terminal theme for ANSI colors
- Minimalist spinners (dots, no ASCII art banners)
- Silent on success when piped
- Render markdown headers as bold/colored, hyperlink URLs via OSC 8 where supported

---

## Distribution

### Build Pipeline (GitHub Actions)

Triggered on pushes to `main` (nightly) or new tags (stable releases):

1. Cross-compile via `bun build --compile` for 4 targets: `linux-x64`, `darwin-arm64`, `darwin-x64`, `windows-x64`
2. Upload binaries as artifacts
3. On tagged release, create GitHub Release with attached binaries

### Installation

- **Direct download** from GitHub Releases
- **Shell script** — `curl | sh` that detects OS and downloads the correct binary
- **Homebrew** (future) — custom tap for `brew install difflog`
