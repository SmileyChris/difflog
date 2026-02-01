---
icon: lucide/sparkles
---

# Changelog System

A user-friendly changelog that shows what's new since you last visited.

## Design Goals

- **No runtime backend** — changelog is a static JSON file
- **Efficient loading** — fetched only when user opens the dialog
- **New indicator** — dot appears when there are unseen changes
- **Grouped versions** — display major.minor, track patches internally

## Version Strategy

Versions are grouped by major.minor for display, but individual changes track their exact patch version:

| Version | Display | Notes |
|---------|---------|-------|
| 2.0.0 | 2.0 | Initial 2.0 release |
| 2.0.1 | 2.0 | Patch added to 2.0 section |
| 2.0.2 | 2.0 | Another patch in 2.0 |
| 2.1.0 | 2.1 | New minor = new section |

This keeps the UI clean while still allowing "new since last visit" highlighting at the patch level.

## Data Format

`public/changelog.json`:

```json
{
  "versions": [
    {
      "version": "2.0",
      "date": "2026-01-31",
      "summary": "Streak tracking and stability improvements",
      "description": "Track your diff·log usage with a new streak system. See your weekly activity at a glance and build consistency in staying up to date.",
      "changes": [
        { "type": "feature", "text": "Streak tracking with weekly activity calendar", "in": "2.0.0" },
        { "type": "feature", "text": "Ctrl+click demo profile creation on setup", "in": "2.0.0" },
        { "type": "fix", "text": "Star hashing and Alpine.js key generation", "in": "2.0.1" }
      ]
    }
  ]
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Major.minor version for display (e.g., "2.0") |
| `date` | Yes | Release date (YYYY-MM-DD) |
| `summary` | Yes | One-line summary shown in collapsed view |
| `description` | No | Longer description shown when expanded |
| `changes` | Yes | Array of individual changes |

### Change Types

| Type | Icon | Description |
|------|------|-------------|
| `feature` | ✨ | New functionality |
| `fix` | 🐛 | Bug fix |
| Other | `mono text` | Fallback for other types (e.g., `docs`, `perf`) |

## Build Integration

The build script injects the current version from `package.json` into the page as a data attribute on the changelog button. This allows the "new" dot indicator to work without fetching the changelog.

```html
<button class="changelog-btn" data-version="2.0.1">
```

## Client Behavior

### New Indicator

1. Page loads with version injected from `package.json`
2. Compare against `localStorage['difflog-changelog-seen']`
3. If different → show dot on changelog button

### Opening the Changelog

1. Fetch `/changelog.json` (cached after first load)
2. Display versions with their changes
3. Highlight items where `in > lastSeen`
4. Update `localStorage['difflog-changelog-seen']` to current version

### localStorage

| Key | Value | Example |
|-----|-------|---------|
| `difflog-changelog-seen` | Last viewed version (full semver) | `"2.0.1"` |

## Adding a New Release

### New Major/Minor (e.g., 2.1.0)

1. Update `package.json` version
2. Add new entry to `changelog.json`:

```json
{
  "version": "2.1",
  "date": "2026-02-15",
  "summary": "Brief description of this release",
  "changes": [
    { "type": "feature", "text": "New feature description", "in": "2.1.0" }
  ]
}
```

### Patch Release (e.g., 2.0.2)

1. Update `package.json` version
2. Add changes to existing version entry:

```json
{
  "version": "2.0",
  "date": "2026-01-31",
  "summary": "...",
  "changes": [
    { "type": "feature", "text": "...", "in": "2.0.0" },
    { "type": "fix", "text": "New fix description", "in": "2.0.2" }
  ]
}
```

## Files

| File | Purpose |
|------|---------|
| `public/changelog.json` | Changelog data (static, no backend) |
| `src/components/changelog.ts` | Alpine component for dialog |
| `partials/site-footer.html` | Changelog button in footer |
| `src/lib/constants.ts` | `STORAGE_KEYS.CHANGELOG_SEEN` |
