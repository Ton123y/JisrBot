import React, { useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Globe, X, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  PUBLIC_BROKER_PRESETS,
  generateSecretTopicPrefix,
  getCommandTopic,
  type MqttConfig,
  type MqttMode,
} from '../lib/esp32Codegen';

interface Esp32ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: {
    mode: MqttMode;
    brokerHost: string;
    port: number;
    useTls: boolean;
    topicPrefix: string;
    username: string;
    hasPassword: boolean;
  };
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  lastError: string;
  onSaveConfig: (config: MqttConfig) => Promise<{ ok: boolean; connected?: boolean; error?: string }>;
}

export const Esp32ConfigModal: React.FC<Esp32ConfigModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  connectionState,
  lastError,
  onSaveConfig,
}) => {
  const [mode, setMode] = useState<MqttMode>(currentConfig.mode);
  const [brokerHost, setBrokerHost] = useState(currentConfig.brokerHost);
  const [port, setPort] = useState(currentConfig.port);
  const [topicPrefix, setTopicPrefix] = useState(currentConfig.topicPrefix);
  const [username, setUsername] = useState(currentConfig.username);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const wasOpenRef = React.useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setMode(currentConfig.mode);
      setBrokerHost(currentConfig.brokerHost);
      setPort(currentConfig.port);
      setTopicPrefix(currentConfig.topicPrefix);
      setUsername(currentConfig.username);
      setPassword('');
      setFeedback(null);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, currentConfig]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleModeSwitch = (nextMode: MqttMode) => {
    setMode(nextMode);
    setFeedback(null);
    if (nextMode === 'public') {
      if (brokerHost.includes('hivemq.cloud')) {
        setBrokerHost('broker.emqx.io');
      }
      setPort(1883);
    } else {
      setPort(8883);
      if (brokerHost === 'broker.emqx.io' || brokerHost === 'broker.hivemq.com' || brokerHost === 'test.mosquitto.org') {
        setBrokerHost('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const result = await onSaveConfig({
      mode,
      brokerHost,
      port: Number(port),
      useTls: mode === 'hivemq_cloud',
      topicPrefix,
      username: mode === 'hivemq_cloud' ? username : undefined,
      password: mode === 'hivemq_cloud' ? password : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setFeedback({ type: 'error', text: result.error || 'تعذر حفظ الإعدادات.' });
    } else if (result.connected) {
      setFeedback({
        type: 'success',
        text: 'تم الاتصال بسيرفر MQTT وإرسال نبضة اختبار لقناة الـ ESP32 بنجاح.',
      });
    } else {
      setFeedback({
        type: 'error',
        text: result.error || 'تم حفظ الإعدادات، لكن تعذر الوصول للسيرفر حالياً.',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mqtt-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-[#191B1F] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
          <div>
            <h2 id="mqtt-modal-title" className="text-lg font-bold text-slate-100">
              إعداد ربط الروبوت ESP32 عبر الإنترنت
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              الحالة الحالية: {connectionState === 'connected' ? 'متصل بالسيرفر' : connectionState === 'connecting' ? 'جاري الاتصال' : 'غير متصل'}
              {lastError ? ` · ${lastError}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة إعداد ESP32"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Option Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleModeSwitch('public')}
              className={`text-right p-4 rounded-xl border transition-colors ${
                mode === 'public'
                  ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                  : 'border-white/10 bg-[#131416] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <span>الخيار الأول: سيرفر عام مجاني</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                تشغيل فوري بدون تسجيل عبر broker.emqx.io مع قناة سرية طويلة.
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('hivemq_cloud')}
              className={`text-right p-4 rounded-xl border transition-colors ${
                mode === 'hivemq_cloud'
                  ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                  : 'border-white/10 bg-[#131416] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                <span>الخيار الثاني: HiveMQ Cloud</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                سيرفر خاص مجاني ومشفر TLS مع اسم مستخدم وكلمة مرور.
              </p>
            </button>
          </div>

          {mode === 'public' && (
            <div>
              <label htmlFor="public-broker-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                اختر السيرفر العام السريع
              </label>
              <select
                id="public-broker-select"
                dir="ltr"
                value={brokerHost}
                onChange={(e) => {
                  setBrokerHost(e.target.value);
                  setPort(1883);
                }}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              >
                {PUBLIC_BROKER_PRESETS.map((p) => (
                  <option key={p.host} value={p.host}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor="mqtt-host" className="block text-xs font-semibold text-slate-300 mb-1.5">
                رابط سيرفر MQTT (Host)
              </label>
              <input
                id="mqtt-host"
                type="text"
                dir="ltr"
                required
                value={brokerHost}
                onChange={(e) => setBrokerHost(e.target.value)}
                placeholder={mode === 'hivemq_cloud' ? 'xxxx.s1.eu.hivemq.cloud' : 'broker.emqx.io'}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label htmlFor="mqtt-port" className="block text-xs font-semibold text-slate-300 mb-1.5">
                البورت (Port)
              </label>
              <input
                id="mqtt-port"
                type="number"
                dir="ltr"
                required
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {mode === 'hivemq_cloud' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="mqtt-user" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  اسم المستخدم (Username)
                </label>
                <input
                  id="mqtt-user"
                  type="text"
                  dir="ltr"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="esp32_robot"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label htmlFor="mqtt-pass" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  كلمة المرور (Password)
                </label>
                <input
                  id="mqtt-pass"
                  type="password"
                  dir="ltr"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="mqtt-topic" className="text-xs font-semibold text-slate-300">
                اسم القناة السرية (Topic Prefix)
              </label>
              <button
                type="button"
                onClick={() => setTopicPrefix(generateSecretTopicPrefix())}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>توليد قناة عشوائية آمنة</span>
              </button>
            </div>
            <input
              id="mqtt-topic"
              type="text"
              dir="ltr"
              required
              value={topicPrefix}
              onChange={(e) => setTopicPrefix(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#131416] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <p className="text-xs text-slate-400 mt-1.5 font-mono-tech" dir="ltr">
              Command Topic: {getCommandTopic(topicPrefix || 'jisrbot')}
            </p>
          </div>

          {feedback && (
            <div
              className={`flex items-start gap-2.5 p-3.5 rounded-xl border text-xs ${
                feedback.type === 'success'
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white rounded-lg"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors"
            >
              {submitting ? 'جاري الاتصال...' : 'حفظ واختبار الاتصال'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
