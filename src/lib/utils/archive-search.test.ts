import { expect, test, describe } from "bun:test";
import { extractArticles, matchArticles, highlightTerms, getSnippet } from "./archive-search";

// Real diff format: ## sections with bold-linked bullet headlines
const REAL_DIFF = `# AI Moves Fast This Week

## 🚀 Notable Releases

- **[TypeScript 5.8 Released](https://devblogs.microsoft.com/typescript/ts-5.8)** — Brings conditional return types and improved inference for generic functions
- **[Bun 1.3 Adds Native S3 Support](https://bun.sh/blog/s3)** (245 [HN](https://news.ycombinator.com/item?id=123) pts) — No more aws-sdk dependency needed, works with any S3-compatible store
- **[Deno 2.2](https://deno.com/blog/v2.2)** — OpenTelemetry support and improved Node compatibility

## 🛠 Tools & Infrastructure

- **[Docker Desktop 5.0](https://docker.com/blog/desktop-5)** — Overhauls the UI and adds built-in Wasm support
- **[GitHub Copilot Chat Goes Free](https://github.blog/copilot-free)** — Limited to 50 messages per day on free tier, full access on paid plans

## 🤖 AI & Machine Learning

- **[Claude 4.5 Sonnet](https://anthropic.com/news/claude-4-5)** — Anthropic released Claude 4.5 with improved coding and reasoning
- **Gemini 2.5 Pro** — Google's latest model with native multimodal support`;

// Some diffs may use H3 format
const H3_DIFF = `# Weekly Roundup

## 🚀 Languages & Runtimes

### TypeScript 5.8 Released
TypeScript 5.8 brings **conditional return types** and improved inference.
- The new \`--erasableTypes\` flag strips types at runtime

### Bun 1.3 Adds Native S3 Support
Bun now supports S3 reads and writes natively.

## 🛠 Tools & Infrastructure

### Docker Desktop 5.0
Docker Desktop overhauls the UI.`;

