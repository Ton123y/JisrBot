import type { SignId } from './signLanguage';

export interface HandLandmarkPoint {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type HandednessLabel = 'Left' | 'Right';

export interface HandDetectionInput {
  landmarks: HandLandmarkPoint[];
  handedness: HandednessLabel;
}

export type BodyZone =
  | 'none'
  | 'above_head'
  | 'head_face'
  | 'mouth_chin'
  | 'chest_heart'
  | 'shoulder'
  | 'torso_neutral';

export type HandsRelation = 'none' | 'single' | 'together' | 'apart' | 'crossed' | 'symmetric';

export interface BodySpatialSummary {
  bodyDetected: boolean;
  handsCount: 0 | 1 | 2;
  leftHandZone: BodyZone;
  rightHandZone: BodyZone;
  leftHandPos: { x: number; y: number } | null;
  rightHandPos: { x: number; y: number } | null;
  handsDistance: number | null; // Normalized by shoulder width
  handsRelation: HandsRelation;
  headPos: { x: number; y: number } | null;
  chestPos: { x: number; y: number } | null;
  shoulderWidth: number;
  locationSummaryAr: string;
}

export type SignRecognitionMode = 'auto' | 'letters' | 'gestures';
export type CaptureSpeedMode = 'turbo' | 'balanced';

export const CAPTURE_HOLD_MS: Record<CaptureSpeedMode, number> = {
  turbo: 90,
  balanced: 220,
};

export const NO_HAND_RESET_MS = 120;

export interface LocalHandClassification {
  handDetected: boolean;
  isLetter: boolean;
  detectedSignId: SignId;
  confidence: number;
  recognizedWordAr: string;
  arabicMeaning: string;
  englishMeaning: string;
  explanationAr: string;
  datasetClass?: string;
  spatial?: BodySpatialSummary;
}

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // Index
  [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
  [0, 13], [13, 14], [14, 15], [15, 16],// Ring
  [0, 17], [17, 18], [18, 19], [19, 20],// Pinky
  [5, 9], [9, 13], [13, 17],            // Palm arch
];

// Upper body pose landmark pairs (MediaPipe 33-landmark Pose model)
export const POSE_UPPER_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [11, 12], // Shoulders
  [11, 13], [13, 15], // Left arm
  [12, 14], [14, 16], // Right arm
  [11, 23], [12, 24], // Torso sides
  [23, 24], // Waist/hips
  [9, 10],  // Mouth line
  [2, 5],   // Eye line
];

const BODY_ZONE_AR: Record<BodyZone, string> = {
  none: 'غير مرصودة',
  above_head: 'فوق الرأس',
  head_face: 'عند الوجه/الرأس',
  mouth_chin: 'عند الفم/الذقن',
  chest_heart: 'عند الصدر/القلب',
  shoulder: 'عند الكتف',
  torso_neutral: 'أمام الجسم',
};

const HANDS_RELATION_AR: Record<HandsRelation, string> = {
  none: 'لا توجد يد',
  single: 'يد واحدة',
  together: 'اليدان متقاربتان',
  apart: 'اليدان متباعدتان',
  crossed: 'اليدان متقاطعتان',
  symmetric: 'اليدان متوازيتان',
};

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getHandCenter(lm: HandLandmarkPoint[]): { x: number; y: number } {
  const wrist = lm[0];
  const midMcp = lm[9];
  return {
    x: (wrist.x + midMcp.x) * 0.5,
    y: (wrist.y + midMcp.y) * 0.5,
  };
}

