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

`static/changelog.json` (served as `/changelog.json`):

```json
{
  "versions": [
    {
      "version": "4.3",
      "date": "2026-05-15",
      "summary": "Pick a specific model for each pipeline step",
      "description": "Each provider now exposes a per-step model picker right inside its API key modal.",
      "changes": [
        { "type": "feature", "text": "Model picker for each pipeline step", "in": "4.3.0" },
        { "type": "fix", "text": "Screen Wake Lock keeps mobile generation alive", "in": "4.3.1" }
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

The current version from `package.json` is injected at build time via Vite's `define` config as the `__APP_VERSION__` global (`vite.config.ts`), which `ChangelogModal.svelte` reads directly. No `data-version` attribute is needed — the version is baked into the bundle.

```typescript
// vite.config.ts
define: {
  __APP_VERSION__: JSON.stringify(pkg.version)
}
```

## Client Behavior

The changelog is rendered by `src/lib/components/ChangelogModal.svelte`.

### New Indicator

1. Component reads compiled-in `__APP_VERSION__`
2. Compare against `localStorage['difflog-changelog-seen']` using semver
3. If current > last seen → set `hasUnseen` flag (parent shows dot)
4. If no previous value, seed with current version (first-load suppression)

### Opening the Changelog

1. Lazy-fetch `/changelog.json` on first open (cached for the session)
2. Filter to versions containing any change where `in > lastSeen`; otherwise show only the latest version with a "show all" toggle
3. Update `localStorage['difflog-changelog-seen']` to current version on close

### localStorage

| Key | Value | Example |
|-----|-------|---------|
| `difflog-changelog-seen` | Last viewed version (full semver) | `"2.0.1"` |

## Adding a New Release

(See also the "Releasing" section in `CLAUDE.md`.)

### New Major/Minor (e.g., 4.4.0)

1. Bump `version` in `package.json`
2. Prepend a new entry to `versions[]` in `static/changelog.json`:

```json
{
  "version": "4.4",
  "date": "2026-06-15",
  "summary": "Brief description of this release",
  "changes": [
    { "type": "feature", "text": "New feature description", "in": "4.4.0" }
  ]
}
```

3. Commit: `release: vX.Y.Z`
4. Tag and push: `git tag vX.Y.Z && git push --tags`

### Patch Release (e.g., 4.3.2)

1. Bump `version` in `package.json`
2. Append changes to the existing major.minor entry's `changes` array with `"in": "x.y.z"`
3. Commit + tag as above

### CLI Releases

CLI versioning is independent — bumping `cliVersion` in `package.json` triggers `.github/workflows/cli.yml`, which builds binaries and publishes a `cli-vX.Y.Z` GitHub release automatically. No `static/changelog.json` entry is needed for CLI bumps; release notes are auto-generated from commit history between tags.

## Files

| File | Purpose |
|------|---------|
| `static/changelog.json` | Changelog data (static, no backend) |
| `src/lib/components/ChangelogModal.svelte` | Svelte 5 modal component |
| `src/routes/+layout.svelte` | Renders the modal and changelog button |
| `src/lib/utils/constants.ts` | `STORAGE_KEYS.CHANGELOG_SEEN` |
| `vite.config.ts` | Injects `__APP_VERSION__` from `package.json` |
