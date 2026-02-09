---
icon: lucide/users
---

# Team Profiles

**Status:** Conceptual / RFC

Shared stack configuration for engineering teams, so everyone generates diffs tuned to the same technologies without each person setting up their profile independently.

---

## Problem

When a team adopts diff·log, each member manually configures the same languages, frameworks, tools, and topics. When the stack changes (new framework adopted, old tool deprecated), everyone has to update individually. There's no way to say "we're a React/Go/Kubernetes team" once and have that propagate.

---

## Goals

1. **Shared config, personal keys** — team members share a stack definition but generate diffs with their own API keys. No key sharing, ever.
2. **Minimal overhead** — joining a team should be as simple as importing a profile today (link/code).
3. **Additive, not replacing** — team config augments personal profiles. Members can still have personal topics alongside team ones.
4. **Local-first** — works offline. Team config is pulled down and stored locally like any other profile data.

---

## How It Works

A team profile is a read-only stack definition that members subscribe to. It provides `languages`, `frameworks`, `tools`, `topics`, `custom_focus`, and optionally `depth` — the same fields as a personal profile. When generating a diff, the team config is merged with the member's personal profile.

### What's Shared vs. Personal

| Data | Shared (team) | Personal (member) |
|------|:---:|:---:|
| Languages, frameworks, tools, topics | Yes | Yes (additive) |
| Custom focus | Yes | Yes (appended) |
| Depth preference | Optional default | Override allowed |
| API keys | Never | Always personal |
| Diffs | Never | Always personal |
| Stars | Never | Always personal |
| Sync password | Never | Always personal |

### Merge Rules

When generating a diff for a member who subscribes to a team:

- **Lists** (languages, frameworks, tools, topics): union of team + personal, deduplicated.
- **Custom focus**: team focus + personal focus, joined with a newline if both exist.
- **Depth**: personal setting wins. Falls back to team default, then `standard`.

---

## Roles

**Owner** — creates the team profile, sets and updates the stack config. An owner is just a regular diff·log user who created the team. There's no special account type.

**Member** — subscribes to the team profile. Gets the shared config merged into their diff generation. Can unsubscribe at any time.

There are no other roles. No admins, no editors, no viewer-only. The owner edits, members read.

### Transferring Ownership

An owner can transfer ownership to any current member. This is a simple metadata update — the new owner's profile ID replaces the old one. The previous owner becomes a regular member.

---

## Join Flow

1. Owner creates a team profile (name + stack config).
2. Owner gets a share link: `difflog.dev/team/{id}` (or a short code).
3. Prospective member opens the link, sees the team name and stack preview.
4. Member clicks "Join" — the team config is stored locally and linked to their active profile.
5. Next diff generation merges team + personal config automatically.

No password required to join. Team config is not sensitive — it's the same kind of data already visible on the share page (`GET /api/share/{id}`). An owner can regenerate the invite link to invalidate the old one if needed.

### Leaving

A member can leave a team at any time from the profiles page. This removes the local team link. Their next diff generates with personal config only. No server call needed — just delete the local reference.

---

## Schema

### New Table: `teams`

```sql
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  languages TEXT,           -- JSON array
  frameworks TEXT,          -- JSON array
  tools TEXT,               -- JSON array
  topics TEXT,              -- JSON array
  depth TEXT,               -- optional default
  custom_focus TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE
);
```

### New Table: `team_members`

```sql
CREATE TABLE team_members (
  team_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  joined_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, profile_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
```

No encrypted data. Team config is plaintext (same sensitivity level as profile metadata — public on the share page).

### Client-Side Storage

Add a `teamId` field to the local profile object:

```typescript
interface Profile {
  // ... existing fields
  teamId?: string;       // ID of subscribed team (one team per profile for now)
  teamConfig?: TeamConfig; // Cached team config for offline use
}

interface TeamConfig {
  id: string;
  name: string;
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth?: string;
  custom_focus?: string;
  updated_at: string;
}
```

Team config is cached locally so diff generation works offline. Refreshed on sync or manual pull.

---

## API Endpoints

### `POST /api/team/create`

Create a team. Requires the owner's profile password for auth.

**Request:**
```json
{
  "name": "Backend Team",
  "owner_id": "uuid",
  "password_hash": "salt:hash",
  "languages": ["Go", "Python"],
  "frameworks": ["gRPC"],
  "tools": ["Kubernetes", "Terraform"],
  "topics": ["Cloud Infrastructure"]
}
```

**Response** (201):
```json
{
  "id": "uuid",
  "invite_code": "abc123"
}
```

### `GET /api/team/{id}`

Get team config. **No auth required** (same as `GET /api/share/{id}`).

**Response:**
```json
{
  "id": "uuid",
  "name": "Backend Team",
  "languages": ["Go", "Python"],
  "frameworks": ["gRPC"],
  "tools": ["Kubernetes", "Terraform"],
  "topics": ["Cloud Infrastructure"],
  "depth": null,
  "custom_focus": null,
  "member_count": 5
}
```

### `PUT /api/team/{id}`

Update team config. Owner only (requires password).

### `POST /api/team/{id}/join`

Join a team. Requires the member's profile password for auth (proves they own the profile).

**Request:**
```json
{
  "profile_id": "uuid",
  "password_hash": "salt:hash"
}
```

### `POST /api/team/{id}/leave`

Leave a team. Same auth as join.

### `DELETE /api/team/{id}`

Delete a team. Owner only. Removes all memberships.

---

## Interaction with Existing Sync

Team membership is synced alongside profile data. When a profile syncs:

1. If the profile has a `teamId`, fetch the latest team config from `GET /api/team/{id}`.
2. Cache the config locally.
3. If the team has been deleted (404), clear the local `teamId` and `teamConfig`.

This piggybacks on the existing sync flow — no new sync protocol needed. The team config fetch is a simple GET (no encryption, no password) that happens as a side effect of regular sync.

### Multi-Device

When a member imports their profile on a new device, the `teamId` comes along with the rest of the profile data. On first sync, the team config is fetched and cached. The new device is immediately generating team-aware diffs.

---

## Feature Roadmap

### v0.1: Read-Only Teams

- Owner can create a team with stack config
- Share link/code for joining
- Members subscribe, config merges into diff generation
- Owner can update config (propagates on next member sync)
- Team management on the profiles page

### v0.2: Team Activity

- "Last generated" timestamp per member (opt-in, shared with team)
- Owner dashboard showing team engagement (who's generating, who's dormant)
- Team-wide streak tracking

### v0.3: Curated Sources

- Owner can pin custom RSS feeds or specific sources for the team
- Shared `resolved_sources` mapping so the whole team gets the same feed curation
- Source suggestions from members (owner approves)

---

## Open Questions

- **Multiple teams per profile?** v0.1 limits to one team per profile for simplicity. If there's demand, the `teamId` field becomes `teamIds: string[]` and merge order needs to be defined.
- **Team-scoped diffs?** Some teams might want to see each other's diffs. This would require shared encryption keys and is a significant complexity jump. Deferred unless there's clear demand.
- **Notifications?** When the owner updates team config, should members get notified? Could be as simple as a "team config updated" banner on next visit. No push notifications.
