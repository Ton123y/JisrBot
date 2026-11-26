export type SignId =
  | 'REST'
  | 'HELLO'
  | 'YES'
  | 'NO'
  | 'THANK_YOU'
  | 'LOVE'
  | 'HELP'
  | 'STOP'
  | 'GO'
  | 'GOOD'
  | 'OK'
  | 'PEACE'
  | 'POINT'
  | 'FIST'
  | 'OPEN_HAND'
  | 'COUNT_1'
  | 'COUNT_2'
  | 'COUNT_3'
  | 'COUNT_4'
  | 'COUNT_5'
  | 'RAISE_HAND'
  | 'CALL_ME'
  | 'QUESTION'
  | 'LIGHT'
  | 'ROBOT';

export type SignOscillation = 'none' | 'wave' | 'nod' | 'shake' | 'pulse';

export interface HandPose {
  wristPitch: number;
  wristYaw: number;
  wristRoll: number;
  armElevation: number;
  splay: number;
  thumbAbduct: number;
  thumbCurl: [number, number]; // [MCP, IP]
  index: [number, number, number]; // [MCP, PIP, DIP]
  middle: [number, number, number];
  ring: [number, number, number];
  pinky: [number, number, number];
}

export interface SignDefinition {
  id: SignId;
  glossEn: string;
  glossAr: string;
  category: 'greeting' | 'command' | 'emotion' | 'number';
  descriptionAr: string;
  keywords: string[];
  oscillation: SignOscillation;
  pose: HandPose;
  servoTargets: [number, number, number, number, number]; // Thumb..Pinky 0..180 deg for ESP32
}

export interface SignStep {
  key: string;
  signId: string;
  sourceWord: string;
  glossAr: string;
  glossEn: string;
  descriptionAr: string;
  oscillation: SignOscillation;
  pose: HandPose;
  durationMs: number;
  isFingerspelled?: boolean;
}

