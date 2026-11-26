import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  FileCode2,
  FileText,
  Hand,
  ImagePlus,
  Lightbulb,
  MessageSquare,
  Mic,
  MicOff,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import type { SignId, SignStep } from '../lib/signLanguage';
import type { RobotCommandPayload, RobotState } from '../lib/esp32Codegen';
import {
  ROBOT_HARDWARE_PRESETS,
  ROBOT_ROUTINE_PRESETS,
  SUGGESTED_ROBOT_CHAT_PROMPTS,
  type RobotRoutinePreset,
} from '../lib/robotPresets';
import {
  classifyFileAttachment,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  type ChatAttachment,
} from '../lib/attachments';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CameraCaptureModal } from './CameraCaptureModal';

export type ConsoleTab = 'chat' | 'robot';

export interface MessageAttachmentSummary {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: ChatAttachment['kind'];
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachments?: MessageAttachmentSummary[];
  isVoice?: boolean;
  isFromSign?: boolean;
  isError?: boolean;
  retryPrompt?: string;
  signSequence?: SignId[];
  signSteps?: SignStep[];
  dispatchedCommands?: Array<{
    command: RobotCommandPayload;
    publishedToBroker: boolean;
  }>;
  timestamp: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface CommandLogItem {
  command: RobotCommandPayload;
  publishedToBroker: boolean;
  topic: string;
  source: 'ai' | 'manual' | 'sign_camera' | 'system';
}

interface HumanRobotConsoleProps {
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
  conversations: ChatConversation[];
  activeConversationId: string;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  sidebarOpen: boolean;
  onCloseSidebarMobile: () => void;
  messages: ChatMessage[];
  isSending: boolean;
  autoVoiceReply: boolean;
  onToggleAutoVoiceReply: () => void;
  onSendMessage: (
    text: string,
    opts?: { isVoice?: boolean; isFromSign?: boolean; attachments?: ChatAttachment[] }
  ) => Promise<void>;
  onOpenSignTranslation: (steps: SignStep[], replyText: string) => void;
  onPlayTts: (text: string) => Promise<void>;
  ttsPlayingId: string | null;
  ttsError?: string | null;
  robotState: RobotState;
  mqttState: 'disconnected' | 'connecting' | 'connected' | 'error';
  topicCommand: string;
  commandHistory: CommandLogItem[];
  onManualRobotCommand: (payload: {
    action: RobotCommandPayload['action'];
    ledState?: boolean;
    armAngle?: number;
    motorSpeed?: number;
    signGesture?: SignId;
    note?: string;
    source?: 'manual' | 'sign_camera';
  }) => Promise<{ ok: boolean; error?: string }>;
}

const STARTER_CARDS: Array<{
  title: string;
  subtitle: string;
  prompt: string;
}> = [
  {
    title: 'تحكم سريع بالروبوت',
    subtitle: 'شغّل النور وارفع إيد الروبوت 135° ولوّح بالسلام',
    prompt: 'شغّل نور الروبوت وارفع إيده للزاوية 135 درجة ولوّح بإشارة السلام.',
  },
  {
    title: 'دردشة باللهجة المصرية',
    subtitle: 'اتكلم معايا في أي موضوع وأشرحلك ببساطة وبالمصري',
    prompt: 'أهلاً يا JisrBot! اشرحلي ببساطة إزاي الذكاء الاصطناعي بيتعرف على لغة الإشارة؟',
  },
  {
    title: 'برمجة وشرح تقني',
    subtitle: 'اكتب دالة Python لتحليل ملف CSV وشرحها خطوة بخطوة',
    prompt: 'اكتب دالة Python احترافية لقراءة ملف CSV وحساب الإحصائيات الأساسية واشرحها بالمصري.',
  },
  {
    title: 'تشغيل أوامر مركبة',
    subtitle: 'اعمل إشارة ممتاز وشغّل الموتور 60% للعرض التوضيحي',
    prompt: 'خلي الروبوت يعمل إشارة ممتاز (GOOD) وشغّل الموتور بسرعة 60 في المية.',
  },
];

async function copyTextWithFallback(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

async function fileToChatAttachment(file: File): Promise<ChatAttachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`حجم الملف "${file.name}" يتجاوز الحد الأقصى (8 ميجابايت).`);
  }

  const kind = classifyFileAttachment(file.name, file.type);
  if (!kind) {
    throw new Error(
      `صيغة الملف "${file.name}" غير مدعومة. الصيغ المدعومة: صور، PDF، وملفات النص والكود (.txt, .md, .csv, .json, .py, .js, .ts, .ino...).`
    );
  }

  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (kind === 'text') {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`تعذر قراءة الملف "${file.name}".`));
      reader.readAsText(file, 'utf-8');
    });
    return {
      id,
      name: file.name,
      mimeType: file.type || 'text/plain',
      sizeBytes: file.size,
      kind: 'text',
      data: text,
    };
  }

  if (kind === 'pdf') {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`تعذر قراءة ملف PDF "${file.name}".`));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(',')[1] || '';
    if (!base64) throw new Error(`ملف PDF "${file.name}" فارغ.`);
    return {
      id,
      name: file.name,
      mimeType: 'application/pdf',
      sizeBytes: file.size,
      kind: 'pdf',
      data: base64,
    };
  }

  // Image: compress/resize cleanly via Canvas so upload is fast & reliable
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`تعذر قراءة الصورة "${file.name}".`));
    reader.readAsDataURL(file);
  });

  return await new Promise<ChatAttachment>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxSide = 1280;
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const targetMime = file.type === 'image/png' && file.size < 900_000 ? 'image/png' : 'image/jpeg';
        const outUrl = canvas.toDataURL(targetMime, 0.86);
        const base64 = outUrl.split(',')[1] || '';
        if (base64) {
          resolve({
            id,
            name: file.name,
            mimeType: targetMime,
            sizeBytes: file.size,
            kind: 'image',
            data: base64,
            previewUrl: outUrl,
          });
          return;
        }
      }
      const fallbackBase64 = rawDataUrl.split(',')[1] || '';
      if (!fallbackBase64) {
        reject(new Error(`تعذر معالجة الصورة "${file.name}".`));
        return;
      }
      resolve({
        id,
        name: file.name,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
        kind: 'image',
        data: fallbackBase64,
        previewUrl: rawDataUrl,
      });
    };
    img.onerror = () => reject(new Error(`ملف الصورة "${file.name}" غير صالح.`));
    img.src = rawDataUrl;
  });
}

