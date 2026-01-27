import { describe, test, expect } from 'bun:test';
import { computeContentHash } from './crypto';
import { trackChange, createEmptyPending, type PendingChanges } from './sync';

describe('computeContentHash', () => {
  test('produces same hash for same content', async () => {
    const items = [
      { id: 'a', content: 'hello', timestamp: '2024-01-01' },
      { id: 'b', content: 'world', timestamp: '2024-01-02' },
    ];

    const hash1 = await computeContentHash(items);
    const hash2 = await computeContentHash(items);

    expect(hash1).toBe(hash2);
  });

  test('produces same hash regardless of item order', async () => {
    const items1 = [
      { id: 'a', content: 'hello' },
      { id: 'b', content: 'world' },
    ];
    const items2 = [
      { id: 'b', content: 'world' },
      { id: 'a', content: 'hello' },
    ];

    const hash1 = await computeContentHash(items1);
    const hash2 = await computeContentHash(items2);

    expect(hash1).toBe(hash2);
  });

  test('produces same hash regardless of key order in objects', async () => {
    const items1 = [{ id: 'a', content: 'hello', extra: 'data' }];
    const items2 = [{ extra: 'data', content: 'hello', id: 'a' }];

    const hash1 = await computeContentHash(items1);
    const hash2 = await computeContentHash(items2);

    expect(hash1).toBe(hash2);
  });

  test('produces different hash for different content', async () => {
    const items1 = [{ id: 'a', content: 'hello' }];
    const items2 = [{ id: 'a', content: 'world' }];

    const hash1 = await computeContentHash(items1);
    const hash2 = await computeContentHash(items2);

    expect(hash1).not.toBe(hash2);
  });

  test('produces different hash for different IDs', async () => {
    const items1 = [{ id: 'a', content: 'hello' }];
    const items2 = [{ id: 'b', content: 'hello' }];

    const hash1 = await computeContentHash(items1);
    const hash2 = await computeContentHash(items2);

    expect(hash1).not.toBe(hash2);
  });

  test('handles empty array', async () => {
    const hash = await computeContentHash([]);
    expect(hash).toBeTruthy();
  });
});

describe('trackChange', () => {
  test('adds diff to modifiedDiffs', () => {
    const pending = createEmptyPending();
    const result = trackChange(pending, 'diff', 'modified', 'diff-1');

    expect(result.modifiedDiffs).toContain('diff-1');
    expect(result.deletedDiffs).not.toContain('diff-1');
  });

  test('adds star to modifiedStars', () => {
    const pending = createEmptyPending();
    const result = trackChange(pending, 'star', 'modified', 'star-1');

    expect(result.modifiedStars).toContain('star-1');
    expect(result.deletedStars).not.toContain('star-1');
  });

  test('moves diff from modified to deleted on delete', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'diff', 'modified', 'diff-1');
    pending = trackChange(pending, 'diff', 'deleted', 'diff-1');

    expect(pending.modifiedDiffs).not.toContain('diff-1');
    expect(pending.deletedDiffs).toContain('diff-1');
  });

  test('moves star from modified to deleted on delete', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'star', 'modified', 'star-1');
    pending = trackChange(pending, 'star', 'deleted', 'star-1');

    expect(pending.modifiedStars).not.toContain('star-1');
    expect(pending.deletedStars).toContain('star-1');
  });

  test('removes diff from deleted when re-added (modified)', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'diff', 'deleted', 'diff-1');
    expect(pending.deletedDiffs).toContain('diff-1');

    pending = trackChange(pending, 'diff', 'modified', 'diff-1');

    expect(pending.deletedDiffs).not.toContain('diff-1');
    expect(pending.modifiedDiffs).toContain('diff-1');
  });

  test('removes star from deleted when re-added (modified)', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'star', 'deleted', 'star-1');
    expect(pending.deletedStars).toContain('star-1');

    pending = trackChange(pending, 'star', 'modified', 'star-1');

    expect(pending.deletedStars).not.toContain('star-1');
    expect(pending.modifiedStars).toContain('star-1');
  });

  test('does not duplicate IDs when modified multiple times', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'diff', 'modified', 'diff-1');
    pending = trackChange(pending, 'diff', 'modified', 'diff-1');
    pending = trackChange(pending, 'diff', 'modified', 'diff-1');

    expect(pending.modifiedDiffs.filter(id => id === 'diff-1')).toHaveLength(1);
  });

  test('does not duplicate IDs when deleted multiple times', () => {
    let pending = createEmptyPending();
    pending = trackChange(pending, 'diff', 'deleted', 'diff-1');
    pending = trackChange(pending, 'diff', 'deleted', 'diff-1');

    expect(pending.deletedDiffs.filter(id => id === 'diff-1')).toHaveLength(1);
  });
});

describe('pending sync clearing logic', () => {
  test('filters out uploaded items while preserving new ones', () => {
    // Simulates the logic in store.ts uploadContent()
    const uploadedPending: PendingChanges = {
      modifiedDiffs: ['diff-1', 'diff-2'],
      modifiedStars: ['star-1'],
      deletedDiffs: ['diff-old'],
      deletedStars: [],
      profileModified: true,
    };

    // Changes made during sync
    const currentPending: PendingChanges = {
      modifiedDiffs: ['diff-1', 'diff-2', 'diff-3'], // diff-3 added during sync
      modifiedStars: ['star-1', 'star-2'], // star-2 added during sync
      deletedDiffs: ['diff-old'],
      deletedStars: ['star-old'], // star-old deleted during sync
      profileModified: true,
    };

    // Apply the clearing logic from store.ts
    const result: PendingChanges = {
      modifiedDiffs: currentPending.modifiedDiffs.filter(id => !uploadedPending.modifiedDiffs.includes(id)),
      modifiedStars: currentPending.modifiedStars.filter(id => !uploadedPending.modifiedStars.includes(id)),
      deletedDiffs: currentPending.deletedDiffs.filter(id => !uploadedPending.deletedDiffs.includes(id)),
      deletedStars: currentPending.deletedStars.filter(id => !uploadedPending.deletedStars.includes(id)),
      profileModified: currentPending.profileModified && !uploadedPending.profileModified,
    };

    // Items added during sync should be preserved
    expect(result.modifiedDiffs).toEqual(['diff-3']);
    expect(result.modifiedStars).toEqual(['star-2']);
    expect(result.deletedStars).toEqual(['star-old']);

    // Items that were uploaded should be cleared
    expect(result.deletedDiffs).toEqual([]);
    expect(result.profileModified).toBe(false);
  });

  test('preserves all changes if nothing was uploaded', () => {
    const uploadedPending = createEmptyPending();

    const currentPending: PendingChanges = {
      modifiedDiffs: ['diff-1'],
      modifiedStars: ['star-1'],
      deletedDiffs: ['diff-2'],
      deletedStars: ['star-2'],
      profileModified: true,
    };

    const result: PendingChanges = {
      modifiedDiffs: currentPending.modifiedDiffs.filter(id => !uploadedPending.modifiedDiffs.includes(id)),
      modifiedStars: currentPending.modifiedStars.filter(id => !uploadedPending.modifiedStars.includes(id)),
      deletedDiffs: currentPending.deletedDiffs.filter(id => !uploadedPending.deletedDiffs.includes(id)),
      deletedStars: currentPending.deletedStars.filter(id => !uploadedPending.deletedStars.includes(id)),
      profileModified: currentPending.profileModified && !uploadedPending.profileModified,
    };

    expect(result).toEqual(currentPending);
  });
});
