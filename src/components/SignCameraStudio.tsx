import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  BookOpen,
  Camera,
  Delete,
  Hand,
  RefreshCw,
  Send,
  Space,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { HandStage3D } from './HandStage3D';
import { SignLexiconPanel } from './SignLexiconPanel';
import type { RobotCommandPayload, RobotState } from '../lib/esp32Codegen';
import {
  SIGN_LEXICON,
  type SignDefinition,
  type SignId,
  type SignStep,
} from '../lib/signLanguage';
import {
  classifyHandLandmarks,
  HAND_CONNECTIONS,
  type HandLandmarkPoint,
  type SignRecognitionMode,
} from '../lib/handGestureClassifier';

interface SignCameraStudioProps {
  signSteps: SignStep[];
  sequenceTrigger: number;
  latestAiReplyText: string;
  composedText: string;
  onComposedTextChange: React.Dispatch<React.SetStateAction<string>>;
  isSendingAi: boolean;
  robotState: RobotState;
  ttsPlayingText: string | null;
  ttsError?: string | null;
  onPlayTts: (text: string) => Promise<void>;
  onReplayAiSignReply: () => void;
  onSendSignMessage: (composedText: string) => Promise<void>;
  onPreviewSign: (signId: SignId) => void;
  onSendSignToEsp32: (sign: SignDefinition) => void;
  onManualRobotCommand: (payload: {
    action: RobotCommandPayload['action'];
    signGesture?: SignId;
    note?: string;
    source?: 'manual' | 'sign_camera';
  }) => Promise<{ ok: boolean; error?: string }>;
}

interface RecognitionResult {
  handDetected: boolean;
  isLetter?: boolean;
  detectedSignId: SignId | null;
  confidence: number;
  recognizedWordAr: string;
  arabicMeaning: string;
  englishMeaning: string;
  explanationAr: string;
  responseSigns: SignId[];
}

const SAMPLE_SIGN_TESTS: Array<{ signId: SignId; label: string }> = [
  { signId: 'HELLO', label: 'مرحباً' },
  { signId: 'PEACE', label: 'سلام / ٢' },
  { signId: 'GOOD', label: 'ممتاز' },
  { signId: 'STOP', label: 'توقف' },
  { signId: 'LOVE', label: 'أحبك' },
  { signId: 'HELP', label: 'مساعدة' },
];

const FINGER_EXTENDED_MAP: Partial<Record<SignId, [boolean, boolean, boolean, boolean, boolean]>> = {
  HELLO: [true, true, true, true, true],
  STOP: [true, true, true, true, true],
  OPEN_HAND: [true, true, true, true, true],
  COUNT_5: [true, true, true, true, true],
  PEACE: [false, true, true, false, false],
  COUNT_2: [false, true, true, false, false],
  GOOD: [true, false, false, false, false],
  HELP: [true, false, false, false, false],
  LOVE: [true, true, false, false, true],
  POINT: [false, true, false, false, false],
  COUNT_1: [false, true, false, false, false],
  COUNT_3: [true, true, true, false, false],
  COUNT_4: [false, true, true, true, true],
  CALL_ME: [true, false, false, false, true],
  FIST: [false, false, false, false, false],
  YES: [false, false, false, false, false],
  NO: [true, true, true, false, false],
  OK: [true, true, true, true, true],
  THANK_YOU: [true, true, true, true, true],
  GO: [false, true, false, false, false],
  RAISE_HAND: [true, true, true, true, true],
  REST: [true, true, true, true, true],
};

function renderSampleHandJpegBase64(signId: SignId): string {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 360, 280);

  ctx.fillStyle = '#e2a884';
  const drawFinger = (x: number, y: number, w: number, h: number, angle = 0) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h, w, h, w / 2);
    ctx.fill();
    ctx.restore();
  };

  ctx.beginPath();
  ctx.roundRect(130, 145, 96, 95, 22);
  ctx.fill();

  const [thumb, idx, mid, ring, pinky] = FINGER_EXTENDED_MAP[signId] ?? [true, true, true, true, true];
  if (thumb) drawFinger(122, 195, 22, 62, -0.65);
  if (idx) drawFinger(146, 152, 20, 82, -0.06);
  if (mid) drawFinger(172, 148, 20, 92, 0);
  if (ring) drawFinger(198, 150, 19, 82, 0.05);
  if (pinky) drawFinger(222, 160, 17, 64, 0.12);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(SIGN_LEXICON[signId].glossEn, 180, 262);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return dataUrl.split(',')[1] || '';
}

