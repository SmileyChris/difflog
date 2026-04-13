import { expect, test, describe, mock } from "bun:test";
import { computeContentHash, encryptData, uint8ToBase64 } from "./crypto";

// Mock the api module so downloadContent doesn't make real HTTP requests
let mockPostJsonResponse: any = {};
mock.module("./api", () => ({
  postJson: async () => mockPostJsonResponse,
  fetchJson: async () => ({}),
  ApiError: class extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }
}));

// Import sync AFTER mocking api
const { starId, downloadContent, createEmptyPending, trackChange, upgradePendingChanges, hasPendingChanges } = await import("./sync");
type Star = import("./sync").Star;
type Diff = import("./sync").Diff;
type Profile = import("./sync").Profile;
type PendingChanges = import("./sync").PendingChanges;

describe("sync.ts", () => {
  describe("starId", () => {
    test("generates consistent ID from Star object", () => {
      const star = { diff_id: "aaa", p_index: 1, added_at: "2023-01-01" };
      expect(starId(star)).toBe("aaa:1");
    });

    test("generates consistent ID from valid components", () => {
      expect(starId("aaa", 1)).toBe("aaa:1");
    });
  });

  describe("computeContentHash", () => {
    test("hashing stars works if mapped to include id", async () => {
      const stars: Star[] = [
        { diff_id: "diff1", p_index: 1, added_at: "2023-01-01" },
        { diff_id: "diff1", p_index: 5, added_at: "2023-01-02" },
        { diff_id: "diff2", p_index: 0, added_at: "2023-01-03" }
      ];

      // This is the implementation pattern we are verifying
      const starsWithIds = stars.map(s => ({ ...s, id: starId(s) }));

      const hash = await computeContentHash(starsWithIds);
      expect(hash).toBeString();
      expect(hash.length).toBeGreaterThan(0);

      // Verify determinism
      const hash2 = await computeContentHash(starsWithIds);
      expect(hash2).toBe(hash);
    });

    test("hashing sorts items by id", async () => {
      const items1 = [
        { id: "a", val: 1 },
        { id: "b", val: 2 }
      ];
      const items2 = [
        { id: "b", val: 2 },
        { id: "a", val: 1 }
      ];

      const hash1 = await computeContentHash(items1);
      const hash2 = await computeContentHash(items2);

      expect(hash1).toBe(hash2);
    });
  });

  describe("downloadContent", () => {
    const password = "test-password";
    const serverSalt = uint8ToBase64(new Uint8Array(16).fill(42));
    const passwordSalt = "test-password-salt";

    function makeProfile(overrides?: Partial<Profile>): Profile {
      return {
        id: "profile-1",
        name: "Test",
        salt: serverSalt,
        passwordSalt,
        depth: "standard" as const,
        customFocus: "",
        ...overrides,
      };
    }

    test("returns the server salt in result", async () => {
      const diff: Diff = { id: "d1", content: "# News", generated_at: "2025-01-01" };
      const encrypted = await encryptData(diff, password, serverSalt);

      mockPostJsonResponse = {
        salt: serverSalt,
        diffs: [{ id: "d1", encrypted_data: encrypted }],
        stars: [],
      };

      const result = await downloadContent(
        "profile-1",
        makeProfile(),
        [],
        [],
        [],
        createEmptyPending(),
        password
      );

      expect(result.salt).toBe(serverSalt);
      expect(result.downloaded).toBe(1);
      expect(result.decryptionErrors).toBe(0);
      expect(result.diffs[0].content).toBe("# News");
    });

    test("returns updated server salt when it differs from local", async () => {
      const localSalt = uint8ToBase64(new Uint8Array(16).fill(1));
      const newServerSalt = uint8ToBase64(new Uint8Array(16).fill(99));

      // Diff on server was encrypted with the new server salt
      const diff: Diff = { id: "d1", content: "After password change", generated_at: "2025-01-01" };
      const encrypted = await encryptData(diff, password, newServerSalt);

      mockPostJsonResponse = {
        salt: newServerSalt,
        diffs: [{ id: "d1", encrypted_data: encrypted }],
        stars: [],
      };

      // Local profile has stale salt
      const result = await downloadContent(
        "profile-1",
        makeProfile({ salt: localSalt }),
        [],
        [],
        [],
        createEmptyPending(),
        password
      );

      // Result should carry the server's salt so caller can update local profile
      expect(result.salt).toBe(newServerSalt);
      expect(result.salt).not.toBe(localSalt);
      expect(result.diffs[0].content).toBe("After password change");
    });

    test("decryption fails when salt mismatches encrypted data", async () => {
      const encryptSalt = uint8ToBase64(new Uint8Array(16).fill(1));
      const wrongSalt = uint8ToBase64(new Uint8Array(16).fill(2));

      // Diff encrypted with one salt, server reports a different salt
      const diff: Diff = { id: "d1", content: "stale", generated_at: "2025-01-01" };
      const encrypted = await encryptData(diff, password, encryptSalt);

      mockPostJsonResponse = {
        salt: wrongSalt, // Server salt changed but diffs weren't re-encrypted
        diffs: [{ id: "d1", encrypted_data: encrypted }],
        stars: [],
      };

      const result = await downloadContent(
        "profile-1",
        makeProfile({ salt: wrongSalt }),
        [],
        [],
        [],
        createEmptyPending(),
        password
      );

      // Diff fails to decrypt — not added to results, error counted
      expect(result.downloaded).toBe(0);
      expect(result.decryptionErrors).toBe(1);
      expect(result.diffs).toHaveLength(0);
    });

    test("handles public diffs without decryption", async () => {
      const diff: Diff = { id: "d1", content: "Public content", generated_at: "2025-01-01" };

      mockPostJsonResponse = {
        salt: serverSalt,
        diffs: [{ id: "d1", encrypted_data: JSON.stringify(diff) }],
        stars: [],
      };

      const result = await downloadContent(
        "profile-1",
        makeProfile(),
        [],
        [],
        [],
        createEmptyPending(),
        password
      );

      expect(result.downloaded).toBe(1);
      expect(result.diffs[0].content).toBe("Public content");
      expect(result.diffs[0].isPublic).toBe(true);
    });

    test("preserves locally pending diffs even when server decryption fails", async () => {
      const encryptSalt = uint8ToBase64(new Uint8Array(16).fill(1));
      const wrongSalt = uint8ToBase64(new Uint8Array(16).fill(2));

      // Server has a diff encrypted with old salt but reports new salt
      const serverDiff: Diff = { id: "d-server", content: "server", generated_at: "2025-01-01" };
      const encrypted = await encryptData(serverDiff, password, encryptSalt);

      // Local diff that's pending upload
      const localDiff: Diff = { id: "d-local", content: "local", generated_at: "2025-01-02" };

      mockPostJsonResponse = {
        salt: wrongSalt,
        diffs: [{ id: "d-server", encrypted_data: encrypted }],
        stars: [],
      };

      const pending = createEmptyPending();
      pending.modifiedDiffs = ["d-local"];

      const result = await downloadContent(
        "profile-1",
        makeProfile({ salt: wrongSalt }),
        [localDiff],
        [],
        [],
        pending,
        password
      );

      // Server diff failed to decrypt — lost
      // Local pending diff is preserved through the filter
      expect(result.diffs).toHaveLength(1);
      expect(result.diffs[0].id).toBe("d-local");
    });
  });

  describe("trackChange", () => {
    test("modified adds to modified list, removes from deleted", () => {
      const pending = createEmptyPending();
      const withDelete = trackChange(pending, "diff", "deleted", "d1");
      expect(withDelete.deletedDiffs).toHaveLength(1);
      expect(withDelete.deletedDiffs[0].id).toBe("d1");
      expect(withDelete.deletedDiffs[0].deletedAt).toBeString();

      const withModify = trackChange(withDelete, "diff", "modified", "d1");
      expect(withModify.deletedDiffs).toHaveLength(0);
      expect(withModify.modifiedDiffs).toEqual(["d1"]);
    });

    test("deleted adds tombstone with timestamp, removes from modified", () => {
      const pending = createEmptyPending();
      const withMod = trackChange(pending, "star", "modified", "s1");
      expect(withMod.modifiedStars).toEqual(["s1"]);

      const withDel = trackChange(withMod, "star", "deleted", "s1");
      expect(withDel.modifiedStars).toHaveLength(0);
      expect(withDel.deletedStars).toHaveLength(1);
      expect(withDel.deletedStars[0].id).toBe("s1");
    });

    test("supports tldr type", () => {
      const pending = createEmptyPending();
      const result = trackChange(pending, "tldr", "modified", "d1:3");
      expect(result.modifiedTldrs).toEqual(["d1:3"]);

      const deleted = trackChange(result, "tldr", "deleted", "d1:3");
      expect(deleted.modifiedTldrs).toHaveLength(0);
      expect(deleted.deletedTldrs[0].id).toBe("d1:3");
    });
  });

  describe("upgradePendingChanges", () => {
    test("upgrades legacy string[] tombstones to PendingDeletion[]", () => {
      const legacy = {
        modifiedDiffs: ["d1"],
        modifiedStars: [],
        deletedDiffs: ["old-diff"] as unknown,
        deletedStars: ["old-star"] as unknown
      } as Partial<PendingChanges>;

      const upgraded = upgradePendingChanges(legacy);
      expect(upgraded.deletedDiffs).toHaveLength(1);
      expect(upgraded.deletedDiffs[0]).toHaveProperty("id", "old-diff");
      expect(upgraded.deletedDiffs[0]).toHaveProperty("deletedAt");
      expect(upgraded.deletedStars[0].id).toBe("old-star");
      expect(upgraded.modifiedTldrs).toEqual([]);
      expect(upgraded.deletedTldrs).toEqual([]);
    });

    test("passes through already-upgraded deletions", () => {
      const existing = createEmptyPending();
      existing.deletedDiffs = [{ id: "d1", deletedAt: "2026-01-01T00:00:00Z" }];
      const upgraded = upgradePendingChanges(existing);
      expect(upgraded.deletedDiffs[0].deletedAt).toBe("2026-01-01T00:00:00Z");
    });
  });

  describe("hasPendingChanges", () => {
    test("returns false for empty pending", () => {
      expect(hasPendingChanges(createEmptyPending())).toBe(false);
    });

    test("returns true when a TLDR is modified", () => {
      const p = createEmptyPending();
      p.modifiedTldrs = ["d1:0"];
      expect(hasPendingChanges(p)).toBe(true);
    });

    test("returns true when a TLDR is deleted", () => {
      const p = createEmptyPending();
      p.deletedTldrs = [{ id: "d1:0", deletedAt: "2026-01-01T00:00:00Z" }];
      expect(hasPendingChanges(p)).toBe(true);
    });
  });
});
