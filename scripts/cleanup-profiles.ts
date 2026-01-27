#!/usr/bin/env bun
/**
 * Profile cleanup management command
 *
 * Lists and optionally deletes stale profiles from the D1 database.
 * Profiles are considered stale if updated_at is older than threshold.
 *
 * Usage:
 *   bun run cleanup --days 180                    # List profiles inactive 6+ months (local)
 *   bun run cleanup --days 180 --remote           # List from production
 *   bun run cleanup --days 180 --remote --confirm # Delete from production
 */

const DB_NAME = "difflog-db";

interface StaleProfile {
  id: string;
  name: string;
  updated_at: string;
  content_updated_at: string | null;
  created_at: string;
  diff_count: number;
  star_count: number;
}

function parseArgs(): { days: number; remote: boolean; confirm: boolean } {
  const args = process.argv.slice(2);
  let days = 180;
  let remote = false;
  let confirm = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--days" && args[i + 1]) {
      days = parseInt(args[i + 1], 10);
      if (isNaN(days) || days < 1) {
        console.error("Error: --days must be a positive integer");
        process.exit(1);
      }
      i++;
    } else if (arg === "--remote") {
      remote = true;
    } else if (arg === "--confirm") {
      confirm = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { days, remote, confirm };
}

function printUsage(): void {
  console.log(`
Profile Cleanup Command

Lists and optionally deletes stale profiles from the D1 database.

Usage:
  bun run cleanup [options]

Options:
  --days <n>     Profiles older than n days are considered stale (default: 180)
  --remote       Query production database instead of local
  --confirm      Actually delete profiles (dry-run by default)
  --help, -h     Show this help message

Examples:
  bun run cleanup --days 180                    # List profiles inactive 6+ months (local)
  bun run cleanup --days 180 --remote           # List from production
  bun run cleanup --days 180 --remote --confirm # Delete from production
`);
}

async function runQuery(
  sql: string,
  remote: boolean
): Promise<{ results: unknown[] }> {
  const remoteFlag = remote ? "--remote" : "--local";
  const localPersist = remote ? [] : ["--persist-to=.wrangler/state"];

  const proc = Bun.spawn(
    [
      "wrangler",
      "d1",
      "execute",
      DB_NAME,
      remoteFlag,
      ...localPersist,
      "--json",
      "--command",
      sql,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    console.error("Wrangler error:", stderr);
    process.exit(1);
  }

  try {
    const parsed = JSON.parse(stdout);
    // wrangler d1 execute --json returns an array with result objects
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { results: parsed[0].results || [] };
    }
    return { results: [] };
  } catch {
    console.error("Failed to parse wrangler output:", stdout);
    process.exit(1);
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function daysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

async function listStaleProfiles(
  days: number,
  remote: boolean
): Promise<StaleProfile[]> {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.updated_at,
      p.content_updated_at,
      p.created_at,
      (SELECT COUNT(*) FROM diffs WHERE profile_id = p.id) as diff_count,
      (SELECT COUNT(*) FROM stars WHERE profile_id = p.id) as star_count
    FROM profiles p
    WHERE p.updated_at < datetime('now', '-${days} days')
    ORDER BY p.updated_at ASC;
  `;

  const result = await runQuery(sql, remote);
  return result.results as StaleProfile[];
}

async function deleteProfile(id: string, remote: boolean): Promise<void> {
  // Escape single quotes in ID
  const escapedId = id.replace(/'/g, "''");
  const sql = `DELETE FROM profiles WHERE id = '${escapedId}';`;
  await runQuery(sql, remote);
}

async function main(): Promise<void> {
  const { days, remote, confirm } = parseArgs();

  const location = remote ? "production" : "local";
  console.log(`\nSearching for profiles inactive for ${days}+ days (${location} database)...\n`);

  const profiles = await listStaleProfiles(days, remote);

  if (profiles.length === 0) {
    console.log("No stale profiles found.\n");
    return;
  }

  console.log(`Found ${profiles.length} stale profile(s):\n`);
  console.log("─".repeat(80));

  for (const profile of profiles) {
    const age = daysSince(profile.updated_at);
    console.log(`ID:           ${profile.id}`);
    console.log(`Name:         ${profile.name}`);
    console.log(`Last updated: ${formatDate(profile.updated_at)} (${age} days ago)`);
    console.log(`Content sync: ${formatDate(profile.content_updated_at)}`);
    console.log(`Created:      ${formatDate(profile.created_at)}`);
    console.log(`Diffs:        ${profile.diff_count}`);
    console.log(`Stars:        ${profile.star_count}`);
    console.log("─".repeat(80));
  }

  const totalDiffs = profiles.reduce((sum, p) => sum + p.diff_count, 0);
  const totalStars = profiles.reduce((sum, p) => sum + p.star_count, 0);

  console.log(`\nSummary: ${profiles.length} profiles, ${totalDiffs} diffs, ${totalStars} stars`);

  if (!confirm) {
    console.log("\nDry run - no changes made.");
    console.log(`To delete these profiles, run with --confirm flag.\n`);
    return;
  }

  console.log("\nDeleting profiles...\n");

  for (const profile of profiles) {
    process.stdout.write(`Deleting ${profile.name} (${profile.id})... `);
    await deleteProfile(profile.id, remote);
    console.log("done");
  }

  console.log(`\nDeleted ${profiles.length} profiles (with ${totalDiffs} diffs and ${totalStars} stars).\n`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
