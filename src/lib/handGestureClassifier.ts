import type { SignId } from './signLanguage';

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z?: number;
}

export type SignRecognitionMode = 'auto' | 'letters' | 'gestures';

export interface LocalHandClassification {
  handDetected: boolean;
  isLetter: boolean;
  detectedSignId: SignId;
  confidence: number;
  recognizedWordAr: string;
  arabicMeaning: string;
  englishMeaning: string;
  explanationAr: string;
}

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [5, 9], [9, 13], [13, 17],            // Palm arch
];

function dist2D(a: HandLandmarkPoint, b: HandLandmarkPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export interface HandGeometricFeatures {
  palmScale: number;
  thumbExtended: boolean;
  thumbUp: boolean;
  thumbDown: boolean;
  indexExtended: boolean;
  indexHooked: boolean;
  middleExtended: boolean;
  ringExtended: boolean;
  pinkyExtended: boolean;
  pinchThumbIndex: number;
  indexMiddleGap: number;
  spreadAvg: number;
  fingersTogether: boolean;
}

export function extractHandFeatures(lm: HandLandmarkPoint[]): HandGeometricFeatures | null {
  if (!lm || lm.length < 21) return null;

  const wrist = lm[0];
  const palmScale = Math.max(0.03, dist2D(wrist, lm[9]));

  const isFingerExtended = (mcpIdx: number, pipIdx: number, tipIdx: number): boolean => {
    const wristToTip = dist2D(wrist, lm[tipIdx]);
    const wristToPip = dist2D(wrist, lm[pipIdx]);
    const mcpToTip = dist2D(lm[mcpIdx], lm[tipIdx]);
    const mcpToPip = dist2D(lm[mcpIdx], lm[pipIdx]);
    return wristToTip > wristToPip * 1.12 && mcpToTip > mcpToPip * 1.15;
  };

  const indexExtended = isFingerExtended(5, 6, 8);
  const middleExtended = isFingerExtended(9, 10, 12);
  const ringExtended = isFingerExtended(13, 14, 16);
  const pinkyExtended = isFingerExtended(17, 18, 20);

  // Hooked index: partially raised above MCP but tip bends closer to PIP than fully straight
  const indexWristTip = dist2D(wrist, lm[8]);
  const indexWristMcp = dist2D(wrist, lm[5]);
  const indexTipPip = dist2D(lm[6], lm[8]) / palmScale;
  const indexHooked = !indexExtended && indexWristTip > indexWristMcp * 1.18 && indexTipPip < 0.45;

  // Thumb extension: distance from thumb tip to pinky MCP & index MCP
  const thumbTipToPinkyMcp = dist2D(lm[4], lm[17]) / palmScale;
  const thumbIpToPinkyMcp = dist2D(lm[3], lm[17]) / palmScale;
  const thumbToIndexMcp = dist2D(lm[4], lm[5]) / palmScale;
  const thumbExtended =
    (thumbTipToPinkyMcp > thumbIpToPinkyMcp * 1.08 && thumbToIndexMcp > 0.48) ||
    thumbToIndexMcp > 0.65;

  const thumbUp =
    thumbExtended &&
    lm[4].y < lm[3].y - 0.02 * palmScale &&
    lm[4].y < lm[5].y;

  const thumbDown =
    thumbExtended &&
    lm[4].y > lm[3].y + 0.06 * palmScale &&
    lm[4].y > lm[5].y + 0.08 * palmScale;

  const pinchThumbIndex = dist2D(lm[4], lm[8]) / palmScale;
  const indexMiddleGap = dist2D(lm[8], lm[12]) / palmScale;
  const middleRingGap = dist2D(lm[12], lm[16]) / palmScale;
  const ringPinkyGap = dist2D(lm[16], lm[20]) / palmScale;
  const spreadAvg = (indexMiddleGap + middleRingGap + ringPinkyGap) / 3;
  const fingersTogether = spreadAvg < 0.31;

  return {
    palmScale,
    thumbExtended,
    thumbUp,
    thumbDown,
    indexExtended,
    indexHooked,
    middleExtended,
    ringExtended,
    pinkyExtended,
    pinchThumbIndex,
    indexMiddleGap,
    spreadAvg,
    fingersTogether,
  };
}

export function classifyHandLandmarks(
  lm: HandLandmarkPoint[],
  mode: SignRecognitionMode = 'auto'
): LocalHandClassification | null {
  const f = extractHandFeatures(lm);
  if (!f) return null;

  const {
    thumbExtended,
    thumbUp,
    thumbDown,
    indexExtended,
    indexHooked,
    middleExtended,
    ringExtended,
    pinkyExtended,
    pinchThumbIndex,
    indexMiddleGap,
    fingersTogether,
  } = f;

  // 1. LETTERS MODE (أبجدية الإشارة السريعة)
  if (mode === 'letters') {
    // O / ف : Thumb & Index form circle, others up
    if (pinchThumbIndex < 0.36 && middleExtended && ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'OK',
        confidence: 92,
        recognizedWordAr: 'ف',
        arabicMeaning: 'حرف الفاء (ف / F)',
        englishMeaning: 'Letter F / Fa',
        explanationAr: 'ملامسة الإبهام والسبابة مع رفع باقي الأصابع (حرف ف).',
      };
    }
    // م / O-closed : Thumb & Index form outward O-ring while other fingers are curled
    const indexTipDist = dist2D(lm[0], lm[8]);
    const indexMcpDist = dist2D(lm[0], lm[5]);
    if (
      pinchThumbIndex < 0.34 &&
      indexTipDist > indexMcpDist * 1.12 &&
      !middleExtended &&
      !ringExtended &&
      !pinkyExtended
    ) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'NO',
        confidence: 90,
        recognizedWordAr: 'م',
        arabicMeaning: 'حرف الميم (م / O)',
        englishMeaning: 'Letter Meem / O',
        explanationAr: 'حلقة مغلقة بين الإبهام والسبابة مع ثني باقي الأصابع (حرف م).',
      };
    }
    // هـ : All 5 open
    if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'HELLO',
        confidence: 94,
        recognizedWordAr: 'هـ',
        arabicMeaning: 'حرف الهاء (هـ / 5)',
        englishMeaning: 'Letter Ha',
        explanationAr: 'فتح جميع الأصابع الخمسة (حرف هـ).',
      };
    }
    // ب : 4 fingers straight & together, thumb tucked
    if (!thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'COUNT_4',
        confidence: 91,
        recognizedWordAr: 'ب',
        arabicMeaning: 'حرف الباء (ب / B)',
        englishMeaning: 'Letter Ba / B',
        explanationAr: 'رفع الأصابع الأربعة مع ضم الإبهام (حرف ب).',
      };
    }
    // س : Index + Middle + Ring extended
    if (indexExtended && middleExtended && ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'COUNT_3',
        confidence: 91,
        recognizedWordAr: 'س',
        arabicMeaning: 'حرف السين (س / W)',
        englishMeaning: 'Letter Seen / W',
        explanationAr: 'رفع السبابة والوسطى والبنصر (حرف س).',
      };
    }
    // ي / ت (2 fingers)
    if (!thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
      const spreadV = indexMiddleGap >= 0.32;
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'PEACE',
        confidence: 93,
        recognizedWordAr: spreadV ? 'ت' : 'ي',
        arabicMeaning: spreadV ? 'حرف التاء (ت / V)' : 'حرف الياء (ي / U)',
        englishMeaning: spreadV ? 'Letter Ta / V' : 'Letter Ya / U',
        explanationAr: spreadV
          ? 'رفع السبابة والوسطى متباعدتين (حرف ت).'
          : 'رفع السبابة والوسطى متلاصقتين (حرف ي).',
      };
    }
    // ل : L-shape (Thumb + Index extended)
    if (thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'POINT',
        confidence: 93,
        recognizedWordAr: 'ل',
        arabicMeaning: 'حرف اللام (ل / L)',
        englishMeaning: 'Letter Lam / L',
        explanationAr: 'مد الإبهام والسبابة على شكل زاوية قائمة (حرف ل).',
      };
    }
    // د : Index only
    if (!thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'COUNT_1',
        confidence: 92,
        recognizedWordAr: 'د',
        arabicMeaning: 'حرف الدال (د / D)',
        englishMeaning: 'Letter Dal / D',
        explanationAr: 'رفع السبابة فقط للأعلى (حرف د).',
      };
    }
    // ن : Pinky only
    if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'CALL_ME',
        confidence: 90,
        recognizedWordAr: 'ن',
        arabicMeaning: 'حرف النون (ن / I)',
        englishMeaning: 'Letter Noon / I',
        explanationAr: 'رفع الخنصر فقط للأعلى (حرف ن).',
      };
    }
    // و : Thumb + Pinky
    if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'CALL_ME',
        confidence: 92,
        recognizedWordAr: 'و',
        arabicMeaning: 'حرف الواو (و / Y)',
        englishMeaning: 'Letter Waw / Y',
        explanationAr: 'مد الإبهام والخنصر مع ثني باقي الأصابع (حرف و).',
      };
    }
    // ع : Thumb + Index + Pinky
    if (thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'LOVE',
        confidence: 91,
        recognizedWordAr: 'ع',
        arabicMeaning: 'حرف العين (ع)',
        englishMeaning: 'Letter Ain',
        explanationAr: 'مد الإبهام والسبابة والخنصر (حرف ع).',
      };
    }
    // ك : Thumb UP
    if (thumbUp && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'GOOD',
        confidence: 91,
        recognizedWordAr: 'ك',
        arabicMeaning: 'حرف الكاف (ك)',
        englishMeaning: 'Letter Kaf',
        explanationAr: 'رفع الإبهام للأعلى مع قبض الأصابع (حرف ك).',
      };
    }
    // ر : Hooked index
    if (indexHooked && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'QUESTION',
        confidence: 86,
        recognizedWordAr: 'ر',
        arabicMeaning: 'حرف الراء (ر)',
        englishMeaning: 'Letter Ra',
        explanationAr: 'تقويس السبابة للأسفل (حرف ر).',
      };
    }
    // أ : Closed fist
    if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'FIST',
        confidence: 91,
        recognizedWordAr: 'أ',
        arabicMeaning: 'حرف الألف (أ / A)',
        englishMeaning: 'Letter Alif / A',
        explanationAr: 'قبضة مغلقة واضحة (حرف أ).',
      };
    }
  }

  // 2. AUTO & GESTURES MODES
  // OK sign (Thumb + Index pinch + middle/ring/pinky up)
  if (pinchThumbIndex < 0.36 && middleExtended && ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'OK',
      confidence: 93,
      recognizedWordAr: 'تم',
      arabicMeaning: 'تم / صحيح (OK)',
      englishMeaning: 'OK / Perfect',
      explanationAr: 'دائرة الإبهام والسبابة مع رفع باقي الأصابع.',
    };
  }

  // All 5 fingers extended -> HELLO (spread) or STOP (together)
  if (thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
    if (fingersTogether) {
      return {
        handDetected: true,
        isLetter: false,
        detectedSignId: 'STOP',
        confidence: 92,
        recognizedWordAr: 'توقف',
        arabicMeaning: 'توقف / قف',
        englishMeaning: 'Stop / Wait',
        explanationAr: 'كف مفتوح وأصابع متراصة للأمام للإيقاف.',
      };
    }
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'HELLO',
      confidence: 95,
      recognizedWordAr: 'مرحباً',
      arabicMeaning: 'مرحباً / أهلاً',
      englishMeaning: 'Hello / Welcome',
      explanationAr: 'يد مفتوحة وأصابع متباعدة للترحيب.',
    };
  }

  // 4 fingers extended, thumb tucked -> COUNT_4 (or letter ب in auto mode if fingers together)
  if (!thumbExtended && indexExtended && middleExtended && ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'COUNT_4',
      confidence: 92,
      recognizedWordAr: 'أربعة',
      arabicMeaning: 'رقم ٤ (أربعة)',
      englishMeaning: 'Number 4',
      explanationAr: 'رفع الأصابع الأربعة مع ثني الإبهام.',
    };
  }

  // LOVE (Thumb + Index + Pinky)
  if (thumbExtended && indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'LOVE',
      confidence: 94,
      recognizedWordAr: 'أحبك',
      arabicMeaning: 'أحبك (I Love You)',
      englishMeaning: 'I Love You',
      explanationAr: 'رفع الإبهام والسبابة والخنصر مع ثني الوسطى والبنصر.',
    };
  }

  // CALL_ME (Thumb + Pinky)
  if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'CALL_ME',
      confidence: 93,
      recognizedWordAr: 'اتصل',
      arabicMeaning: 'اتصل بي',
      englishMeaning: 'Call Me',
      explanationAr: 'مد الإبهام والخنصر لإشارة الاتصال.',
    };
  }

  // COUNT_3 (Thumb + Index + Middle OR Index + Middle + Ring)
  if (indexExtended && middleExtended && ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'COUNT_3',
      confidence: 91,
      recognizedWordAr: 'ثلاثة',
      arabicMeaning: 'رقم ٣ (ثلاثة)',
      englishMeaning: 'Number 3',
      explanationAr: 'رفع ثلاثة أصابع بوضوح.',
    };
  }

  if (thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'COUNT_3',
      confidence: 90,
      recognizedWordAr: 'ثلاثة',
      arabicMeaning: 'رقم ٣ (ثلاثة)',
      englishMeaning: 'Number 3',
      explanationAr: 'رفع الإبهام والسبابة والوسطى.',
    };
  }

  // PEACE / 2 (Index + Middle)
  if (!thumbExtended && indexExtended && middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'PEACE',
      confidence: 95,
      recognizedWordAr: 'سلام',
      arabicMeaning: 'سلام / رقم ٢',
      englishMeaning: 'Peace / Two',
      explanationAr: 'رفع السبابة والوسطى مع ثني باقي الأصابع.',
    };
  }

  // In 'auto' mode, distinguish L-shape (letter ل) and Pinky-only (letter ن)
  if (mode === 'auto') {
    if (thumbExtended && indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'POINT',
        confidence: 91,
        recognizedWordAr: 'ل',
        arabicMeaning: 'حرف اللام (ل / L)',
        englishMeaning: 'Letter Lam / L',
        explanationAr: 'مد الإبهام والسبابة على شكل حرف ل.',
      };
    }
    if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
      return {
        handDetected: true,
        isLetter: true,
        detectedSignId: 'CALL_ME',
        confidence: 89,
        recognizedWordAr: 'ن',
        arabicMeaning: 'حرف النون (ن / I)',
        englishMeaning: 'Letter Noon / I',
        explanationAr: 'رفع الخنصر فقط (حرف ن).',
      };
    }
  }

  // GOOD / Thumbs up
  if (thumbUp && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'GOOD',
      confidence: 94,
      recognizedWordAr: 'ممتاز',
      arabicMeaning: 'ممتاز / جيد جداً',
      englishMeaning: 'Good / Thumbs Up',
      explanationAr: 'رفع الإبهام للأعلى مع قبض باقي الأصابع.',
    };
  }

  // NO / Thumbs down
  if (thumbDown && !indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'NO',
      confidence: 93,
      recognizedWordAr: 'لا',
      arabicMeaning: 'لا / غير موافق',
      englishMeaning: 'No / Thumbs Down',
      explanationAr: 'توجيه الإبهام للأسفل للتعبير عن الرفض أو النفي.',
    };
  }

  // POINT / 1 (Index only)
  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'POINT',
      confidence: 93,
      recognizedWordAr: 'واحد',
      arabicMeaning: 'واحد / إشارة',
      englishMeaning: 'One / Point',
      explanationAr: 'رفع السبابة فقط للأعلى.',
    };
  }

  // QUESTION (Hooked index)
  if (indexHooked && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'QUESTION',
      confidence: 86,
      recognizedWordAr: 'سؤال',
      arabicMeaning: 'سؤال / استفسار',
      englishMeaning: 'Question',
      explanationAr: 'تقويس إصبع السبابة على شكل علامة استفهام.',
    };
  }

  // Closed fist -> YES / FIST
  if (!indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'YES',
      confidence: 90,
      recognizedWordAr: 'نعم',
      arabicMeaning: 'نعم / قبضة',
      englishMeaning: 'Yes / Fist',
      explanationAr: 'قبضة يد مغلقة بالكامل.',
    };
  }

  return {
    handDetected: true,
    isLetter: false,
    detectedSignId: 'OPEN_HAND',
    confidence: 78,
    recognizedWordAr: 'إشارة',
    arabicMeaning: 'حركة يد مرصودة',
    englishMeaning: 'Hand Gesture Detected',
    explanationAr: 'تم رصد اليد، ثبت الإشارة للحظة ليتم اعتمادها.',
  };
}