function classifyHandZoneWithPose(
  handCenter: { x: number; y: number },
  pose: HandLandmarkPoint[] | null | undefined
): BodyZone {
  if (!pose || pose.length < 25) {
    // Approximate body zone cleanly when pose is not available yet
    if (handCenter.y < 0.24) return 'above_head';
    if (handCenter.y < 0.42) return 'head_face';
    if (handCenter.y < 0.62) return 'chest_heart';
    return 'torso_neutral';
  }

  const nose = pose[0];
  const mouthL = pose[9] ?? nose;
  const mouthR = pose[10] ?? nose;
  const mouthCenter = {
    x: (mouthL.x + mouthR.x) * 0.5,
    y: (mouthL.y + mouthR.y) * 0.5,
  };
  const lShoulder = pose[11];
  const rShoulder = pose[12];
  const shoulderCenter = {
    x: (lShoulder.x + rShoulder.x) * 0.5,
    y: (lShoulder.y + rShoulder.y) * 0.5,
  };
  const shoulderWidth = Math.max(0.14, dist2D(lShoulder, rShoulder));
  const lHip = pose[23];
  const rHip = pose[24];
  const chestCenter = {
    x: shoulderCenter.x,
    y: shoulderCenter.y + Math.max(0.08, ((lHip.y + rHip.y) * 0.5 - shoulderCenter.y) * 0.34),
  };

  if (handCenter.y < nose.y - shoulderWidth * 0.32) {
    return 'above_head';
  }
  if (
    dist2D(handCenter, mouthCenter) < shoulderWidth * 0.28 &&
    handCenter.y >= mouthCenter.y - shoulderWidth * 0.12
  ) {
    return 'mouth_chin';
  }
  if (dist2D(handCenter, nose) < shoulderWidth * 0.68 || handCenter.y < shoulderCenter.y - shoulderWidth * 0.14) {
    return 'head_face';
  }
  if (
    dist2D(handCenter, lShoulder) < shoulderWidth * 0.34 ||
    dist2D(handCenter, rShoulder) < shoulderWidth * 0.34
  ) {
    return 'shoulder';
  }
  if (dist2D(handCenter, chestCenter) < shoulderWidth * 0.55) {
    return 'chest_heart';
  }
  return 'torso_neutral';
}

/**
 * Computes full spatial coordinates & body-zone mapping for both hands + 33-point body pose.
 */