export const SIGN_LEXICON: Record<SignId, SignDefinition> = {
  REST: {
    id: 'REST',
    glossEn: 'Rest / Ready',
    glossAr: 'استعداد',
    category: 'command',
    descriptionAr: 'يد مسترخية بانتظار الأوامر أو الحديث.',
    keywords: ['rest', 'idle', 'ready', 'استعداد', 'راحة', 'انتظار', 'جاهز'],
    oscillation: 'none',
    pose: {
      wristPitch: 0.05,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0,
      splay: 0.04,
      thumbAbduct: 0.35,
      thumbCurl: [0.2, 0.25],
      index: [0.22, 0.25, 0.15],
      middle: [0.26, 0.28, 0.18],
      ring: [0.3, 0.32, 0.2],
      pinky: [0.34, 0.35, 0.22],
    },
    servoTargets: [25, 30, 35, 40, 45],
  },
  HELLO: {
    id: 'HELLO',
    glossEn: 'Hello / Welcome',
    glossAr: 'مرحباً / أهلاً',
    category: 'greeting',
    descriptionAr: 'كف مفتوح مرفوع مع تلويح لطيف للترحيب.',
    keywords: [
      'hello', 'hi', 'welcome', 'hey', 'wave', 'greetings', 'morning',
      'مرحبا', 'مرحباً', 'اهلا', 'أهلا', 'أهلاً', 'سلام', 'عليكم', 'هاي', 'تحية', 'لوح', 'تلوح', 'صباح', 'الخير', 'مساء',
      'نورت', 'نورتي', 'منور', 'بيك', 'بيكي', 'ازيك', 'إزيك', 'اخبارك', 'أخبارك',
    ],
    oscillation: 'wave',
    pose: {
      wristPitch: -0.08,
      wristYaw: 0.1,
      wristRoll: 0,
      armElevation: 0.18,
      splay: 0.16,
      thumbAbduct: 0.65,
      thumbCurl: [0.05, 0.05],
      index: [0.02, 0.02, 0.02],
      middle: [0.02, 0.02, 0.02],
      ring: [0.02, 0.02, 0.02],
      pinky: [0.02, 0.02, 0.02],
    },
    servoTargets: [0, 0, 0, 0, 0],
  },
  YES: {
    id: 'YES',
    glossEn: 'Yes / Agree',
    glossAr: 'نعم / موافق',
    category: 'command',
    descriptionAr: 'قبضة مغلقة تومئ للأمام للتأكيد والموافقة.',
    keywords: [
      'yes', 'agree', 'confirm', 'sure', 'indeed', 'true', 'right', 'honest',
      'نعم', 'أجل', 'اجل', 'ايوه', 'أيوه', 'أه', 'اه', 'تمام', 'حاضر', 'موافق', 'صح', 'بالتأكيد', 'طبعاً', 'طبعا', 'أكيد', 'اكيد',
      'فهمت', 'خلاص', 'مظبوط', 'مضبوط', 'ماشي', 'عظيم', 'بالضبط', 'صادق',
    ],
    oscillation: 'nod',
    pose: {
      wristPitch: 0.25,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.08,
      splay: 0,
      thumbAbduct: 0.2,
      thumbCurl: [0.85, 0.9],
      index: [1.35, 1.4, 0.95],
      middle: [1.38, 1.42, 0.95],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.4, 0.95],
    },
    servoTargets: [140, 175, 175, 175, 175],
  },
  NO: {
    id: 'NO',
    glossEn: 'No / Reject',
    glossAr: 'لا / غير موافق',
    category: 'command',
    descriptionAr: 'التقاء السبابة والوسطى مع الإبهام وحركة رفض جانبية.',
    keywords: [
      'no', 'nope', 'not', 'cancel', 'reject', 'never', 'false', 'wrong', 'tired', 'cry',
      'لا', 'لأ', 'مش', 'رفض', 'غير', 'ممنوع', 'خطأ', 'غلط', 'كلا', 'لن', 'لم', 'مافيش', 'مفيش', 'بلاش',
      'عيب', 'كداب', 'حرامي', 'تعبان', 'يبكي', 'يشتم', 'ألم', 'الم',
    ],
    oscillation: 'shake',
    pose: {
      wristPitch: 0.12,
      wristYaw: -0.25,
      wristRoll: 0.1,
      armElevation: 0.1,
      splay: 0.02,
      thumbAbduct: 0.48,
      thumbCurl: [0.55, 0.45],
      index: [0.95, 0.75, 0.45],
      middle: [0.95, 0.75, 0.45],
      ring: [1.35, 1.35, 0.9],
      pinky: [1.35, 1.35, 0.9],
    },
    servoTargets: [95, 110, 110, 175, 175],
  },
  THANK_YOU: {
    id: 'THANK_YOU',
    glossEn: 'Thank You',
    glossAr: 'شكراً',
    category: 'greeting',
    descriptionAr: 'كف مفرود يتحرك للأمام بانحناءة تقدير وامتنان.',
    keywords: [
      'thank', 'thanks', 'appreciate', 'grateful',
      'شكر', 'شكراً', 'شكرا', 'متشكر', 'تسلم', 'ممنون', 'يعطيك', 'العافية', 'أشكرك', 'اشكرك', 'تقدير',
    ],
    oscillation: 'nod',
    pose: {
      wristPitch: 0.42,
      wristYaw: 0,
      wristRoll: -0.15,
      armElevation: 0.12,
      splay: 0.03,
      thumbAbduct: 0.35,
      thumbCurl: [0.1, 0.08],
      index: [0.05, 0.05, 0.03],
      middle: [0.05, 0.05, 0.03],
      ring: [0.05, 0.05, 0.03],
      pinky: [0.05, 0.05, 0.03],
    },
    servoTargets: [15, 10, 10, 10, 10],
  },
  LOVE: {
    id: 'LOVE',
    glossEn: 'I Love You',
    glossAr: 'أحبك / تقدير',
    category: 'emotion',
    descriptionAr: 'إشارة المحبة العالمية: الإبهام والسبابة والخنصر مفرودة.',
    keywords: [
      'love', 'heart', 'ily', 'like', 'friend', 'brother', 'miss',
      'احبك', 'أحبك', 'بحبك', 'بحب', 'حب', 'سعادة', 'جميل', 'سعيد', 'لطيف', 'مبسوط', 'متحمس', 'تحب',
      'أخويا', 'اخويا', 'صاحبي', 'واحشني', 'مراتي', 'خطيبتي',
    ],
    oscillation: 'pulse',
    pose: {
      wristPitch: -0.05,
      wristYaw: 0.06,
      wristRoll: 0,
      armElevation: 0.14,
      splay: 0.14,
      thumbAbduct: 0.78,
      thumbCurl: [0.05, 0.05],
      index: [0.02, 0.02, 0.02],
      middle: [1.38, 1.42, 0.95],
      ring: [1.38, 1.42, 0.95],
      pinky: [0.02, 0.02, 0.02],
    },
    servoTargets: [0, 0, 175, 175, 0],
  },
  HELP: {
    id: 'HELP',
    glossEn: 'Help / Assist',
    glossAr: 'مساعدة',
    category: 'command',
    descriptionAr: 'رفع اليد بإشارة الإبهام للأعلى لطلب أو تقديم المساعدة.',
    keywords: [
      'help', 'assist', 'support', 'service', 'need', 'want', 'doctor',
      'مساعدة', 'ساعد', 'اساعد', 'أساعد', 'اساعدك', 'أساعدك', 'هساعدك', 'ساعدني', 'مساعد', 'دعم', 'خدمة',
      'أستطيع', 'استطيع', 'يمكنني', 'محتاج', 'أحتاج', 'احتاج', 'عايز', 'تقدر', 'أقدر', 'اقدر', 'ممكن', 'دكتور',
    ],
    oscillation: 'nod',
    pose: {
      wristPitch: 0.05,
      wristYaw: -0.3,
      wristRoll: -0.55,
      armElevation: 0.22,
      splay: 0.02,
      thumbAbduct: 0.72,
      thumbCurl: [0.02, 0.02],
      index: [1.32, 1.38, 0.95],
      middle: [1.35, 1.4, 0.95],
      ring: [1.35, 1.4, 0.95],
      pinky: [1.35, 1.4, 0.95],
    },
    servoTargets: [0, 175, 175, 175, 175],
  },
  STOP: {
    id: 'STOP',
    glossEn: 'Stop / Halt',
    glossAr: 'توقف / إيقاف',
    category: 'command',
    descriptionAr: 'كف مفرود ومشدود للأمام لإيقاف الحركة فوراً.',
    keywords: [
      'stop', 'halt', 'wait', 'off', 'close', 'disable', 'pause',
      'توقف', 'قف', 'استنى', 'اقفل', 'أوقف', 'وقف', 'وقّف', 'إيقاف', 'اطفئ', 'أطفئ', 'اطفي', 'إطفاء', 'انطفئ', 'مطفأ',
    ],
    oscillation: 'none',
    pose: {
      wristPitch: -0.22,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.16,
      splay: 0.05,
      thumbAbduct: 0.52,
      thumbCurl: [0.05, 0.05],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [0.0, 0.0, 0.0],
      pinky: [0.0, 0.0, 0.0],
    },
    servoTargets: [10, 0, 0, 0, 0],
  },
  GO: {
    id: 'GO',
    glossEn: 'Go / Execute',
    glossAr: 'تشغيل / تنفيذ',
    category: 'command',
    descriptionAr: 'توجيه السبابة للأمام لبدء التنفيذ أو التشغيل.',
    keywords: [
      'go', 'start', 'run', 'open', 'on', 'execute', 'send', 'active', 'motor', 'now', 'fast', 'tomorrow', 'street',
      'انطلق', 'ابدأ', 'نبدأ', 'شغل', 'شغّل', 'تشغيل', 'افتح', 'نفذ', 'تنفيذ', 'انفذلك', 'أنفذلك',
      'ارسل', 'أرسل', 'إرسال', 'ابعت', 'بعتها', 'موتور', 'محرك', 'حرك', 'تحريك', 'دلوقتي', 'حالاً', 'حالا', 'فوراً', 'اعمل', 'نعمل', 'تعملها',
      'بسرعة', 'بكرة', 'شارع',
    ],
    oscillation: 'nod',
    pose: {
      wristPitch: 0.35,
      wristYaw: 0.08,
      wristRoll: 0,
      armElevation: 0.12,
      splay: 0.04,
      thumbAbduct: 0.35,
      thumbCurl: [0.7, 0.65],
      index: [0.05, 0.05, 0.04],
      middle: [1.35, 1.38, 0.9],
      ring: [1.38, 1.4, 0.9],
      pinky: [1.38, 1.4, 0.9],
    },
    servoTargets: [110, 0, 175, 175, 175],
  },
  GOOD: {
    id: 'GOOD',
    glossEn: 'Good / Excellent',
    glossAr: 'ممتاز / جيد',
    category: 'emotion',
    descriptionAr: 'إبهام مرفوع للأعلى دلالة على الجودة والرضا.',
    keywords: [
      'good', 'great', 'nice', 'excellent', 'fine', 'well', 'best', 'awesome', 'laugh', 'smile',
      'جيد', 'ممتاز', 'رائع', 'كويس', 'عظيم', 'بخير', 'سرور', 'أحسن', 'افضل', 'أفضل',
      'حلو', 'أوي', 'اوي', 'يضحك', 'افردها',
    ],
    oscillation: 'pulse',
    pose: {
      wristPitch: 0,
      wristYaw: 0.15,
      wristRoll: -0.75,
      armElevation: 0.14,
      splay: 0,
      thumbAbduct: 0.78,
      thumbCurl: [0.0, 0.0],
      index: [1.38, 1.42, 0.95],
      middle: [1.4, 1.42, 0.95],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.42, 0.95],
    },
    servoTargets: [0, 180, 180, 180, 180],
  },
  OK: {
    id: 'OK',
    glossEn: 'OK / Verified',
    glossAr: 'تم / صحيح',
    category: 'command',
    descriptionAr: 'دائرة الإبهام والسبابة مع فرد باقي الأصابع.',
    keywords: ['ok', 'okay', 'done', 'verified', 'success', 'completed', 'أوكي', 'تم', 'مضبوط', 'صحيح', 'بنجاح', 'اكتمل'],
    oscillation: 'none',
    pose: {
      wristPitch: -0.05,
      wristYaw: 0.12,
      wristRoll: 0,
      armElevation: 0.12,
      splay: 0.12,
      thumbAbduct: 0.45,
      thumbCurl: [0.68, 0.58],
      index: [0.98, 0.88, 0.52],
      middle: [0.04, 0.04, 0.03],
      ring: [0.04, 0.04, 0.03],
      pinky: [0.04, 0.04, 0.03],
    },
    servoTargets: [105, 115, 0, 0, 0],
  },
  PEACE: {
    id: 'PEACE',
    glossEn: 'Peace / Victory',
    glossAr: 'سلام / نصر',
    category: 'emotion',
    descriptionAr: 'رفع السبابة والوسطى على شكل حرف V.',
    keywords: ['peace', 'victory', 'أمان', 'امان', 'نصر', 'هدوء'],
    oscillation: 'pulse',
    pose: {
      wristPitch: -0.04,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.14,
      splay: 0.22,
      thumbAbduct: 0.25,
      thumbCurl: [0.85, 0.85],
      index: [0.02, 0.02, 0.02],
      middle: [0.02, 0.02, 0.02],
      ring: [1.38, 1.42, 0.95],
      pinky: [1.38, 1.42, 0.95],
    },
    servoTargets: [140, 0, 0, 180, 180],
  },
  POINT: {
    id: 'POINT',
    glossEn: 'Point / You / This',
    glossAr: 'أنت / هذا / إشارة',
    category: 'command',
    descriptionAr: 'رفع السبابة لتوجيه الانتباه أو الإشارة.',
    keywords: [
      'point', 'look', 'this', 'that', 'you', 'here', 'there', 'attention',
      'اشر', 'أشر', 'انظر', 'انتباه', 'هنا', 'هناك', 'هذا', 'هذه', 'أنت', 'انت', 'هو', 'هي', 'إشارة', 'اشارة', 'إشارتك', 'اشارتك',
      'ده', 'دي', 'دول', 'بص', 'كده', 'عليك', 'لك', 'ليك',
    ],
    oscillation: 'none',
    pose: {
      wristPitch: 0.12,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.14,
      splay: 0.04,
      thumbAbduct: 0.25,
      thumbCurl: [0.82, 0.82],
      index: [0.02, 0.02, 0.02],
      middle: [1.38, 1.42, 0.95],
      ring: [1.38, 1.42, 0.95],
      pinky: [1.38, 1.42, 0.95],
    },
    servoTargets: [135, 0, 180, 180, 180],
  },
  FIST: {
    id: 'FIST',
    glossEn: 'Grip / Fist',
    glossAr: 'قبضة / إمساك',
    category: 'command',
    descriptionAr: 'إغلاق كامل الأصابع للقبض أو الإمساك.',
    keywords: ['fist', 'grab', 'hold', 'grip', 'قبضة', 'امسك', 'إمساك', 'اغلق', 'قوي', 'قوة'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.06,
      splay: 0,
      thumbAbduct: 0.2,
      thumbCurl: [0.9, 0.92],
      index: [1.4, 1.45, 0.98],
      middle: [1.42, 1.45, 0.98],
      ring: [1.42, 1.45, 0.98],
      pinky: [1.42, 1.45, 0.98],
    },
    servoTargets: [155, 180, 180, 180, 180],
  },
  OPEN_HAND: {
    id: 'OPEN_HAND',
    glossEn: 'Open Hand / All',
    glossAr: 'يد مفتوحة / الكل',
    category: 'command',
    descriptionAr: 'فرد جميع الأصابع الخمسة بالكامل.',
    keywords: [
      'open', 'release', 'hand', 'all', 'everything', 'book', 'home', 'house', 'room', 'today', 'window',
      'يد', 'فتح', 'بسط', 'الكل', 'جميع', 'كل', 'سوا', 'معاً', 'معا', 'موضوع', 'حاجة', 'شيء', 'أي', 'اي',
      'كتاب', 'بيت', 'منزل', 'أوضة', 'النهاردة', 'شباك', 'كلية', 'الجمعة', 'ارمي', 'ضهرك',
    ],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.18,
      thumbAbduct: 0.72,
      thumbCurl: [0.0, 0.0],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [0.0, 0.0, 0.0],
      pinky: [0.0, 0.0, 0.0],
    },
    servoTargets: [0, 0, 0, 0, 0],
  },
  COUNT_1: {
    id: 'COUNT_1',
    glossEn: 'Number 1 / I / Me',
    glossAr: 'واحد / أنا',
    category: 'number',
    descriptionAr: 'رفع إصبع السبابة فقط.',
    keywords: ['one', '1', 'i', 'me', 'واحد', '١', 'أنا', 'انا', 'أول', 'اول', 'عندي', 'معي', 'معاك', 'معايا'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.05,
      thumbAbduct: 0.22,
      thumbCurl: [0.85, 0.85],
      index: [0.0, 0.0, 0.0],
      middle: [1.4, 1.42, 0.95],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.42, 0.95],
    },
    servoTargets: [140, 0, 180, 180, 180],
  },
  COUNT_2: {
    id: 'COUNT_2',
    glossEn: 'Number 2',
    glossAr: 'رقم ٢ (اثنان)',
    category: 'number',
    descriptionAr: 'رفع السبابة والوسطى.',
    keywords: ['two', '2', 'both', 'اثنان', 'اتنين', '٢', 'ثاني', 'تاني'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.16,
      thumbAbduct: 0.22,
      thumbCurl: [0.85, 0.85],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.42, 0.95],
    },
    servoTargets: [140, 0, 0, 180, 180],
  },
  COUNT_3: {
    id: 'COUNT_3',
    glossEn: 'Number 3',
    glossAr: 'رقم ٣ (ثلاثة)',
    category: 'number',
    descriptionAr: 'رفع الإبهام والسبابة والوسطى.',
    keywords: ['three', '3', 'ثلاثة', 'تلاتة', '٣'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.14,
      thumbAbduct: 0.65,
      thumbCurl: [0.05, 0.05],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.42, 0.95],
    },
    servoTargets: [0, 0, 0, 180, 180],
  },
  COUNT_4: {
    id: 'COUNT_4',
    glossEn: 'Number 4',
    glossAr: 'رقم ٤ (أربعة)',
    category: 'number',
    descriptionAr: 'رفع أربعة أصابع مع طي الإبهام.',
    keywords: ['four', '4', 'أربعة', 'اربعة', '٤'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.14,
      thumbAbduct: 0.18,
      thumbCurl: [0.95, 0.95],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [0.0, 0.0, 0.0],
      pinky: [0.0, 0.0, 0.0],
    },
    servoTargets: [155, 0, 0, 0, 0],
  },
  COUNT_5: {
    id: 'COUNT_5',
    glossEn: 'Number 5',
    glossAr: 'رقم ٥ (خمسة)',
    category: 'number',
    descriptionAr: 'رفع جميع الأصابع الخمسة متباعدة.',
    keywords: ['five', '5', 'خمسة', '٥'],
    oscillation: 'none',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.1,
      splay: 0.2,
      thumbAbduct: 0.75,
      thumbCurl: [0.0, 0.0],
      index: [0.0, 0.0, 0.0],
      middle: [0.0, 0.0, 0.0],
      ring: [0.0, 0.0, 0.0],
      pinky: [0.0, 0.0, 0.0],
    },
    servoTargets: [0, 0, 0, 0, 0],
  },
  RAISE_HAND: {
    id: 'RAISE_HAND',
    glossEn: 'Raise Hand / Arm',
    glossAr: 'رفع الذراع / اليد',
    category: 'command',
    descriptionAr: 'رفع الساعد والكف لأعلى نقطة استجابة لطلب المستخدم.',
    keywords: ['raise', 'up', 'lift', 'arm', 'angle', 'ارفع', 'رفع', 'فوق', 'أعلى', 'اعلى', 'ذراع', 'الذراع', 'زاوية'],
    oscillation: 'pulse',
    pose: {
      wristPitch: -0.1,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.42,
      splay: 0.1,
      thumbAbduct: 0.55,
      thumbCurl: [0.05, 0.05],
      index: [0.02, 0.02, 0.02],
      middle: [0.02, 0.02, 0.02],
      ring: [0.02, 0.02, 0.02],
      pinky: [0.02, 0.02, 0.02],
    },
    servoTargets: [0, 0, 0, 0, 0],
  },
  CALL_ME: {
    id: 'CALL_ME',
    glossEn: 'Connect / Communicate',
    glossAr: 'تواصل / كلام',
    category: 'greeting',
    descriptionAr: 'فرد الإبهام والخنصر إشارةً إلى التواصل والاتصال.',
    keywords: [
      'call', 'connect', 'contact', 'speak', 'talk', 'message', 'voice', 'chat', 'internet',
      'تواصل', 'اتصال', 'كلمني', 'اتكلم', 'نتكلم', 'تحدث', 'حديث', 'كلام', 'رسالة', 'صوت', 'بالصوت',
      'إنترنت', 'انترنت', 'ربط', 'شبكة', 'قول', 'قولي', 'أشرح', 'اشرح', 'أترجم', 'اترجم', 'رد', 'ردودي', 'لغة', 'مصرية', 'مصري',
    ],
    oscillation: 'shake',
    pose: {
      wristPitch: 0.05,
      wristYaw: -0.18,
      wristRoll: -0.35,
      armElevation: 0.14,
      splay: 0.15,
      thumbAbduct: 0.75,
      thumbCurl: [0.02, 0.02],
      index: [1.38, 1.42, 0.95],
      middle: [1.4, 1.42, 0.95],
      ring: [1.4, 1.42, 0.95],
      pinky: [0.02, 0.02, 0.02],
    },
    servoTargets: [0, 180, 180, 180, 0],
  },
  QUESTION: {
    id: 'QUESTION',
    glossEn: 'Question / Why / How',
    glossAr: 'سؤال / كيف / ماذا',
    category: 'greeting',
    descriptionAr: 'سبابة معقوفة بشكل علامة استفهام للاستفسار والسؤال.',
    keywords: [
      'what', 'why', 'how', 'when', 'where', 'who', 'question', 'ask', 'confused',
      'ماذا', 'لماذا', 'كيف', 'متى', 'أين', 'اين', 'من', 'هل', 'ما', 'اسأل', 'استفسار',
      'سؤال', 'إزاي', 'ازاي', 'إيه', 'ايه', 'فين', 'امتى', 'إمتى', 'ليه', 'مين', 'تحب', 'عامل',
      'مشوش', 'مكار', 'يا', 'لهوي',
    ],
    oscillation: 'shake',
    pose: {
      wristPitch: -0.05,
      wristYaw: 0.12,
      wristRoll: 0.15,
      armElevation: 0.16,
      splay: 0.04,
      thumbAbduct: 0.35,
      thumbCurl: [0.75, 0.65],
      index: [0.48, 0.82, 0.65],
      middle: [1.38, 1.42, 0.95],
      ring: [1.4, 1.42, 0.95],
      pinky: [1.4, 1.42, 0.95],
    },
    servoTargets: [115, 75, 180, 180, 180],
  },
  LIGHT: {
    id: 'LIGHT',
    glossEn: 'Light / LED / Shine',
    glossAr: 'إضاءة / مصباح',
    category: 'command',
    descriptionAr: 'تفتح الأصابع للأعلى مع حركة إشعاع دلالة على الضوء والمصباح.',
    keywords: ['light', 'led', 'lamp', 'bright', 'on', 'مصباح', 'ضوء', 'إضاءة', 'اضاءة', 'أضئ', 'اضئ', 'لمبة', 'نور', 'مضاء', 'منور'],
    oscillation: 'pulse',
    pose: {
      wristPitch: -0.18,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.24,
      splay: 0.24,
      thumbAbduct: 0.72,
      thumbCurl: [0.15, 0.1],
      index: [0.18, 0.12, 0.08],
      middle: [0.18, 0.12, 0.08],
      ring: [0.18, 0.12, 0.08],
      pinky: [0.18, 0.12, 0.08],
    },
    servoTargets: [10, 15, 15, 15, 15],
  },
  ROBOT: {
    id: 'ROBOT',
    glossEn: 'Robot / ESP32 / System',
    glossAr: 'روبوت / نظام',
    category: 'command',
    descriptionAr: 'وضعية مفاصل ميكانيكية قائمة تمثل الروبوت أو وحدة التحكم.',
    keywords: [
      'robot', 'esp32', 'mqtt', 'servo', 'device', 'system', 'ai', 'car', 'engineer', 'plumber',
      'روبوت', 'الروبوت', 'جهاز', 'ذكاء', 'اصطناعي', 'نظام', 'سيرفر', 'مفصل', 'أوامرك', 'أوامر',
      'عربية', 'مهندس', 'سباك',
    ],
    oscillation: 'pulse',
    pose: {
      wristPitch: 0,
      wristYaw: 0,
      wristRoll: 0,
      armElevation: 0.14,
      splay: 0.08,
      thumbAbduct: 0.55,
      thumbCurl: [0.75, 0.05],
      index: [0.75, 0.85, 0.05],
      middle: [0.75, 0.85, 0.05],
      ring: [0.75, 0.85, 0.05],
      pinky: [0.75, 0.85, 0.05],
    },
    servoTargets: [85, 90, 90, 90, 90],
  },
};

