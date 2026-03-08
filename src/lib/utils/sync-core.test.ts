import { expect, test, describe } from 'bun:test';
import { encryptData, decryptData, uint8ToBase64 } from './crypto';
import {
  starId,
  encryptDiffs,
  decryptAndMergeDiffs,
  encryptStars,
  decryptAndMergeStars,
  decryptKeysBlob,
  inferProviderSelections,
  buildProfileMetadata,
  buildSyncPayload,
  sortDiffsNewestFirst,
  buildApiKeysRecord,
  computeKeysHash,
} from './sync-core';
import type { Diff, Star, PendingChanges, ProfileCore } from '../types/sync';

const password = 'test-password';
const salt = uint8ToBase64(new Uint8Array(16).fill(42));

function emptyPending(): PendingChanges {
  return { modifiedDiffs: [], modifiedStars: [], deletedDiffs: [], deletedStars: [] };
}

function makeDiff(overrides: Partial<Diff> = {}): Diff {
  return { id: 'diff-1', content: '# Hello', generated_at: '2026-01-01T00:00:00Z', ...overrides };
}

function makeStar(overrides: Partial<Star> = {}): Star {
  return { diff_id: 'diff-1', p_index: 0, added_at: '2026-01-01T00:00:00Z', ...overrides };
}

