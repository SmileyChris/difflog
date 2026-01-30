---
icon: lucide/book-open
---

# Concepts

Terminology, conventions, and technology choices used throughout diff·log.

## Terminology

| Term | Meaning |
|------|---------|
| **Diff** | A generated intelligence report — what's changed since you last checked in |
| **Profile** | A saved configuration (tech stack, interests, API key) that personalizes your diffs |
| **Star** | A reference to a bookmarked paragraph in a diff (not a copy) |
| **Depth** | Reading preference — how detailed your diffs should be (see [AI Pipeline](../ai.md#depth-levels)) |
| **Sync** | Optional cross-device sharing via encrypted cloud storage |
| **Account** | Email-based identity for purchasing and tracking creds |
| **Creds** | Credits for generating diffs via shared API (alternative to BYOK) |

## Pages and Partials

**Pages** are full HTML documents that work standalone on direct load. CSS View Transitions provide smooth cross-document navigation.

| Route | File | Purpose |
|-------|------|---------|
| `/` | `index.html` | Main dashboard — generate and view diffs |
| `/about` | `about/index.html` | Landing page for new users |
| `/about/privacy` | `about/privacy.html` | Privacy policy |
| `/about/terms` | `about/terms.html` | Terms of service |
| `/setup` | `setup.html` | Profile creation wizard |
| `/archive` | `archive.html` | Past diffs list |
| `/stars` | `stars.html` | Bookmarked paragraphs |
| `/profiles` | `profiles.html` | Manage multiple profiles |
| `/share` | `share.html` | Import a shared profile |
| `/d/:id` | `d.html` | Public diff view |
| `/creds` | `creds.html` | Creds management, purchase history |

**Partials** are HTML fragments in `partials/`. They're inlined at build time via `<!-- @include partials/filename.html -->` for repeated sections (footer, dropdowns) or loaded dynamically by Alpine components (setup wizard steps).

| File | Purpose |
|------|---------|
| `step-languages.html` | Setup wizard — programming languages |
| `step-frameworks.html` | Setup wizard — frameworks |
| `step-tools.html` | Setup wizard — tools |
| `step-topics.html` | Setup wizard — topics of interest |
| `step-depth.html` | Setup wizard — reading depth preference |
| `sync-dropdown.html` | Sync status and controls |
| `share-dropdown.html` | Public sharing controls |
| `site-footer.html` | Common footer links |

## localStorage Keys

All client data is stored locally with these keys:

| Key | Contents |
|-----|----------|
| `difflog-profiles` | All profile configurations |
| `difflog-active-profile` | Currently selected profile ID |
| `difflog-histories` | Generated diffs per profile |
| `difflog-bookmarks` | Starred paragraphs per profile |
| `difflog-pending-sync` | Changes waiting to sync |
| `difflog-user` | Account info (email, code, creds balance) |

## Data Models

### Profile

A saved configuration that personalizes your diffs.

```typescript
{
  id: string;              // UUID
  name: string;            // Display name
  apiKey?: string;         // Anthropic API key (BYOK mode only)
  apiSource: 'byok' | 'creds';  // API mode
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

Custom languages/tools/topics not in predefined mappings are resolved via AI (Haiku) on first use. Results are cached in `resolvedMappings` to avoid repeated API calls.

### Diff

Diffs store markdown only. HTML is rendered client-side on display.

```typescript
{
  id: string;           // Unique identifier (timestamp-based)
  title: string;        // AI-generated title
  content: string;      // Markdown content
  generated_at: string; // ISO timestamp
  duration_seconds: number;
  cost?: number;        // -1 = creds, positive = BYOK cost in $
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

### User

Stored in `difflog-user` localStorage. Represents the logged-in creds account.

```typescript
{
  email: string;    // Verified email address
  code: string;     // Verification code (reused as credential)
  creds: number;    // Current credits balance
}
```

For server-side models (Account, Transaction), see [Creds Database Schema](../architecture/creds.md#database-schema).

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

This keeps the bundle small and works universally without icon fonts.