/**
 * Generates canonical 21-point normalized landmarks for key signs so camera-less
 * quick samples exercise the same geometric classifier as live webcam tracking.
 */
export function getSampleLandmarksForSign(signId: SignId): HandLandmarkPoint[] {
  const pts: HandLandmarkPoint[] = new Array(21).fill(null).map(() => ({ x: 0.5, y: 0.5 }));
  pts[0] = { x: 0.5, y: 0.85 };
  pts[1] = { x: 0.42, y: 0.78 };
  pts[2] = { x: 0.38, y: 0.72 };
  pts[3] = { x: 0.36, y: 0.68 };
  pts[4] = { x: 0.44, y: 0.65 };

  pts[5] = { x: 0.43, y: 0.62 };
  pts[6] = { x: 0.43, y: 0.53 };
  pts[7] = { x: 0.43, y: 0.58 };
  pts[8] = { x: 0.43, y: 0.64 };

  pts[9] = { x: 0.49, y: 0.60 };
  pts[10] = { x: 0.49, y: 0.51 };
  pts[11] = { x: 0.49, y: 0.56 };
  pts[12] = { x: 0.49, y: 0.63 };

  pts[13] = { x: 0.55, y: 0.61 };
  pts[14] = { x: 0.55, y: 0.52 };
  pts[15] = { x: 0.55, y: 0.57 };
  pts[16] = { x: 0.55, y: 0.64 };

  pts[17] = { x: 0.61, y: 0.64 };
  pts[18] = { x: 0.61, y: 0.56 };
  pts[19] = { x: 0.61, y: 0.60 };
  pts[20] = { x: 0.61, y: 0.66 };

  const extend = (mcp: number, pip: number, dip: number, tip: number, xOffset = 0) => {
    const base = pts[mcp];
    pts[pip] = { x: base.x + xOffset * 0.3, y: base.y - 0.1 };
    pts[dip] = { x: base.x + xOffset * 0.6, y: base.y - 0.18 };
    pts[tip] = { x: base.x + xOffset, y: base.y - 0.25 };
  };
  const thumbOut = () => {
    pts[2] = { x: 0.35, y: 0.72 };
    pts[3] = { x: 0.28, y: 0.64 };
    pts[4] = { x: 0.2, y: 0.56 };
  };

  switch (signId) {
    case 'HELLO':
      thumbOut();
      extend(5, 6, 7, 8, -0.05);
      extend(9, 10, 11, 12, -0.01);
      extend(13, 14, 15, 16, 0.04);
      extend(17, 18, 19, 20, 0.09);
      break;
    case 'STOP':
      thumbOut();
      extend(5, 6, 7, 8, 0.01);
      extend(9, 10, 11, 12, 0);
      extend(13, 14, 15, 16, -0.01);
      extend(17, 18, 19, 20, -0.02);
      break;
    case 'PEACE':
      extend(5, 6, 7, 8, -0.04);
      extend(9, 10, 11, 12, 0.04);
      break;
    case 'GOOD':
      pts[2] = { x: 0.36, y: 0.68 };
      pts[3] = { x: 0.32, y: 0.56 };
      pts[4] = { x: 0.28, y: 0.44 };
      break;
    case 'NO':
      pts[2] = { x: 0.36, y: 0.68 };
      pts[3] = { x: 0.32, y: 0.76 };
      pts[4] = { x: 0.28, y: 0.88 };
      break;
    case 'LOVE':
      thumbOut();
      extend(5, 6, 7, 8, -0.02);
      extend(17, 18, 19, 20, 0.04);
      break;
    case 'QUESTION':
      pts[6] = { x: 0.43, y: 0.51 };
      pts[7] = { x: 0.45, y: 0.53 };
      pts[8] = { x: 0.43, y: 0.56 };
      break;
    case 'CALL_ME':
      thumbOut();
      extend(17, 18, 19, 20, 0.04);
      break;
    case 'OK':
      pts[4] = { x: 0.41, y: 0.51 };
      pts[8] = { x: 0.43, y: 0.5 };
      extend(9, 10, 11, 12, 0);
      extend(13, 14, 15, 16, 0.02);
      extend(17, 18, 19, 20, 0.05);
      break;
    case 'YES':
    default:
      break;
  }
  return pts;
}
