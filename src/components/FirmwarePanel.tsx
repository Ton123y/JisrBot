import React, { useState } from 'react';
import { Check, Copy, Download, Settings2 } from 'lucide-react';
import { generateEsp32Sketch, type MqttConfig } from '../lib/esp32Codegen';

interface FirmwarePanelProps {
  config: MqttConfig;
  onOpenConfig: () => void;
}

export const FirmwarePanel: React.FC<FirmwarePanelProps> = ({ config, onOpenConfig }) => {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const sketch = generateEsp32Sketch(config);

  const handleCopy = async () => {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(sketch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = sketch;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          return;
        }
      } catch {
        // fall through
      }
      setCopyError('تعذر النسخ التلقائي — يمكنك استخدام زر "تحميل .ino" بالجانب.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([sketch], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jisrbot_esp32_mqtt.ino';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex-1 bg-[#191B1F] border-x border-white/8 flex flex-col min-h-0">
      <div className="p-4 border-b border-white/8 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-stone-100">كود برمجة ESP32 (Arduino C++)</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              يتحدث تلقائياً حسب اختيارك: {config.mode === 'hivemq_cloud' ? 'HiveMQ Cloud (TLS)' : `سيرفر عام (${config.brokerHost})`}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenConfig}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37] shrink-0"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>تغيير السيرفر</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'تم النسخ!' : 'نسخ الكود بالكامل'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-100 hover:bg-[#2B2F37] transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>تحميل .ino</span>
          </button>
        </div>

        {copyError && (
          <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            {copyError}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4 bg-[#131416]">
        <pre
          dir="ltr"
          className="text-xs font-mono-tech text-stone-300 leading-relaxed whitespace-pre overflow-x-auto"
        >
          {sketch}
        </pre>
      </div>
    </div>
  );
};