export function computeBodySpatialContext(
  hands: HandDetectionInput[],
  poseLandmarks?: HandLandmarkPoint[] | null
): BodySpatialSummary {
  const hasPose = Boolean(poseLandmarks && poseLandmarks.length >= 25);
  const pose = hasPose ? poseLandmarks! : null;

  const shoulderWidth = pose
    ? Math.max(0.14, dist2D(pose[11], pose[12]))
    : 0.32;
  const headPos = pose ? { x: pose[0].x, y: pose[0].y } : null;
  const chestPos = pose
    ? {
        x: (pose[11].x + pose[12].x) * 0.5,
        y: (pose[11].y + pose[12].y) * 0.5 + 0.12,
      }
    : null;

  let leftHand: HandDetectionInput | undefined;
  let rightHand: HandDetectionInput | undefined;

  for (const h of hands.slice(0, 2)) {
    if (!h.landmarks || h.landmarks.length < 21) continue;
    if (h.handedness === 'Left' && !leftHand) {
      leftHand = h;
    } else if (h.handedness === 'Right' && !rightHand) {
      rightHand = h;
    } else if (!leftHand) {
      leftHand = h;
    } else if (!rightHand) {
      rightHand = h;
    }
  }

  const leftPos = leftHand ? getHandCenter(leftHand.landmarks) : null;
  const rightPos = rightHand ? getHandCenter(rightHand.landmarks) : null;
  const leftZone: BodyZone = leftPos ? classifyHandZoneWithPose(leftPos, pose) : 'none';
  const rightZone: BodyZone = rightPos ? classifyHandZoneWithPose(rightPos, pose) : 'none';

  const handsCount: 0 | 1 | 2 = leftPos && rightPos ? 2 : leftPos || rightPos ? 1 : 0;

  let handsDistance: number | null = null;
  let handsRelation: HandsRelation = handsCount === 0 ? 'none' : 'single';

  if (leftPos && rightPos) {
    handsDistance = dist2D(leftPos, rightPos) / shoulderWidth;
    if (handsDistance < 0.52) {
      handsRelation = Math.abs(leftPos.x - rightPos.x) < 0.04 ? 'crossed' : 'together';
    } else if (handsDistance > 1.05) {
      handsRelation = 'apart';
    } else if (Math.abs(leftPos.y - rightPos.y) < 0.09) {
      handsRelation = 'symmetric';
    } else {
      handsRelation = 'together';
    }
  }

  const parts: string[] = [];
  parts.push(hasPose ? 'الجسم مرصود' : 'تتبع اليدين');
  if (rightZone !== 'none') parts.push(`اليمنى: ${BODY_ZONE_AR[rightZone]}`);
  if (leftZone !== 'none') parts.push(`اليسرى: ${BODY_ZONE_AR[leftZone]}`);
  if (handsCount === 2) parts.push(HANDS_RELATION_AR[handsRelation]);

  return {
    bodyDetected: hasPose,
    handsCount,
    leftHandZone: leftZone,
    rightHandZone: rightZone,
    leftHandPos: leftPos,
    rightHandPos: rightPos,
    handsDistance,
    handsRelation,
    headPos,
    chestPos,
    shoulderWidth,
    locationSummaryAr: parts.join(' • '),
  };
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
  pointingDown: boolean;
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
    return wristToTip > wristToPip * 1.07 && mcpToTip > mcpToPip * 1.08;
  };

  const indexExtended = isFingerExtended(5, 6, 8);
  const middleExtended = isFingerExtended(9, 10, 12);
  const ringExtended = isFingerExtended(13, 14, 16);
  const pinkyExtended = isFingerExtended(17, 18, 20);

  const indexWristTip = dist2D(wrist, lm[8]);
  const indexWristMcp = dist2D(wrist, lm[5]);
  const indexTipPip = dist2D(lm[6], lm[8]) / palmScale;
  const indexHooked = !indexExtended && indexWristTip > indexWristMcp * 1.15 && indexTipPip < 0.45;
  const pointingDown = indexExtended && lm[8].y > lm[5].y + 0.08 * palmScale;

  const thumbTipToPinkyMcp = dist2D(lm[4], lm[17]) / palmScale;
  const thumbIpToPinkyMcp = dist2D(lm[3], lm[17]) / palmScale;
  const thumbToIndexMcp = dist2D(lm[4], lm[5]) / palmScale;
  const thumbExtended =
    (thumbTipToPinkyMcp > thumbIpToPinkyMcp * 1.06 && thumbToIndexMcp > 0.45) ||
    thumbToIndexMcp > 0.62;

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
    pointingDown,
  };
}

/**
 * Classifies single-hand shape without body context (also used as building block for dual-hand + body fusion).
 */
export function classifyHandLandmarks(
  lm: HandLandmarkPoint[],
  mode: SignRecognitionMode = 'gestures'
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

  // 1. LETTERS MODE (تهجئة الاسم بالحروف فقط)
  if (mode === 'letters') {
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

  // 2. FULL GESTURES & COMPLETE WORDS ONLY (NO single letters)
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

  if (thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'CALL_ME',
      confidence: 93,
      recognizedWordAr: 'اتصل',
      arabicMeaning: 'اتصل بي / تواصل',
      englishMeaning: 'Call Me',
      explanationAr: 'مد الإبهام والخنصر لإشارة الاتصال.',
    };
  }

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

  if (!thumbExtended && !indexExtended && !middleExtended && !ringExtended && pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'CALL_ME',
      confidence: 89,
      recognizedWordAr: 'تواصل',
      arabicMeaning: 'تواصل / اتصال',
      englishMeaning: 'Connect / Communicate',
      explanationAr: 'رفع الخنصر للإشارة إلى التواصل أو الحديث.',
    };
  }

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

  if (indexExtended && !middleExtended && !ringExtended && !pinkyExtended) {
    return {
      handDetected: true,
      isLetter: false,
      detectedSignId: 'POINT',
      confidence: 93,
      recognizedWordAr: 'واحد',
      arabicMeaning: 'واحد / إشارة',
      englishMeaning: 'One / Point',
      explanationAr: 'رفع السبابة فقط.',
    };
  }

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
 * Full-body (33 pose landmarks) + Two-hand (Left + Right 21 landmarks each) Egyptian Sign Language classifier,
 * grounded in Mendeley ESL dataset (DOI: 10.17632/39tbt2jd7r.1) spatial & handedness patterns.
 */
