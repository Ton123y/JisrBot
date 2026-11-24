import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGN_LEXICON,
  interpolateHandPose,
  normalizeSignSequence,
  textToSignSequence,
  translateSentenceToSignSteps,
} from './signLanguage';

test('normalizeSignSequence filters invalid tokens and deduplicates adjacent duplicates', () => {
  const result = normalizeSignSequence(['hello', 'HELLO', 'INVALID_SIGN', 'thank_you', 'yes']);
  assert.deepEqual(result, ['HELLO', 'THANK_YOU', 'YES']);
});

test('normalizeSignSequence falls back to OPEN_HAND when empty', () => {
  assert.deepEqual(normalizeSignSequence([]), ['OPEN_HAND']);
  assert.deepEqual(normalizeSignSequence(null), ['HELLO']);
});

test('textToSignSequence maps Arabic and English intents to ordered signs', () => {
  const arSeq = textToSignSequence('مرحبا شكراً لك نعم');
  assert.equal(arSeq.includes('HELLO'), true);
  assert.equal(arSeq.includes('THANK_YOU'), true);
  assert.equal(arSeq.includes('YES'), true);

  const enSeq = textToSignSequence('stop and help');
  assert.deepEqual(enSeq, ['STOP', 'HELP']);
});

test('translateSentenceToSignSteps translates every single word in an AI reply without dropping trailing words', () => {
  const reply = 'مرحباً بك، تم تشغيل المصباح ورفع الذراع بنجاح!';
  const steps = translateSentenceToSignSteps(reply);
  const coveredWords = new Set(steps.map((s) => s.sourceWord));

  assert.equal(coveredWords.has('مرحباً'), true);
  assert.equal(coveredWords.has('تم'), true);
  assert.equal(coveredWords.has('تشغيل'), true);
  assert.equal(coveredWords.has('المصباح'), true);
  assert.equal(coveredWords.has('ورفع'), true);
  assert.equal(coveredWords.has('الذراع'), true);
  assert.equal(coveredWords.has('بنجاح'), true);
  assert.equal(steps.some((s) => s.signId === 'HELLO'), true);
  assert.equal(steps.some((s) => s.signId === 'LIGHT'), true);
  assert.equal(steps.some((s) => s.signId === 'RAISE_HAND'), true);
});

test('interpolateHandPose clamps alpha and interpolates finger joints linearly', () => {
  const from = SIGN_LEXICON.OPEN_HAND.pose;
  const to = SIGN_LEXICON.FIST.pose;
  const mid = interpolateHandPose(from, to, 0.5);
  assert.equal(mid.index[0], (from.index[0] + to.index[0]) / 2);
  const clamped = interpolateHandPose(from, to, 2.0);
  assert.equal(clamped.index[0], to.index[0]);
});
