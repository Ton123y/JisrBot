import { useEffect, useRef, useState } from 'react';
import { TopBar, type ActiveNavSection } from './components/TopBar';
import {
  HumanRobotConsole,
  type ChatConversation,
  type ChatMessage,
  type CommandLogItem,
  type ConsoleTab,
} from './components/HumanRobotConsole';
import { SignCameraStudio } from './components/SignCameraStudio';
import { Esp32ConfigModal } from './components/Esp32ConfigModal';
import { FirmwarePanel } from './components/FirmwarePanel';
import {
  DEFAULT_MQTT_CONFIG,
  getCommandTopic,
  type MqttConfig,
  type RobotCommandPayload,
  type RobotState,
} from './lib/esp32Codegen';
import {
  SIGN_LEXICON,
  translateSentenceToSignSteps,
  type SignDefinition,
  type SignId,
  type SignStep,
} from './lib/signLanguage';
import type { ChatAttachment } from './lib/attachments';

const WELCOME_TEXT =
  'أهلاً بك في JisrBot! أنا هنا للحديث معك في أي موضوع، وتنفيذ أوامرك مباشرة على الروبوت ESP32، والرد عليك بالصوت وترجمة كل ردودي بالكامل إلى لغة الإشارة.';

const INITIAL_SIGN_STEPS = translateSentenceToSignSteps(WELCOME_TEXT);
const STORAGE_KEY = 'jisrbot_conversations_v1';

function createEmptyConversation(): ChatConversation {
  return {
    id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: 'محادثة جديدة',
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function loadInitialConversations(): ChatConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatConversation[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 20);
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return [createEmptyConversation()];
}

function sanitizeConversationsForStorage(list: ChatConversation[]): ChatConversation[] {
  return list.slice(0, 15).map((conv) => ({
    ...conv,
    messages: conv.messages.slice(-40).map((msg) => ({
      ...msg,
      attachments: msg.attachments?.map((att) => ({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        sizeBytes: att.sizeBytes,
        kind: att.kind,
        // Avoid filling localStorage quota with large image data URLs
        previewUrl: att.previewUrl && att.previewUrl.length < 30_000 ? att.previewUrl : undefined,
      })),
    })),
  }));
}

function deriveThreadTitle(text: string, attachments?: ChatAttachment[]): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean) {
    return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
  }
  if (attachments && attachments.length > 0) {
    return `تحليل: ${attachments[0].name}`;
  }
  return 'محادثة جديدة';
}

