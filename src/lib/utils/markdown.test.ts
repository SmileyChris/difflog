import { expect, test, describe } from "bun:test";
import { renderMarkdown } from "./markdown";

describe("markdown.ts", () => {
    describe("links", () => {
        test("renders simple links", () => {
            const md = "[Example](https://example.com)";
            const html = renderMarkdown(md);
            expect(html).toContain('<a class="md-link" href="https://example.com"');
            expect(html).toContain("Example");
        });

        test("renders links with nested brackets like [pdf]", () => {
            const md = "[Actors: A Model of Concurrent Computation [pdf]](https://apps.dtic.mil/sti/tr/pdf/ADA157917.pdf)";
            const html = renderMarkdown(md);
            expect(html).toContain('<a class="md-link" href="https://apps.dtic.mil/sti/tr/pdf/ADA157917.pdf"');
            expect(html).toContain("Actors: A Model of Concurrent Computation [pdf]");
        });

        test("renders links with nested [video] tag", () => {
            const md = "[Understanding Rust Ownership [video]](https://youtube.com/watch?v=123)";
            const html = renderMarkdown(md);
            expect(html).toContain('<a class="md-link" href="https://youtube.com/watch?v=123"');
            expect(html).toContain("Understanding Rust Ownership [video]");
        });

        test("renders multiple links with nested brackets in same paragraph", () => {
            const md = "Check [Paper A [pdf]](https://a.com) and [Paper B [pdf]](https://b.com)";
            const html = renderMarkdown(md);
            expect(html).toContain('href="https://a.com"');
            expect(html).toContain('href="https://b.com"');
            expect(html).toContain("Paper A [pdf]");
            expect(html).toContain("Paper B [pdf]");
        });

        test("rejects javascript: URLs", () => {
            const md = "[Click me](javascript:alert('xss'))";
            const html = renderMarkdown(md);
            expect(html).not.toContain("href=");
            expect(html).toContain("Click me");
        });
    });

    describe("inline formatting", () => {
        test("renders bold text", () => {
            const md = "This is **bold** text";
            const html = renderMarkdown(md);
            expect(html).toContain('<strong class="md-bold">bold</strong>');
        });

        test("renders inline code", () => {
            const md = "Use the `console.log()` function";
            const html = renderMarkdown(md);
            expect(html).toContain('<code class="md-code">console.log()</code>');
        });
    });

    describe("blocks", () => {
        test("renders headers", () => {
            const md = "# Title\n## Subtitle\n### Section";
            const html = renderMarkdown(md);
            expect(html).toContain('<h1 class="md-h1">Title</h1>');
            expect(html).toContain('<summary class="md-h2">Subtitle</summary>');
            expect(html).toContain('<h3 class="md-h3">Section</h3>');
        });

        test("renders list items with data-p indices", () => {
            const md = "- Item one\n- Item two";
            const html = renderMarkdown(md);
            expect(html).toContain('data-p="0"');
            expect(html).toContain('data-p="1"');
            expect(html).toContain("Item one");
            expect(html).toContain("Item two");
        });
    });

    describe("collapsible sections", () => {
        test("wraps h2 sections in details/summary with content wrapper", () => {
            const md = "## Languages\n\nSome content";
            const html = renderMarkdown(md);
            expect(html).toContain('<details class="md-section" open>');
            expect(html).toContain('<summary class="md-h2">Languages</summary>');
            expect(html).toContain('<div class="md-section-content">');
            expect(html).toContain('</details>');
        });

        test("content before first h2 stays flat", () => {
            const md = "# Title\n\nIntro paragraph\n\n## Section One\n\nSection content";
            const html = renderMarkdown(md);
            // h1 and intro paragraph should be before the first <details>
            const detailsIdx = html.indexOf('<details');
            const h1Idx = html.indexOf('<h1');
            const introIdx = html.indexOf('Intro paragraph');
            expect(h1Idx).toBeLessThan(detailsIdx);
            expect(introIdx).toBeLessThan(detailsIdx);
        });

        test("multiple h2 sections are each wrapped separately", () => {
            const md = "## Section A\n\nContent A\n\n## Section B\n\nContent B";
            const html = renderMarkdown(md);
            const matches = html.match(/<details class="md-section" open>/g);
            expect(matches).toHaveLength(2);
            const closes = html.match(/<\/details>/g);
            expect(closes).toHaveLength(2);
        });

        test("data-p indices are sequential across sections", () => {
            const md = "## Section A\n\nPara 0\n\nPara 1\n\n## Section B\n\nPara 2";
            const html = renderMarkdown(md);
            expect(html).toContain('data-p="0"');
            expect(html).toContain('data-p="1"');
            expect(html).toContain('data-p="2"');
        });

        test("citations remain outside sections", () => {
            const md = "## Section\n\nContent";
            const citations = [{ url: "https://example.com", title: "Example" }];
            const html = renderMarkdown(md, citations);
            const lastDetails = html.lastIndexOf('</details>');
            const sourcesIdx = html.indexOf('class="md-sources"');
            expect(lastDetails).toBeLessThan(sourcesIdx);
        });

        test("h1 closes open section", () => {
            const md = "## Section\n\nContent\n\n# New Title";
            const html = renderMarkdown(md);
            // The </details> should come before the h1
            const detailsClose = html.indexOf('</details>');
            const h1Idx = html.indexOf('<h1');
            expect(detailsClose).toBeLessThan(h1Idx);
        });
    });
});