export function classifyBodyAndHands(
  hands: HandDetectionInput[],
  poseLandmarks?: HandLandmarkPoint[] | null,
  mode: SignRecognitionMode = 'gestures'
): LocalHandClassification | null {
  const validHands = hands.filter((h) => h.landmarks && h.landmarks.length >= 21);
  if (validHands.length === 0) return null;

  const spatial = computeBodySpatialContext(validHands, poseLandmarks);
  const primary = validHands[0];
  const primaryCls = classifyHandLandmarks(primary.landmarks, mode);
  if (!primaryCls) return null;

  // In explicit name-spelling letters mode, keep single-letter output enriched with spatial info
  if (mode === 'letters') {
    return { ...primaryCls, spatial };
  }

  // --- TWO-HANDED EGYPTIAN SIGN LANGUAGE FUSION ---
  if (validHands.length === 2) {
    const clsA = classifyHandLandmarks(validHands[0].landmarks, 'gestures');
    const clsB = classifyHandLandmarks(validHands[1].landmarks, 'gestures');
    const featA = extractHandFeatures(validHands[0].landmarks);
    const featB = extractHandFeatures(validHands[1].landmarks);

    if (clsA && clsB && featA && featB) {
      const bothOpen =
        (clsA.detectedSignId === 'HELLO' || clsA.detectedSignId === 'STOP' || clsA.detectedSignId === 'COUNT_4') &&
        (clsB.detectedSignId === 'HELLO' || clsB.detectedSignId === 'STOP' || clsB.detectedSignId === 'COUNT_4');

      // Two open palms meeting at top or side-by-side in front of chest -> بيت / كتاب / مفيش
      if (bothOpen) {
        const tipDist = dist2D(validHands[0].landmarks[12], validHands[1].landmarks[12]) / spatial.shoulderWidth;
        const wristDist = dist2D(validHands[0].landmarks[0], validHands[1].landmarks[0]) / spatial.shoulderWidth;
        // Tips touching/converging closer than wrists -> triangle roof -> بيت / منزل
        if (tipDist < 0.36 && tipDist < wristDist * 0.72) {
          return {
            handDetected: true,
            isLetter: false,
            detectedSignId: 'OPEN_HAND',
            confidence: 93,
            recognizedWordAr: 'بيت',
            arabicMeaning: 'بيت / منزل (إشارة باليدين)',
            englishMeaning: 'Home / House',
            explanationAr: 'التقاء أطراف أصابع اليدين معاً لتشكيل سقف البيت أمام الجسم.',
            datasetClass: 'manzel',
            spatial,
          };
        }
        if (spatial.handsRelation === 'together' || spatial.handsRelation === 'crossed') {
          return {
            handDetected: true,
            isLetter: false,
            detectedSignId: 'OPEN_HAND',
            confidence: 93,
            recognizedWordAr: 'كتاب',
            arabicMeaning: 'كتاب (إشارة باليدين)',
            englishMeaning: 'Book',
            explanationAr: 'تقارب الكفين المفتوحتين أمام الصدر مثل فتح كتاب.',
            datasetClass: 'ktab',
            spatial,
          };
        }

        if (spatial.handsRelation === 'apart') {
          return {
            handDetected: true,
            isLetter: false,
            detectedSignId: 'NO',
            confidence: 92,
            recognizedWordAr: 'مفيش',
            arabicMeaning: 'مفيش / لا يوجد (باليدين)',
            englishMeaning: 'Nothing / None',
            explanationAr: 'فتح اليدين وتبعيدهما عن الصدر للتعبير عن عدم الوجود (مفيش).',
            datasetClass: 'mafish',
            spatial,
          };
        }

        if (spatial.leftHandZone === 'head_face' || spatial.rightHandZone === 'head_face') {
          return {
            handDetected: true,
            isLetter: false,
            detectedSignId: 'HELLO',
            confidence: 93,
            recognizedWordAr: 'صباح الخير',
            arabicMeaning: 'صباح الخير (ترحيب باليدين)',
            englishMeaning: 'Good morning',
            explanationAr: 'إشارة ترحيبية باليدين عند مستوى الوجه والرأس.',
            datasetClass: 'sabhl elkheer',
            spatial,
          };
        }

        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'HELLO',
          confidence: 94,
          recognizedWordAr: 'أهلاً بيك',
          arabicMeaning: 'أهلاً بيك / تحية باليدين',
          englishMeaning: 'Welcome',
          explanationAr: 'الكفان مفتوحتان أمام الصدر للترحيب.',
          spatial,
        };
      }

      // Two thumbs up -> حلو أوي / تمام أوي
      if (clsA.detectedSignId === 'GOOD' && clsB.detectedSignId === 'GOOD') {
        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'GOOD',
          confidence: 95,
          recognizedWordAr: 'حلو أوي',
          arabicMeaning: 'حلو أوي / ممتاز جداً',
          englishMeaning: 'Very good / Awesome',
          explanationAr: 'رفع الإبهام في كلتا اليدين تأكيداً على الإعجاب (حلو أوي).',
          datasetClass: 'helw awy',
          spatial,
        };
      }

      // Two fists together/crossed near chest -> عربية / صاحبي
      if (
        (clsA.detectedSignId === 'YES' || clsA.detectedSignId === 'FIST') &&
        (clsB.detectedSignId === 'YES' || clsB.detectedSignId === 'FIST')
      ) {
        if (spatial.handsRelation === 'together' || spatial.handsRelation === 'crossed') {
          return {
            handDetected: true,
            isLetter: false,
            detectedSignId: 'LOVE',
            confidence: 91,
            recognizedWordAr: 'صاحبي',
            arabicMeaning: 'صاحبي / صديقي (تشابك اليدين)',
            englishMeaning: 'My friend',
            explanationAr: 'تقارب القبضتين أمام الصدر إشارة للصداقة والمودة.',
            datasetClass: 'sahby',
            spatial,
          };
        }
        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'ROBOT',
          confidence: 91,
          recognizedWordAr: 'عربية',
          arabicMeaning: 'عربية / قيادة (كلتا اليدين)',
          englishMeaning: 'Car / Steering',
          explanationAr: 'القبضتان متوازيتان أمام الجذع بوضعية القيادة.',
          datasetClass: '3rabia',
          spatial,
        };
      }

      // Two LOVE / chest -> بحب / واحشني
      if (clsA.detectedSignId === 'LOVE' && clsB.detectedSignId === 'LOVE') {
        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'LOVE',
          confidence: 95,
          recognizedWordAr: 'واحشني',
          arabicMeaning: 'واحشني / بحبك جداً',
          englishMeaning: 'Miss you / Love',
          explanationAr: 'إشارة المحبة بكلتا اليدين أمام الصدر.',
          datasetClass: 'whashny',
          spatial,
        };
      }

      // Two Question / Hooked / Pointing -> عامل إيه
      if (clsA.detectedSignId === 'QUESTION' || clsB.detectedSignId === 'QUESTION') {
        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'QUESTION',
          confidence: 91,
          recognizedWordAr: 'عامل إيه',
          arabicMeaning: 'عامل إيه / كيف حالك؟',
          englishMeaning: 'How are you?',
          explanationAr: 'حركة الاستفهام باليدين أمام الصدر للسؤال عن الحال.',
          datasetClass: '3amel eh',
          spatial,
        };
      }

      // Two-hand PEACE -> السلام عليكم / هدوء
      if (clsA.detectedSignId === 'PEACE' && clsB.detectedSignId === 'PEACE') {
        return {
          handDetected: true,
          isLetter: false,
          detectedSignId: 'PEACE',
          confidence: 94,
          recognizedWordAr: 'أخويا',
          arabicMeaning: 'أخويا / سلام وتوافق',
          englishMeaning: 'Brother / Peace',
          explanationAr: 'رفع السبابة والوسطى في اليدين أمام الصدر.',
          datasetClass: 'akhoia',
          spatial,
        };
      }
    }
  }

  // --- SINGLE-HAND + BODY LOCATION DISAMBIGUATION (requires Pose spatial context) ---
  const activeZone: BodyZone =
    spatial.rightHandZone !== 'none' ? spatial.rightHandZone : spatial.leftHandZone;
  const primaryFeatures = extractHandFeatures(primary.landmarks);

  if (spatial.bodyDetected && activeZone !== 'none') {
    if (primaryCls.detectedSignId === 'HELLO') {
      if (activeZone === 'above_head') {
        return {
          ...primaryCls,
          detectedSignId: 'RAISE_HAND',
          recognizedWordAr: 'سبحان الله',
          arabicMeaning: 'سبحان الله / فوق الرأس',
          englishMeaning: 'Glory to God / Raised High',
          explanationAr: 'الكف المفتوح مرفوع فوق الرأس.',
          datasetClass: 'sabhlala',
          spatial,
        };
      }
      if (activeZone === 'head_face') {
        return {
          ...primaryCls,
          recognizedWordAr: 'صباح الخير',
          arabicMeaning: 'صباح الخير (عند الوجه)',
          englishMeaning: 'Good morning',
          explanationAr: 'الكف المفتوح عند مستوى الرأس والجبهة للتحية.',
          datasetClass: 'sabhl elkheer',
          spatial,
        };
      }
      if (activeZone === 'mouth_chin') {
        return {
          ...primaryCls,
          detectedSignId: 'THANK_YOU',
          recognizedWordAr: 'شكراً',
          arabicMeaning: 'شكراً (من عند الفم/الذقن)',
          englishMeaning: 'Thank you',
          explanationAr: 'اليد مفرودة عند الفم/الذقن للتقدير والشكر.',
          spatial,
        };
      }
      if (activeZone === 'chest_heart') {
        return {
          ...primaryCls,
          recognizedWordAr: 'عايز',
          arabicMeaning: 'عايز / أهلاً (عند الصدر)',
          englishMeaning: 'Want / Welcome',
          explanationAr: 'اليد المفتوحة أمام الصدر والقلب.',
          datasetClass: '3waz',
          spatial,
        };
      }
    }

    if (primaryCls.detectedSignId === 'GOOD') {
      if (activeZone === 'mouth_chin') {
        return {
          ...primaryCls,
          recognizedWordAr: 'تمام',
          arabicMeaning: 'تمام / كويس (عند الذقن)',
          englishMeaning: 'Fine / Great',
          explanationAr: 'إشارة الإبهام للأعلى قرب الذقن للتأكيد (تمام).',
          datasetClass: 'tmam',
          spatial,
        };
      }
      if (activeZone === 'chest_heart') {
        return {
          ...primaryCls,
          recognizedWordAr: 'حلو أوي',
          arabicMeaning: 'حلو أوي (عند الصدر)',
          englishMeaning: 'Very nice',
          explanationAr: 'إشارة الإبهام للأعلى أمام الصدر.',
          datasetClass: 'helw awy',
          spatial,
        };
      }
    }

    if (primaryCls.detectedSignId === 'POINT') {
      if (activeZone === 'head_face') {
        return {
          ...primaryCls,
          recognizedWordAr: 'خلي بالك',
          arabicMeaning: 'خلي بالك / انتبه (عند العين/الرأس)',
          englishMeaning: 'Be careful / Pay attention',
          explanationAr: 'السبابة تشير بجانب العين والوجه للتنبيه.',
          datasetClass: 'khaly balk',
          spatial,
        };
      }
      if (activeZone === 'mouth_chin') {
        return {
          ...primaryCls,
          detectedSignId: 'NO',
          recognizedWordAr: 'كداب',
          arabicMeaning: 'كداب (عند الذقن/الفم)',
          englishMeaning: 'Liar',
          explanationAr: 'السبابة أمام الذقن والفم.',
          datasetClass: 'kdab',
          spatial,
        };
      }
      if (primaryFeatures?.pointingDown || activeZone === 'torso_neutral') {
        return {
          ...primaryCls,
          recognizedWordAr: primaryFeatures?.pointingDown ? 'دلوقتي' : 'واحد',
          arabicMeaning: primaryFeatures?.pointingDown ? 'دلوقتي / الآن' : 'واحد / إشارة',
          englishMeaning: primaryFeatures?.pointingDown ? 'Now' : 'One / Point',
          explanationAr: primaryFeatures?.pointingDown
            ? 'السبابة متجهة للأسفل أمام الجذع للدلالة على الآن (دلوقتي).'
            : 'رفع السبابة أمام الجسم.',
          datasetClass: primaryFeatures?.pointingDown ? 'delwaty' : undefined,
          spatial,
        };
      }
    }

    if (primaryCls.detectedSignId === 'LOVE' && activeZone === 'chest_heart') {
      return {
        ...primaryCls,
        recognizedWordAr: 'بحب',
        arabicMeaning: 'بحب / أحبك (عند القلب)',
        englishMeaning: 'Love',
        explanationAr: 'إشارة المحبة عند الصدر والقلب.',
        datasetClass: 'bhab',
        spatial,
      };
    }

    if (primaryCls.detectedSignId === 'YES' && activeZone === 'chest_heart') {
      return {
        ...primaryCls,
        recognizedWordAr: 'تعبان',
        arabicMeaning: 'قبضة عند الصدر (تعبان / نعم)',
        englishMeaning: 'Tired / Confirm',
        explanationAr: 'إمساك الصدر أو القبضة أمام القلب.',
        datasetClass: 't3ban',
        spatial,
      };
    }

    if (primaryCls.detectedSignId === 'PEACE' && activeZone === 'head_face') {
      return {
        ...primaryCls,
        recognizedWordAr: 'يضحك',
        arabicMeaning: 'يضحك / سلام (عند الوجه)',
        englishMeaning: 'Smile / Peace',
        explanationAr: 'رفع الإصبعين بجانب الوجه.',
        datasetClass: 'yadhk',
        spatial,
      };
    }
  }

  return {
    ...primaryCls,
    spatial,
  };
}

