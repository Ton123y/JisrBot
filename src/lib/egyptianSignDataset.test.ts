import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EGYPTIAN_SIGN_DATASET,
  EGYPTIAN_SIGN_DATASET_COUNT,
  EGYPTIAN_SIGN_DATASET_PROMPT,
  findEgyptianSignEntry,
} from './egyptianSignDataset.ts';
import { isValidSignId } from './signLanguage.ts';

test('EGYPTIAN_SIGN_DATASET contains all 56 Mendeley Egyptian Sign Language classes with valid mapped SignIds', () => {
  assert.equal(EGYPTIAN_SIGN_DATASET_COUNT, 56);
  assert.equal(EGYPTIAN_SIGN_DATASET.length, 56);
  for (const entry of EGYPTIAN_SIGN_DATASET) {
    assert.ok(entry.slug.length > 0);
    assert.ok(entry.arabicWord.length > 1, `Expected whole Arabic word for ${entry.slug}`);
    assert.equal(isValidSignId(entry.mappedSignId), true, `Invalid SignId ${entry.mappedSignId}`);
  }
});

test('findEgyptianSignEntry resolves both Franco-Arabic dataset slugs and Egyptian Arabic words', () => {
  const howAreYou = findEgyptianSignEntry('3amel eh');
  assert.ok(howAreYou);
  assert.equal(howAreYou.arabicWord, 'عامل إيه');
  assert.equal(howAreYou.twoHanded, true);

  const fine = findEgyptianSignEntry('تمام');
  assert.ok(fine);
  assert.equal(fine.slug, 'tmam');
  assert.equal(fine.twoHanded, false);
  assert.equal(fine.bodyAnchor, 'mouth_chin');

  assert.ok(EGYPTIAN_SIGN_DATASET_PROMPT.includes('صباح الخير'));
  assert.ok(EGYPTIAN_SIGN_DATASET_PROMPT.includes('كتاب'));
});