let sharedHandLandmarkerPromise: Promise<HandLandmarker> | null = null;

async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!sharedHandLandmarkerPromise) {
    sharedHandLandmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        });
      } catch {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.5,
        });
      }
    })();
  }
  return sharedHandLandmarkerPromise;
}

function drawHandOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: HandLandmarkPoint[] | null
) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!landmarks || landmarks.length < 21) return;

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f59e0b';
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(pa.x * w, pa.y * h);
    ctx.lineTo(pb.x * w, pb.y * h);
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, isTip ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? '#2dd4bf' : '#fef3c7';
    ctx.fill();
  }
}

export const SignCameraStudio: React.FC<SignCameraStudioProps> = ({
  signSteps,
  sequenceTrigger,
  latestAiReplyText,
  composedText,
  onComposedTextChange,
  isSendingAi,
  robotState,
  ttsPlayingText,
  ttsError,
  onPlayTts,
  onReplayAiSignReply,
  onSendSignMessage,
  onPreviewSign,
  onSendSignToEsp32,
  onManualRobotCommand,
}) => {
  const [rightMode, setRightMode] = useState<'camera' | 'lexicon'>('camera');
  const [recognitionMode, setRecognitionMode] = useState<SignRecognitionMode>('auto');
  const [activeStageSign, setActiveStageSign] = useState<SignId>('HELLO');
  const [expandReply, setExpandReply] = useState(false);
  const [espFeedback, setEspFeedback] = useState<string | null>(null);

  // Top-bar word timeline sync with HandStage3D
  const [stageStepInfo, setStageStepInfo] = useState<{ index: number; total: number }>({
    index: 0,
    total: Math.max(1, signSteps.length),
  });
  const [externalJump, setExternalJump] = useState<{ index: number; token: number } | null>(null);
  const topTimelineRef = useRef<HTMLDivElement | null>(null);

  const wordChips = useMemo(() => {
    const chips: Array<{ word: string; firstStepIdx: number; lastStepIdx: number }> = [];
    const steps = signSteps.length > 0 ? signSteps : [];
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const wordKey = st.key.split('_ch_')[0];
      const prev = chips[chips.length - 1];
      if (prev && steps[prev.firstStepIdx].key.split('_ch_')[0] === wordKey) {
        prev.lastStepIdx = i;
      } else {
        chips.push({ word: st.sourceWord, firstStepIdx: i, lastStepIdx: i });
      }
    }
    return chips;
  }, [signSteps]);

  useEffect(() => {
    const container = topTimelineRef.current;
    if (!container) return;
    const activeBtn = container.querySelector<HTMLButtonElement>('[data-active-chip="true"]');
    if (!activeBtn) return;
    const targetLeft = activeBtn.offsetLeft - container.clientWidth / 2 + activeBtn.clientWidth / 2;
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
  }, [stageStepInfo.index]);

  const handleStageStepIndexChange = useCallback((index: number, total: number) => {
    setStageStepInfo((prev) =>
      prev.index === index && prev.total === total ? prev : { index, total }
    );
  }, []);

  // Camera & ultra-fast local MediaPipe + Gemini fallback state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastAutoWordRef = useRef<string>('');
  const lastWasLetterRef = useRef<boolean>(false);
  const lastHandDetectedRef = useRef<boolean>(false);
  const analyzingRef = useRef(false);
  const recognitionModeRef = useRef<SignRecognitionMode>('auto');
  recognitionModeRef.current = recognitionMode;
  const captureFnRef = useRef<((isFromAuto?: boolean) => Promise<void>) | null>(null);

  // Real-time stability state for 30fps MediaPipe tracking
  const stableCandidateRef = useRef<{ word: string; startedAt: number }>({ word: '', startedAt: 0 });
  const noHandSinceRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [trackerMode, setTrackerMode] = useState<'loading' | 'realtime_local' | 'cloud_fallback'>('loading');
  const [liveHandLocked, setLiveHandLocked] = useState(false);
  const [livePreviewLabel, setLivePreviewLabel] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzingSign, setAnalyzingSign] = useState(false);
  const [signResult, setSignResult] = useState<RecognitionResult | null>(null);

  const appendRecognizedWord = useCallback(
    (word: string, isFromAuto = false, isLetter = false) => {
      const clean = word.trim();
      if (!clean) return;
      if (isFromAuto && lastAutoWordRef.current === clean) {
        return;
      }
      const shouldJoinDirectly = isLetter && clean.length === 1 && lastWasLetterRef.current;

      lastAutoWordRef.current = clean;
      lastWasLetterRef.current = isLetter && clean.length === 1;

      onComposedTextChange((prev) => {
        if (shouldJoinDirectly) {
          return prev + clean;
        }
        const trimmedPrev = prev.trim();
        return trimmedPrev ? `${trimmedPrev} ${clean}` : clean;
      });
    },
    [onComposedTextChange]
  );

  const stopCamera = () => {
    setAutoCapture(false);
    setLiveHandLocked(false);
    setLivePreviewLabel('');
    lastHandDetectedRef.current = false;
    lastAutoWordRef.current = '';
    stableCandidateRef.current = { word: '', startedAt: 0 };
    if (overlayCanvasRef.current) {
      const ctx = overlayCanvasRef.current.getContext('2d');
      ctx?.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height);
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('الكاميرا غير متاحة في هذا المتصفح. يمكنك رفع صورة إشارة أو تجربة النماذج بالأسفل.');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      lastHandDetectedRef.current = false;
      lastAutoWordRef.current = '';
      stableCandidateRef.current = { word: '', startedAt: 0 };
      setTrackerMode('loading');
      setAutoCapture(true);
      setCameraActive(true);
    } catch {
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setCameraActive(false);
      setCameraError('تعذر فتح الكاميرا (تأكد من منح الإذن أو استخدم رفع صورة / نماذج الاختبار بالأسفل).');
    }
  };

  const analyzeSignBase64 = async (
    imageBase64: string,
    mimeType: string,
    isFromAuto = false,
    modeOverride?: SignRecognitionMode
  ) => {
    analyzingRef.current = true;
    setAnalyzingSign(true);
    setCameraError(null);
    try {
      const resp = await fetch('/api/ai/recognize-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType,
          mode: modeOverride ?? recognitionModeRef.current,
        }),
      });
      const data = (await resp.json()) as RecognitionResult & { error?: string };
      if (!resp.ok) {
        throw new Error(data.error || 'تعذر تحليل الإشارة.');
      }

      setSignResult(data);
      lastHandDetectedRef.current = Boolean(data.handDetected);
      if (data.handDetected && data.recognizedWordAr) {
        appendRecognizedWord(data.recognizedWordAr, isFromAuto, Boolean(data.isLetter));
      } else if (!data.handDetected) {
        lastAutoWordRef.current = '';
        lastWasLetterRef.current = false;
      }
    } catch (err: unknown) {
      if (!isFromAuto) {
        setCameraError(err instanceof Error ? err.message : 'فشل تحليل لغة الإشارة.');
      }
    } finally {
      analyzingRef.current = false;
      setAnalyzingSign(false);
    }
  };

  const captureFromCamera = async (isFromAuto = false) => {
    const video = videoRef.current;
    if (!video || analyzingRef.current || video.readyState < 2) return;

    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 480;
    const maxSide = 480;
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    const base64 = dataUrl.split(',')[1] || '';
    if (base64) {
      await analyzeSignBase64(base64, 'image/jpeg', isFromAuto);
    }
  };

  captureFnRef.current = captureFromCamera;

  // Real-time 30 FPS local MediaPipe HandLandmarker loop (with cloud fallback if unavailable)
  useEffect(() => {
    if (!cameraActive) return;

    let cancelled = false;
    let rafId = 0;
    let fallbackTimerId = 0;
    let lastVideoTime = -1;

    const startCloudFallbackLoop = () => {
      if (cancelled) return;
      setTrackerMode('cloud_fallback');
      const runLoop = async (delay: number) => {
        fallbackTimerId = window.setTimeout(async () => {
          if (cancelled) return;
          if (autoCapture && !analyzingRef.current) {
            await captureFnRef.current?.(true);
          }
          if (!cancelled) runLoop(260);
        }, delay);
      };
      runLoop(200);
    };

    (async () => {
      try {
        const landmarker = await getHandLandmarker();
        if (cancelled) return;
        setTrackerMode('realtime_local');

        const tick = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const overlay = overlayCanvasRef.current;

          if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const result = landmarker.detectForVideo(video, now);
            const lm = result.landmarks?.[0] as HandLandmarkPoint[] | undefined;

            if (overlay) {
              drawHandOverlay(overlay, video, lm ?? null);
            }

            if (lm && lm.length >= 21) {
              noHandSinceRef.current = 0;
              setLiveHandLocked(true);
              lastHandDetectedRef.current = true;

              const cls = classifyHandLandmarks(lm, recognitionModeRef.current);
              if (cls && cls.detectedSignId !== 'OPEN_HAND') {
                setLivePreviewLabel(`${cls.recognizedWordAr} (${cls.confidence}%)`);

                if (autoCapture) {
                  if (stableCandidateRef.current.word !== cls.recognizedWordAr) {
                    stableCandidateRef.current = { word: cls.recognizedWordAr, startedAt: now };
                  } else if (now - stableCandidateRef.current.startedAt >= 320) {
                    if (lastAutoWordRef.current !== cls.recognizedWordAr) {
                      appendRecognizedWord(cls.recognizedWordAr, true, cls.isLetter);
                      setSignResult({
                        handDetected: true,
                        isLetter: cls.isLetter,
                        detectedSignId: cls.detectedSignId,
                        confidence: cls.confidence,
                        recognizedWordAr: cls.recognizedWordAr,
                        arabicMeaning: cls.arabicMeaning,
                        englishMeaning: cls.englishMeaning,
                        explanationAr: cls.explanationAr,
                        responseSigns: [cls.detectedSignId],
                      });
                    }
                  }
                }
              } else {
                setLivePreviewLabel('تم رصد اليد...');
              }
            } else {
              if (noHandSinceRef.current === 0) {
                noHandSinceRef.current = now;
              }
              if (now - noHandSinceRef.current >= 220) {
                setLiveHandLocked(false);
                setLivePreviewLabel('');
                lastHandDetectedRef.current = false;
                lastAutoWordRef.current = '';
                stableCandidateRef.current = { word: '', startedAt: 0 };
              }
            }
          }

          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      } catch {
        startCloudFallbackLoop();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      clearTimeout(fallbackTimerId);
    };
  }, [cameraActive, autoCapture, appendRecognizedWord]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCameraError(null);
    const reader = new FileReader();
    reader.onerror = () => {
      setCameraError('تعذر قراءة الملف المختار.');
    };
    reader.onloadend = async () => {
      const dataUrl = String(reader.result || '');
      if (!dataUrl) {
        setCameraError('ملف الصورة فارغ أو غير مدعوم.');
        return;
      }
      const img = new Image();
      img.onerror = () => {
        setCameraError('صيغة الصورة غير مدعومة أو الملف تالف. استخدم صورة JPG أو PNG.');
      };
      img.onload = async () => {
        const maxSide = 720;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const compressed = canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
          if (compressed) {
            await analyzeSignBase64(compressed, 'image/jpeg', false);
            return;
          }
        }
        const fallbackBase64 = dataUrl.split(',')[1] || '';
        if (fallbackBase64) {
          await analyzeSignBase64(fallbackBase64, file.type || 'image/jpeg', false);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runSampleSignRecognition = async (signId: SignId) => {
    const base64 = renderSampleHandJpegBase64(signId);
    if (base64) {
      await analyzeSignBase64(base64, 'image/jpeg', false);
    }
  };

  const handleBackspaceWord = () => {
    lastAutoWordRef.current = '';
    lastWasLetterRef.current = false;
    onComposedTextChange((prev) => {
      const parts = prev.trim().split(/\s+/).filter(Boolean);
      parts.pop();
      return parts.join(' ');
    });
  };

  const handleClearComposed = () => {
    lastAutoWordRef.current = '';
    lastWasLetterRef.current = false;
    onComposedTextChange('');
  };

  const handleSubmitComposed = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = composedText.trim();
    if (!trimmed || isSendingAi) return;
    onComposedTextChange('');
    lastAutoWordRef.current = '';
    lastWasLetterRef.current = false;
    await onSendSignMessage(trimmed);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:overflow-hidden">
      {/* VERY TOP FULL-WIDTH BAR: Words Currently Performed by the 3D Hand Model */}
      <div
        data-testid="sign-sentence-timeline"
        className="w-full min-w-0 shrink-0 bg-[#191B1F] border-b border-white/10 px-3 sm:px-4 py-2 flex items-center gap-2.5"
      >
        <div className="flex items-center gap-1.5 shrink-0 text-[11px] sm:text-xs font-bold text-stone-300">
          <Hand className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline text-stone-200">كلمات المجسم:</span>
          <span className="text-amber-400 font-mono-tech">
            {stageStepInfo.index + 1}/{stageStepInfo.total}
          </span>
        </div>

        <div
          ref={topTimelineRef}
          className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto py-0.5"
        >
          {wordChips.map((chip) => {
            const isCurrent =
              stageStepInfo.index >= chip.firstStepIdx && stageStepInfo.index <= chip.lastStepIdx;
            const isDone = stageStepInfo.index > chip.lastStepIdx;
            return (
              <button
                key={`${chip.firstStepIdx}_${chip.word}`}
                type="button"
                data-active-chip={isCurrent ? 'true' : undefined}
                onClick={() =>
                  setExternalJump({ index: chip.firstStepIdx, token: Date.now() + chip.firstStepIdx })
                }
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  isCurrent
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : isDone
                    ? 'bg-white/10 text-stone-200 hover:bg-white/15'
                    : 'bg-[#22252B] text-stone-400 hover:text-stone-100 hover:bg-[#2B2F37]'
                }`}
              >
                {chip.word}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split View: 3D Hand Model (Left/Center) + Sign Camera / Lexicon (Right) */}
      <div className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 lg:overflow-hidden">
        {/* 3D Model Column + Current Full AI Reply Text Readout */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[#131416]">
          <HandStage3D
            signSteps={signSteps}
            sequenceTrigger={sequenceTrigger}
            ledOn={robotState.ledOn}
            armAngle={robotState.armAngle}
            replyTitle="المجسم يترجم رد الذكاء الاصطناعي بالكامل"
            hideTopTimeline
            externalJump={externalJump}
            onStepIndexChange={handleStageStepIndexChange}
            onActiveStepChange={(st) => {
              if (st.signId in SIGN_LEXICON) {
                setActiveStageSign(st.signId as SignId);
              }
            }}
          />

          {/* Full AI Reply Reference Strip inside Sign Studio */}
          {latestAiReplyText && (
            <div className="px-4 py-2.5 bg-[#191B1F] border-t border-white/10 space-y-1.5 shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <p
                      data-testid="sign-studio-ai-reply"
                      className={`text-xs sm:text-sm text-stone-200 leading-relaxed ${
                        expandReply ? '' : 'line-clamp-2'
                      }`}
                    >
                      {latestAiReplyText}
                    </p>
                    {latestAiReplyText.length > 95 && (
                      <button
                        type="button"
                        onClick={() => setExpandReply((v) => !v)}
                        className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 mt-0.5"
                      >
                        {expandReply ? 'إخفاء' : 'قراءة الرد كاملاً'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onReplayAiSignReply}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-amber-300 hover:bg-[#2B2F37] whitespace-nowrap"
                  >
                    <Hand className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>ترجمة الرد</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPlayTts(latestAiReplyText)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37] whitespace-nowrap"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-teal-400" aria-hidden="true" />
                    <span>{ttsPlayingText === latestAiReplyText ? 'إيقاف الصوت' : 'استماع'}</span>
                  </button>
                </div>
              </div>
              {ttsError && <p className="text-xs text-rose-300">{ttsError}</p>}
            </div>
          )}
        </div>

        {/* Right Panel: Sign Camera Recognition OR Inline Sign Lexicon */}
        <aside
          aria-label="كاميرا لغة الإشارة والقاموس"
          className="w-full lg:w-[430px] xl:w-[460px] shrink-0 bg-[#191B1F] border-t lg:border-t-0 lg:border-r border-white/10 flex flex-col min-w-0 min-h-0"
        >
          {/* Toggle between Sign Camera & Sign Lexicon inside this single Sign Studio */}
          <div className="p-3 border-b border-white/10 flex items-center gap-1.5 bg-[#131416] shrink-0">
            <button
              type="button"
              onClick={() => setRightMode('camera')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                rightMode === 'camera'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-300 hover:bg-white/5'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>كاميرا والتقاط الإشارة</span>
            </button>

            <button
              type="button"
              onClick={() => setRightMode('lexicon')}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                rightMode === 'lexicon'
                  ? 'bg-amber-500 text-stone-950'
                  : 'text-stone-300 hover:bg-white/5'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>قاموس الإشارة</span>
            </button>
          </div>

          {rightMode === 'lexicon' ? (
            <SignLexiconPanel
              activeSign={activeStageSign}
              onPreviewSign={onPreviewSign}
              onSendSignToEsp32={onSendSignToEsp32}
            />
          ) : (
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-stone-100">
                  التعرف الفوري على اليد والحركات والحروف
                </h2>
                <p className="text-xs text-stone-400 leading-relaxed">
                  عند تشغيل الكاميرا، يتتبّع النظام يدك لحظياً (30 إطار/ثانية) ويكتب الحركات أو الحروف مباشرة في الشريط بالأسفل.
                </p>

                {/* Recognition Focus Mode Selector */}
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#131416] border border-white/8">
                  {(
                    [
                      { id: 'auto', label: 'حركات + حروف' },
                      { id: 'letters', label: 'حروف فقط' },
                      { id: 'gestures', label: 'حركات وكلمات' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setRecognitionMode(m.id);
                        lastAutoWordRef.current = '';
                        stableCandidateRef.current = { word: '', startedAt: 0 };
                      }}
                      className={`px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                        recognitionMode === m.id
                          ? 'bg-amber-500 text-stone-950'
                          : 'text-stone-400 hover:text-stone-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camera Mirror Viewport + Live 21-Point Hand Skeleton Overlay */}
              <div className="relative aspect-video bg-[#131416] border border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 transition-opacity ${
                    cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                />
                <canvas
                  ref={overlayCanvasRef}
                  className={`absolute inset-0 w-full h-full object-cover -scale-x-100 pointer-events-none ${
                    cameraActive ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {!cameraActive && (
                  <div className="relative z-10 text-center p-4 space-y-2">
                    <Camera className="w-8 h-8 text-stone-500 mx-auto" aria-hidden="true" />
                    <p className="text-xs text-stone-400">
                      اضغط تشغيل الكاميرا ليتم رصد يدك وقراءة الحركات والحروف فوراً
                    </p>
                  </div>
                )}
                {cameraActive && (
                  <div
                    className={`absolute top-2.5 right-2.5 z-10 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${
                      liveHandLocked
                        ? 'bg-teal-950/90 border-teal-400/50 text-teal-200'
                        : 'bg-[#131416]/85 border-white/15 text-stone-200'
                    }`}
                  >
                    {trackerMode === 'loading'
                      ? 'جاري تجهيز متتبع اليد الفوري...'
                      : analyzingSign
                      ? 'جاري التحليل بالذكاء الاصطناعي...'
                      : liveHandLocked && livePreviewLabel
                      ? `رصد اليد: ${livePreviewLabel}`
                      : autoCapture
                      ? 'وجّه يدك للكاميرا — الرصد الفوري جاهز'
                      : 'التقاط متوقف مؤقتاً'}
                  </div>
                )}
              </div>

              {/* Camera Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCamera}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 transition-colors whitespace-nowrap"
                  >
                    <Camera className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>تشغيل الكاميرا</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => captureFromCamera(false)}
                      disabled={analyzingSign}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      <Hand className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{analyzingSign ? 'جاري التحليل...' : 'التقاط ذكي بالـ AI'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAutoCapture((v) => !v)}
                      aria-pressed={autoCapture}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                        autoCapture
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-[#22252B] text-stone-200 border-white/10 hover:bg-[#2B2F37]'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${autoCapture ? 'animate-spin' : ''}`} aria-hidden="true" />
                      <span>رصد تلقائي</span>
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="px-3 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37] whitespace-nowrap"
                    >
                      إيقاف
                    </button>
                  </>
                )}

                <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37] cursor-pointer whitespace-nowrap">
                  <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>رفع صورة</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              {cameraError && (
                <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl">
                  {cameraError}
                </div>
              )}

              {/* Quick Sample Gestures for Testing Recognition */}
              <div className="pt-2 border-t border-white/10">
                <p className="text-xs font-semibold text-stone-300 mb-2">
                  تجربة فورية للالتقاط والكتابة بلغة الإشارة (بدون كاميرا):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_SIGN_TESTS.map((sample) => (
                    <button
                      key={sample.signId}
                      type="button"
                      disabled={analyzingSign}
                      onClick={() => runSampleSignRecognition(sample.signId)}
                      className="px-2.5 py-1.5 text-xs bg-[#22252B] hover:bg-[#2B2F37] text-stone-200 border border-white/10 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recognition Result Card */}
              {signResult && (
                <div
                  data-testid="sign-recognition-result"
                  className={`p-3.5 rounded-xl bg-[#131416] border space-y-2 ${
                    signResult.handDetected ? 'border-teal-500/35' : 'border-amber-500/35'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span>{signResult.handDetected ? 'تم التعرف على الإشارة' : 'تنبيه الكاميرا'}</span>
                    {signResult.handDetected && (
                      <span className="font-mono-tech text-teal-400">ثقة {signResult.confidence}%</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-stone-100">
                    {signResult.handDetected
                      ? `${signResult.recognizedWordAr} — ${signResult.arabicMeaning}`
                      : signResult.arabicMeaning}
                  </p>
                  <p className="text-xs text-stone-300 leading-relaxed">{signResult.explanationAr}</p>

                  {signResult.handDetected && signResult.detectedSignId && (
                    <div className="pt-1 space-y-1.5">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setEspFeedback(null);
                            const res = await onManualRobotCommand({
                              action: 'perform_sign',
                              signGesture: signResult.detectedSignId!,
                              note: `تنفيذ إشارة ${signResult.recognizedWordAr}`,
                              source: 'sign_camera',
                            });
                            setEspFeedback(
                              res.ok ? 'تم إرسال الإشارة إلى ESP32 بنجاح.' : res.error || 'تعذر إرسال الإشارة.'
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-200 hover:bg-[#2B2F37]"
                        >
                          تنفيذ الإشارة على ESP32
                        </button>
                      </div>
                      {espFeedback && <p className="text-[11px] text-teal-300">{espFeedback}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* BOTTOM BAR: Text Written by the User in Sign Language via Camera */}
      <form
        onSubmit={handleSubmitComposed}
        data-testid="sign-composed-bar"
        aria-label="النص المكتوب بلغة الإشارة من الكاميرا"
        className="sticky bottom-0 z-20 w-full min-w-0 shrink-0 border-t border-white/10 bg-[#131416] px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
      >
        <div className="flex items-center gap-2 shrink-0">
          <Hand className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
          <span className="text-xs font-bold text-stone-200 whitespace-nowrap">
            النص المكتوب بلغة الإشارة:
          </span>
        </div>

        <label htmlFor="sign-composed-input" className="sr-only">
          النص المكتوب بلغة الإشارة
        </label>
        <input
          id="sign-composed-input"
          data-testid="sign-composed-input"
          type="text"
          value={composedText}
          onChange={(e) => onComposedTextChange(e.target.value)}
          placeholder="اعمل الإشارات أو الحروف أمام الكاميرا ليظهر كلامك هنا فوراً..."
          className="flex-1 min-w-0 px-3.5 py-2 text-sm font-semibold bg-[#191B1F] border border-white/15 rounded-xl text-amber-300 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
        />

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              lastWasLetterRef.current = false;
              lastAutoWordRef.current = '';
              onComposedTextChange((prev) => (prev && !prev.endsWith(' ') ? `${prev} ` : prev));
            }}
            aria-label="إضافة مسافة"
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-300 hover:bg-[#2B2F37] transition-colors whitespace-nowrap"
          >
            <Space className="w-3.5 h-3.5" aria-hidden="true" />
            <span>مسافة</span>
          </button>

          <button
            type="button"
            onClick={handleBackspaceWord}
            disabled={!composedText.trim()}
            aria-label="حذف آخر كلمة"
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-300 hover:bg-[#2B2F37] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Delete className="w-3.5 h-3.5" aria-hidden="true" />
            <span>حذف كلمة</span>
          </button>

          <button
            type="button"
            onClick={handleClearComposed}
            disabled={!composedText.trim()}
            aria-label="مسح النص بالكامل"
            className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-300 hover:bg-[#2B2F37] disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>مسح</span>
          </button>

          <button
            type="submit"
            disabled={!composedText.trim() || isSendingAi}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isSendingAi ? 'جاري الإرسال...' : 'إرسال للذكاء الاصطناعي'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