export const SIGN_LIST: SignDefinition[] = Object.values(SIGN_LEXICON);

const ALL_SIGN_IDS = new Set<string>(Object.keys(SIGN_LEXICON));

// Distinct handshape poses for Arabic & English fingerspelling of words outside the word lexicon
const LETTER_POSES: HandPose[] = [
  // 0: Alif / A (fist with thumb up/side)
  { wristPitch: 0, wristYaw: 0, wristRoll: 0, armElevation: 0.1, splay: 0, thumbAbduct: 0.58, thumbCurl: [0.05, 0.05], index: [1.35, 1.4, 0.9], middle: [1.38, 1.42, 0.9], ring: [1.38, 1.42, 0.9], pinky: [1.38, 1.42, 0.9] },
  // 1: Baa / B (4 fingers up, thumb folded)
  { wristPitch: 0, wristYaw: 0, wristRoll: 0, armElevation: 0.1, splay: 0.05, thumbAbduct: 0.2, thumbCurl: [0.9, 0.9], index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], pinky: [0, 0, 0] },
  // 2: Taa / C (curved C shape)
  { wristPitch: 0.05, wristYaw: -0.25, wristRoll: 0, armElevation: 0.12, splay: 0.04, thumbAbduct: 0.55, thumbCurl: [0.42, 0.35], index: [0.55, 0.65, 0.45], middle: [0.58, 0.68, 0.45], ring: [0.6, 0.7, 0.45], pinky: [0.62, 0.72, 0.45] },
  // 3: Jeem / D (index up, others meet thumb)
  { wristPitch: 0, wristYaw: 0.05, wristRoll: 0, armElevation: 0.12, splay: 0.04, thumbAbduct: 0.35, thumbCurl: [0.6, 0.55], index: [0.02, 0.02, 0.02], middle: [1.05, 0.95, 0.6], ring: [1.1, 1.0, 0.65], pinky: [1.15, 1.05, 0.65] },
  // 4: Sheen / W (3 middle fingers up)
  { wristPitch: 0, wristYaw: 0, wristRoll: 0, armElevation: 0.12, splay: 0.16, thumbAbduct: 0.25, thumbCurl: [0.85, 0.85], index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], pinky: [1.35, 1.4, 0.9] },
  // 5: Faa / F (thumb & index circle, 3 fingers up)
  { wristPitch: -0.04, wristYaw: 0.1, wristRoll: 0, armElevation: 0.12, splay: 0.12, thumbAbduct: 0.45, thumbCurl: [0.68, 0.58], index: [0.95, 0.85, 0.5], middle: [0.03, 0.03, 0.02], ring: [0.03, 0.03, 0.02], pinky: [0.03, 0.03, 0.02] },
  // 6: Kaf / K (index & middle open, thumb between)
  { wristPitch: 0, wristYaw: 0.08, wristRoll: 0, armElevation: 0.12, splay: 0.2, thumbAbduct: 0.55, thumbCurl: [0.15, 0.1], index: [0.02, 0.02, 0.02], middle: [0.35, 0.15, 0.05], ring: [1.38, 1.42, 0.95], pinky: [1.38, 1.42, 0.95] },
  // 7: Lam / L (index & thumb L shape)
  { wristPitch: 0, wristYaw: 0, wristRoll: 0, armElevation: 0.12, splay: 0.06, thumbAbduct: 0.8, thumbCurl: [0, 0], index: [0, 0, 0], middle: [1.38, 1.42, 0.95], ring: [1.38, 1.42, 0.95], pinky: [1.38, 1.42, 0.95] },
  // 8: Meem / M (3 fingers bent over thumb)
  { wristPitch: 0.15, wristYaw: 0, wristRoll: 0, armElevation: 0.1, splay: 0, thumbAbduct: 0.22, thumbCurl: [0.9, 0.9], index: [1.15, 1.1, 0.75], middle: [1.15, 1.1, 0.75], ring: [1.15, 1.1, 0.75], pinky: [1.4, 1.42, 0.95] },
  // 9: Yaa / Y (thumb & pinky out)
  { wristPitch: 0, wristYaw: -0.1, wristRoll: 0, armElevation: 0.12, splay: 0.14, thumbAbduct: 0.76, thumbCurl: [0.02, 0.02], index: [1.38, 1.42, 0.95], middle: [1.4, 1.42, 0.95], ring: [1.4, 1.42, 0.95], pinky: [0.02, 0.02, 0.02] },
  // 10: Raa / R (crossed index & middle)
  { wristPitch: 0, wristYaw: 0.05, wristRoll: 0, armElevation: 0.12, splay: -0.06, thumbAbduct: 0.25, thumbCurl: [0.85, 0.85], index: [0.05, 0.12, 0.05], middle: [0.18, 0.1, 0.05], ring: [1.38, 1.42, 0.95], pinky: [1.38, 1.42, 0.95] },
  // 11: Seen / S (tight fist, thumb in front)
  { wristPitch: 0, wristYaw: 0, wristRoll: 0, armElevation: 0.1, splay: 0, thumbAbduct: 0.22, thumbCurl: [0.88, 0.9], index: [1.42, 1.45, 0.98], middle: [1.42, 1.45, 0.98], ring: [1.42, 1.45, 0.98], pinky: [1.42, 1.45, 0.98] },
];

