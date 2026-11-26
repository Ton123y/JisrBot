import type { RobotCommandPayload } from './esp32Codegen';
import type { SignId } from './signLanguage';

export interface SuggestedRobotChatPrompt {
  id: string;
  label: string;
  category: 'إضاءة' | 'الذراع' | 'الموتور' | 'إشارات' | 'حركات مركبة';
  prompt: string;
}

export interface RobotHardwarePreset {
  id: string;
  label: string;
  category: 'إضاءة وطوارئ' | 'زوايا الذراع' | 'سرعة الموتور' | 'إشارات اليد';
  payload: {
    action: RobotCommandPayload['action'];
    ledState?: boolean;
    armAngle?: number;
    motorSpeed?: number;
    signGesture?: SignId;
    note: string;
  };
}

export interface RobotRoutinePreset {
  id: string;
  label: string;
  description: string;
  steps: Array<{
    action: RobotCommandPayload['action'];
    ledState?: boolean;
    armAngle?: number;
    motorSpeed?: number;
    signGesture?: SignId;
    note: string;
  }>;
}

export const SUGGESTED_ROBOT_CHAT_PROMPTS: SuggestedRobotChatPrompt[] = [
  {
    id: 'led_on',
    label: 'شغّل النور',
    category: 'إضاءة',
    prompt: 'شغّل نور الروبوت (LED) دلوقتي.',
  },
  {
    id: 'led_off',
    label: 'اطفي النور',
    category: 'إضاءة',
    prompt: 'اطفي نور الروبوت (LED) دلوقتي.',
  },
  {
    id: 'wave_hello',
    label: 'سلّم ولوّح بيدك',
    category: 'إشارات',
    prompt: 'ارفع إيد الروبوت للزاوية 135 درجة ولوّح بإشارة السلام.',
  },
  {
    id: 'arm_up',
    label: 'ارفع الذراع 155°',
    category: 'الذراع',
    prompt: 'ارفع ذراع الروبوت للزاوية 155 درجة.',
  },
  {
    id: 'arm_mid',
    label: 'الذراع في النص 90°',
    category: 'الذراع',
    prompt: 'ظبّط زاوية ذراع الروبوت على 90 درجة في الوضع المحايد.',
  },
  {
    id: 'arm_down',
    label: 'نزّل الذراع 25°',
    category: 'الذراع',
    prompt: 'نزّل ذراع الروبوت لزاوية 25 درجة.',
  },
  {
    id: 'motor_60',
    label: 'شغّل الموتور 60%',
    category: 'الموتور',
    prompt: 'شغّل الموتور بسرعة متوسطة 60 في المية.',
  },
  {
    id: 'motor_fast',
    label: 'أقصى سرعة 95%',
    category: 'الموتور',
    prompt: 'زوّد سرعة الموتور لـ 95 في المية.',
  },
  {
    id: 'motor_stop',
    label: 'وقّف الموتور',
    category: 'الموتور',
    prompt: 'وقّف الموتور وخلي السرعة 0 في المية.',
  },
  {
    id: 'sign_good',
    label: 'اعمل إشارة ممتاز',
    category: 'إشارات',
    prompt: 'خلي إيد الروبوت تعمل إشارة ممتاز (GOOD).',
  },
  {
    id: 'sign_peace',
    label: 'علامة النصر / سلام',
    category: 'إشارات',
    prompt: 'خلي الروبوت يعمل إشارة سلام أو نصر بإيديه.',
  },
  {
    id: 'sign_love',
    label: 'إشارة بحبك',
    category: 'إشارات',
    prompt: 'خلي إيد الروبوت تعمل إشارة بحبك (LOVE).',
  },
  {
    id: 'routine_welcome',
    label: 'ترحيب + إضاءة',
    category: 'حركات مركبة',
    prompt: 'اعمل وضع الترحيب الكامل: شغّل النور، ارفع الذراع 140 درجة، واعمل إشارة مرحباً.',
  },
  {
    id: 'reset_all',
    label: 'وضع الراحة (Reset)',
    category: 'حركات مركبة',
    prompt: 'رجّع الروبوت لوضع الراحة واقفل النور والموتور.',
  },
];

