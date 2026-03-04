import { expect, test, describe } from "bun:test";
import { renderMarkdown, extractParagraphs, extractSections } from "./markdown";
import { buildDiffContent, formatDiffDate } from "./time";

/**
 * Tests that date metadata never shifts data-p indices.
 *
 * Previously, buildDiffContent() prepended a bold date line to markdown for
 * window_days diffs. That rendered as data-p="0", pushing all real content
 * indices up by 1 and breaking existing bookmarks/stars. The fix moves date
 * display to UI, keeping buildDiffContent as a passthrough.
 */

const SAMPLE_MARKDOWN = [
  "# My Diff Title",
  "",
  "## 🔧 Tools & Infrastructure",
  "",
  "**[Cool Tool](https://example.com/tool)** — A neat new tool for devs.",
  "",
  "**[Another Project](https://example.com/proj)** — Something interesting.",
  "",
  "## 🧠 AI & ML",
  "",
  "**[Model Update](https://example.com/model)** — New model released.",
].join("\n");

const DIFF_BASE = {
  content: SAMPLE_MARKDOWN,
  generated_at: "2026-01-29T12:00:00Z",
};

// ── buildDiffContent ────────────────────────────────────────────────

describe("buildDiffContent", () => {
  test("returns content as-is for diff without window_days", () => {
    const result = buildDiffContent({ content: SAMPLE_MARKDOWN });
    expect(result).toBe(SAMPLE_MARKDOWN);
  });

  test("returns content as-is for diff with window_days", () => {
    const result = buildDiffContent({
      content: SAMPLE_MARKDOWN,
      ...({ window_days: 3 } as Record<string, unknown>),
    });
    expect(result).toBe(SAMPLE_MARKDOWN);
  });

  test("returns empty string for null content", () => {
    expect(buildDiffContent({ content: null })).toBe("");
  });

  test("returns empty string for undefined content", () => {
    expect(buildDiffContent({})).toBe("");
  });
});

// ── data-p index stability ──────────────────────────────────────────

describe("data-p index stability", () => {
  test("first real paragraph gets data-p=0", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    expect(html).toContain('data-p="0"');
    expect(html).toContain("Cool Tool");

    // The first data-p element should contain the first article, not a date
    const firstP = html.match(/data-p="0"[^>]*>([\s\S]*?)(?:<\/p>|<\/li>)/);
    expect(firstP).not.toBeNull();
    expect(firstP![1]).toContain("Cool Tool");
  });

  test("indices are sequential starting from 0", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const indices = [...html.matchAll(/data-p="(\d+)"/g)].map((m) =>
      parseInt(m[1], 10)
    );
    expect(indices).toEqual([0, 1, 2]);
  });

  test("window_days diff has same indices as regular diff", () => {
    const regularContent = buildDiffContent({ content: SAMPLE_MARKDOWN });
    const windowContent = buildDiffContent({
      content: SAMPLE_MARKDOWN,
      ...({ window_days: 7 } as Record<string, unknown>),
    });

    const regularHtml = renderMarkdown(regularContent);
    const windowHtml = renderMarkdown(windowContent);

    const regularIndices = [...regularHtml.matchAll(/data-p="(\d+)"/g)].map(
      (m) => parseInt(m[1], 10)
    );
    const windowIndices = [...windowHtml.matchAll(/data-p="(\d+)"/g)].map(
      (m) => parseInt(m[1], 10)
    );

    expect(windowIndices).toEqual(regularIndices);
  });

  test("bold date text in markdown would shift indices (regression guard)", () => {
    // Simulates the old bug: if someone manually prepends a bold date line,
    // the paragraph indices shift. This test documents the behavior.
    const withDatePrepended = `**Thursday, January 29, 2026 · Past 7 days**\n\n---\n\n${SAMPLE_MARKDOWN}`;
    const withoutDate = SAMPLE_MARKDOWN;

    const htmlWith = renderMarkdown(withDatePrepended);
    const htmlWithout = renderMarkdown(withoutDate);

    const indicesWith = [...htmlWith.matchAll(/data-p="(\d+)"/g)].map((m) =>
      parseInt(m[1], 10)
    );
    const indicesWithout = [...htmlWithout.matchAll(/data-p="(\d+)"/g)].map(
      (m) => parseInt(m[1], 10)
    );

    // The prepended bold text creates an extra data-p="0", shifting everything
    expect(indicesWith[0]).toBe(0); // the date paragraph
    expect(indicesWith.length).toBe(indicesWithout.length + 1);

    // Real content starts at data-p="1" instead of data-p="0"
    expect(indicesWith[1]).toBe(1);
    expect(indicesWithout[0]).toBe(0);
  });
});

