import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('suggestLocalArabicSentence converts raw sign tokens into clear Arabic sentences', () => {
  assert.equal(
    suggestLocalArabicSentence('مرحباً مساعدة'),
    'مرحباً، أحتاج إلى مساعدة من فضلك.'
  );
  assert.equal(
    suggestLocalArabicSentence('مرحباً سؤال'),
    'مرحباً، لدي سؤال أريد أن أسأله لك.'
  );
  assert.equal(
    suggestLocalArabicSentence('توقف روبوت'),
    'أوقف حركة الروبوت الآن من فضلك.'
  );
});
