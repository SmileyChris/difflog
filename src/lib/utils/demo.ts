import type { Diff } from './sync';

interface Section {
	heading: string;
	pool: string[];
	pick: number;
}

const SECTIONS: Section[] = [
	{
		heading: '## 🚨 Critical Alerts',
		pick: 2,
		pool: [
			'- **[Node.js 22.14.0 Security Release](https://nodejs.org/en/blog/release/v22.14.0)** (287 [HN](https://news.ycombinator.com/item?id=42856301) pts) — Patches a high-severity HTTP request smuggling vulnerability in the HTTP/2 implementation. All Node 22.x users should upgrade immediately; the fix also backports to 20.x LTS.',

			'- **[Critical SQLite Bug Affects Embedded Databases](https://www.sqlite.org/cves.html)** (156 [HN](https://news.ycombinator.com/item?id=42861203) pts) — A buffer overflow in the JSON extension can be triggered by malformed JSON inputs. Affects SQLite 3.44.0–3.45.1. Patch available in 3.45.2.',

			'- **[OpenSSL 3.3.1 Patches Certificate Validation Bypass](https://www.openssl.org/news/secadv/20250204.txt)** (203 [HN](https://news.ycombinator.com/item?id=42862104) pts) — A flaw in X.509 name constraint checking allows specially crafted certificates to bypass validation. Severity: High. Upgrade from 3.3.0 immediately.',

			'- **[GitHub Actions Runner RCE via Crafted Workflow](https://github.blog/security/vulnerability-research/actions-runner-rce/)** (341 [HN](https://news.ycombinator.com/item?id=42863205) pts) — Untrusted input in `run:` steps can escape the shell sandbox. GitHub has patched hosted runners; self-hosted runners need manual update to v2.314.0+.',

			'- **[Python 3.13.2 Fixes Pickle Deserialization Vulnerability](https://www.python.org/downloads/release/python-3132/)** (118 [HN](https://news.ycombinator.com/item?id=42864306) pts) — A crafted pickle payload could achieve arbitrary code execution even with restricted unpicklers. All 3.13.x users should upgrade.',
		],
	},
	{
		heading: '## 📦 Notable Releases',
		pick: 3,
		pool: [
			'- **[Rust 1.85 Stabilizes Async Closures](https://blog.rust-lang.org/2025/02/06/Rust-1.85.0.html)** (412 [HN](https://news.ycombinator.com/item?id=42849912) pts) — The long-awaited `async closures` RFC lands in stable. Also includes improvements to the borrow checker for self-referential structs and a 15% compile-time improvement for large workspaces.',

			'- **[React 19.1](https://react.dev/blog/2025/02/05/react-19-1)** (318 [HN](https://news.ycombinator.com/item?id=42853447) pts) — Adds `useFormState` improvements, fixes hydration mismatches with Suspense boundaries, and introduces experimental `<Offscreen>` component for pre-rendering routes.',

			'- **[Docker Desktop 4.38](https://docs.docker.com/desktop/release-notes/)** — Adds synchronized file shares for 5x faster bind mounts on macOS, Wasm container support moves to GA, and built-in vulnerability scanning powered by Grype.',

			'- **[PostgreSQL 17.3](https://www.postgresql.org/about/news/postgresql-173-released-3012/)** — Fixes a planner regression that caused slow query plans on partitioned tables with 100+ partitions. Also patches two moderate CVEs in `pg_dump`.',

			'- **[Deno 2.2](https://deno.com/blog/v2.2)** (245 [HN](https://news.ycombinator.com/item?id=42865407) pts) — Full Node.js compatibility layer drops the `--compat` flag, npm packages work out of the box. New `deno compile` produces self-contained binaries under 20MB.',

			'- **[Tailwind CSS 4.0](https://tailwindcss.com/blog/tailwindcss-v4)** (567 [HN](https://news.ycombinator.com/item?id=42866508) pts) — Complete rewrite of the engine in Rust. Build times drop from ~300ms to ~5ms. New CSS-first configuration replaces `tailwind.config.js` entirely.',

			'- **[Go 1.24](https://go.dev/blog/go1.24)** (389 [HN](https://news.ycombinator.com/item?id=42867609) pts) — Adds generic type aliases, weak pointers for caches, and a new `tool` directive in `go.mod` for managing project-specific CLI tools.',

			'- **[SvelteKit 2.8](https://svelte.dev/blog/sveltekit-2-8)** — Introduces incremental static regeneration, reworked error boundaries, and built-in i18n routing. Adapter ecosystem gets a new Deno adapter.',

			'- **[Vite 6.1](https://vite.dev/blog/announcing-vite6-1)** — Experimental Rolldown integration delivers 10x faster production builds. Environment API stabilizes, enabling true SSR-aware HMR.',
		],
	},
	{
		heading: '## 🔥 Trending',
		pick: 3,
		pool: [
			'- **[Why We Moved From Microservices Back to a Monolith](https://reddit.com/r/programming/comments/1iexample1)** (892 r/programming pts) — An engineering team at a mid-size SaaS company details their journey back to a modular monolith after 3 years of microservices. Key pain points: distributed tracing complexity, deployment coordination overhead, and 4x infrastructure costs.',

			'- **[Show HN: I Built a Git TUI That Replaces 90% of My Terminal Git Usage](https://news.ycombinator.com/item?id=42857102)** (534 HN pts) — Rust-based terminal UI for git with interactive rebase visualization, conflict resolution, and stash management. Supports custom keybindings and integrates with delta for diffs.',

			'- **[The State of AI Code Assistants in 2026](https://dev.to/codeanalysis/ai-code-assistants-2026)** — Comprehensive comparison of Claude Code, GitHub Copilot, Cursor, and Windsurf across real-world coding benchmarks. Claude Code leads in multi-file refactoring tasks while Copilot edges ahead in single-line completions.',

			'- **[SQLite Is All You Need for Most Web Apps](https://reddit.com/r/webdev/comments/1iexample2)** (1.2k r/webdev pts) — Provocative post arguing that SQLite with Litestream replication handles 99% of web app workloads. Comments are a lively debate between Postgres advocates and SQLite converts.',

			'- **[Why I Stopped Using TypeScript Enums](https://reddit.com/r/typescript/comments/1iexample3)** (347 r/typescript pts) — Developer makes the case for `as const` objects over enums, citing tree-shaking issues, nominal typing surprises, and the upcoming `--erasableSyntaxOnly` flag in TypeScript 5.8.',

			'- **[Show HN: Zero-Dependency Markdown Parser in 200 Lines](https://news.ycombinator.com/item?id=42868710)** (412 HN pts) — Hand-rolled CommonMark parser that handles 95% of real-world markdown. No AST — streams tokens directly to HTML. Benchmarks show 6x faster than marked.',

			'- **[The Bun vs Node Debate Is Over (And Both Won)](https://dev.to/runtime-wars/bun-vs-node-2026)** — Nuanced take arguing that Bun pushed Node.js to ship major performance improvements, and both runtimes now serve different niches well. Bun for tooling speed, Node for ecosystem stability.',

			"- **[Ask HN: What's Your Most Controversial Programming Opinion?](https://news.ycombinator.com/item?id=42869811)** (678 HN pts) — Top-voted opinions include \"ORMs are a net negative,\" \"monorepos cause more problems than they solve,\" and \"code review is mostly theater.\" 500+ comments.",
		],
	},
	{
		heading: '## 🔭 Horizon Watch',
		pick: 2,
		pool: [
			'- **[TypeScript 5.8 Beta: Isolated Declarations](https://devblogs.microsoft.com/typescript/announcing-typescript-5-8-beta/)** — The `isolatedDeclarations` flag enables parallel .d.ts generation without type inference across files. Expected to dramatically speed up declaration emit in large monorepos. Release targeted for late February.',

			'- **[Bun 1.2 Adds S3 and Postgres Support](https://bun.sh/blog/bun-v1.2)** (267 [HN](https://news.ycombinator.com/item?id=42860891) pts) — Built-in S3 client and Postgres driver ship as native APIs. Benchmarks show 3x throughput over Node.js pg driver for simple queries. Also adds `bun publish` for npm publishing.',

			'- **[WebAssembly Garbage Collection Ships in All Major Browsers](https://web.dev/blog/wasm-gc)** — Chrome, Firefox, and Safari now all support WasmGC. This unblocks languages like Kotlin, Dart, and Java from compiling to Wasm without shipping their own GC. Expect an explosion of non-JS web frameworks.',

			'- **[CSS `if()` Function Enters Stage 2 at W3C](https://github.com/w3c/csswg-drafts/issues/10064)** — Conditional logic directly in CSS property values. Would enable patterns like `color: if(style(--theme: dark), white, black)` without JavaScript. Earliest browser implementation expected late 2026.',

			'- **[Postgres 18 Preview: Native Vector Search](https://www.postgresql.org/about/news/postgresql-18-beta1/)** — Built-in `VECTOR` type and `<->` operator for approximate nearest-neighbor search. Early benchmarks show competitive performance with pgvector while being zero-config. Beta expected in Q2.',

			'- **[Node.js Experimental Permission Model Going Stable](https://nodejs.org/en/blog/release/v23.6.0)** — The `--experimental-permission` flag is set to drop the experimental prefix in Node 24. Enables fine-grained filesystem, network, and child process restrictions per-module.',
		],
	},
];

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function buildContent(): string {
	const parts: string[] = [];

	for (const section of SECTIONS) {
		const picked = shuffle(section.pool).slice(0, section.pick);
		parts.push(`${section.heading}\n\n${picked.join('\n\n')}`);
	}

	return parts.join('\n\n');
}

const TITLES = [
	'Your Demo Developer Intelligence Diff',
	'What Changed While You Were Coding',
	'Dev Ecosystem Snapshot',
	'Your Stack This Week',
	"Here's What You Missed",
	'Fresh Off the Wire',
	'The Dev World Moves Fast',
	'Meanwhile, in Open Source...',
	'Your Ecosystem at a Glance',
	'Caught Up in 60 Seconds',
];

export function createDemoDiff(lastTitle?: string): Diff {
	const candidates = lastTitle ? TITLES.filter((t) => t !== lastTitle) : TITLES;
	return {
		id: Date.now().toString(),
		title: candidates[Math.floor(Math.random() * candidates.length)],
		content: buildContent(),
		generated_at: new Date().toISOString(),
		duration_seconds: 42,
		window_days: 3,
	};
}
