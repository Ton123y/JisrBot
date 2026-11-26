import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  ShieldCheck,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
      setShowAdvanced(false);
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
      if (!brokerHost || brokerHost.includes('hivemq.cloud')) {
        setBrokerHost('broker.emqx.io');
      }
      setPort(1883);
    } else {
      setPort(8883);
      if (
        brokerHost === 'broker.emqx.io' ||
        brokerHost === 'broker.hivemq.com' ||
        brokerHost === 'test.mosquitto.org'
      ) {
        setBrokerHost('');
      }
    }
  };

  const connectWithPayload = async (override?: Partial<MqttConfig>) => {
    setSubmitting(true);
    setFeedback(null);

    const effectiveMode = override?.mode ?? mode;
    const effectiveHost = (override?.brokerHost ?? brokerHost) || 'broker.emqx.io';
    const effectivePort = override?.port ?? (effectiveMode === 'hivemq_cloud' ? 8883 : Number(port) || 1883);
    const effectiveTopic = (override?.topicPrefix ?? topicPrefix).trim();

    const result = await onSaveConfig({
      mode: effectiveMode,
      brokerHost: effectiveHost,
      port: effectivePort,
      useTls: effectiveMode === 'hivemq_cloud',
      topicPrefix: effectiveTopic,
      username: effectiveMode === 'hivemq_cloud' ? username : undefined,
      password: effectiveMode === 'hivemq_cloud' ? password : undefined,
    });

    setSubmitting(false);
    if (!result.ok) {
      setFeedback({ type: 'error', text: result.error || 'مقدرناش نحفظ الإعدادات، جرّب تاني.' });
    } else if (result.connected) {
      setFeedback({
        type: 'success',
        text: 'تم ربط الروبوت بنجاح وبعتنا نبضة اختبار شغالة دلوقتي!',
      });
    } else {
      setFeedback({
        type: 'error',
        text: result.error || 'حفظنا اسم الروبوت، لكن السيرفر مش واصل دلوقتي.',
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await connectWithPayload();
  };

  const handleOneClickQuickConnect = async () => {
    const cleanHost =
      brokerHost && !brokerHost.includes('hivemq.cloud') ? brokerHost : 'broker.emqx.io';
    const cleanCode = topicPrefix.trim() || generateSecretTopicPrefix();
    setMode('public');
    setBrokerHost(cleanHost);
    setPort(1883);
    setTopicPrefix(cleanCode);
    await connectWithPayload({
      mode: 'public',
      brokerHost: cleanHost,
      port: 1883,
      topicPrefix: cleanCode,
    });
  };

  const isConnected = connectionState === 'connected';

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
      <div className="w-full max-w-lg bg-[#191B1F] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Clean Friendly Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-[#131416]">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isConnected
                  ? 'bg-teal-500/15 text-teal-400 border border-teal-500/30'
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}
            >
              <Cpu className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="mqtt-modal-title" className="text-base font-bold text-slate-100">
                توصيل الروبوت (ESP32)
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    isConnected ? 'text-teal-400' : 'text-amber-400'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                  {isConnected
                    ? 'متصل وجاهز للأوامر'
                    : connectionState === 'connecting'
                    ? 'جاري التوصيل...'
                    : 'غير متصل حالياً'}
                </span>
                {lastError && <span className="text-[11px] text-rose-300">· {lastError}</span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة توصيل الروبوت"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Simple 2-option connection mode */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleModeSwitch('public')}
              className={`text-right p-3.5 rounded-xl border transition-colors ${
                mode === 'public'
                  ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                  : 'border-white/10 bg-[#131416] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                <span>ربط سريع (موصى به)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                اكتب اسم الروبوت واضغط اتصال علطول
              </p>
            </button>

            <button
              type="button"
              onClick={() => handleModeSwitch('hivemq_cloud')}
              className={`text-right p-3.5 rounded-xl border transition-colors ${
                mode === 'hivemq_cloud'
                  ? 'border-amber-500 bg-amber-500/10 text-slate-100'
                  : 'border-white/10 bg-[#131416] text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm">
                <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
                <span>اتصال بحساب خاص</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                سيرفر مشفر بكلمة سر (HiveMQ)
              </p>
            </button>
          </div>

          {/* Step 1: Friendly Robot Pairing Code */}
          <div className="p-4 rounded-xl bg-[#131416] border border-white/10 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="mqtt-topic" className="text-xs font-bold text-slate-200">
                اسم الروبوت / كود الربط
              </label>
              <button
                type="button"
                onClick={() => setTopicPrefix(generateSecretTopicPrefix())}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 hover:text-amber-300"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>توليد كود جديد</span>
              </button>
            </div>

            <input
              id="mqtt-topic"
              type="text"
              dir="ltr"
              required
              value={topicPrefix}
              onChange={(e) => setTopicPrefix(e.target.value)}
              placeholder="مثال: jisrbot_home_01"
              className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#191B1F] border border-white/15 rounded-xl text-amber-300 focus:outline-none focus:border-amber-500"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ده الكود السري اللي الروبوت والتطبيق بيتعرفوا بيه على بعض تلقائياً بدون أي تعقيد.
            </p>

            {mode === 'public' && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleOneClickQuickConnect}
                className="w-full py-2.5 px-4 text-sm font-bold rounded-xl bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'جاري التوصيل بالروبوت...' : 'ربط الروبوت دلوقتي (ضغطة واحدة)'}</span>
              </button>
            )}
          </div>

          {mode === 'hivemq_cloud' && (
            <div className="p-4 rounded-xl bg-[#131416] border border-white/10 space-y-3">
              <div>
                <label htmlFor="mqtt-host" className="block text-xs font-semibold text-slate-300 mb-1.5">
                  رابط الحساب الخاص (HiveMQ Cloud Host)
                </label>
                <input
                  id="mqtt-host"
                  type="text"
                  dir="ltr"
                  required
                  value={brokerHost}
                  onChange={(e) => setBrokerHost(e.target.value)}
                  placeholder="xxxx.s1.eu.hivemq.cloud"
                  className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="mqtt-user" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    اسم المستخدم
                  </label>
                  <input
                    id="mqtt-user"
                    type="text"
                    dir="ltr"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="esp32_robot"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label htmlFor="mqtt-pass" className="block text-xs font-semibold text-slate-300 mb-1.5">
                    كلمة المرور
                  </label>
                  <input
                    id="mqtt-pass"
                    type="password"
                    dir="ltr"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2.5 text-sm font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Collapsed Advanced Technical Settings */}
          <div className="border border-white/8 rounded-xl bg-[#131416] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-stone-400 hover:text-stone-200 transition-colors"
            >
              <span>إعدادات متقدمة (للمحترفين)</span>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 pt-2 border-t border-white/8 space-y-3">
                {mode === 'public' && (
                  <div>
                    <label htmlFor="public-broker-select" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      السيرفر الوسيط
                    </label>
                    <select
                      id="public-broker-select"
                      dir="ltr"
                      value={brokerHost}
                      onChange={(e) => {
                        setBrokerHost(e.target.value);
                        setPort(1883);
                      }}
                      className="w-full px-3 py-2 text-xs font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-100 focus:outline-none focus:border-amber-500"
                    >
                      {PUBLIC_BROKER_PRESETS.map((p) => (
                        <option key={p.host} value={p.host}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2.5">
                  <div className="col-span-2">
                    <label htmlFor="mqtt-adv-host" className="block text-[11px] text-slate-400 mb-1">
                      Host
                    </label>
                    <input
                      id="mqtt-adv-host"
                      type="text"
                      dir="ltr"
                      value={brokerHost}
                      onChange={(e) => setBrokerHost(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="mqtt-adv-port" className="block text-[11px] text-slate-400 mb-1">
                      Port
                    </label>
                    <input
                      id="mqtt-adv-port"
                      type="number"
                      dir="ltr"
                      value={port}
                      onChange={(e) => setPort(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono-tech bg-[#191B1F] border border-white/10 rounded-lg text-slate-200"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 font-mono-tech truncate" dir="ltr">
                  Command Channel: {getCommandTopic(topicPrefix || 'jisrbot')}
                </p>
              </div>
            )}
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
              إغلاق
            </button>
            {mode === 'hivemq_cloud' && (
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'جاري التوصيل...' : 'حفظ وربط الحساب'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