const ARABIC_CHAR_MAP: Record<string, { label: string; poseIdx: number }> = {
  ا: { label: 'أ', poseIdx: 0 }, أ: { label: 'أ', poseIdx: 0 }, إ: { label: 'إ', poseIdx: 0 }, آ: { label: 'آ', poseIdx: 0 },
  ب: { label: 'ب', poseIdx: 1 }, ت: { label: 'ت', poseIdx: 2 }, ة: { label: 'ة', poseIdx: 2 }, ث: { label: 'ث', poseIdx: 4 },
  ج: { label: 'ج', poseIdx: 3 }, ح: { label: 'ح', poseIdx: 2 }, خ: { label: 'خ', poseIdx: 3 }, د: { label: 'د', poseIdx: 3 },
  ذ: { label: 'ذ', poseIdx: 3 }, ر: { label: 'ر', poseIdx: 10 }, ز: { label: 'ز', poseIdx: 10 }, س: { label: 'س', poseIdx: 11 },
  ش: { label: 'ش', poseIdx: 4 }, ص: { label: 'ص', poseIdx: 11 }, ض: { label: 'ض', poseIdx: 11 }, ط: { label: 'ط', poseIdx: 7 },
  ظ: { label: 'ظ', poseIdx: 7 }, ع: { label: 'ع', poseIdx: 2 }, غ: { label: 'غ', poseIdx: 2 }, ف: { label: 'ف', poseIdx: 5 },
  ق: { label: 'ق', poseIdx: 6 }, ك: { label: 'ك', poseIdx: 6 }, ل: { label: 'ل', poseIdx: 7 }, م: { label: 'م', poseIdx: 8 },
  ن: { label: 'ن', poseIdx: 8 }, ه: { label: 'ه', poseIdx: 1 }, و: { label: 'و', poseIdx: 9 }, ي: { label: 'ي', poseIdx: 9 },
  ى: { label: 'ى', poseIdx: 9 }, ئ: { label: 'ئ', poseIdx: 9 },
};