export default function App() {
  const [activeNav, setActiveNav] = useState<ActiveNavSection>('chat');
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>('chat');
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  // Full Sign Language Steps state (used exclusively inside كاميرا الإشارة)
  const [signSteps, setSignSteps] = useState<SignStep[]>(INITIAL_SIGN_STEPS);
  const [sequenceTrigger, setSequenceTrigger] = useState(0);
  const [latestAiReplyText, setLatestAiReplyText] = useState<string>(WELCOME_TEXT);
  const [composedSignText, setComposedSignText] = useState('');

  // Multi-conversation threads state
  const [conversations, setConversations] = useState<ChatConversation[]>(loadInitialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string>(
    () => conversations[0]?.id || ''
  );

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || conversations[0];
  const messages = activeConversation ? activeConversation.messages : [];

  const [isSending, setIsSending] = useState(false);
  const [autoVoiceReply, setAutoVoiceReply] = useState(false);
  const [ttsPlayingText, setTtsPlayingText] = useState<string | null>(null);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsRequestIdRef = useRef(0);

  // Robot & MQTT state
  const [mqttConfig, setMqttConfig] = useState<{
    mode: MqttConfig['mode'];
    brokerHost: string;
    port: number;
    useTls: boolean;
    topicPrefix: string;
    username: string;
    hasPassword: boolean;
    commandTopic: string;
  }>({
    mode: DEFAULT_MQTT_CONFIG.mode,
    brokerHost: DEFAULT_MQTT_CONFIG.brokerHost,
    port: DEFAULT_MQTT_CONFIG.port,
    useTls: DEFAULT_MQTT_CONFIG.useTls,
    topicPrefix: DEFAULT_MQTT_CONFIG.topicPrefix,
    username: '',
    hasPassword: false,
    commandTopic: getCommandTopic(DEFAULT_MQTT_CONFIG.topicPrefix),
  });

  const [mqttState, setMqttState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('connecting');
  const [mqttLastError, setMqttLastError] = useState('');
  const [robotState, setRobotState] = useState<RobotState>({
    ledOn: false,
    armAngle: 90,
    motorSpeed: 0,
    activeSign: 'REST',
    servoAngles: [...SIGN_LEXICON.REST.servoTargets] as [number, number, number, number, number],
    lastUpdated: new Date().toISOString(),
  });
  const [commandHistory, setCommandHistory] = useState<CommandLogItem[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeConversationsForStorage(conversations)));
    } catch {
      // ignore storage quota overflow
    }
  }, [conversations]);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const resp = await fetch('/api/mqtt/status');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!active) return;
        if (data.config) setMqttConfig(data.config);
        if (data.connectionState) setMqttState(data.connectionState);
        if (typeof data.lastError === 'string') setMqttLastError(data.lastError);
        if (data.robotState) setRobotState(data.robotState);
        if (Array.isArray(data.commandHistory)) setCommandHistory(data.commandHistory);
      } catch {
        // ignore transient poll errors
      }
    };

    fetchStatus();
    const timer = window.setInterval(fetchStatus, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      ttsRequestIdRef.current += 1;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleSelectNav = (section: ActiveNavSection) => {
    setActiveNav(section);
    if (section === 'chat') {
      setConsoleTab('chat');
    } else if (section === 'robot') {
      setConsoleTab('robot');
    }
  };

  const handleNewConversation = () => {
    const fresh = createEmptyConversation();
    setConversations((prev) => [fresh, ...prev]);
    setActiveConversationId(fresh.id);
    setActiveNav('chat');
    setConsoleTab('chat');
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setActiveNav('chat');
    setConsoleTab('chat');
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (filtered.length === 0) {
        const fresh = createEmptyConversation();
        setActiveConversationId(fresh.id);
        return [fresh];
      }
      if (activeConversationId === id) {
        setActiveConversationId(filtered[0].id);
      }
      return filtered;
    });
  };

  const triggerSignStepsPlayback = (steps: SignStep[], replyText?: string) => {
    if (steps.length === 0) return;
    setSignSteps(steps);
    if (typeof replyText === 'string') {
      setLatestAiReplyText(replyText);
    }
    setSequenceTrigger((n) => n + 1);
  };

  const triggerSingleSignPreview = (signId: SignId) => {
    const def = SIGN_LEXICON[signId] ?? SIGN_LEXICON.REST;
    const step: SignStep = {
      key: `preview_${signId}_${Date.now()}`,
      signId: def.id,
      sourceWord: def.glossAr,
      glossAr: def.glossAr,
      glossEn: def.glossEn,
      descriptionAr: def.descriptionAr,
      oscillation: def.oscillation,
      pose: def.pose,
      durationMs: 1400,
    };
    triggerSignStepsPlayback([step]);
  };

  const playTts = async (text: string) => {
    if (!text.trim()) return;
    setTtsError(null);
    const reqId = ++ttsRequestIdRef.current;

    if (ttsPlayingText === text) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setTtsPlayingText(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTtsPlayingText(text);
    try {
      const resp = await fetch('/api/ai/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await resp.json();
      if (reqId !== ttsRequestIdRef.current) return;
      if (!resp.ok || !data.audioBase64) {
        throw new Error(data.error || 'تعذر توليد الصوت حالياً.');
      }
      const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        if (reqId === ttsRequestIdRef.current) setTtsPlayingText(null);
      };
      audio.onerror = () => {
        if (audioRef.current === audio) audioRef.current = null;
        if (reqId === ttsRequestIdRef.current) {
          setTtsPlayingText(null);
          setTtsError('تعذر تشغيل الملف الصوتي في هذا المتصفح.');
        }
      };
      await audio.play();
    } catch (err: unknown) {
      if (reqId !== ttsRequestIdRef.current) return;
      setTtsPlayingText(null);
      setTtsError(err instanceof Error ? err.message : 'تعذر تشغيل الرد الصوتي.');
    }
  };

  const handleSendMessage = async (
    text: string,
    opts?: { isVoice?: boolean; isFromSign?: boolean; attachments?: ChatAttachment[] }
  ) => {
    const targetConvId = activeConversation?.id || activeConversationId;
    const priorMessages = activeConversation?.messages || [];

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text,
      attachments: opts?.attachments?.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        kind: a.kind,
        previewUrl: a.previewUrl,
      })),
      isVoice: opts?.isVoice,
      isFromSign: opts?.isFromSign,
      timestamp: new Date().toISOString(),
    };

    const nextTitle =
      activeConversation?.title === 'محادثة جديدة'
        ? deriveThreadTitle(text, opts?.attachments)
        : activeConversation?.title || 'محادثة جديدة';

    setConversations((prev) =>
      prev.map((c) =>
        c.id === targetConvId
          ? {
              ...c,
              title: nextTitle,
              updatedAt: new Date().toISOString(),
              messages: [...c.messages, userMsg],
            }
          : c
      )
    );

    setIsSending(true);

    try {
      const resp = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          attachments: opts?.attachments?.map((a) => ({
            name: a.name,
            mimeType: a.mimeType,
            kind: a.kind,
            data: a.data,
          })),
          history: priorMessages
            .filter((m) => !m.id.startsWith('err_') && m.text.trim().length > 0)
            .slice(-10)
            .map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'تعذر الاتصال بالمساعد الذكي.');
      }

      const fullSteps: SignStep[] =
        Array.isArray(data.signSteps) && data.signSteps.length > 0
          ? data.signSteps
          : translateSentenceToSignSteps(data.replyText || '');

      const seq: SignId[] = Array.isArray(data.signSequence) ? data.signSequence : ['HELLO'];
      triggerSignStepsPlayback(fullSteps, data.replyText);

      if (data.robotState) setRobotState(data.robotState);
      if (data.mqttState) setMqttState(data.mqttState);
      if (Array.isArray(data.commandHistory)) setCommandHistory(data.commandHistory);

      const aiMsg: ChatMessage = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: data.replyText,
        signSequence: seq,
        signSteps: fullSteps,
        dispatchedCommands: data.executedCommands,
        timestamp: new Date().toISOString(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: [...c.messages, aiMsg],
              }
            : c
        )
      );

      if (autoVoiceReply || opts?.isVoice) {
        playTts(data.replyText);
      }
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'حدث خطأ غير متوقع.';
      const errFullText = `تنبيه: ${errText}`;
      const errSteps = translateSentenceToSignSteps(errFullText);
      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: 'model',
        text: errFullText,
        isError: true,
        retryPrompt: text,
        signSequence: ['NO'],
        signSteps: errSteps,
        timestamp: new Date().toISOString(),
      };
      setConversations((prev) =>
        prev.map((c) =>
          c.id === targetConvId
            ? {
                ...c,
                updatedAt: new Date().toISOString(),
                messages: [...c.messages, errMsg],
              }
            : c
        )
      );
      triggerSignStepsPlayback(errSteps, errFullText);
    } finally {
      setIsSending(false);
    }
  };

  const handleManualRobotCommand = async (payload: {
    action: RobotCommandPayload['action'];
    ledState?: boolean;
    armAngle?: number;
    motorSpeed?: number;
    signGesture?: SignId;
    note?: string;
    source?: 'manual' | 'sign_camera';
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const resp = await fetch('/api/mqtt/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { ok: false, error: data.error || 'تعذر إرسال الأمر إلى الروبوت.' };
      }
      if (data.robotState) setRobotState(data.robotState);
      if (Array.isArray(data.commandHistory)) setCommandHistory(data.commandHistory);
      if (payload.signGesture) {
        triggerSingleSignPreview(payload.signGesture);
      }
      return { ok: true };
    } catch {
      return { ok: false, error: 'تعذر الوصول إلى خادم الروبوت حالياً.' };
    }
  };

  const handleSaveMqttConfig = async (cfg: MqttConfig) => {
    try {
      const resp = await fetch('/api/mqtt/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      });
      const data = await resp.json();
      if (!resp.ok) {
        return { ok: false, error: data.error || 'تعذر الاتصال.' };
      }
      if (data.config) setMqttConfig(data.config);
      if (data.connectionState) setMqttState(data.connectionState);
      if (typeof data.lastError === 'string') setMqttLastError(data.lastError);
      if (Array.isArray(data.commandHistory)) setCommandHistory(data.commandHistory);
      return { ok: true, connected: Boolean(data.connected), error: data.error };
    } catch {
      return { ok: false, error: 'تعذر الوصول للخادم.' };
    }
  };

  const handleSendSignFromLexicon = (sign: SignDefinition) => {
    triggerSingleSignPreview(sign.id);
    handleManualRobotCommand({
      action: 'perform_sign',
      signGesture: sign.id,
      note: `تنفيذ إشارة ${sign.glossAr}`,
    });
  };

  const mobileNavItems: Array<{ id: ActiveNavSection; label: string }> = [
    { id: 'chat', label: 'المحادثة' },
    { id: 'sign_camera', label: 'كاميرا الإشارة' },
    { id: 'robot', label: 'أوامر الروبوت' },
    { id: 'firmware', label: 'كود ESP32' },
  ];

  return (
    <div className="min-h-screen lg:h-screen w-full flex flex-col bg-[#131416] text-stone-100 lg:overflow-hidden">
      <TopBar
        activeSection={activeNav}
        onSelectSection={handleSelectNav}
        mqttState={mqttState}
        onOpenMqttConfig={() => setConfigModalOpen(true)}
        showSidebarToggle={activeNav === 'chat'}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      {/* Mobile Secondary Navigation Strip (since desktop nav is hidden below md) */}
      <nav
        aria-label="أقسام التطبيق للجوال"
        className="flex md:hidden border-b border-white/8 bg-[#191B1F] px-2 py-1.5 gap-1 overflow-x-auto"
      >
        {mobileNavItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleSelectNav(item.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
              activeNav === item.id ? 'bg-amber-500 text-stone-950' : 'text-stone-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Main Content Area: 3D Hand & Sign Language live EXCLUSIVELY inside 'sign_camera' */}
      <main className="flex-1 flex flex-col min-h-0">
        {activeNav === 'sign_camera' ? (
          <SignCameraStudio
            signSteps={signSteps}
            sequenceTrigger={sequenceTrigger}
            latestAiReplyText={latestAiReplyText}
            composedText={composedSignText}
            onComposedTextChange={setComposedSignText}
            isSendingAi={isSending}
            robotState={robotState}
            ttsPlayingText={ttsPlayingText}
            ttsError={ttsError}
            onPlayTts={playTts}
            onReplayAiSignReply={() =>
              triggerSignStepsPlayback(translateSentenceToSignSteps(latestAiReplyText), latestAiReplyText)
            }
            onSendSignMessage={(composedText) =>
              handleSendMessage(composedText, { isFromSign: true })
            }
            onPreviewSign={triggerSingleSignPreview}
            onSendSignToEsp32={handleSendSignFromLexicon}
            onManualRobotCommand={handleManualRobotCommand}
          />
        ) : activeNav === 'firmware' ? (
          <FirmwarePanel
            config={{
              mode: mqttConfig.mode,
              brokerHost: mqttConfig.brokerHost,
              port: mqttConfig.port,
              useTls: mqttConfig.useTls,
              topicPrefix: mqttConfig.topicPrefix,
              username: mqttConfig.username,
            }}
            onOpenConfig={() => setConfigModalOpen(true)}
          />
        ) : (
          <HumanRobotConsole
            activeTab={consoleTab}
            onTabChange={(tab) => {
              setConsoleTab(tab);
              setActiveNav(tab);
            }}
            conversations={conversations}
            activeConversationId={activeConversation?.id || activeConversationId}
            onNewConversation={handleNewConversation}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            sidebarOpen={sidebarOpen}
            onCloseSidebarMobile={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                setSidebarOpen(false);
              }
            }}
            messages={messages}
            isSending={isSending}
            autoVoiceReply={autoVoiceReply}
            onToggleAutoVoiceReply={() => setAutoVoiceReply((v) => !v)}
            onSendMessage={handleSendMessage}
            onOpenSignTranslation={(steps, replyText) => {
              triggerSignStepsPlayback(steps, replyText);
              setActiveNav('sign_camera');
            }}
            onPlayTts={playTts}
            ttsPlayingId={ttsPlayingText}
            ttsError={ttsError}
            robotState={robotState}
            mqttState={mqttState}
            topicCommand={mqttConfig.commandTopic}
            commandHistory={commandHistory}
            onManualRobotCommand={handleManualRobotCommand}
          />
        )}
      </main>

      <Esp32ConfigModal
        isOpen={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        currentConfig={mqttConfig}
        connectionState={mqttState}
        lastError={mqttLastError}
        onSaveConfig={handleSaveMqttConfig}
      />
    </div>
  );
}
