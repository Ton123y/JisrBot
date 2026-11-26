import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAccumulatedSentence,
  combineAccumulatedSignMessage,
  suggestLocalArabicSentence,
  tokensToComposedText,
  type CapturedSignToken,
} from './signSentenceBuilder.ts';

test('tokensToComposedText joins consecutive letters into a word and separates sign words', () => {
  const tokens: CapturedSignToken[] = [
    { id: '1', word: 'مرحباً', isLetter: false },
    { id: '2', word: 'أ', isLetter: true },
    { id: '3', word: 'ن', isLetter: true },
    { id: '4', word: 'ا', isLetter: true },
    { id: '5', word: ' ', isLetter: false },
    { id: '6', word: 'س', isLetter: true },
    { id: '7', word: 'ع', isLetter: true },
    { id: '8', word: 'ي', isLetter: true },
    { id: '9', word: 'د', isLetter: true },
    { id: '10', word: 'شكراً', isLetter: false },
  ];
  assert.equal(tokensToComposedText(tokens), 'مرحباً أنا سعيد شكراً');
});

test('suggestLocalArabicSentence converts raw sign tokens into clear Egyptian Arabic sentences', () => {
  assert.equal(
    suggestLocalArabicSentence('مرحباً مساعدة'),
    'أهلاً، محتاج مساعدة لو سمحت.'
  );
  assert.equal(
    suggestLocalArabicSentence('مرحباً سؤال'),
    'أهلاً، عندي سؤال عايز أسألهولك.'
  );
  assert.equal(
    suggestLocalArabicSentence('توقف روبوت'),
    'وقّف حركة الروبوت دلوقتي لو سمحت.'
  );
});

test('appendAccumulatedSentence and combineAccumulatedSignMessage keep all signed sentences together', () => {
  let acc: string[] = [];
  acc = appendAccumulatedSentence(acc, 'أهلاً، محتاج مساعدة');
  acc = appendAccumulatedSentence(acc, 'لو سمحت شغّل نور الروبوت.');
  assert.deepEqual(acc, ['أهلاً، محتاج مساعدة.', 'لو سمحت شغّل نور الروبوت.']);
  assert.equal(
    combineAccumulatedSignMessage(acc, 'وشكراً جداً'),
    'أهلاً، محتاج مساعدة. لو سمحت شغّل نور الروبوت. وشكراً جداً'
  );
});
