import React, { useState } from 'react';
import { Hand, Send } from 'lucide-react';
import { SIGN_LIST, type SignDefinition, type SignId } from '../lib/signLanguage';

interface SignLexiconPanelProps {
  activeSign: SignId;
  onPreviewSign: (signId: SignId) => void;
  onSendSignToEsp32: (sign: SignDefinition) => void;
}

const CATEGORIES: Array<{ id: 'all' | SignDefinition['category']; label: string }> = [
  { id: 'all', label: 'الكل' },
  { id: 'greeting', label: 'تحيات' },
  { id: 'command', label: 'أوامر' },
  { id: 'emotion', label: 'مشاعر' },
  { id: 'number', label: 'أرقام' },
];

export const SignLexiconPanel: React.FC<SignLexiconPanelProps> = ({
  activeSign,
  onPreviewSign,
  onSendSignToEsp32,
}) => {
  const [category, setCategory] = useState<'all' | SignDefinition['category']>('all');

  const filtered = category === 'all' ? SIGN_LIST : SIGN_LIST.filter((s) => s.category === category);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-4 border-b border-white/10 space-y-3">
        <div>
          <h2 className="text-base font-bold text-slate-100">قاموس لغة الإشارة ثلاثي الأبعاد</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            اضغط على أي إشارة لتجسيدها على نموذج اليد وإرسال زوايا السيرفو إلى ESP32
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0E14] rounded-lg border border-white/10 overflow-x-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                category === cat.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
        {filtered.map((sign) => {
          const isCurrent = activeSign === sign.id;
          return (
            <div
              key={sign.id}
              className={`p-3.5 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                isCurrent
                  ? 'bg-amber-500/10 border-amber-500/50'
                  : 'bg-[#0E131D] border-white/10 hover:border-white/20'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span className="font-mono-tech">{sign.id}</span>
                  <span className="font-mono-tech text-[11px] text-slate-500">
                    {sign.servoTargets.join('·')}
                  </span>
                </div>
                <h3 className="mt-1 text-sm font-bold text-slate-100">{sign.glossAr}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{sign.descriptionAr}</p>
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => onPreviewSign(sign.id)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#1A2130] text-slate-100 hover:bg-[#232C3F] transition-colors"
                >
                  <Hand className="w-3.5 h-3.5 text-amber-400" />
                  <span>معاينة 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSendSignToEsp32(sign)}
                  aria-label={`إرسال إشارة ${sign.glossAr} إلى ESP32`}
                  className="inline-flex items-center justify-center p-1.5 rounded-lg bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
