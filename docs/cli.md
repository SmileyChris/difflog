---
icon: lucide/terminal-square
---

# CLI Usage

Access diff·log from your terminal without opening a browser. The CLI is built with Bun and shares the same codebase as the web app.

## Installation

### Download Binary

Download the latest release for your platform from [GitHub Releases](https://github.com/SmileyChris/difflog/releases):

```bash
# Linux (x64)
curl -L https://github.com/SmileyChris/difflog/releases/latest/download/difflog-linux-x64 -o difflog
chmod +x difflog
sudo mv difflog /usr/local/bin/

# macOS (Apple Silicon)
curl -L https://github.com/SmileyChris/difflog/releases/latest/download/difflog-darwin-arm64 -o difflog
chmod +x difflog
sudo mv difflog /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/SmileyChris/difflog/releases/latest/download/difflog-darwin-x64 -o difflog
chmod +x difflog
sudo mv difflog /usr/local/bin/
```

### Build from Source

Requires [Bun](https://bun.sh) to be installed:

```bash
git clone https://github.com/SmileyChris/difflog.git
cd difflog
bun install
bun cli:build
```

The compiled binary will be at `./dist/difflog`.

## Quick Start

**First time?** Create a profile or import one from the web:

```bash
difflog config  # Create new profile
# OR
difflog login   # Import from difflog.dev
```

**Already set up?** Just run:

```bash
difflog  # Shows your most recent diff
```

---

## Authentication

### Web-Assisted Login (Recommended)

The easiest way to log in — just like `gh auth login`:

```bash
difflog login
```

This will:

1. Print a 4-character verification code
2. Open your browser to difflog.dev
3. Show the same verification code in the browser
4. Let you select a profile from your browser's saved profiles
5. Automatically sync your profile and diffs to the CLI

**Verification code example:**
```
$ difflog login

  Verification code: a3f7

  Press Enter to open difflog.dev in your browser...
```

In your browser, you'll see the same code `a3f7`. If they match, click "Codes match" and select your profile.

!!! tip "No browser on this device?"
    Use `difflog login --no-browser` to print the URL instead of auto-opening. Copy the URL to a device that has your profile saved.

!!! info "QR Code Fallback"
    If you don't have any profiles on the current device, the browser will show a QR code. Scan it with a phone/tablet that has your difflog profile.

### Direct Login (Advanced)

If you know your profile ID and password, you can log in directly:

```bash
difflog login --profile YOUR_PROFILE_ID --password YOUR_PASSWORD
```

This bypasses the browser and authenticates directly with the difflog API. Useful for:

- Automated scripts and CI/CD
- Headless servers
- Environments without a browser

!!! warning "Shared Profiles Only"
    Direct login requires a shared profile with a sync password. Local-only profiles don't have passwords and must use web-assisted login.

## Commands

### `difflog` (no arguments)

**Smart default command** — the fastest way to use difflog.

**Behavior:**

- **No profile?** → Shows getting started options (config or login)
- **Has profile?** → Shows your most recent diff

**Examples:**

```bash
# After setup: shows latest diff
difflog

# Pipe to a markdown reader
difflog | glow -
```

### `difflog login`

Authenticate with difflog.

**Options:**

- `--no-browser` - Print URL instead of auto-opening browser
- `--profile ID` - Profile ID for direct login
- `--password PWD` - Password for direct login

**Examples:**

```bash
# Interactive web login
difflog login

# Print URL without opening browser
difflog login --no-browser

# Direct login (shared profiles only)
difflog login --profile abc123... --password mypassword
```

### `difflog ls`

List your diff history.

```bash
$ difflog ls

2026-02-12  Next.js 15.1, Bun 1.2, React 19 patterns
2026-02-10  TypeScript 5.7, Deno 2.0, Vite 6.0
2026-02-08  SvelteKit 3.0, Astro 5.0, Tailwind 4.0
```

Diffs are listed with an index number, relative time, and title. Use the index with `difflog show` to read a specific diff.

### `difflog show <id>`

Read a specific diff in the terminal.

```bash
difflog show <id>
```

**Output:**

- Renders markdown with ANSI colors
- Detects dark/light terminal theme
- Linkifies URLs (supports OSC 8 where available)

**Examples:**

```bash
# Show a specific diff
difflog show 2026-02-12

# Pipe to a pager
difflog show 2026-02-12 | less -R

# Pipe to a markdown reader
difflog show 2026-02-12 | glow -
```

### `difflog generate`

Generate a new diff directly from the terminal.

```bash
difflog generate
```

This runs the full AI pipeline (fetch feeds, curate, search, synthesize) using your profile settings and API keys from the OS keychain.

**Requirements:**
- At least one AI provider API key configured (see `difflog config ai`)
- Active profile from `difflog login`

**Where to get API keys:**
- [Anthropic](https://console.anthropic.com/) (recommended)
- [Serper](https://serper.dev/) (optional, for web search)
- [DeepSeek](https://platform.deepseek.com/)
- [Google AI](https://ai.google.dev/)
- [Perplexity](https://www.perplexity.ai/)

### `difflog config`

Interactive configuration wizard for managing your profile and AI settings.

**First time?** Running `difflog config` without a profile will create one for you.

#### Interactive Wizard

The full wizard provides a terminal-native interface with keyboard navigation:

```bash
difflog config
```

**Navigation:**
- `↑/↓` or `k/j` - Navigate menu items (cycles at top/bottom)
- `Enter` - Edit selected section
- `Esc` or `q` - Quit (prompts to save if changes made)

**Section Controls:**

*Topic Selection (Languages/Frameworks/Tools/Topics):*
- `Space` - Toggle item selection
- `Enter` - Add custom item
- `Esc` - Save and return to menu
- Custom items appear inline with `(custom)` label

*AI Configuration:*
- `↑/↓` or `k/j` - Navigate providers
- `←/→` or `h/l` - Select column (search/curation/synthesis)
- `Space` - Toggle provider for selected column
- `Enter` - Edit API key for current provider
- Cyan circle shows exactly what will be toggled
- Yellow warnings for unset required providers

*Depth & Focus:*
- `↑/↓` or `k/j` - Navigate depth options
- `Space` - Select depth
- `Enter` - Edit custom focus
- `Esc` - Save and return to menu

#### Quick Commands

For scripting or quick edits without the interactive wizard:

```bash
difflog config name                              # Edit profile name
difflog config depth standard                    # Set depth (quick/standard/detailed)
difflog config topics add languages rust go      # Add languages
difflog config topics rm frameworks react        # Remove frameworks
difflog config topics focus "cloud native"       # Set custom focus
difflog config ai                                # Show AI config
difflog config ai key add anthropic sk-ant-...   # Add API key
difflog config ai key rm deepseek                # Remove API key
difflog config ai set serper deepseek anthropic  # Set providers (search/curation/synthesis)
```

#### Configuration Sections (in wizard order)

- **Name** - Profile display name
- **AI** - API keys and provider selections (search/curation/synthesis)
- **Languages** - Programming languages you follow
- **Frameworks** - Frameworks and libraries
- **Tools** - Development tools and platforms
- **Topics** - General technology topics
- **Depth & Focus** - Generation depth (quick/standard/detailed) and custom focus

**Profile Creation:**
If no profile exists, `difflog config` will prompt for a profile name and create a new local-only profile with default settings (standard depth, DeepSeek for curation, Anthropic for synthesis).

**API Keys Storage:**
All API keys are stored securely in your OS credential manager:
- **macOS**: Keychain
- **Linux**: Secret Service (GNOME Keyring / KDE Wallet)
- **Windows**: Credential Manager

Keys are never stored in plaintext configuration files.

## How It Works

The CLI uses the same encryption and sync system as the web app:

1. **Local-first storage**: Profile and diffs stored in `~/.config/difflog/` (or OS equivalent)
2. **Client-side encryption**: All synced data is encrypted with your password
3. **Shared codebase**: Uses the same TypeScript code as the web app, compiled to a standalone binary

For details on the web login flow, see [CLI Login Architecture](architecture/cli-login.md). For API key storage, see [CLI Key Storage](architecture/cli-keys.md).

## Configuration

The CLI stores data in standard OS locations:

| Platform | Location |
|----------|----------|
| Linux | `~/.config/difflog/` |
| macOS | `~/.config/difflog/` |
| Windows | `%APPDATA%\difflog\` |

**Files:**

- `session.json` - Authentication session (profile ID, password salt)
- `profile.json` - Profile metadata (name, languages, frameworks, topics, depth, provider selections)
- `diffs.json` - Cached diff history
- `read-state.json` - Article read/unread tracking for interactive viewer

**API Keys:**

API keys are **NOT** stored in configuration files. They are securely stored in your OS credential manager:

- **macOS**: Keychain (`difflog-cli` service)
- **Linux**: Secret Service / GNOME Keyring / KDE Wallet
- **Windows**: Credential Manager

Use `difflog config ai` to manage API keys.

**Single Profile Design:**

The CLI currently supports **one active profile** at a time. This keeps things simple for terminal workflows. To switch profiles, run `difflog login` again with a different profile.

The web app supports multiple profiles, but the CLI simplifies to a single-profile model for now.

## Tips & Tricks

### Pipe to Markdown Readers

The CLI outputs clean markdown. Pipe it to your favorite reader:

```bash
# glow
difflog show latest | glow -

# bat
difflog show latest | bat -l md

# mdcat
difflog show latest | mdcat
```

### Aliases

Add shortcuts to your `.bashrc` or `.zshrc`:

```bash
alias dl='difflog'
alias dls='difflog show'
alias dll='difflog ls'
```

### CI/CD Integration

Use direct login in CI pipelines:

```bash
#!/bin/bash
difflog login --profile "$DIFFLOG_PROFILE_ID" --password "$DIFFLOG_PASSWORD"
difflog show latest > CHANGELOG.md
```

Store credentials as secrets in GitHub Actions, GitLab CI, etc.

## Troubleshooting

### Login timeout

**Problem:** `Error: Login timed out. Run 'difflog login' to try again.`

**Solution:** The auth code expires in 5 minutes. Run `difflog login` again and complete the browser flow faster.

### Connection failed

**Problem:** `Error: Unable to connect to https://difflog.dev`

**Solution:**

- Check your internet connection
- Verify you're not behind a restrictive firewall
- Try using a VPN if your network blocks the domain

### Verification code mismatch

**Problem:** The code in the terminal doesn't match the browser.

**Solution:** This indicates a potential security issue. Close the browser tab, press Ctrl+C to cancel the CLI, and run `difflog login` again. If the problem persists, report it as a bug.

### No profiles found

**Problem:** Browser shows "No profiles found on this device."

**Solution:**

- Create a profile at [difflog.dev/setup](https://difflog.dev/setup)
- Or scan the QR code on a device that already has your profile
- Or use `difflog login --profile ID --password PWD` for direct login (shared profiles only)

## FAQ

**Q: Do I need to be logged in to the website to use the CLI?**

No. The CLI stores your profile and diffs locally. Once you've run `difflog login`, the CLI works offline for reading cached diffs.

**Q: Can I use the CLI with a local-only profile?**

Yes, via web-assisted login. The browser will send your local profile data to the CLI. Direct login (`--profile`/`--password`) only works with shared profiles.

**Q: Is my data encrypted?**

Yes. Shared profiles use the same client-side encryption as the web app. Local profiles are stored as plaintext on disk (same as browser localStorage).

**Q: Can I use multiple profiles?**

Not currently. The CLI uses a single-profile design for simplicity. To switch profiles, run `difflog login` again and select a different profile. Your API keys (stored in the OS keychain) are shared across profiles, so you won't need to re-enter them.

**Q: How do I log out?**

Use the logout command, which removes your profile, cached diffs, and API keys from the OS keychain:

```bash
difflog logout
```

**Q: Where are my API keys stored?**

API keys are stored in your operating system's secure credential manager, not in plaintext files:

- **macOS**: Keychain Access (search for "difflog-cli")
- **Linux**: GNOME Keyring or KDE Wallet
- **Windows**: Credential Manager (Control Panel → Credential Manager)

Use `difflog config ai` to add or remove keys.

**Q: How do I remove all my API keys?**

```bash
# From CLI
difflog config ai key rm anthropic
difflog config ai key rm serper
# ... etc for each provider

# Or manually through your OS:
# macOS: Keychain Access → search "difflog-cli" → delete items
# Linux: Seahorse → search "difflog-cli" → delete items
# Windows: Credential Manager → search "difflog-cli" → remove credentials
```

**Q: How big is the binary?**

About 90 MB. It's a standalone Bun executable with the JavaScript runtime bundled. No external dependencies required.

## Roadmap

Planned:

- [ ] `difflog summary` — plain text summaries for scripts
- [ ] `--json` output on all commands
- [ ] Multi-profile support