export const ROBOT_HARDWARE_PRESETS: RobotHardwarePreset[] = [
  {
    id: 'hw_led_on',
    label: 'شغّل المصباح',
    category: 'إضاءة وطوارئ',
    payload: { action: 'set_led', ledState: true, note: 'تشغيل مصباح الروبوت' },
  },
  {
    id: 'hw_led_off',
    label: 'اطفي المصباح',
    category: 'إضاءة وطوارئ',
    payload: { action: 'set_led', ledState: false, note: 'إطفاء مصباح الروبوت' },
  },
  {
    id: 'hw_stop_motor',
    label: 'وقّف الموتور فوراً',
    category: 'إضاءة وطوارئ',
    payload: { action: 'set_motor_speed', motorSpeed: 0, note: 'إيقاف الموتور فوراً' },
  },
  {
    id: 'hw_reset',
    label: 'وضع الراحة الكامل',
    category: 'إضاءة وطوارئ',
    payload: { action: 'reset', note: 'إعادة ضبط الروبوت لوضع الراحة' },
  },
  {
    id: 'hw_arm_15',
    label: 'نزول كامل 15°',
    category: 'زوايا الذراع',
    payload: { action: 'set_arm_angle', armAngle: 15, note: 'نزول الذراع إلى 15°' },
  },
  {
    id: 'hw_arm_45',
    label: 'زاوية منخفضة 45°',
    category: 'زوايا الذراع',
    payload: { action: 'set_arm_angle', armAngle: 45, note: 'ضبط الذراع على 45°' },
  },
  {
    id: 'hw_arm_90',
    label: 'الوضع المحايد 90°',
    category: 'زوايا الذراع',
    payload: { action: 'set_arm_angle', armAngle: 90, note: 'ضبط الذراع على 90°' },
  },
  {
    id: 'hw_arm_135',
    label: 'رفع تحية 135°',
    category: 'زوايا الذراع',
    payload: { action: 'set_arm_angle', armAngle: 135, note: 'رفع الذراع للتحية 135°' },
  },
  {
    id: 'hw_arm_175',
    label: 'أقصى رفع 175°',
    category: 'زوايا الذراع',
    payload: { action: 'set_arm_angle', armAngle: 175, note: 'أقصى رفع للذراع 175°' },
  },
  {
    id: 'hw_motor_25',
    label: 'حركة هادية 25%',
    category: 'سرعة الموتور',
    payload: { action: 'set_motor_speed', motorSpeed: 25, note: 'سرعة موتور هادية 25%' },
  },
  {
    id: 'hw_motor_55',
    label: 'سرعة متوسطة 55%',
    category: 'سرعة الموتور',
    payload: { action: 'set_motor_speed', motorSpeed: 55, note: 'سرعة موتور متوسطة 55%' },
  },
  {
    id: 'hw_motor_85',
    label: 'سرعة عالية 85%',
    category: 'سرعة الموتور',
    payload: { action: 'set_motor_speed', motorSpeed: 85, note: 'سرعة موتور عالية 85%' },
  },
  {
    id: 'hw_motor_100',
    label: 'أقصى طاقة 100%',
    category: 'سرعة الموتور',
    payload: { action: 'set_motor_speed', motorSpeed: 100, note: 'أقصى سرعة للموتور 100%' },
  },
  {
    id: 'hw_sign_hello',
    label: 'إشارة مرحباً',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'HELLO', note: 'تنفيذ إشارة مرحباً' },
  },
  {
    id: 'hw_sign_good',
    label: 'إشارة ممتاز / تمام',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'GOOD', note: 'تنفيذ إشارة ممتاز' },
  },
  {
    id: 'hw_sign_peace',
    label: 'إشارة سلام / نصر',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'PEACE', note: 'تنفيذ إشارة سلام' },
  },
  {
    id: 'hw_sign_love',
    label: 'إشارة بحبك',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'LOVE', note: 'تنفيذ إشارة بحبك' },
  },
  {
    id: 'hw_sign_stop',
    label: 'إشارة توقف',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'STOP', note: 'تنفيذ إشارة توقف' },
  },
  {
    id: 'hw_sign_yes',
    label: 'إشارة أيوه / موافق',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'YES', note: 'تنفيذ إشارة موافقة' },
  },
  {
    id: 'hw_sign_no',
    label: 'إشارة لأ',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'NO', note: 'تنفيذ إشارة لا' },
  },
  {
    id: 'hw_sign_thanks',
    label: 'إشارة شكراً',
    category: 'إشارات اليد',
    payload: { action: 'perform_sign', signGesture: 'THANK_YOU', note: 'تنفيذ إشارة شكراً' },
  },
];

export const ROBOT_ROUTINE_PRESETS: RobotRoutinePreset[] = [
  {
    id: 'routine_greet',
    label: 'سيناريو الترحيب بالضيوف',
    description: 'نور شغّال + ذراع 140° + إشارة مرحباً',
    steps: [
      { action: 'set_led', ledState: true, note: 'تشغيل النور للترحيب' },
      { action: 'set_arm_angle', armAngle: 140, note: 'رفع الذراع للتحية' },
      { action: 'perform_sign', signGesture: 'HELLO', note: 'إشارة مرحباً' },
    ],
  },
  {
    id: 'routine_active',
    label: 'وضع العمل والتأهب',
    description: 'نور شغّال + موتور 60% + ذراع 110°',
    steps: [
      { action: 'set_led', ledState: true, note: 'تشغيل إضاءة العمل' },
      { action: 'set_arm_angle', armAngle: 110, note: 'تجهيز الذراع 110°' },
      { action: 'set_motor_speed', motorSpeed: 60, note: 'تشغيل الموتور 60%' },
    ],
  },
  {
    id: 'routine_approve',
    label: 'موافقة وتشجيع',
    description: 'إشارة ممتاز + ذراع 120° + نور شغّال',
    steps: [
      { action: 'set_led', ledState: true, note: 'إضاءة الموافقة' },
      { action: 'set_arm_angle', armAngle: 120, note: 'رفع الذراع 120°' },
      { action: 'perform_sign', signGesture: 'GOOD', note: 'إشارة ممتاز' },
    ],
  },
  {
    id: 'routine_rest',
    label: 'وضع الراحة وإطفاء كل شيء',
    description: 'إطفاء النور + موتور 0% + وضع REST',
    steps: [{ action: 'reset', note: 'الرجوع لوضع الراحة الكامل' }],
  },
];
