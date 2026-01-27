interface Profile {
  name: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth: 'quick' | 'standard' | 'deep';
  customFocus?: string;
}

const DEPTH_INSTRUCTIONS: Record<string, string> = {
  quick: 'Keep it very concise. 1-2 bullet points per section max. Headlines and key facts only.',
  standard: 'Provide balanced coverage. 2-4 bullet points per section with key details and context.',
  deep: 'Provide comprehensive analysis. Include background context, implications, and detailed analysis for each item.'
};

export function buildPrompt(profile: Profile, feedContext?: string, lastDiffDate?: string, previousDiff?: string): string {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  });
  const windowDays = lastDiffDate
    ? Math.min(Math.max(Math.ceil((Date.now() - new Date(lastDiffDate).getTime()) / 86400000), 1), 7)
    : 7;
  const windowText = windowDays === 1 ? 'Past 24 hours' : `Past ${windowDays} days`;

  const feedSection = feedContext
    ? `\n\n${feedContext}\n\nIMPORTANT: Use the real URLs from the feed data above as sources. Do NOT use placeholder URLs like example.com. Link to the actual articles, repos, and discussions provided.`
    : '';

  const previousDiffSection = previousDiff
    ? `\n\nPREVIOUS DIFF (DO NOT REPEAT):\nThe following is the user's most recent diff. Do NOT repeat any of the same stories, releases, or topics covered below. Find NEW and DIFFERENT developments to report on.\n\n---\n${previousDiff}\n---`
    : '';

  return `Generate a developer intelligence diff in markdown. No preamble — start directly with the date line below.

FORMAT:
- Use real URLs from the feed data or web search — never placeholder or hallucinated links
- Link to sources inline: [Source Title](url)

PROFILE:
- Name: ${profile.name || 'Developer'}
- Tracking (languages/frameworks/tools): ${[...profile.languages, ...profile.frameworks, ...profile.tools].join(', ') || 'General'}
- Focus (topics & interests): ${profile.topics.join(', ') || 'General tech'}
${profile.customFocus ? `- Custom focus: ${profile.customFocus}` : ''}

DEPTH: ${DEPTH_INSTRUCTIONS[profile.depth] || DEPTH_INSTRUCTIONS.standard}
${feedSection}${previousDiffSection}

SECTION GUIDANCE:
- Start with the date line, then organize into whatever ## sections make sense for this week's findings
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
- Use emoji prefixes on section headings, e.g.: ## \uD83D\uDEA8 Critical Alerts

START OUTPUT HERE:

**${currentDate}** \u00b7 Intelligence Window: ${windowText}

---`;
}
