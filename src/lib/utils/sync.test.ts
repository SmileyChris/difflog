import { expect, test, describe } from "bun:test";
import { starId, type Star, type Diff } from "./sync";
import { computeContentHash } from "./crypto";

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
});