// ── extractParagraphs ───────────────────────────────────────────────

describe("extractParagraphs", () => {
  test("extracts paragraphs with correct indices", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const paragraphs = extractParagraphs(html);

    expect(paragraphs.length).toBe(3);
    expect(paragraphs[0].pIndex).toBe(0);
    expect(paragraphs[1].pIndex).toBe(1);
    expect(paragraphs[2].pIndex).toBe(2);
  });

  test("paragraphs have correct section titles", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const paragraphs = extractParagraphs(html);

    expect(paragraphs[0].sectionTitle).toContain("Tools");
    expect(paragraphs[1].sectionTitle).toContain("Tools");
    expect(paragraphs[2].sectionTitle).toContain("AI");
  });

  test("paragraph text contains article content", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const paragraphs = extractParagraphs(html);

    expect(paragraphs[0].text).toContain("Cool Tool");
    expect(paragraphs[1].text).toContain("Another Project");
    expect(paragraphs[2].text).toContain("Model Update");
  });

  test("buildDiffContent output produces stable extractParagraphs results", () => {
    const content = buildDiffContent({ content: SAMPLE_MARKDOWN });
    const html = renderMarkdown(content);
    const paragraphs = extractParagraphs(html);

    expect(paragraphs[0].pIndex).toBe(0);
    expect(paragraphs[0].text).toContain("Cool Tool");
  });
});

// ── extractSections ─────────────────────────────────────────────────

describe("extractSections", () => {
  test("extracts sections by h2 headings", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const sections = extractSections(html);

    expect(sections.length).toBe(2);
    expect(sections[0].title).toContain("Tools");
    expect(sections[1].title).toContain("AI");
  });

  test("excludes Sources section", () => {
    const mdWithSources = SAMPLE_MARKDOWN + "\n\n## Sources\n\nSome source info.";
    const html = renderMarkdown(mdWithSources);
    const sections = extractSections(html);

    expect(sections.length).toBe(2);
    expect(sections.every((s) => !/sources/i.test(s.title))).toBe(true);
  });

  test("section html contains data-p elements", () => {
    const html = renderMarkdown(SAMPLE_MARKDOWN);
    const sections = extractSections(html);

    expect(sections[0].html).toContain('data-p="0"');
    expect(sections[0].html).toContain('data-p="1"');
    expect(sections[1].html).toContain('data-p="2"');
  });
});

// ── formatDiffDate ──────────────────────────────────────────────────

describe("formatDiffDate", () => {
  test("returns date string without window", () => {
    const result = formatDiffDate("2026-01-29T12:00:00Z");
    expect(result).toContain("2026");
    expect(result).toContain("29");
  });

  test("appends 'Past 24 hours' for window_days=1", () => {
    const result = formatDiffDate("2026-01-29T12:00:00Z", 1);
    expect(result).toContain("Past 24 hours");
  });

  test("appends 'Past N days' for window_days > 1", () => {
    const result = formatDiffDate("2026-01-29T12:00:00Z", 7);
    expect(result).toContain("Past 7 days");
  });

  test("returns just the date for window_days=0", () => {
    const result = formatDiffDate("2026-01-29T12:00:00Z", 0);
    expect(result).not.toContain("Past");
  });
});