describe("extractArticles", () => {
    describe("bullet format (real diffs)", () => {
        test("extracts articles from bold-linked bullets", () => {
            const articles = extractArticles(REAL_DIFF);
            expect(articles.length).toBe(7);
            expect(articles[0].heading).toBe("TypeScript 5.8 Released");
            expect(articles[0].pIndex).toBe(0);
            expect(articles[1].heading).toBe("Bun 1.3 Adds Native S3 Support");
            expect(articles[1].pIndex).toBe(1);
            expect(articles[2].heading).toBe("Deno 2.2");
            expect(articles[2].pIndex).toBe(2);
        });

        test("extracts heading from bold without link", () => {
            const articles = extractArticles(REAL_DIFF);
            const gemini = articles.find(a => a.heading === "Gemini 2.5 Pro");
            expect(gemini).toBeDefined();
            expect(gemini!.body).toContain("native multimodal support");
        });

        test("strips score and em dash from body", () => {
            const articles = extractArticles(REAL_DIFF);
            const bun = articles.find(a => a.heading.includes("Bun"));
            expect(bun!.body).not.toContain("245");
            expect(bun!.body).not.toContain("HN");
            expect(bun!.body).toContain("No more aws-sdk");
        });

        test("assigns parent H2 as category", () => {
            const articles = extractArticles(REAL_DIFF);
            expect(articles[0].category).toBe("Notable Releases");
            expect(articles[3].category).toBe("Tools & Infrastructure");
            expect(articles[3].pIndex).toBe(3);
            expect(articles[5].category).toBe("AI & Machine Learning");
            expect(articles[5].pIndex).toBe(5);
        });

        test("strips emoji prefix from H2 categories", () => {
            const articles = extractArticles(REAL_DIFF);
            expect(articles[0].category).not.toContain("🚀");
            expect(articles[5].category).not.toContain("🤖");
        });

        test("strips ZWJ and variation-selector emoji prefixes from H2 categories", () => {
            const md = `## 🛠️ Dev Tools & Infrastructure
- **Tool A** — note
## 🧑‍💻 From the Trenches
- **Story B** — note`;
            const articles = extractArticles(md);
            expect(articles[0].category).toBe("Dev Tools & Infrastructure");
            expect(articles[1].category).toBe("From the Trenches");
        });

        test("extracts body text after em dash", () => {
            const articles = extractArticles(REAL_DIFF);
            expect(articles[0].body).toContain("conditional return types");
        });

        test("strips markdown links from body", () => {
            const articles = extractArticles(REAL_DIFF);
            expect(articles[0].body).not.toContain("](");
        });
    });

    describe("H3 format (fallback)", () => {
        test("extracts articles from H3 headings", () => {
            const articles = extractArticles(H3_DIFF);
            expect(articles.length).toBe(3);
            expect(articles[0].heading).toBe("TypeScript 5.8 Released");
            expect(articles[2].heading).toBe("Docker Desktop 5.0");
        });

        test("collects body text under H3", () => {
            const articles = extractArticles(H3_DIFF);
            expect(articles[0].body).toContain("conditional return types");
        });

        test("assigns H2 category to H3 articles", () => {
            const articles = extractArticles(H3_DIFF);
            expect(articles[0].category).toBe("Languages & Runtimes");
            expect(articles[2].category).toBe("Tools & Infrastructure");
        });

        test("assigns pIndex of first body element to H3 articles", () => {
            const articles = extractArticles(H3_DIFF);
            // TS: first body element is paragraph at pIndex 0
            expect(articles[0].pIndex).toBe(0);
            // Bun: paragraph after TS's paragraph(0) + list item(1) → pIndex 2
            expect(articles[1].pIndex).toBe(2);
            // Docker: paragraph after Bun's paragraph(2) → pIndex 3
            expect(articles[2].pIndex).toBe(3);
        });

        test("strips bold from H3 headings", () => {
            const md = "### **Breaking**: New API\nDetails here";
            const articles = extractArticles(md);
            expect(articles[0].heading).toBe("Breaking: New API");
        });

        test("strips links from H3 headings", () => {
            const md = "## Section\n### [Some Tool](https://example.com) v2.0\nBody text";
            const articles = extractArticles(md);
            expect(articles[0].heading).toBe("Some Tool v2.0");
        });

        test("handles consecutive H3s with no body", () => {
            const md = "## Cat\n### First\n### Second\n### Third\nSome body";
            const articles = extractArticles(md);
            expect(articles).toHaveLength(3);
            expect(articles[0].body).toBe("");
            expect(articles[0].pIndex).toBeUndefined();
            expect(articles[1].body).toBe("");
            expect(articles[1].pIndex).toBeUndefined();
            expect(articles[2].body).toContain("Some body");
            expect(articles[2].pIndex).toBe(0);
        });
    });

    describe("pIndex tracking", () => {
        test("bullet articles get sequential pIndex values across sections", () => {
            const articles = extractArticles(REAL_DIFF);
            // 3 items in first section (0,1,2), 2 in second (3,4), 2 in third (5,6)
            expect(articles.map(a => a.pIndex)).toEqual([0, 1, 2, 3, 4, 5, 6]);
        });

        test("H3 articles get pIndex of first body element", () => {
            const md = `## Section
### Article One
First paragraph.
- A bullet point
### Article Two
Second paragraph.`;
            const articles = extractArticles(md);
            expect(articles[0].pIndex).toBe(0); // first paragraph
            expect(articles[1].pIndex).toBe(2); // after paragraph(0) + list item(1)
        });

        test("H3 with only list body gets first item pIndex", () => {
            const md = `### List Article
- First item
- Second item`;
            const articles = extractArticles(md);
            expect(articles[0].pIndex).toBe(0);
        });

        test("H3 with no body gets undefined pIndex", () => {
            const md = "### Empty Article\n### Another Empty";
            const articles = extractArticles(md);
            expect(articles[0].pIndex).toBeUndefined();
            expect(articles[1].pIndex).toBeUndefined();
        });

        test("mixed H3 and bullet articles get correct pIndex", () => {
            const md = `## Section A
### H3 Article
Body text

## Section B
- **[Bullet One](https://x.com)** — desc
- **[Bullet Two](https://x.com)** — desc`;
            const articles = extractArticles(md);
            expect(articles[0].heading).toBe("H3 Article");
            expect(articles[0].pIndex).toBe(0); // paragraph
            expect(articles[1].heading).toBe("Bullet One");
            expect(articles[1].pIndex).toBe(1); // first list item after paragraph
            expect(articles[2].heading).toBe("Bullet Two");
            expect(articles[2].pIndex).toBe(2);
        });
    });

    describe("edge cases", () => {
        test("returns empty array for content with no articles", () => {
            const md = "## Section\n\nJust some paragraph text.";
            expect(extractArticles(md)).toEqual([]);
        });

        test("handles H3 with no parent H2", () => {
            const md = "### Standalone Article\nSome content here";
            const articles = extractArticles(md);
            expect(articles).toHaveLength(1);
            expect(articles[0].category).toBeUndefined();
        });

        test("handles bullet article with no parent H2", () => {
            const md = "- **[Standalone](https://x.com)** — some info";
            const articles = extractArticles(md);
            expect(articles).toHaveLength(1);
            expect(articles[0].category).toBeUndefined();
        });

        test("handles mixed H3 and bullet formats", () => {
            const md = `## Section A
### H3 Article
Body text

## Section B
- **[Bullet Article](https://x.com)** — description`;
            const articles = extractArticles(md);
            expect(articles).toHaveLength(2);
            expect(articles[0].heading).toBe("H3 Article");
            expect(articles[0].category).toBe("Section A");
            expect(articles[1].heading).toBe("Bullet Article");
            expect(articles[1].category).toBe("Section B");
        });
    });
});

