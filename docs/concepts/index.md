---
icon: lucide/book-open
---

# Concepts

Terminology, conventions, and technology choices used throughout Difflog.

## Terminology

| Term | Meaning |
|------|---------|
| **Diff** | A generated intelligence report — what's changed since you last checked in |
| **Profile** | A saved configuration (tech stack, interests, API key) that personalizes your diffs |
| **Star** | A reference to a bookmarked paragraph in a diff (not a copy) |
| **Depth** | Reading preference — how detailed your diffs should be |
| **Sync** | Optional cross-device sharing via encrypted cloud storage |

### Depth Levels

| Level | Icon | Description |
|-------|------|-------------|
| Quick Scan | ⚡ | 2-3 min read, headlines only |
| Standard Brief | 📋 | 5 min read, key details |
| Deep Dive | 🔬 | 10+ min, full analysis |

## Pages and Partials

**Pages** are full HTML documents that work standalone on direct load. Alpine AJAX swaps the `#content` area on navigation for SPA-like transitions.

| Route | File | Purpose |
|-------|------|---------|
| `/welcome` | `welcome.html` | Landing page for new users |
| `/setup` | `setup.html` | Profile creation wizard |
| `/` | `index.html` | Main app — generate and view diffs |
| `/archive` | `archive.html` | Past diffs list |
| `/stars` | `stars.html` | Bookmarked paragraphs |
| `/profiles` | `profiles.html` | Manage multiple profiles |
| `/share` | `share.html` | Import a shared profile |

**Partials** are HTML fragments loaded via Alpine AJAX into existing pages. They don't include `<html>` or `<head>` — just the content to be swapped in.

| File | Purpose |
|------|---------|
| `step-languages.html` | Setup wizard — programming languages |
| `step-frameworks.html` | Setup wizard — frameworks |
| `step-tools.html` | Setup wizard — tools |
| `step-topics.html` | Setup wizard — topics of interest |
| `step-depth.html` | Setup wizard — reading depth preference |

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

## Iconography

The app uses HTML entities rather than an icon library:

| Icon | Entity | Usage |
|------|--------|-------|
| ◆ | `&#9670;` | Logo, generate button, branding |
| ■ | `&#9632;` | Diff indicator |
| ★ | `&#9733;` | Star/bookmark |
| ✎ | `&#9998;` | Edit |
| ✓ | `&#10003;` | Confirmed/valid |
| ✗ | `&#10007;` | Invalid |
| ↻ | `&#8635;` | Sync |
| 🗑️ | `&#128465;` | Delete |

This keeps the bundle small and works universally without icon fonts.
