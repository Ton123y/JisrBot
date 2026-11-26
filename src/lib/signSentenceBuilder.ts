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
 * into natural, clear Egyptian Arabic sentences immediately while typing/signing.
 * Returns null if the sequence is empty or needs AI refinement.
 */
export function suggestLocalArabicSentence(rawText: string): string | null {
  const clean = rawText.replace(/\s+/g, ' ').trim();
  if (!clean) return null;

  const words = clean.split(' ').filter(Boolean);
  if (words.length === 0) return null;

  if (words.length >= 6 && /[.!؟]$/.test(clean)) {
    return null;
  }

  const hasAny = (targets: string[]) =>
    words.some((w) => targets.some((t) => w === t || w.includes(t)));

  const hasGreeting = hasAny(['مرحباً', 'مرحبا', 'أهلاً', 'اهلا', 'سلام']);
  const hasThanks = hasAny(['شكراً', 'شكرا']);
  const hasYes = hasAny(['نعم', 'موافق', 'تم', 'ممتاز', 'أيوه', 'تمام']);
  const hasNo = hasAny(['لا', 'لأ', 'توقف', 'خطأ', 'اطفي']);
  const hasHelp = hasAny(['مساعدة', 'ساعدني', 'أحتاج', 'محتاج']);
  const hasQuestion = hasAny(['سؤال', 'كيف', 'ازيك', 'أين', 'فين', 'ما', 'إيه', 'هل']);
  const hasLove = hasAny(['أحبك', 'بحبك', 'تقدير']);
  const hasCall = hasAny(['اتصل', 'هاتف', 'تواصل', 'كلمني']);
  const hasLight = hasAny(['مصباح', 'نور', 'ضوء', 'إضاءة']);
  const hasRobot = hasAny(['روبوت', 'ذراع', 'يد', 'موتور', 'محرك']);

  // Specific robot command phrases in Egyptian Arabic
  if (hasLight && hasNo) {
    return 'لو سمحت اطفي نور الروبوت دلوقتي.';
  }
  if (hasLight && (hasYes || hasHelp || words.length <= 3)) {
    return 'لو سمحت شغّل نور الروبوت.';
  }
  if (hasRobot && hasAny(['توقف', 'إيقاف', 'وقّف', 'وقف'])) {
    return 'وقّف حركة الروبوت دلوقتي لو سمحت.';
  }
  if (hasRobot && hasQuestion) {
    return 'إيه أخبار الروبوت دلوقتي وهل شغال تمام؟';
  }
  if (hasRobot && hasYes) {
    return 'تمام، شغّل الروبوت ونفّذ الحركة المطلوبة.';
  }

  // Conversational phrases in Egyptian Arabic
  if (hasGreeting && hasHelp) {
    return 'أهلاً، محتاج مساعدة لو سمحت.';
  }
  if (hasGreeting && hasQuestion) {
    return 'أهلاً، عندي سؤال عايز أسألهولك.';
  }
  if (hasGreeting && hasThanks) {
    return 'أهلاً بيك، شكراً جداً على مساعدتك.';
  }
  if (hasGreeting && hasLove) {
    return 'أهلاً بيك، ربنا يسعد يومك، كل الشكر والتقدير.';
  }
  if (hasGreeting && hasYes) {
    return 'أهلاً، أيوه أنا جاهز نبدأ دلوقتي.';
  }
  if (hasGreeting && words.length === 1) {
    return 'أهلاً بيك، تقدر تساعدني إزاي النهارده؟';
  }
  if (hasHelp && hasQuestion) {
    return 'ممكن تساعدني وتجاوبني على سؤالي؟';
  }
  if (hasHelp && words.length <= 2) {
    return 'محتاج مساعدة لو سمحت.';
  }
  if (hasQuestion && words.length <= 2) {
    return 'عندي سؤال مهم، ممكن تجاوبني عليه؟';
  }
  if (hasCall) {
    return hasGreeting
      ? 'أهلاً، عايز أتواصل معاك دلوقتي.'
      : 'عايز أتصل وأتواصل معاك لو سمحت.';
  }
  if (hasThanks && hasYes) {
    return 'شكراً جداً، ده ممتاز خالص.';
  }
  if (hasThanks && words.length === 1) {
    return 'شكراً ليك جداً.';
  }
  if (hasLove && words.length <= 2) {
    return 'شكراً ليك وبقدّرك جداً.';
  }
  if (hasAny(['توقف', 'وقّف']) && words.length === 1) {
    return 'استنى لحظة لو سمحت.';
  }

  // Fallback tidy punctuation for 2+ raw words
  if (words.length >= 2) {
    const joined = words.join(' ');
    return /[.!؟]$/.test(joined) ? joined : `${joined}.`;
  }

  return null;
}

/**
 * Normalizes a sentence segment by ensuring clean spacing and ending punctuation.
 */
export function normalizeSentenceSegment(segment: string): string {
  const clean = segment.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return /[.!؟]$/.test(clean) ? clean : `${clean}.`;
}

/**
 * Appends a newly formed sentence into an array of accumulated sentences,
 * preserving all previously gathered sentences without losing anything the user signed.
 */
export function appendAccumulatedSentence(
  existingSentences: string[],
  newSegment: string
): string[] {
  const normalized = normalizeSentenceSegment(newSegment);
  if (!normalized) return existingSentences;
  return [...existingSentences, normalized];
}

/**
 * Combines all accumulated sentences + any active unsaved draft into one coherent multi-sentence message.
 */
export function combineAccumulatedSignMessage(
  accumulatedSentences: string[],
  activeDraft: string
): string {
  const parts = accumulatedSentences
    .map((s) => s.trim())
    .filter(Boolean);
  const draft = activeDraft.replace(/\s+/g, ' ').trim();
  if (draft) {
    parts.push(draft);
  }
  return parts.join(' ').trim();
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
    label: 'أهلاً بيك',
    word: 'مرحباً',
    sentence: 'أهلاً بيك، عامل إيه النهارده؟',
    signId: 'HELLO',
  },
  {
    id: 'need_help',
    label: 'محتاج مساعدة',
    word: 'مساعدة',
    sentence: 'محتاج مساعدة لو سمحت.',
    signId: 'HELP',
  },
  {
    id: 'have_question',
    label: 'عندي سؤال',
    word: 'سؤال',
    sentence: 'عندي سؤال عايز أسألهولك.',
    signId: 'QUESTION',
  },
  {
    id: 'turn_on_light',
    label: 'شغّل نور الروبوت',
    word: 'نور',
    sentence: 'شغّل نور الروبوت لو سمحت.',
    signId: 'LIGHT',
  },
  {
    id: 'stop_robot',
    label: 'وقّف الروبوت',
    word: 'توقف',
    sentence: 'وقّف حركة الروبوت دلوقتي.',
    signId: 'STOP',
  },
  {
    id: 'thanks',
    label: 'شكراً ليك',
    word: 'شكراً',
    sentence: 'شكراً ليك جداً.',
    signId: 'THANK_YOU',
  },
];