describe("matchArticles", () => {
    const diffs = [
        {
            id: "1",
            title: "Dev Diff Feb 27",
            content: REAL_DIFF,
        },
        {
            id: "2",
            title: "Dev Diff Feb 20",
            content: "## 🤖 AI & ML\n- **[GPT-5 Announced](https://openai.com/gpt5)** — OpenAI announced GPT-5 with reasoning\n- **[Claude 4.5 Sonnet](https://anthropic.com)** — Anthropic released Claude 4.5 Sonnet",
        },
    ];

    test("matches articles by heading keyword", () => {
        const results = matchArticles(diffs, "typescript");
        expect(results).toHaveLength(1);
        expect(results[0].item.id).toBe("1");
        expect(results[0].matches).toHaveLength(1);
        expect(results[0].matches[0].heading).toBe("TypeScript 5.8 Released");
    });

    test("matches articles by body keyword", () => {
        const results = matchArticles(diffs, "aws-sdk");
        expect(results).toHaveLength(1);
        expect(results[0].matches[0].heading).toContain("Bun");
    });

    test("matches articles by category", () => {
        const results = matchArticles(diffs, "infrastructure");
        expect(results).toHaveLength(1);
        expect(results[0].matches).toHaveLength(2);
        expect(results[0].matches[0].heading).toBe("Docker Desktop 5.0");
        expect(results[0].matches[1].heading).toContain("Copilot");
    });

    test("matches articles by diff title", () => {
        const results = matchArticles(diffs, "feb 20 claude");
        expect(results).toHaveLength(1);
        expect(results[0].item.id).toBe("2");
    });

    test("is case-insensitive", () => {
        const results = matchArticles(diffs, "DOCKER");
        expect(results).toHaveLength(1);
        expect(results[0].matches[0].heading).toBe("Docker Desktop 5.0");
    });

    test("requires all terms to match (AND logic)", () => {
        const results = matchArticles(diffs, "bun s3");
        expect(results).toHaveLength(1);
        expect(results[0].matches).toHaveLength(1);
        expect(results[0].matches[0].heading).toContain("Bun");
    });

    test("matches across both diffs for common term", () => {
        const results = matchArticles(diffs, "claude");
        expect(results).toHaveLength(2);
    });

    test("matches by AI category", () => {
        const results = matchArticles(diffs, "AI");
        // Both diffs have AI-related categories or content
        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    test("returns empty for no matches", () => {
        expect(matchArticles(diffs, "kubernetes")).toEqual([]);
    });

    test("returns empty for empty query", () => {
        expect(matchArticles(diffs, "")).toEqual([]);
    });

    test("returns empty for whitespace-only query", () => {
        expect(matchArticles(diffs, "   ")).toEqual([]);
    });

    describe("scoring and sort order", () => {
        test("full word match ranks above substring match", () => {
            const items = [
                { id: "sub", title: "Diff A", content: "## Cat\n- **[Typescripting Today](https://x.com)** — a new way to write code" },
                { id: "full", title: "Diff B", content: "## Cat\n- **[TypeScript 6.0](https://x.com)** — new release" },
            ];
            const results = matchArticles(items, "typescript");
            expect(results).toHaveLength(2);
            // "TypeScript" is a full word in Diff B, start-of-word in "Typescripting" in Diff A
            expect(results[0].item.id).toBe("full");
            expect(results[1].item.id).toBe("sub");
        });

        test("start-of-word match ranks above substring match", () => {
            const items = [
                { id: "mid", title: "Diff A", content: "## Cat\n- **[GoTypeScript](https://x.com)** — stuff" },
                { id: "start", title: "Diff B", content: "## Cat\n- **[Typing Fast](https://x.com)** — stuff" },
            ];
            const results = matchArticles(items, "typ");
            expect(results).toHaveLength(2);
            // "Typ" starts a word in "Typing", is mid-word in "GoTypeScript"
            expect(results[0].item.id).toBe("start");
            expect(results[1].item.id).toBe("mid");
        });

        test("higher total score breaks tier tie", () => {
            const items = [
                { id: "one", title: "Diff A", content: "## Cat\n- **[Docker Tool](https://x.com)** — stuff" },
                { id: "two", title: "Diff B", content: "## Cat\n- **[Docker Desktop](https://x.com)** — docker thing\n- **[Docker CLI](https://x.com)** — docker tool" },
            ];
            const results = matchArticles(items, "docker");
            expect(results).toHaveLength(2);
            // Both have full word matches, but Diff B has more matching articles
            expect(results[0].item.id).toBe("two");
            expect(results[1].item.id).toBe("one");
        });

        test("preserves newest-first for equal scores", () => {
            const items = [
                { id: "older", title: "Diff A", content: "## Cat\n- **[Docker Tool](https://x.com)** — info" },
                { id: "newer", title: "Diff B", content: "## Cat\n- **[Docker CLI](https://x.com)** — info" },
            ];
            const results = matchArticles(items, "docker");
            expect(results).toHaveLength(2);
            // Same tier, same total score → preserve input order
            expect(results[0].item.id).toBe("older");
            expect(results[1].item.id).toBe("newer");
        });
    });
});

describe("highlightTerms", () => {
    test("wraps matched term in <mark>", () => {
        expect(highlightTerms("TypeScript 5.8 Released", "typescript"))
            .toBe("<mark>TypeScript</mark> 5.8 Released");
    });

    test("highlights multiple terms", () => {
        expect(highlightTerms("Bun 1.3 Adds Native S3 Support", "bun s3"))
            .toBe("<mark>Bun</mark> 1.3 Adds Native <mark>S3</mark> Support");
    });

    test("is case-insensitive", () => {
        expect(highlightTerms("Docker Desktop 5.0", "DOCKER"))
            .toBe("<mark>Docker</mark> Desktop 5.0");
    });

    test("escapes HTML in input text", () => {
        expect(highlightTerms("Use <script> tags", "script"))
            .toBe("Use &lt;<mark>script</mark>&gt; tags");
    });

    test("handles regex special characters in query", () => {
        expect(highlightTerms("C++ and C# languages", "c++"))
            .toBe("<mark>C++</mark> and C# languages");
    });

    test("returns escaped text for empty query", () => {
        expect(highlightTerms("Hello <world>", ""))
            .toBe("Hello &lt;world&gt;");
    });

    test("highlights all occurrences", () => {
        expect(highlightTerms("test a test b test", "test"))
            .toBe("<mark>test</mark> a <mark>test</mark> b <mark>test</mark>");
    });
});

describe("getSnippet", () => {
    const longBody = "This is the beginning of a long body text that talks about various topics including TypeScript and its new features for conditional return types and improved inference for generic functions and more";

    test("returns snippet around first match", () => {
        const snippet = getSnippet(longBody, "TypeScript");
        expect(snippet).not.toBeNull();
        expect(snippet).toContain("TypeScript");
    });

    test("adds ellipsis when truncated at start", () => {
        const snippet = getSnippet(longBody, "inference");
        expect(snippet).not.toBeNull();
        expect(snippet!.startsWith("\u2026")).toBe(true);
    });

    test("adds ellipsis when truncated at end", () => {
        const snippet = getSnippet(longBody, "beginning");
        expect(snippet).not.toBeNull();
        expect(snippet!.endsWith("\u2026")).toBe(true);
    });

    test("returns null when no match in body", () => {
        expect(getSnippet(longBody, "kubernetes")).toBeNull();
    });

    test("returns null for empty body", () => {
        expect(getSnippet("", "test")).toBeNull();
    });

    test("returns null for empty query", () => {
        expect(getSnippet(longBody, "")).toBeNull();
    });

    test("finds earliest matching term", () => {
        const snippet = getSnippet("AAA BBB CCC DDD EEE", "EEE BBB");
        expect(snippet).toContain("BBB");
    });

    test("respects maxLen parameter", () => {
        const snippet = getSnippet(longBody, "TypeScript", 50);
        expect(snippet).not.toBeNull();
        // Snippet length can slightly exceed maxLen due to word boundary snapping
        expect(snippet!.length).toBeLessThan(80);
    });
});