/**
 * Generates canonical 21-point normalized landmarks for single-hand or dual-hand + pose samples.
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
    case 'POINT':
      extend(5, 6, 7, 8, 0);
      break;
    case 'YES':
    default:
      break;
  }
  return pts;
}

/**
 * Generates canonical 33-point body pose landmarks (upper body centered in frame)
 * + positioned hand landmarks so dual-hand & body-anchored dataset signs can be tested deterministically.
 */
export function getCanonicalPoseLandmarks(): HandLandmarkPoint[] {
  const pose: HandLandmarkPoint[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  pose[0] = { x: 0.5, y: 0.22, visibility: 0.99 }; // Nose
  pose[2] = { x: 0.47, y: 0.19, visibility: 0.99 }; // Left eye
  pose[5] = { x: 0.53, y: 0.19, visibility: 0.99 }; // Right eye
  pose[9] = { x: 0.48, y: 0.27, visibility: 0.99 }; // Mouth L
  pose[10] = { x: 0.52, y: 0.27, visibility: 0.99 }; // Mouth R
  pose[11] = { x: 0.34, y: 0.44, visibility: 0.99 }; // Left shoulder
  pose[12] = { x: 0.66, y: 0.44, visibility: 0.99 }; // Right shoulder
  pose[13] = { x: 0.28, y: 0.62, visibility: 0.99 }; // Left elbow
  pose[14] = { x: 0.72, y: 0.62, visibility: 0.99 }; // Right elbow
  pose[15] = { x: 0.34, y: 0.66, visibility: 0.99 }; // Left wrist
  pose[16] = { x: 0.66, y: 0.66, visibility: 0.99 }; // Right wrist
  pose[23] = { x: 0.38, y: 0.86, visibility: 0.99 }; // Left hip
  pose[24] = { x: 0.62, y: 0.86, visibility: 0.99 }; // Right hip
  return pose;
}

function translateHandLandmarks(
  lm: HandLandmarkPoint[],
  targetCenterX: number,
  targetCenterY: number,
  scale = 0.55
): HandLandmarkPoint[] {
  const cx = (lm[0].x + lm[9].x) * 0.5;
  const cy = (lm[0].y + lm[9].y) * 0.5;
  return lm.map((p) => ({
    x: targetCenterX + (p.x - cx) * scale,
    y: targetCenterY + (p.y - cy) * scale,
  }));
}

export type DatasetSampleKey =
  | 'sabhl_elkheer'
  | '3amel_eh'
  | 'tmam'
  | 'bhab'
  | 'ktab'
  | 'manzel'
  | 'mafish'
  | 'khaly_balk'
  | 'helw_awy';

export function getSampleBodyAndHandsForDatasetSign(sample: DatasetSampleKey): {
  hands: HandDetectionInput[];
  pose: HandLandmarkPoint[];
} {
  const pose = getCanonicalPoseLandmarks();
  switch (sample) {
    case 'sabhl_elkheer':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.58, 0.18),
          },
        ],
      };
    case 'tmam':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('GOOD'), 0.54, 0.28),
          },
        ],
      };
    case 'bhab':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('LOVE'), 0.51, 0.56),
          },
        ],
      };
    case 'khaly_balk':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('POINT'), 0.56, 0.21),
          },
        ],
      };
    case 'ktab':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.54, 0.58),
          },
          {
            handedness: 'Left',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.46, 0.58),
          },
        ],
      };
    case 'manzel': {
      // Roof triangle: fingertips lean inward closer than wrists
      const rOpen = translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.57, 0.54);
      const lOpen = translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.43, 0.54);
      rOpen[12] = { x: 0.505, y: 0.40 };
      lOpen[12] = { x: 0.495, y: 0.40 };
      return {
        pose,
        hands: [
          { handedness: 'Right', landmarks: rOpen },
          { handedness: 'Left', landmarks: lOpen },
        ],
      };
    }
    case 'mafish':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.72, 0.56),
          },
          {
            handedness: 'Left',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('HELLO'), 0.28, 0.56),
          },
        ],
      };
    case 'helw_awy':
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('GOOD'), 0.58, 0.56),
          },
          {
            handedness: 'Left',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('GOOD'), 0.42, 0.56),
          },
        ],
      };
    case '3amel_eh':
    default:
      return {
        pose,
        hands: [
          {
            handedness: 'Right',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('QUESTION'), 0.57, 0.56),
          },
          {
            handedness: 'Left',
            landmarks: translateHandLandmarks(getSampleLandmarksForSign('QUESTION'), 0.43, 0.56),
          },
        ],
      };
  }
}
