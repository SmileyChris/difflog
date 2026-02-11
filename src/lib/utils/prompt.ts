import { type GenerationDepth } from './constants';

interface Profile {
  name: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth?: GenerationDepth;
  customFocus?: string;
}

export interface DiffPrompt {
  system: string;
  user: string;
  dateLine: string;
}

const DEPTH_INSTRUCTIONS = {
  quick: 'Keep it very concise. Max 3 sections, 1-2 bullet points each. Headlines and key facts only. Target ~500 words total.',
  standard: 'Provide balanced coverage. 2-4 bullet points per section with key details and context.',
  deep: 'Provide comprehensive analysis. Include background context, implications, and detailed analysis for each item.'
};

export function buildPrompt(profile: Profile, feedContext?: string, lastDiffDate?: string, previousDiff?: string, webContext?: string): DiffPrompt {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const windowDays = lastDiffDate
    ? Math.min(Math.max(Math.ceil((Date.now() - new Date(lastDiffDate).getTime()) / 86400000), 1), 7)
    : 7;
  const windowText = windowDays === 1 ? 'Past 24 hours' : `Past ${windowDays} days`;

  const system = `You are a developer intelligence reporter. Generate a markdown diff — no preamble, no code fences, start directly with content.

FORMAT:
- Begin with a single # heading: a short, creative plain-text title (3-8 words, no links or bold) that captures the overall theme of this diff — not just the first section
- Use plain Unicode characters (·, —, →, etc.), NEVER HTML entities (&middot; &mdash; &rarr; etc.)
- Use real URLs from the feed data or web search — never placeholder or hallucinated links
- IMPORTANT: Make the headline itself a link. The bold text should BE the link:
  CORRECT: **[Django 6.0 Released](https://djangoproject.com/...)** — description
  WRONG: **Django 6.0 Released** ([link](url)) — description
- When a discussion thread exists (HN, Reddit), add score after the linked headline:
  **[Rust 1.80 Released](https://blog.rust-lang.org/...)** (142 [HN](https://news.ycombinator.com/item?id=...) pts) — description
- For self-posts where the URL IS the discussion, just name the source in the score:
  **[Is Svelte easier than React?](https://reddit.com/r/sveltejs/...)** (42 r/sveltejs pts) — description

SECTION GUIDANCE:
- After the # title, organize into whatever ## sections make sense for this week's findings
- Only include sections that have real, substantive content — don't force empty categories
- Possible sections (use any, all, or invent your own as appropriate):
  - Critical Alerts (security vulns, breaking changes)
  - Notable Releases (new versions, major launches)
  - Trending (hot repos, discussions, viral posts)
  - Horizon Watch (emerging trends, upcoming changes)
  - Hype Check (overhyped claims vs reality)
  - Try This Week (practical tools/techniques worth exploring)
  - Community Drama (notable controversies or debates)
  - Deep Dive (detailed analysis of one significant development)
- Use emoji prefixes on section headings, e.g.: ## \uD83D\uDEA8 Critical Alerts`;

  const webSection = webContext
    ? `\n\n${webContext}`
    : '';

  const feedSection = feedContext
    ? `\n\n${feedContext}`
    : '';

  const sourcesNote = (feedContext || webContext)
    ? `\n\nIMPORTANT: Use the real URLs from the sources above. Do NOT use placeholder URLs like example.com. Link to the actual articles, repos, and discussions provided. Synthesize information from BOTH web search results and feed data to create a comprehensive diff.`
    : '';

  const previousDiffSection = previousDiff
    ? `\n\nPREVIOUS DIFF (DO NOT REPEAT):\nThe following is the user's most recent diff. Do NOT repeat any of the same stories, releases, or topics covered below. Find NEW and DIFFERENT developments to report on.\n\n---\n${previousDiff}\n---`
    : '';

  const user = `PROFILE:
- Name: ${profile.name || 'Developer'}
- Tracking (languages/frameworks/tools): ${[...profile.languages, ...profile.frameworks, ...profile.tools].join(', ') || 'General'}
- Focus (topics & interests): ${profile.topics.join(', ') || 'General tech'}
${profile.customFocus ? `- Custom focus: ${profile.customFocus}` : ''}
- Date: ${currentDate}
- Intelligence Window: ${windowText}

DEPTH: ${DEPTH_INSTRUCTIONS[(profile.depth as GenerationDepth) || 'standard']}
${webSection}${feedSection}${sourcesNote}${previousDiffSection}

Generate the diff now. Start with the # title, then ## sections.`;

  const dateLine = `**${currentDate}** \u00b7 Intelligence Window: ${windowText}\n\n---`;

  return { system, user, dateLine };
}