export function isValidSignId(value: string): value is SignId {
  return ALL_SIGN_IDS.has(value);
}

/**
 * Normalizes AI-returned sign gloss strings into valid SignId entries.
 */
export function normalizeSignSequence(glosses: unknown): SignId[] {
  if (!Array.isArray(glosses)) {
    return ['HELLO'];
  }
  const result: SignId[] = [];
  for (const item of glosses) {
    if (typeof item !== 'string') continue;
    const upper = item.trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (isValidSignId(upper)) {
      if (result[result.length - 1] !== upper) {
        result.push(upper);
      }
    }
  }
  return result.length > 0 ? result : ['OPEN_HAND'];
}

function stripArabicDiacriticsAndPrefixes(word: string): string[] {
  const noDiacritics = word.replace(/[\u064B-\u065F\u0670]/g, '');
  const forms = [noDiacritics];
  // Strip common 1-2 char Arabic proclitics (و، ف، ب، ك، ل، ال)
  const strippedPref = noDiacritics.replace(/^(و|ف|ب|ك|ل)(?=[\u0621-\u064A]{2,})/, '');
  if (strippedPref !== noDiacritics) forms.push(strippedPref);
  for (const f of [...forms]) {
    if (f.startsWith('ال') && f.length > 3) {
      forms.push(f.slice(2));
    }
  }
  return forms;
}

