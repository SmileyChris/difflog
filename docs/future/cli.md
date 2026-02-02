# The Difflog CLI: A Manifesto & Vision

**Status:** Conceptual / RFC
**Context:** Bringing Developer Intelligence to the Command Line

---

## 1. Purpose & Goals

### The Purpose
To liberate developer intelligence from the browser tab and inject it directly into the developer's native environment: **the terminal**.

The Difflog CLI is not just a "wrapper" for the API. It is a philosophy that says staying informed shouldn't require context switching. It treats global ecosystem updates—framework releases, breaking changes, trending tools—as a raw data stream that can be piped, filtered, and automated.

### The Goals
1.  **Frictionless Access:** Reducing the "time-to-insight" to zero. No opening a browser, no logging in. Just typing a command.
2.  ** UNIX Philosophy:** The tool should produce text streams that play nicely with other tools (`grep`, `less`, `glow`, `cat`). `stdout` is for content; `stderr` is for status.
3.  **Local-First Security:** Replicate the browser's security model. Keys and profile data live encrypted on the user's disk, not our servers.
4.  **Flow State Preservation:** Allow developers to check "what's new" without being sucked into the infinite scroll of social media or news aggregators.

---

## 2. The User Experience (The "Dream")

We imagine a tool that feels like it has always been part of your toolbelt, like `git` or `curl`.

### Scenario A: The Morning Briefing
You open your terminal with your morning coffee. Instead of doom-scrolling Hacker News, you run one command:

```bash
$ difflog gen --today
```

**Result:** A concise, 30-second read of exactly what changed in your stack (e.g., Rust, React, AWS) overnight. You read it, you know you aren't missing anything critical, and you start coding.

### Scenario B: The "Deep Dive" Pipe
You see a headline about a new security vulnerability but want the details without the fluff. You pipe the output to your preferred markdown reader:

```bash
$ difflog gen --focus "security" --deep | glow -
```

### Scenario C: The "Message of the Day" (MOTD)
You manage a team of 10 engineers. You want them to know about the new breaking change in the company's core framework. You add this to the project's `Makefile` or CI pipeline:

```bash
# In CI output or local dev setup script
difflog summary --profile team-backend
```

**Result:** Every time they build the project, they get a 1-line summary of critical ecosystem news relevant to *that specific project*.

---

## 3. Technology Strategy: The Fork in the Road

We have two primary paths for implementation. Each defines a different future for the tool.

### Option A: The "Bun" Way (TypeScript)
*Leveraging the existing ecosystem.*

Since `difflog` is already a Bun + TypeScript project, this is the path of least resistance and highest consistency.

*   **Pros:**
    *   **Code Reuse:** We can reuse 90% of the logic in `src/lib/` (feeds, prompts, crypto, types).
    *   **Single Codebase:** One repo to maintain. Improvements to the "brain" (AI prompts) improve both Web and CLI instantly.
    *   **Speed:** Bun startup time is nearly instant, making it viable for a CLI.
    *   **Zero-Dependency Distribution:** Using `bun build --compile`, we can bundle the source code *and* the Bun runtime into a single, standalone executable file.
        *   **Result:** The user downloads `difflog`. They run `./difflog`. It works. They do **not** need to install Bun, Node, or NPM.
        *   **Cross-Platform:** From your Linux or Mac machine, you can generate binaries for all platforms:
            *   `bun-linux-x64` (Linux)
            *   `bun-darwin-arm64` (Apple Silicon Mac)
            *   `bun-darwin-x64` (Intel Mac)
            *   `bun-windows-x64` (Windows)
*   **Cons:**
    *   **Binary Size:** Because it includes the runtime, the "Hello World" binary starts at ~90MB (though it compresses well).
    *   **"System" Feel:** It's still a JS runtime under the hood, which might feel "heavier" than a native binary to purists.

### Option B: The "Rust" Way
*The "True CLI" experience.*

Rewriting the client in Rust.

*   **Pros:**
    *   **Distribution:** A single, small (~5MB) static binary. No dependencies. easy `brew install`.
    *   **Performance:** Unmatched speed and memory footprint.
    *   **Credibility:** Fits the aesthetic of modern "cool" CLI tools (like `ripgrep`, `bat`, `starship`).
*   **Cons:**
    *   **The "Rewrite" Tax:** We have to re-implement *everything*: encryption (WebCrypto vs Ring), fetching logic, and prompt engineering.
    *   **Drift:** The Web logic and CLI logic will inevitably drift apart, requiring double maintenance for every new feature.

### Recommendation: **Option A (Bun) for MVP**
Given the complexity of the AI logic and encryption, **Option A** allows us to ship a robust, feature-complete CLI *now*. We can compile it to a standalone binary using `bun build --compile` for easier distribution, bridging the gap with Option B.

---

## 4. Feature Roadmap

### v0.1: The "Viewer"
*   `difflog login`: Authenticate with an existing Profile ID & Password.
*   `difflog ls`: List past diffs.
*   `difflog show <id>`: Read a past diff in the terminal.

### v0.2: The "Generator"
*   `difflog gen`: The full loop. Fetch feeds -> Call Claude -> Render -> Encrypt & Sync.
*   Support for `--quick` and `--deep` flags.

### v0.3: The "Integrator"
*   `difflog summary`: Raw text output for script integration.
*   `difflog config`: Edit profile tracking (languages/tools) from the CLI.
*   `--json` flag for all commands to allow piping into `jq`.

---

## 5. Aesthetic & Design

*   **Colors:** Use standard ANSI colors but detect user theme (dark/light).
*   **Spinners:** Minimalist dots. No loud ASCII art banners.
*   **Silence:** The tool should be silent on success when piped.
*   **Markdown:** Render headers as bold/colored. Links should be hyperlinked (OSC 8) where supported, or footnoted.

**The Golden Rule:** The CLI respects the user's intelligence and their machine's resources.

---

## 6. Distribution & CI/CD

To make "zero-dependency" a reality, we will automate the build process so we never have to manually compile binaries.

### The Build Pipeline (GitHub Actions)
We will create a workflow (`.github/workflows/cli-release.yml`) that triggers whenever code in `cli/` or `src/` changes.

1.  **Trigger:** Pushes to `main` (for "nightly" builds) or new Tags (for stable releases).
2.  **Matrix Build:** A single Linux runner will execute the cross-compilation:
    *   `bun build --compile --target=bun-linux-x64 ...`
    *   `bun build --compile --target=bun-darwin-arm64 ...`
    *   `bun build --compile --target=bun-darwin-x64 ...`
    *   `bun build --compile --target=bun-windows-x64 ...`
3.  **Artifacts:** The pipeline uploads these 4 binaries as artifacts.
4.  **Releases:** On a tagged release (e.g., `v1.0.0`), the pipeline automatically creates a GitHub Release and attaches the binaries.

### Installation Methods
*   **Direct Download:** Users grab the binary from the GitHub Releases page.
*   **Shell Script:** A simple `curl | sh` script can detect the OS and download the correct binary.
*   **Homebrew (Future):** A custom tap to allow `brew install difflog`.