export const HumanRobotConsole: React.FC<HumanRobotConsoleProps> = ({
  activeTab,
  onTabChange,
  conversations,
  activeConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  sidebarOpen,
  onCloseSidebarMobile,
  messages,
  isSending,
  autoVoiceReply,
  onToggleAutoVoiceReply,
  onSendMessage,
  onOpenSignTranslation,
  onPlayTts,
  ttsPlayingId,
  ttsError,
  robotState,
  mqttState,
  topicCommand,
  commandHistory,
  onManualRobotCommand,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showRobotQuickPrompts, setShowRobotQuickPrompts] = useState(true);
  const [runningRoutineId, setRunningRoutineId] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [draftArmAngle, setDraftArmAngle] = useState(robotState.armAngle);
  const [draftMotorSpeed, setDraftMotorSpeed] = useState(robotState.motorSpeed);
  const [robotCommandError, setRobotCommandError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setDraftArmAngle(robotState.armAngle);
    setDraftMotorSpeed(robotState.motorSpeed);
  }, [robotState.armAngle, robotState.motorSpeed]);

  useEffect(() => {
    if (activeTab === 'chat' && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isSending, activeTab]);

  // Auto-resize textarea like Claude.ai / ChatGPT
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [inputText]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    };
  }, []);

  const addIncomingFiles = async (fileList: FileList | File[]) => {
    setAttachmentError(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const remainingSlots = MAX_ATTACHMENTS_PER_MESSAGE - attachments.length;
    if (remainingSlots <= 0) {
      setAttachmentError(`الحد الأقصى ${MAX_ATTACHMENTS_PER_MESSAGE} مرفقات في الرسالة الواحدة.`);
      return;
    }

    const slice = files.slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      setAttachmentError(`تمت إضافة أول ${remainingSlots} ملفات فقط (الحد الأقصى ${MAX_ATTACHMENTS_PER_MESSAGE} مرفقات).`);
    }

    const added: ChatAttachment[] = [];
    for (const file of slice) {
      try {
        const parsed = await fileToChatAttachment(file);
        added.push(parsed);
      } catch (err: unknown) {
        setAttachmentError(err instanceof Error ? err.message : 'تعذر إرفاق أحد الملفات.');
      }
    }

    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setAttachmentError(null);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) imageFiles.push(f);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      await addIncomingFiles(imageFiles);
    }
  };

  const submitMessage = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && attachments.length === 0) || isSending) return;
    setVoiceError(null);
    setAttachmentError(null);
    const toSendAttachments = [...attachments];
    setInputText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSendMessage(trimmed, { attachments: toSendAttachments });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitMessage();
  };

  const handleTextareaKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      await submitMessage();
    }
  };

  const dispatchRobotWithFeedback = async (payload: Parameters<typeof onManualRobotCommand>[0]) => {
    setRobotCommandError(null);
    const res = await onManualRobotCommand(payload);
    if (!res.ok && res.error) {
      setRobotCommandError(res.error);
    }
  };

  const toggleVoiceRecording = async () => {
    setVoiceError(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('المتصفح لا يدعم تسجيل الصوت المباشر. يمكنك الكتابة هنا أو تجربة متصفح حديث.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ];
      const chosenType = preferredTypes.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = chosenType ? new MediaRecorder(stream, { mimeType: chosenType }) : new MediaRecorder(stream);
      const effectiveMime = chosenType || recorder.mimeType || 'audio/webm';
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        const blob = new Blob(audioChunksRef.current, { type: effectiveMime });
        if (blob.size < 100) {
          setVoiceError('التسجيل الصوتي قصير جداً، تحدث بوضوح ثم اضغط إيقاف للإرسال.');
          return;
        }

        setTranscribing(true);
        try {
          const reader = new FileReader();
          const base64: string = await new Promise((resolve, reject) => {
            reader.onloadend = () => {
              const res = String(reader.result || '');
              resolve(res.split(',')[1] || '');
            };
            reader.onerror = () => reject(new Error('Failed to read audio'));
            reader.readAsDataURL(blob);
          });

          const resp = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: effectiveMime }),
          });
          const data = await resp.json();
          if (!resp.ok) {
            throw new Error(data.error || 'تعذر تحويل الصوت إلى نص.');
          }

          if (data.transcript && data.transcript.trim()) {
            const pendingAttachments = [...attachments];
            setAttachments([]);
            await onSendMessage(data.transcript.trim(), {
              isVoice: true,
              attachments: pendingAttachments,
            });
          } else {
            setVoiceError('لم يتم التقاط كلام واضح، حاول التحدث بالقرب من الميكروفون.');
          }
        } catch (err: unknown) {
          setVoiceError(err instanceof Error ? err.message : 'فشل معالجة الرسالة الصوتية.');
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setVoiceError('يرجى السماح بالوصول للميكروفون لإرسال رسائل صوتية.');
    }
  };

  // VIEW 1: CLAUDE / CHATGPT / GEMINI STYLE AI WORKSPACE
  if (activeTab === 'chat') {
    const isFreshConversation = messages.length === 0;

    return (
      <section
        aria-label="مساحة المحادثة الذكية"
        className="flex-1 flex min-h-0 bg-[#131416] relative overflow-hidden"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFiles(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setIsDraggingFiles(false);
        }}
        onDrop={async (e) => {
          e.preventDefault();
          setIsDraggingFiles(false);
          if (e.dataTransfer?.files?.length) {
            await addIncomingFiles(e.dataTransfer.files);
          }
        }}
      >
        {/* Mobile Sidebar Backdrop */}
        {sidebarOpen && (
          <div
            onClick={onCloseSidebarMobile}
            className="fixed inset-0 z-30 bg-black/60 lg:hidden"
            aria-hidden="true"
          />
        )}

        {/* Collapsible Conversations Sidebar */}
        <aside
          aria-label="سجل المحادثات"
          data-testid="chat-sidebar"
          className={`${
            sidebarOpen ? 'translate-x-0 lg:w-72' : 'translate-x-full lg:w-0 lg:overflow-hidden lg:border-l-0'
          } fixed lg:static inset-y-0 right-0 z-40 w-72 bg-[#191B1F] border-l border-white/8 flex flex-col shrink-0 transition-all duration-200`}
        >
          <div className="p-3 border-b border-white/8 flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onNewConversation();
                onCloseSidebarMobile();
              }}
              data-testid="new-chat-btn"
              className="flex-1 inline-flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#22252B] hover:bg-[#2B2F37] border border-white/10 text-sm font-semibold text-stone-100 transition-colors"
            >
              <span>محادثة جديدة</span>
              <Plus className="w-4 h-4 text-amber-400" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onCloseSidebarMobile}
              aria-label="إغلاق القائمة الجانبية"
              className="lg:hidden p-2 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <p className="px-2.5 py-1.5 text-[11px] font-semibold text-stone-500">المحادثات</p>
            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  className={`group flex items-center gap-1 rounded-xl px-2 py-1 transition-colors ${
                    active ? 'bg-[#262931] text-stone-100' : 'text-stone-400 hover:bg-white/5 hover:text-stone-200'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onCloseSidebarMobile();
                    }}
                    className="flex-1 min-w-0 text-right py-1.5 px-1.5 flex items-center gap-2"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-70" aria-hidden="true" />
                    <span className="text-xs font-medium truncate">{conv.title}</span>
                  </button>
                  {conversations.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                      aria-label={`حذف محادثة ${conv.title}`}
                      className="p-1.5 rounded-lg text-stone-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar Hardware Shortcut Footer */}
          <div className="p-3 border-t border-white/8 space-y-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onTabChange('robot');
                onCloseSidebarMobile();
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#131416] hover:bg-[#22252B] border border-white/8 text-xs text-stone-300 transition-colors"
            >
              <span className="inline-flex items-center gap-2 font-semibold">
                <Cpu className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                <span>لوحة تحكم ESP32</span>
              </span>
              <span className="text-[11px] font-mono-tech text-stone-400">
                {mqttState === 'connected' ? 'متصل' : 'محلي'}
              </span>
            </button>
          </div>
        </aside>

        {/* Main Centered AI Chat Stream + Floating Pill Composer */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {isDraggingFiles && (
            <div className="absolute inset-4 z-30 rounded-3xl border-2 border-dashed border-amber-400 bg-[#131416]/90 flex flex-col items-center justify-center gap-2 pointer-events-none">
              <Paperclip className="w-8 h-8 text-amber-400" />
              <p className="text-sm font-bold text-stone-100">أفلت الملفات أو الصور هنا لإرفاقها</p>
            </div>
          )}

          {/* Subtle Top Chat Bar for Auto-Voice Toggle */}
          <div className="px-4 sm:px-6 py-2 flex items-center justify-between gap-3 shrink-0">
            <span className="text-xs text-stone-500 hidden sm:inline">
              ذكاء اصطناعي شامل + تحليل ملفات وصور + تحكم مباشر بـ ESP32
            </span>
            <div className="flex items-center gap-2 mr-auto">
              <button
                type="button"
                onClick={onToggleAutoVoiceReply}
                aria-pressed={autoVoiceReply}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  autoVoiceReply
                    ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                    : 'bg-white/5 text-stone-400 hover:text-stone-200'
                }`}
              >
                {autoVoiceReply ? (
                  <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>رد صوتي تلقائي</span>
              </button>
            </div>
          </div>

          {/* Scrollable Thread OR Welcoming Hero */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-6">
            {isFreshConversation ? (
              <div
                data-testid="chat-hero"
                className="max-w-3xl mx-auto min-h-full py-8 flex flex-col items-center justify-center text-center"
              >
                <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mb-5">
                  <Sparkles className="w-5 h-5 text-amber-400" aria-hidden="true" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-stone-100 tracking-tight">
                  أهلاً بيك، تحب نعمل إيه النهارده؟
                </h1>
                <p className="text-sm text-stone-400 mt-2.5 max-w-xl leading-relaxed">
                  اتكلم معايا بالمصري في أي موضوع زي Gemini أو Claude — برمجة، تحليل ملفات PDF وصور، أو اختار أمر من أوامر الروبوت الجاهزة بالأسفل.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-8 text-right">
                  {STARTER_CARDS.map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      disabled={isSending}
                      onClick={() => onSendMessage(card.prompt)}
                      className="p-4 rounded-2xl bg-[#191B1F] hover:bg-[#22252B] border border-white/8 text-right transition-colors space-y-1.5 group"
                    >
                      <span className="text-xs font-bold text-amber-400 block">{card.title}</span>
                      <span className="text-sm text-stone-300 group-hover:text-stone-100 leading-snug block">
                        {card.subtitle}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto py-4 space-y-6">
                {messages.map((msg) =>
                  msg.role === 'user' ? (
                    <div key={msg.id} className="flex justify-end">
                      <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl bg-[#24262C] border border-white/8 px-4 py-3 space-y-2.5 text-stone-100">
                        {(msg.isVoice || msg.isFromSign) && (
                          <div className="text-[11px] font-semibold text-amber-400">
                            {msg.isVoice ? 'رسالة صوتية مفرّغة' : 'مترجم من كاميرا لغة الإشارة'}
                          </div>
                        )}

                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.attachments.map((att) =>
                              att.kind === 'image' && att.previewUrl ? (
                                <img
                                  key={att.id}
                                  src={att.previewUrl}
                                  alt={att.name}
                                  className="max-h-56 rounded-xl border border-white/10 object-cover"
                                />
                              ) : (
                                <div
                                  key={att.id}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#191B1F] border border-white/10 text-xs text-stone-200"
                                >
                                  {att.kind === 'pdf' ? (
                                    <FileText className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                  ) : (
                                    <FileCode2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                                  )}
                                  <span className="truncate max-w-[180px]">{att.name}</span>
                                  <span className="font-mono-tech text-[11px] text-stone-500">
                                    {formatFileSize(att.sizeBytes)}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {msg.text && (
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div key={msg.id} className="flex items-start gap-3 sm:gap-4">
                      <div
                        aria-hidden="true"
                        className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-display font-bold text-xs flex items-center justify-center shrink-0 mt-0.5"
                      >
                        J
                      </div>

                      <div className="flex-1 min-w-0 space-y-3">
                        <MarkdownRenderer content={msg.text} />

                        {msg.dispatchedCommands && msg.dispatchedCommands.length > 0 && (
                          <div className="p-3 rounded-xl bg-[#191B1F] border border-teal-500/25 text-xs text-teal-300 space-y-1">
                            {msg.dispatchedCommands.map((dc, i) => (
                              <div key={dc.command.id + i} className="flex items-center justify-between gap-2">
                                <span>
                                  أمر ESP32: {dc.command.action}
                                  {typeof dc.command.ledState === 'boolean' ? ` (${dc.command.ledState ? 'تشغيل' : 'إطفاء'})` : ''}
                                  {typeof dc.command.armAngle === 'number' ? ` (${dc.command.armAngle}°)` : ''}
                                  {typeof dc.command.motorSpeed === 'number' ? ` (${dc.command.motorSpeed}%)` : ''}
                                </span>
                                <span className="font-mono-tech text-[11px] text-stone-400">
                                  {dc.publishedToBroker ? 'MQTT مرسل' : 'محاكاة محلية'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await copyTextWithFallback(msg.text);
                              if (ok) {
                                setCopiedMsgId(msg.id);
                                setTimeout(() => setCopiedMsgId((prev) => (prev === msg.id ? null : prev)), 1800);
                              }
                            }}
                            className="inline-flex items-center gap-1 text-stone-400 hover:text-stone-100 transition-colors"
                          >
                            {copiedMsgId === msg.id ? (
                              <Check className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{copiedMsgId === msg.id ? 'تم النسخ' : 'نسخ'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onPlayTts(msg.text)}
                            aria-label={ttsPlayingId === msg.text ? 'إيقاف الصوت' : 'تشغيل الرد بالصوت'}
                            className="inline-flex items-center gap-1 text-stone-400 hover:text-stone-100 transition-colors"
                          >
                            <Volume2 className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                            <span>{ttsPlayingId === msg.text ? 'إيقاف الصوت' : 'استماع'}</span>
                          </button>

                          {msg.signSteps && msg.signSteps.length > 0 && (
                            <button
                              type="button"
                              onClick={() => onOpenSignTranslation(msg.signSteps!, msg.text)}
                              className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition-colors font-semibold"
                            >
                              <Hand className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>عرض بلغة الإشارة ({msg.signSteps.length} خطوة)</span>
                            </button>
                          )}

                          {msg.isError && msg.retryPrompt && (
                            <button
                              type="button"
                              disabled={isSending}
                              onClick={() => onSendMessage(msg.retryPrompt!)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-50 font-bold"
                            >
                              <RotateCcw className="w-3 h-3" aria-hidden="true" />
                              <span>إعادة المحاولة</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}

                {(isSending || transcribing) && (
                  <div className="flex items-center gap-3 py-1">
                    <div
                      aria-hidden="true"
                      className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-display font-bold text-xs flex items-center justify-center shrink-0"
                    >
                      J
                    </div>
                    <span className="text-sm text-amber-400 font-medium">
                      {transcribing ? 'جاري تحويل الرسالة الصوتية إلى نص...' : 'يفكر المساعد في الإجابة...'}
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Floating Claude/ChatGPT/Gemini Rounded Pill Composer */}
          <div className="w-full max-w-3xl mx-auto px-3 sm:px-6 pb-4 pt-1 shrink-0">
            {/* Quick Suggested Robot Commands Bar */}
            <div
              data-testid="suggested-robot-commands"
              className="mb-2.5 rounded-2xl bg-[#191B1F] border border-white/8 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowRobotQuickPrompts((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300"
                >
                  <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>أوامر مقترحة للروبوت ({SUGGESTED_ROBOT_CHAT_PROMPTS.length})</span>
                  {showRobotQuickPrompts ? (
                    <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
                <span className="text-[11px] text-stone-500 hidden sm:inline">
                  اضغط على أي أمر عشان يتنفّذ فوراً في الشات
                </span>
              </div>

              {showRobotQuickPrompts && (
                <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
                  {SUGGESTED_ROBOT_CHAT_PROMPTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isSending}
                      onClick={() => onSendMessage(item.prompt)}
                      title={item.prompt}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#22252B] hover:bg-amber-500 hover:text-stone-950 text-stone-200 border border-white/10 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(voiceError || ttsError || attachmentError) && (
              <div className="mb-2 px-3.5 py-2 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl flex items-center justify-between gap-2">
                <span>{attachmentError || voiceError || ttsError}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentError(null);
                    setVoiceError(null);
                  }}
                  aria-label="إغلاق التنبيه"
                  className="text-rose-300 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form
              onSubmit={handleFormSubmit}
              className="rounded-3xl bg-[#1E2025] border border-white/10 focus-within:border-amber-500/50 shadow-2xl transition-colors"
            >
              {/* Pending Attachment Preview Chips */}
              {attachments.length > 0 && (
                <div
                  data-testid="composer-attachments"
                  className="px-4 pt-3 pb-1 flex flex-wrap gap-2"
                >
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="relative group inline-flex items-center gap-2 rounded-xl bg-[#131416] border border-white/10 p-1.5 pr-2 text-xs text-stone-200"
                    >
                      {att.kind === 'image' && att.previewUrl ? (
                        <img
                          src={att.previewUrl}
                          alt={att.name}
                          className="w-11 h-11 rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-[#22252B] flex items-center justify-center shrink-0">
                          {att.kind === 'pdf' ? (
                            <FileText className="w-4 h-4 text-rose-400" />
                          ) : (
                            <FileCode2 className="w-4 h-4 text-teal-400" />
                          )}
                        </div>
                      )}
                      <div className="min-w-0 max-w-[140px]">
                        <p className="font-semibold truncate">{att.name}</p>
                        <p className="text-[10px] font-mono-tech text-stone-400">
                          {formatFileSize(att.sizeBytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        aria-label={`إزالة ${att.name}`}
                        className="p-1 rounded-full text-stone-400 hover:text-white hover:bg-white/10"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Textarea Input */}
              <div className="px-4 pt-3 pb-1">
                <label htmlFor="chat-message-input" className="sr-only">
                  اكتب سؤالك أو أمر الروبوت
                </label>
                <textarea
                  ref={textareaRef}
                  id="chat-message-input"
                  rows={1}
                  value={inputText}
                  onChange={(e) => {
                    setInputText(e.target.value);
                    if (voiceError) setVoiceError(null);
                  }}
                  onKeyDown={handleTextareaKeyDown}
                  onPaste={handlePaste}
                  placeholder={
                    isRecording
                      ? 'جاري تسجيل صوتك... اضغط المايك للإرسال'
                      : 'اسأل JisrBot عن أي شيء، أرفق ملفاً أو صورة، أو وجّه أمراً للروبوت...'
                  }
                  disabled={isSending || isRecording}
                  className="w-full resize-none bg-transparent text-[15px] text-stone-100 placeholder:text-stone-500 focus:outline-none leading-relaxed max-h-[180px]"
                />
              </div>

              {/* Hidden File & Image Inputs */}
              <input
                ref={fileInputRef}
                data-testid="chat-file-input"
                type="file"
                multiple
                accept=".pdf,.txt,.md,.markdown,.csv,.tsv,.json,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.ino,.html,.htm,.css,.scss,.xml,.yaml,.yml,.sql,.sh,.log"
                className="sr-only"
                onChange={async (e) => {
                  if (e.target.files) await addIncomingFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={imageInputRef}
                data-testid="chat-image-input"
                type="file"
                multiple
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  if (e.target.files) await addIncomingFiles(e.target.files);
                  e.target.value = '';
                }}
              />

              {/* Bottom Composer Action Row */}
              <div className="px-3 pb-2.5 pt-1 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    disabled={isSending || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                    onClick={() => fileInputRef.current?.click()}
                    title="إرفاق ملف (PDF، نص، CSV، كود برمجي)"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-300 hover:text-stone-100 hover:bg-white/6 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    <Paperclip className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>ملف</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSending || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                    onClick={() => imageInputRef.current?.click()}
                    title="رفع صورة من الجهاز"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-300 hover:text-stone-100 hover:bg-white/6 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    <ImagePlus className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>صورة</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSending || attachments.length >= MAX_ATTACHMENTS_PER_MESSAGE}
                    onClick={() => setCameraModalOpen(true)}
                    title="التقاط صورة مباشرة بالكاميرا"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-stone-300 hover:text-stone-100 hover:bg-white/6 disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>تصوير</span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleVoiceRecording}
                    disabled={isSending || transcribing}
                    aria-label={isRecording ? 'إيقاف التسجيل الصوتي وإرساله' : 'تسجيل رسالة صوتية'}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                      isRecording
                        ? 'bg-rose-500 text-white'
                        : 'text-stone-300 hover:text-stone-100 hover:bg-white/6'
                    }`}
                  >
                    {isRecording ? (
                      <MicOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">{isRecording ? 'إيقاف' : 'صوت'}</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={(!inputText.trim() && attachments.length === 0) || isSending}
                  aria-label="إرسال الرسالة"
                  className="w-9 h-9 rounded-full bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-30 disabled:hover:bg-amber-500 flex items-center justify-center transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </form>

            <p className="text-[11px] text-stone-500 text-center mt-2">
              يدعم رفع ملفات PDF والنص والكود والصور والتصوير بالكاميرا، مع تنفيذ أوامر ESP32 عند الطلب.
            </p>
          </div>
        </div>

        <CameraCaptureModal
          isOpen={cameraModalOpen}
          onClose={() => setCameraModalOpen(false)}
          onAttachPhoto={(photoAttachment) => {
            setAttachmentError(null);
            setAttachments((prev) => [...prev, photoAttachment].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
          }}
        />
      </section>
    );
  }

  // VIEW 2: ESP32 LIVE STATE & MANUAL CONTROLS
  return (
    <section
      aria-label="لوحة التحكم المباشر بالروبوت ESP32"
      className="w-full max-w-4xl mx-auto flex-1 bg-[#191B1F] border-x border-white/8 flex flex-col min-h-0"
    >
      <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between gap-3 bg-[#131416]">
        <div>
          <h2 className="text-base font-bold text-stone-100">أوامر الروبوت وحالة ESP32</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            تحكم فوري بالعتاد ومتابعة آخر الأوامر المرسلة عبر MQTT
          </p>
        </div>
        <button
          type="button"
          onClick={() => onTabChange('chat')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37]"
        >
          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
          <span>العودة للمحادثة</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Telemetry Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#131416] border border-white/8">
            <span className="text-xs text-stone-400 block">حالة المصباح (LED)</span>
            <span className="mt-1 text-sm font-bold text-stone-100 block">
              {robotState.ledOn ? 'مُضاء (ON)' : 'مُطفأ (OFF)'}
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#131416] border border-white/8">
            <span className="text-xs text-stone-400 block">زاوية الذراع</span>
            <span className="mt-1 text-sm font-bold font-mono-tech text-amber-400 block">
              {robotState.armAngle}°
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#131416] border border-white/8">
            <span className="text-xs text-stone-400 block">سرعة الموتور</span>
            <span className="mt-1 text-sm font-bold font-mono-tech text-teal-400 block">
              {robotState.motorSpeed}%
            </span>
          </div>
          <div className="p-3.5 rounded-xl bg-[#131416] border border-white/8">
            <span className="text-xs text-stone-400 block">حالة اتصال MQTT</span>
            <span className="mt-1 text-sm font-bold text-stone-100 block">
              {mqttState === 'connected' ? 'متصل' : mqttState === 'connecting' ? 'جاري الاتصال' : 'غير متصل'}
            </span>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400 font-mono-tech bg-[#131416] border border-white/8 rounded-lg px-3 py-2"
          dir="ltr"
        >
          <span className="truncate">Topic: {topicCommand}</span>
          <span className="text-amber-400 shrink-0">Sign: {robotState.activeSign}</span>
        </div>

        {robotCommandError && (
          <div className="px-3 py-2 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-lg">
            {robotCommandError}
          </div>
        )}

        {/* Direct Hardware Actuators */}
        <div className="space-y-4 pt-2 border-t border-white/8">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-stone-200">التحكم المباشر بالمصباح (Pin 2)</span>
            <button
              type="button"
              onClick={() =>
                dispatchRobotWithFeedback({
                  action: 'set_led',
                  ledState: !robotState.ledOn,
                  note: !robotState.ledOn ? 'تشغيل المصباح يدوياً' : 'إطفاء المصباح يدوياً',
                })
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                robotState.ledOn
                  ? 'bg-amber-500 text-stone-950 hover:bg-amber-400'
                  : 'bg-[#22252B] text-stone-200 hover:bg-[#2B2F37]'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>{robotState.ledOn ? 'إطفاء LED' : 'تشغيل LED'}</span>
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="arm-angle-range" className="font-semibold text-stone-200">
                زاوية سيرفو الذراع (Pin 14)
              </label>
              <span className="font-mono-tech text-amber-400">{draftArmAngle}°</span>
            </div>
            <input
              id="arm-angle-range"
              type="range"
              min={0}
              max={180}
              step={5}
              value={draftArmAngle}
              onChange={(e) => setDraftArmAngle(Number(e.target.value))}
              onPointerUp={() =>
                dispatchRobotWithFeedback({
                  action: 'set_arm_angle',
                  armAngle: draftArmAngle,
                  note: `ضبط زاوية الذراع إلى ${draftArmAngle}°`,
                })
              }
              onTouchEnd={() =>
                dispatchRobotWithFeedback({
                  action: 'set_arm_angle',
                  armAngle: draftArmAngle,
                  note: `ضبط زاوية الذراع إلى ${draftArmAngle}°`,
                })
              }
              onKeyUp={() =>
                dispatchRobotWithFeedback({
                  action: 'set_arm_angle',
                  armAngle: draftArmAngle,
                  note: `ضبط زاوية الذراع إلى ${draftArmAngle}°`,
                })
              }
              className="w-full accent-amber-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="motor-speed-range" className="font-semibold text-stone-200">
                سرعة الموتور PWM (Pin 13)
              </label>
              <span className="font-mono-tech text-teal-400">{draftMotorSpeed}%</span>
            </div>
            <input
              id="motor-speed-range"
              type="range"
              min={0}
              max={100}
              step={5}
              value={draftMotorSpeed}
              onChange={(e) => setDraftMotorSpeed(Number(e.target.value))}
              onPointerUp={() =>
                dispatchRobotWithFeedback({
                  action: 'set_motor_speed',
                  motorSpeed: draftMotorSpeed,
                  note: `ضبط سرعة الموتور إلى ${draftMotorSpeed}%`,
                })
              }
              onTouchEnd={() =>
                dispatchRobotWithFeedback({
                  action: 'set_motor_speed',
                  motorSpeed: draftMotorSpeed,
                  note: `ضبط سرعة الموتور إلى ${draftMotorSpeed}%`,
                })
              }
              onKeyUp={() =>
                dispatchRobotWithFeedback({
                  action: 'set_motor_speed',
                  motorSpeed: draftMotorSpeed,
                  note: `ضبط سرعة الموتور إلى ${draftMotorSpeed}%`,
                })
              }
              className="w-full accent-teal-500"
            />
          </div>

          <button
            type="button"
            onClick={() => dispatchRobotWithFeedback({ action: 'reset', note: 'إعادة ضبط الروبوت' })}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>رجّع الروبوت لوضع الراحة (Reset)</span>
          </button>
        </div>

        {/* Rich Suggested Robot Commands & Routines Grid */}
        <div
          data-testid="robot-presets-section"
          className="pt-4 border-t border-white/8 space-y-5"
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-amber-400">
                أوامر مركبة جاهزة للروبوت (ضغطة واحدة)
              </h3>
              <span className="text-[11px] text-stone-500">تنفّذ خطوات متتالية</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROBOT_ROUTINE_PRESETS.map((routine: RobotRoutinePreset) => {
                const isRunning = runningRoutineId === routine.id;
                return (
                  <button
                    key={routine.id}
                    type="button"
                    disabled={Boolean(runningRoutineId)}
                    onClick={async () => {
                      setRunningRoutineId(routine.id);
                      for (const step of routine.steps) {
                        await dispatchRobotWithFeedback(step);
                      }
                      setRunningRoutineId(null);
                    }}
                    className="p-3 rounded-xl bg-[#131416] hover:bg-[#22252B] border border-white/10 text-right transition-colors flex items-start justify-between gap-3 disabled:opacity-60"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-xs font-bold text-stone-100 block">{routine.label}</span>
                      <span className="text-[11px] text-stone-400 block">{routine.description}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 text-[11px] font-bold shrink-0">
                      <Play className="w-3 h-3" aria-hidden="true" />
                      <span>{isRunning ? 'شغال...' : 'تشغيل'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {(
            ['إضاءة وطوارئ', 'زوايا الذراع', 'سرعة الموتور', 'إشارات اليد'] as const
          ).map((cat) => {
            const items = ROBOT_HARDWARE_PRESETS.filter((p) => p.category === cat);
            return (
              <div key={cat} className="space-y-2">
                <h4 className="text-xs font-bold text-stone-300">{cat}</h4>
                <div className="flex flex-wrap gap-2">
                  {items.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => dispatchRobotWithFeedback(preset.payload)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] hover:bg-amber-500 hover:text-stone-950 text-stone-200 border border-white/10 transition-colors whitespace-nowrap"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live MQTT Command Dispatch Log */}
        <div className="pt-3 border-t border-white/8 space-y-2">
          <h4 className="text-xs font-bold text-stone-300">سجل الأوامر المرسلة إلى ESP32</h4>
          {commandHistory.length === 0 ? (
            <p className="text-xs text-stone-500 py-3">لم يتم إرسال أوامر بعد.</p>
          ) : (
            <div className="space-y-2">
              {commandHistory.slice(0, 12).map((entry) => (
                <div
                  key={entry.command.id}
                  className="p-2.5 rounded-lg bg-[#131416] border border-white/8 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-stone-200">
                      {entry.command.note || entry.command.action}
                    </span>
                    <span className="font-mono-tech text-[11px] text-teal-400">
                      {entry.publishedToBroker ? 'MQTT مرسل' : 'محلي'}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-tech text-stone-400 truncate" dir="ltr">
                    {JSON.stringify(entry.command)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