const KEYWORD_TO_SIGN = new Map<string, SignId>();
for (const sign of SIGN_LIST) {
  if (sign.id === 'REST') continue;
  for (const kw of sign.keywords) {
    KEYWORD_TO_SIGN.set(kw.toLowerCase(), sign.id);
  }
}

const SELF_NAME_TOKENS = new Set([
  'jisrbot',
  'jisr',
  'جسر',
  'جيسر',
  'جسربوت',
  'جيسربوت',
]);

const EXPRESSIVE_WORD_GESTURES: SignId[] = [
  'OPEN_HAND',
  'CALL_ME',
  'POINT',
  'GOOD',
  'HELP',
  'OK',
  'GO',
  'ROBOT',
];

function inferWholeWordGesture(word: string): SignId {
  const clean = word.trim().toLowerCase();
  if (!clean) return 'OPEN_HAND';
  // Light semantic prefix/pattern hints for Egyptian & standard Arabic stems
  if (/^(ب|م|ي|ت|ن)?(كلم|قول|شرح|ترجم|سمع|صوت|رد)/.test(clean)) return 'CALL_ME';
  if (/^(ب|م|ي|ت|ن)?(ساعد|عاوز|عايز|محتاج|طلب|خدم)/.test(clean)) return 'HELP';
  if (/^(ب|م|ي|ت|ن)?(عمل|شغل|حرك|نفذ|روح|بد|بعت)/.test(clean)) return 'GO';
  if (/^(ب|م|ي|ت|ن)?(فهم|عرف|صح|تمام|اكيد|مظبوط)/.test(clean)) return 'OK';
  if (/^(ب|م|ي|ت|ن)?(وقف|قفل|طفي|منع|مش)/.test(clean)) return 'STOP';
  if (/^(ب|م|ي|ت|ن)?(نور|ضو|لمب)/.test(clean)) return 'LIGHT';
  if (/^(ه|د|ذ|ك|ل|ف|م).{1,3}$/.test(clean)) return 'POINT';
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return EXPRESSIVE_WORD_GESTURES[hash % EXPRESSIVE_WORD_GESTURES.length];
}

