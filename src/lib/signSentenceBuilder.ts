import type { SignId } from './signLanguage';

export interface CapturedSignToken {
  id: string;
  word: string;
  isLetter: boolean;
  signId?: SignId | null;
  confidence?: number;
}

/**
 * Joins an ordered list of captured sign tokens into editable text:
 * - Consecutive single-character fingerspelling letters are joined into one word (e.g. م + ر + ح + ب + ا => مرحبا).
 * - Multi-character words / gesture tokens are separated by spaces.
 * - Explicit space tokens (`word === ' '`) separate letter groups cleanly.
 */
export function tokensToComposedText(tokens: CapturedSignToken[]): string {
  let out = '';
  let lastWasLetter = false;

  for (const token of tokens) {
    if (token.word === ' ') {
      if (out && !out.endsWith(' ')) {
        out += ' ';
      }
      lastWasLetter = false;
      continue;
    }

    const clean = token.word.trim();
    if (!clean) continue;

    const isSingleLetter = token.isLetter && clean.length === 1;
    if (isSingleLetter && lastWasLetter) {
      out += clean;
    } else {
      const trimmed = out.trimEnd();
      out = trimmed ? `${trimmed} ${clean}` : clean;
    }
    lastWasLetter = isSingleLetter;
  }

  return out;
}

/**
 * Local fast heuristic that turns common isolated sign-language word sequences
 * into natural, readable Arabic sentences immediately while typing/signing.
 * Returns null if the sequence is already a full sentence or needs AI refinement.
 */
export function suggestLocalArabicSentence(rawText: string): string | null {
  const clean = rawText.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return null;

  // Already looks like a rich structured sentence (>= 5 words or ends with punctuation)
  if (words.length >= 6 && /[.!؟]$/.test(clean)) {
    return null;
  }

  const hasAny = (targets: string[]) =>
    words.some((w) => targets.some((t) => w === t || w.includes(t)));

  const hasGreeting = hasAny(['مرحباً', 'مرحبا', 'أهلاً', 'اهلا', 'سلام']);
  const hasThanks = hasAny(['شكراً', 'شكرا']);
  const hasYes = hasAny(['نعم', 'موافق', 'تم', 'ممتاز']);
  const hasNo = hasAny(['لا', 'توقف', 'خطأ']);
  const hasHelp = hasAny(['مساعدة', 'ساعدني', 'أحتاج']);
  const hasQuestion = hasAny(['سؤال', 'كيف', 'أين', 'ما', 'هل']);
  const hasLove = hasAny(['أحبك', 'تقدير']);
  const hasCall = hasAny(['اتصل', 'هاتف', 'تواصل']);
  const hasLight = hasAny(['مصباح', 'نور', 'ضوء', 'إضاءة']);
  const hasRobot = hasAny(['روبوت', 'ذراع', 'يد', 'موتور', 'محرك']);

  // Specific robot command phrases
  if (hasLight && hasNo) {
    return 'من فضلك أطفئ المصباح الآن.';
  }
  if (hasLight && (hasYes || hasHelp || words.length <= 3)) {
    return 'من فضلك شغّل مصباح الروبوت.';
  }
  if (hasRobot && hasAny(['توقف', 'إيقاف'])) {
    return 'أوقف حركة الروبوت الآن من فضلك.';
  }
  if (hasRobot && hasQuestion) {
    return 'كيف حال الروبوت الآن وهل يعمل بشكل سليم؟';
  }
  if (hasRobot && hasYes) {
    return 'نعم، شغّل الروبوت ونفّذ الحركة المطلوبة.';
  }

  // Conversational phrases
  if (hasGreeting && hasHelp) {
    return 'مرحباً، أحتاج إلى مساعدة من فضلك.';
  }
  if (hasGreeting && hasQuestion) {
    return 'مرحباً، لدي سؤال أريد أن أسأله لك.';
  }
  if (hasGreeting && hasThanks) {
    return 'مرحباً، شكراً جزيلاً لك على مساعدتك.';
  }
  if (hasGreeting && hasLove) {
    return 'مرحباً، أتمنى لك يوماً سعيداً وكل التقدير.';
  }
  if (hasGreeting && hasYes) {
    return 'مرحباً، نعم أنا مستعد للبدء الآن.';
  }
  if (hasGreeting && words.length === 1) {
    return 'مرحباً، كيف يمكنك مساعدتي اليوم؟';
  }
  if (hasHelp && hasQuestion) {
    return 'هل يمكنك مساعدتي والإجابة عن سؤالي؟';
  }
  if (hasHelp && words.length <= 2) {
    return 'أحتاج إلى مساعدة من فضلك.';
  }
  if (hasQuestion && words.length <= 2) {
    return 'لدي سؤال مهم، هل يمكنك الإجابة عليه؟';
  }
  if (hasCall) {
    return hasGreeting
      ? 'مرحباً، أريد التواصل معك الآن.'
      : 'أريد الاتصال والتواصل معك من فضلك.';
  }
  if (hasThanks && hasYes) {
    return 'شكراً جزيلاً، هذا ممتاز جداً.';
  }
  if (hasThanks && words.length === 1) {
    return 'شكراً جزيلاً لك.';
  }
  if (hasLove && words.length <= 2) {
    return 'أشكرك وأقدرك كثيراً.';
  }
  if (hasAny(['توقف']) && words.length === 1) {
    return 'توقف لحظة من فضلك.';
  }

  // Fallback tidy punctuation for 2+ raw words
  if (words.length >= 2) {
    const joined = words.join(' ');
    return /[.!؟]$/.test(joined) ? joined : `${joined}.`;
  }

  return null;
}

export const QUICK_SENTENCE_SUGGESTIONS: Array<{
  id: string;
  label: string;
  sentence: string;
  word: string;
  signId: SignId;
}> = [
  {
    id: 'greet',
    label: 'مرحباً',
    word: 'مرحباً',
    sentence: 'مرحباً، كيف حالك اليوم؟',
    signId: 'HELLO',
  },
  {
    id: 'need_help',
    label: 'أحتاج مساعدة',
    word: 'مساعدة',
    sentence: 'أحتاج إلى مساعدة من فضلك.',
    signId: 'HELP',
  },
  {
    id: 'have_question',
    label: 'لدي سؤال',
    word: 'سؤال',
    sentence: 'لدي سؤال أريد طرحه عليك.',
    signId: 'QUESTION',
  },
  {
    id: 'turn_on_light',
    label: 'شغّل المصباح',
    word: 'شغّل المصباح',
    sentence: 'شغّل مصباح الروبوت من فضلك.',
    signId: 'LIGHT',
  },
  {
    id: 'stop_robot',
    label: 'أوقف الروبوت',
    word: 'توقف',
    sentence: 'أوقف الروبوت الآن من فضلك.',
    signId: 'STOP',
  },
  {
    id: 'thanks',
    label: 'شكراً لك',
    word: 'شكراً',
    sentence: 'شكراً جزيلاً لك.',
    signId: 'THANK_YOU',
  },
];
