// Profile field options
export const LANGUAGES = ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go', 'Java', 'C#', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Elixir', 'Haskell', 'Zig', 'Clojure'];
export const FRAMEWORKS = ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Node.js', 'Deno', 'Bun', 'Django', 'FastAPI', 'Rails', 'Spring', '.NET', 'Laravel', 'Phoenix', 'Tauri', 'Electron'];
export const TOOLS = ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Azure', 'Vercel', 'Cloudflare', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'Ansible', 'Prometheus', 'Grafana', 'Redis', 'PostgreSQL', 'MongoDB', 'SQLite'];
export const TOPICS = ['AI/ML & LLMs', 'DevOps & Platform', 'Security & Privacy', 'Web Performance', 'Open Source', 'Startups & Funding', 'Career & Jobs', 'System Design', 'Mobile Dev', 'Game Dev', 'Data Engineering', 'Blockchain/Web3', 'Edge Computing', 'Developer Tools'];

export const DEPTHS = [
  { id: 'quick', label: 'Quick Scan', desc: '2-3 min read, headlines only', icon: '\u26A1' },
  { id: 'standard', label: 'Standard Brief', desc: '5 min read, key details', icon: '\uD83D\uDCCB' },
  { id: 'deep', label: 'Deep Dive', desc: '10+ min, full analysis', icon: '\uD83D\uDD2C' }
] as const;

export const SCAN_MESSAGES = [
  { text: "Scanning HN, Reddit, GitHub, Lobsters, Dev.to...", icon: "\uD83D\uDCE1" },
  { text: "Analyzing your tech interests...", icon: "\uD83D\uDD0D" },
  { text: "Recalling what's new in your stack...", icon: "\uD83E\uDDE0" },
  { text: "Separating hype from substance...", icon: "\uD83C\uDFAD" },
  { text: "Judging yesterday's Show HN posts...", icon: "\u2696\uFE0F" },
  { text: "Composing something you'll actually read...", icon: "\u270D\uFE0F" },
  { text: "Filtering out blockchain pitches...", icon: "\uD83D\uDEAB" },
  { text: "Curating links worth clicking...", icon: "\uD83D\uDD17" },
  { text: "Skimming changelogs so you don't have to...", icon: "\uD83D\uDCCB" },
  { text: "Deciding which breaking changes to warn you about...", icon: "\u26A0\uFE0F" },
  { text: "Crafting hot takes with measured restraint...", icon: "\uD83C\uDF21\uFE0F" },
  { text: "Suppressing urge to recommend Rust...", icon: "\uD83E\uDD80" },
  { text: "Pretending not to have opinions about tabs vs spaces...", icon: "\uD83E\uDD10" },
  { text: "Resisting the urge to refactor your diff...", icon: "\uD83D\uDD04" },
  { text: "Generating your personalized diff...", icon: "\uD83C\uDFAF" },
  { text: "Almost done, just adding one more mass extinction event...", icon: "\u231B" },
];

// Field options lookup for setup wizard
export const FIELD_OPTIONS: Record<string, string[]> = {
  languages: LANGUAGES,
  frameworks: FRAMEWORKS,
  tools: TOOLS,
  topics: TOPICS
};

// Storage keys
export const STORAGE_KEYS = {
  PROFILES: 'difflog-profiles',
  ACTIVE_PROFILE: 'difflog-active-profile',
  HISTORIES: 'difflog-histories',
  BOOKMARKS: 'difflog-bookmarks',
  PENDING_SYNC: 'difflog-pending-sync',
  SYNC_PASSWORD: 'difflog-sync-password',
  REMEMBERED_PASSWORDS: 'difflog-remembered-passwords'
} as const;