describe('sync-core.ts', () => {
  // --- starId ---
  describe('starId', () => {
    test('from Star object', () => {
      expect(starId({ diff_id: 'abc', p_index: 3, added_at: '' })).toBe('abc:3');
    });

    test('from string + number components', () => {
      expect(starId('abc', 3)).toBe('abc:3');
    });
  });

  // --- encryptDiffs ---
  describe('encryptDiffs', () => {
    test('encrypts only modified diffs when modifiedIds provided', async () => {
      const diffs = [makeDiff({ id: 'd1' }), makeDiff({ id: 'd2' })];
      const result = await encryptDiffs(diffs, new Set(['d1']), password, salt);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('d1');
    });

    test('encrypts all diffs when modifiedIds is null', async () => {
      const diffs = [makeDiff({ id: 'd1' }), makeDiff({ id: 'd2' })];
      const result = await encryptDiffs(diffs, null, password, salt);
      expect(result).toHaveLength(2);
    });

    test('public diffs stored as plain JSON with isPublic stripped', async () => {
      const diff = makeDiff({ id: 'd1', isPublic: true });
      const result = await encryptDiffs([diff], null, password, salt);
      expect(result).toHaveLength(1);
      const parsed = JSON.parse(result[0].encrypted_data);
      expect(parsed.content).toBe('# Hello');
      expect(parsed.isPublic).toBeUndefined();
    });

    test('private diffs are encrypted (not plain JSON)', async () => {
      const diff = makeDiff({ id: 'd1' });
      const result = await encryptDiffs([diff], null, password, salt);
      expect(result[0].encrypted_data.startsWith('{')).toBe(false);
    });
  });

  // --- decryptAndMergeDiffs ---
  describe('decryptAndMergeDiffs', () => {
    test('new server diff added to local', async () => {
      const serverDiff = makeDiff({ id: 's1' });
      const encrypted = await encryptData(serverDiff, password, salt);

      const result = await decryptAndMergeDiffs(
        [{ id: 's1', encrypted_data: encrypted }],
        [],
        emptyPending(),
        password,
        salt,
      );
      expect(result.downloaded).toBe(1);
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].id).toBe('s1');
    });

    test('existing diff updated by server (server wins on isPublic)', async () => {
      const localDiff = makeDiff({ id: 'd1', isPublic: false });
      // Server has it as public (plain JSON)
      const serverData = JSON.stringify({ id: 'd1', content: '# Hello', generated_at: '2026-01-01T00:00:00Z' });

      const result = await decryptAndMergeDiffs(
        [{ id: 'd1', encrypted_data: serverData }],
        [localDiff],
        emptyPending(),
        password,
        salt,
      );
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].isPublic).toBe(true);
      expect(result.downloaded).toBe(0); // existing, not new
    });

    test('existing diff NOT updated when locally modified', async () => {
      const localDiff = makeDiff({ id: 'd1', isPublic: true });
      const serverData = JSON.stringify({ id: 'd1', content: 'server', generated_at: '2026-01-01T00:00:00Z' });
      const pending = emptyPending();
      pending.modifiedDiffs = ['d1'];

      const result = await decryptAndMergeDiffs(
        [{ id: 'd1', encrypted_data: serverData }],
        [localDiff],
        pending,
        password,
        salt,
      );
      // Local version preserved — isPublic stays true (not overwritten)
      expect(result.merged[0].isPublic).toBe(true);
    });

    test('new server diff skipped when pending delete', async () => {
      const serverDiff = makeDiff({ id: 's1' });
      const encrypted = await encryptData(serverDiff, password, salt);
      const pending = emptyPending();
      pending.deletedDiffs = ['s1'];

      const result = await decryptAndMergeDiffs(
        [{ id: 's1', encrypted_data: encrypted }],
        [],
        pending,
        password,
        salt,
      );
      expect(result.downloaded).toBe(0);
      expect(result.merged).toHaveLength(0);
    });

    test('local-only diff removed when not on server (server deletion)', async () => {
      const localDiff = makeDiff({ id: 'local-only' });
      const result = await decryptAndMergeDiffs(
        [], // server has nothing
        [localDiff],
        emptyPending(),
        password,
        salt,
      );
      expect(result.merged).toHaveLength(0);
    });

    test('local-only diff preserved when in pendingDeletedDiffs', async () => {
      const localDiff = makeDiff({ id: 'local-only' });
      const pending = emptyPending();
      pending.deletedDiffs = ['local-only'];

      const result = await decryptAndMergeDiffs([], [localDiff], pending, password, salt);
      expect(result.merged).toHaveLength(1);
      expect(result.merged[0].id).toBe('local-only');
    });

    test('local-only diff preserved when in pendingModifiedDiffs', async () => {
      const localDiff = makeDiff({ id: 'local-only' });
      const pending = emptyPending();
      pending.modifiedDiffs = ['local-only'];

      const result = await decryptAndMergeDiffs([], [localDiff], pending, password, salt);
      expect(result.merged).toHaveLength(1);
    });

    test('decryption error counted, diff skipped', async () => {
      const result = await decryptAndMergeDiffs(
        [{ id: 'bad', encrypted_data: 'not-valid-encrypted-data' }],
        [],
        emptyPending(),
        password,
        salt,
      );
      expect(result.errors).toBe(1);
      expect(result.merged).toHaveLength(0);
    });

    test('public diff detection (JSON string starting with {)', async () => {
      const publicData = JSON.stringify({ id: 'pub', content: 'Public', generated_at: '2026-01-01' });
      const result = await decryptAndMergeDiffs(
        [{ id: 'pub', encrypted_data: publicData }],
        [],
        emptyPending(),
        password,
        salt,
      );
      expect(result.merged[0].isPublic).toBe(true);
    });
  });

  // --- encryptStars ---
  describe('encryptStars', () => {
    test('encrypts only modified stars', async () => {
      const stars = [makeStar({ diff_id: 'd1', p_index: 0 }), makeStar({ diff_id: 'd2', p_index: 1 })];
      const result = await encryptStars(stars, new Set(['d1:0']), password, salt);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('d1:0');
    });

    test('encrypts all when modifiedIds is null', async () => {
      const stars = [makeStar({ diff_id: 'd1', p_index: 0 }), makeStar({ diff_id: 'd2', p_index: 1 })];
      const result = await encryptStars(stars, null, password, salt);
      expect(result).toHaveLength(2);
    });
  });

  // --- decryptAndMergeStars ---
  describe('decryptAndMergeStars', () => {
    test('new server star added', async () => {
      const star = makeStar({ diff_id: 's1', p_index: 0 });
      const encrypted = await encryptData(star, password, salt);

      const result = await decryptAndMergeStars(
        [{ id: 's1:0', encrypted_data: encrypted }],
        [],
        emptyPending(),
        password,
        salt,
      );
      expect(result.downloaded).toBe(1);
      expect(result.merged).toHaveLength(1);
    });

    test('existing star skipped (stars are immutable)', async () => {
      const localStar = makeStar({ diff_id: 'd1', p_index: 0 });
      const serverStar = makeStar({ diff_id: 'd1', p_index: 0 });
      const encrypted = await encryptData(serverStar, password, salt);

      const result = await decryptAndMergeStars(
        [{ id: 'd1:0', encrypted_data: encrypted }],
        [localStar],
        emptyPending(),
        password,
        salt,
      );
      expect(result.downloaded).toBe(0);
      expect(result.merged).toHaveLength(1);
    });

    test('pending delete skipped', async () => {
      const star = makeStar({ diff_id: 'd1', p_index: 0 });
      const encrypted = await encryptData(star, password, salt);
      const pending = emptyPending();
      pending.deletedStars = ['d1:0'];

      const result = await decryptAndMergeStars(
        [{ id: 'd1:0', encrypted_data: encrypted }],
        [],
        pending,
        password,
        salt,
      );
      expect(result.downloaded).toBe(0);
    });

    test('server deletion removes local star', async () => {
      const localStar = makeStar({ diff_id: 'd1', p_index: 0 });
      const result = await decryptAndMergeStars([], [localStar], emptyPending(), password, salt);
      expect(result.merged).toHaveLength(0);
    });

    test('pending modified preserved through server deletion', async () => {
      const localStar = makeStar({ diff_id: 'd1', p_index: 0 });
      const pending = emptyPending();
      pending.modifiedStars = ['d1:0'];

      const result = await decryptAndMergeStars([], [localStar], pending, password, salt);
      expect(result.merged).toHaveLength(1);
    });

    test('decryption error counted', async () => {
      const result = await decryptAndMergeStars(
        [{ id: 'bad:0', encrypted_data: 'garbage' }],
        [],
        emptyPending(),
        password,
        salt,
      );
      expect(result.errors).toBe(1);
      expect(result.merged).toHaveLength(0);
    });
  });

  // --- decryptKeysBlob ---
  describe('decryptKeysBlob', () => {
    test('Format 1: EncryptedKeysBlob with apiKeys + providerSelections', async () => {
      const blob = {
        apiKeys: { anthropic: 'sk-ant-123' },
        providerSelections: { search: 'anthropic', curation: 'anthropic', synthesis: 'anthropic' },
      };
      const encrypted = await encryptData(blob, password, salt);
      const result = await decryptKeysBlob(encrypted, password, salt);
      expect(result.apiKeys).toEqual({ anthropic: 'sk-ant-123' });
      expect(result.providerSelections.search).toBe('anthropic');
    });

    test('Format 2: Record<string, string> (legacy)', async () => {
      const keys = { anthropic: 'sk-ant-123', serper: 'sk-ser-456' };
      const encrypted = await encryptData(keys, password, salt);
      const result = await decryptKeysBlob(encrypted, password, salt);
      expect(result.apiKeys).toEqual(keys);
      // Inferred: anthropic sets all three, serper overrides search
      expect(result.providerSelections.search).toBe('serper');
      expect(result.providerSelections.curation).toBe('anthropic');
    });
  });

  // --- inferProviderSelections ---
  describe('inferProviderSelections', () => {
    test('anthropic key → all three steps', () => {
      const result = inferProviderSelections({ anthropic: 'sk-123' });
      expect(result.search).toBe('anthropic');
      expect(result.curation).toBe('anthropic');
      expect(result.synthesis).toBe('anthropic');
    });

    test('deepseek key → curation + synthesis', () => {
      const result = inferProviderSelections({ deepseek: 'sk-123' });
      expect(result.curation).toBe('deepseek');
      expect(result.synthesis).toBe('deepseek');
      expect(result.search).toBeUndefined();
    });

    test('gemini key → curation + synthesis', () => {
      const result = inferProviderSelections({ gemini: 'sk-123' });
      expect(result.curation).toBe('gemini');
      expect(result.synthesis).toBe('gemini');
    });

    test('serper key overrides search to serper', () => {
      const result = inferProviderSelections({ anthropic: 'sk-1', serper: 'sk-2' });
      expect(result.search).toBe('serper');
    });

    test('perplexity key → search set to perplexity', () => {
      const result = inferProviderSelections({ perplexity: 'sk-1' });
      expect(result.search).toBe('perplexity');
    });

    test('empty keys → empty selections', () => {
      const result = inferProviderSelections({});
      expect(result).toEqual({});
    });
  });

  // --- buildProfileMetadata ---
  describe('buildProfileMetadata', () => {
    test('maps ProfileCore fields to upload shape', () => {
      const profile: ProfileCore = {
        id: 'p1',
        name: 'Test Profile',
        languages: ['TypeScript'],
        frameworks: ['SvelteKit'],
        tools: ['Vite'],
        topics: ['AI'],
        depth: 'standard',
        customFocus: 'Frontend',
      };
      const meta = buildProfileMetadata(profile);
      expect(meta.name).toBe('Test Profile');
      expect(meta.languages).toEqual(['TypeScript']);
      expect(meta.depth).toBe('standard');
      expect(meta.custom_focus).toBe('Frontend');
    });

    test('depth coerced to string', () => {
      const profile: ProfileCore = {
        id: 'p1',
        name: 'Test',
        depth: 3 as any,
        customFocus: '',
      };
      const meta = buildProfileMetadata(profile);
      expect(meta.depth).toBe('3');
    });
  });

  // --- buildSyncPayload ---
  describe('buildSyncPayload', () => {
    test('all fields mapped correctly', () => {
      const payload = buildSyncPayload({
        passwordHash: 'hash123',
        diffs: [{ id: 'd1', encrypted_data: 'enc' }],
        deletedDiffIds: ['d2'],
        diffsHash: 'dh',
        starsHash: 'sh',
        stars: [{ id: 's1', encrypted_data: 'enc' }],
        deletedStarIds: ['s2'],
        encryptedApiKey: 'ekey',
        keysHash: 'kh',
      });
      expect(payload.password_hash).toBe('hash123');
      expect(payload.diffs).toHaveLength(1);
      expect(payload.deleted_diff_ids).toEqual(['d2']);
      expect(payload.stars).toHaveLength(1);
      expect(payload.deleted_star_ids).toEqual(['s2']);
      expect(payload.encrypted_api_key).toBe('ekey');
    });

    test('optional fields default', () => {
      const payload = buildSyncPayload({
        passwordHash: 'h',
        diffs: [],
        deletedDiffIds: [],
        diffsHash: '',
        starsHash: '',
      });
      expect(payload.stars).toEqual([]);
      expect(payload.deleted_star_ids).toEqual([]);
    });
  });

  // --- sortDiffsNewestFirst ---
  describe('sortDiffsNewestFirst', () => {
    test('sorts descending by generated_at', () => {
      const diffs = [
        { generated_at: '2026-01-01' },
        { generated_at: '2026-03-01' },
        { generated_at: '2026-02-01' },
      ];
      const sorted = sortDiffsNewestFirst(diffs);
      expect(sorted[0].generated_at).toBe('2026-03-01');
      expect(sorted[2].generated_at).toBe('2026-01-01');
    });

    test('single item', () => {
      const diffs = [{ generated_at: '2026-01-01' }];
      expect(sortDiffsNewestFirst(diffs)).toHaveLength(1);
    });

    test('already sorted', () => {
      const diffs = [{ generated_at: '2026-03-01' }, { generated_at: '2026-01-01' }];
      const sorted = sortDiffsNewestFirst(diffs);
      expect(sorted[0].generated_at).toBe('2026-03-01');
    });
  });

  // --- buildApiKeysRecord ---
  describe('buildApiKeysRecord', () => {
    test('filters empty values', () => {
      const record = buildApiKeysRecord({ anthropic: 'sk-123', serper: '', deepseek: undefined });
      expect(record).toEqual({ anthropic: 'sk-123' });
    });

    test('undefined apiKeys returns empty record', () => {
      expect(buildApiKeysRecord(undefined)).toEqual({});
    });
  });

  // --- computeKeysHash ---
  describe('computeKeysHash', () => {
    test('deterministic', async () => {
      const h1 = await computeKeysHash({ anthropic: 'sk-1' }, { search: 'anthropic' });
      const h2 = await computeKeysHash({ anthropic: 'sk-1' }, { search: 'anthropic' });
      expect(h1).toBe(h2);
    });

    test('order-independent (sorts internally)', async () => {
      const h1 = await computeKeysHash({ anthropic: 'a', serper: 'b' });
      const h2 = await computeKeysHash({ serper: 'b', anthropic: 'a' });
      expect(h1).toBe(h2);
    });

    test('empty inputs', async () => {
      const h = await computeKeysHash(undefined, undefined);
      expect(h).toBeString();
      expect(h.length).toBeGreaterThan(0);
    });
  });
});
