---
icon: lucide/server
---

# Operations

This section covers deployment and maintenance tasks for diff·log.

## Deployment

diff·log is deployed to Cloudflare Pages with a D1 database for sync storage.

### Deploy to Production

```bash
bun run deploy
```

This builds the app and deploys to Cloudflare Pages. The command:

1. Runs `bun run build` to bundle TypeScript and CSS
2. Runs `wrangler pages deploy dist` to upload to Cloudflare

### Database Migrations

Apply migrations to the production D1 database:

```bash
bun run db:migrate
```

For local development, migrations are applied automatically when running `bun run dev`.

## Maintenance

### Profile Cleanup

The cleanup command identifies and removes stale profiles from the database. Profiles are considered stale if their `updated_at` timestamp is older than a threshold (default: 180 days).

```bash
# List stale profiles (dry-run, local database)
bun run cleanup --days 180

# List stale profiles from production
bun run cleanup --days 180 --remote

# Delete stale profiles from production
bun run cleanup --days 180 --remote --confirm
```

#### Options

| Option | Description |
|--------|-------------|
| `--days <n>` | Profiles older than n days are stale (default: 180) |
| `--remote` | Query production database instead of local |
| `--confirm` | Actually delete profiles (dry-run by default) |

#### What Gets Deleted

When a profile is deleted, the database cascades the deletion to:

- All **diffs** associated with the profile
- All **stars** associated with the profile

The cleanup output shows counts of diffs and stars that will be affected before deletion.

#### Example Output

```
Searching for profiles inactive for 180+ days (production database)...

Found 2 stale profile(s):

────────────────────────────────────────────────────────────────────────────────
ID:           abc123-def456-...
Name:         old-project
Last updated: Jul 15, 2025 (196 days ago)
Content sync: Aug 1, 2025
Created:      Jan 10, 2025
Diffs:        12
Stars:        5
────────────────────────────────────────────────────────────────────────────────
...

Summary: 2 profiles, 24 diffs, 8 stars

Dry run - no changes made.
To delete these profiles, run with --confirm flag.
```