/**
 * Translates an ENTIRE Arabic/English AI response sentence word-by-word into playable 3D sign steps
 * using ONLY full semantic gestures and whole-word signs.
 * Individual fingerspelling letters are used EXCLUSIVELY when saying the assistant's own name (JisrBot / جسر).
 */
export function translateSentenceToSignSteps(text: string): SignStep[] {
  const cleaned = text
    .replace(/[*_`~#>•\-—]/g, ' ')
    .replace(/[،؛:.!؟?()[\]{}"'«»/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return [
      {
        key: 'step_0_REST',
        signId: 'REST',
        sourceWord: 'استعداد',
        glossAr: SIGN_LEXICON.REST.glossAr,
        glossEn: SIGN_LEXICON.REST.glossEn,
        descriptionAr: SIGN_LEXICON.REST.descriptionAr,
        oscillation: SIGN_LEXICON.REST.oscillation,
        pose: SIGN_LEXICON.REST.pose,
        durationMs: 1100,
      },
    ];
  }

  const words = cleaned.split(' ').filter((w) => w.length > 0);
  const steps: SignStep[] = [];

  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const rawWord = words[wIdx];
    const lower = rawWord.toLowerCase();
    const candidates = stripArabicDiacriticsAndPrefixes(lower);

    // 1. Only fingerspell letters when saying the assistant's own name (JisrBot / جسر)
    if (candidates.some((c) => SELF_NAME_TOKENS.has(c))) {
      const nameChars = Array.from(lower).filter((ch) => /[a-z\u0621-\u064A]/i.test(ch));
      nameChars.forEach((ch, cIdx) => {
        const arInfo = ARABIC_CHAR_MAP[ch];
        const poseIdx = arInfo
          ? arInfo.poseIdx
          : Math.abs(ch.toUpperCase().charCodeAt(0) - 65) % LETTER_POSES.length;
        const letterLabel = arInfo ? arInfo.label : ch.toUpperCase();
        steps.push({
          key: `w_${wIdx}_ch_${cIdx}_${letterLabel}`,
          signId: `LETTER_${letterLabel}`,
          sourceWord: rawWord,
          glossAr: `هجاء الاسم "${rawWord}" (${letterLabel})`,
          glossEn: `Spell Name "${rawWord}" (${letterLabel})`,
          descriptionAr: `تهجئة حرف (${letterLabel}) لقول اسم ${rawWord}`,
          oscillation: 'none',
          pose: LETTER_POSES[poseIdx],
          durationMs: 620,
          isFingerspelled: true,
        });
      });
      continue;
    }

    // 2. Semantic keyword lookup (whole word -> dedicated gesture)
    let matchedId: SignId | undefined;
    for (const candidate of candidates) {
      matchedId = KEYWORD_TO_SIGN.get(candidate);
      if (matchedId) break;
    }

    if (matchedId) {
      const def = SIGN_LEXICON[matchedId];
      steps.push({
        key: `w_${wIdx}_${def.id}`,
        signId: def.id,
        sourceWord: rawWord,
        glossAr: def.glossAr,
        glossEn: def.glossEn,
        descriptionAr: def.descriptionAr,
        oscillation: def.oscillation,
        pose: def.pose,
        durationMs: 1050,
        isFingerspelled: false,
      });
      continue;
    }

    // 3. Numeric word mapping
    if (/^\d+$/.test(rawWord)) {
      const firstDigit = rawWord[0];
      const numSignMap: Record<string, SignId> = {
        '1': 'COUNT_1',
        '2': 'COUNT_2',
        '3': 'COUNT_3',
        '4': 'COUNT_4',
        '5': 'COUNT_5',
      };
      const digitSign = numSignMap[firstDigit] ?? 'COUNT_5';
      const def = SIGN_LEXICON[digitSign];
      steps.push({
        key: `w_${wIdx}_NUM_${rawWord}`,
        signId: def.id,
        sourceWord: rawWord,
        glossAr: `${rawWord} (${def.glossAr})`,
        glossEn: `Number ${rawWord}`,
        descriptionAr: `تمثيل العدد ${rawWord} بلغة الإشارة`,
        oscillation: 'pulse',
        pose: def.pose,
        durationMs: 950,
        isFingerspelled: false,
      });
      continue;
    }

    // 4. Whole-word expressive gesture (NO letters/fingerspelling for regular words!)
    const inferredSignId = inferWholeWordGesture(candidates[candidates.length - 1] || lower);
    const def = SIGN_LEXICON[inferredSignId];
    steps.push({
      key: `w_${wIdx}_WORD_${def.id}`,
      signId: def.id,
      sourceWord: rawWord,
      glossAr: `${rawWord} (${def.glossAr})`,
      glossEn: `${rawWord} (${def.glossEn})`,
      descriptionAr: `حركة تعبيرية كاملة لكلمة "${rawWord}" بدون حروف`,
      oscillation: def.oscillation,
      pose: def.pose,
      durationMs: 950,
      isFingerspelled: false,
    });
  }

  return steps;
}

/**
 * Legacy helper returning SignIds for summary badges or ESP32 servo dispatch.
 */
export function textToSignSequence(text: string): SignId[] {
  const steps = translateSentenceToSignSteps(text);
  const semanticIds: SignId[] = [];
  const fallbackIds: SignId[] = [];
  for (const st of steps) {
    if (!isValidSignId(st.signId)) continue;
    if (st.key.includes('_WORD_')) {
      if (fallbackIds[fallbackIds.length - 1] !== st.signId) {
        fallbackIds.push(st.signId);
      }
    } else if (semanticIds[semanticIds.length - 1] !== st.signId) {
      semanticIds.push(st.signId);
    }
  }
  if (semanticIds.length > 0) return semanticIds;
  return fallbackIds.length > 0 ? fallbackIds : ['OPEN_HAND'];
}

export function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateHandPose(from: HandPose, to: HandPose, alpha: number): HandPose {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    wristPitch: lerpNum(from.wristPitch, to.wristPitch, t),
    wristYaw: lerpNum(from.wristYaw, to.wristYaw, t),
    wristRoll: lerpNum(from.wristRoll, to.wristRoll, t),
    armElevation: lerpNum(from.armElevation, to.armElevation, t),
    splay: lerpNum(from.splay, to.splay, t),
    thumbAbduct: lerpNum(from.thumbAbduct, to.thumbAbduct, t),
    thumbCurl: [
      lerpNum(from.thumbCurl[0], to.thumbCurl[0], t),
      lerpNum(from.thumbCurl[1], to.thumbCurl[1], t),
    ],
    index: [
      lerpNum(from.index[0], to.index[0], t),
      lerpNum(from.index[1], to.index[1], t),
      lerpNum(from.index[2], to.index[2], t),
    ],
    middle: [
      lerpNum(from.middle[0], to.middle[0], t),
      lerpNum(from.middle[1], to.middle[1], t),
      lerpNum(from.middle[2], to.middle[2], t),
    ],
    ring: [
      lerpNum(from.ring[0], to.ring[0], t),
      lerpNum(from.ring[1], to.ring[1], t),
      lerpNum(from.ring[2], to.ring[2], t),
    ],
    pinky: [
      lerpNum(from.pinky[0], to.pinky[0], t),
      lerpNum(from.pinky[1], to.pinky[1], t),
      lerpNum(from.pinky[2], to.pinky[2], t),
    ],
  };
}
