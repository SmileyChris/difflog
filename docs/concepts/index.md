---
icon: lucide/book-open
---

# Concepts

Terminology, conventions, and technology choices used throughout diff·log.

## Terminology

| Term | Meaning |
|------|---------|
| **Diff** | A generated intelligence report — what's changed since you last checked in |
| **Profile** | A saved configuration (tech stack, interests, API keys) that personalizes your diffs |
| **Star** | A reference to a bookmarked paragraph in a diff (not a copy) |
| **Depth** | Reading preference — how detailed your diffs should be (see [AI Pipeline](../ai.md#depth-levels)) |
| **Streak** | Count of consecutive diffs generated with an 8-day tolerance between each |
| **Sync** | Optional cross-device sharing via encrypted cloud storage |

## Routes

SvelteKit file-based routing. CSS View Transitions provide smooth navigation.

| Route | Purpose |
|-------|---------|
| `/` | Main dashboard — generate and view diffs |
| `/about` | Landing page for new users |
| `/about/privacy` | Privacy policy |
| `/about/terms` | Terms of service |
| `/setup` | Profile creation/editing wizard |
| `/generate` | Diff generation page |
| `/archive` | Past diffs list |
| `/stars` | Bookmarked paragraphs |
| `/profiles` | Profile management, sync, sharing |
| `/d/:id` | Public diff view |
| `/design` | Design system (dev only) |

## localStorage Keys

All client data is stored locally with these keys:

| Key | Contents |
|-----|----------|
| `difflog-profiles` | All profile configurations |
| `difflog-active-profile` | Currently selected profile ID |
| `difflog-histories` | Generated diffs per profile |
| `difflog-bookmarks` | Starred paragraphs per profile |
| `difflog-pending-sync` | Changes waiting to sync |

## Data Models

### Profile

A saved configuration that personalizes your diffs.

```typescript
{
  id: string;              // UUID
  name: string;            // Display name
  apiKeys?: {              // API keys per provider (stored locally)
    anthropic?: string;
    serper?: string;
    perplexity?: string;
    deepseek?: string;
    gemini?: string;
  };
  providerSelections?: {   // Which provider to use per pipeline step
    search: string | null;
    curation: string | null;
    synthesis: string | null;
  };
  languages: string[];     // Programming languages
  frameworks: string[];    // Frameworks
  tools: string[];         // Developer tools
  topics: string[];        // Topics of interest
  depth: string;           // Reading preference
  customFocus?: string;    // Optional custom instructions
  resolvedMappings?: {     // AI-resolved sources for custom items
    [item: string]: {
      subreddits: string[];
      lobstersTags: string[];
      devtoTags: string[];
    }
  };
  // Sync-related fields
  salt?: string;           // Encryption salt (when synced)
  passwordSalt?: string;   // Password hash salt
  syncedAt?: string;       // Last sync timestamp
}
```

Custom languages/tools/topics not in predefined mappings are resolved via AI on first use (using the cheapest available curation provider). Results are cached in `resolvedMappings` to avoid repeated API calls.

### Diff

Diffs store markdown only. HTML is rendered client-side on display.

```typescript
{
  id: string;           // Unique identifier (timestamp-based)
  title: string;        // AI-generated title
  content: string;      // Markdown content
  generated_at: string; // ISO timestamp
  duration_seconds: number;
}
```

### Star (Reference-Based)

Stars are lightweight references to paragraphs within diffs, not copies of content. This reduces storage from ~2KB to ~50 bytes per star.

```typescript
{
  id: string;           // Unique identifier (UUID)
  diff_id: string;      // Reference to parent diff
  p_index: number;      // Paragraph index (data-p attribute)
  added_at: string;     // ISO timestamp
}
```

Content is reconstructed on display via `getStarContent(star)`, which:

1. Finds the referenced diff by `diff_id`
2. Renders the diff's markdown to HTML
3. Queries for the element with `data-p="${p_index}"`
4. Returns the element's HTML and metadata

If the parent diff is deleted, the star becomes orphaned and displays a "Diff deleted" message with a remove button.

### Paragraph Indexing

The markdown renderer assigns sequential `data-p` indices to bookmarkable elements:

```html
<p class="md-p" data-p="0">First paragraph...</p>
<ul class="md-list">
  <li class="md-list-item" data-p="1">First item...</li>
  <li class="md-list-item" data-p="2">Second item...</li>
</ul>
<p class="md-p" data-p="3">Another paragraph...</p>
```

Headers and horizontal rules are not indexed (not bookmarkable).

### Streak

Streaks track user engagement by counting consecutive diffs with an 8-day tolerance. The streak badge appears when a user has generated 2 or more diffs within the tolerance window.

```typescript
{
  streak: number;          // Total diffs in current streak
  expiresInDays: number;   // Days remaining before streak breaks
  startDate: string | null; // ISO timestamp of first diff in streak
  activeDates: string[];   // Array of ISO date strings (YYYY-MM-DD)
}
```

**Calculation rules:**

- Counts total diffs (not unique days) within the active streak period
- Multiple diffs on the same day all count toward the streak
- Maximum 8 days can pass between diffs before the streak breaks
- Streaks expire if more than 8 days have passed since the last diff
- The calendar shows the current week with activity dots (◆) for days with diffs

**Display:**

- Badge shows 🔥 emoji with streak count (size scales with streak length)
- Dropdown displays current week calendar with:
  - Active days marked with ◆
  - Today highlighted with accent border
  - Gap days shown with middot (·)
  - Expiration warning when ≤3 days remain

## Iconography

The app uses HTML entities rather than an icon library:

| Icon | Entity | Usage |
|------|--------|-------|
| ◆ | `&#9670;` | Logo, generate button, branding, separators |
| ■ | `&#9632;` | Diff indicator, archive |
| ★ | `&#9733;` | Star/bookmark |
| ✎ | `&#9998;` | Edit |
| × | `&times;` | Close/delete/remove |
| ✓ | `&#10003;` | Confirmed/valid |
| ✗ | `&#10007;` | Invalid |
| ↻ | `&#8635;` | Sync |
| ☁ | `&#9729;` | Cloud (sync status) |
| ⚠️ | `&#9888;` | Warning/error |
| 🔒 | `&#128274;` | Lock/private |
| 🔑 | `&#128273;` | Key |
| 📋 | `&#128203;` | Clipboard/copy |
| ↗ | `&#8599;` | External link/upload |
| ↓ | `&#8595;` | Import |
| 🔥 | `&#128293;` | Streak/fire |

This keeps the bundle small and works universally without icon fonts.
