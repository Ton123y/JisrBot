import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import {
  BookOpen,
  Camera,
  Check,
  Delete,
  Hand,
  ListPlus,
  MessageSquare,
  RefreshCw,
  Send,
  Space,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  X,
  Zap,
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
  CAPTURE_HOLD_MS,
  classifyBodyAndHands,
  computeBodySpatialContext,
  getSampleBodyAndHandsForDatasetSign,
  getSampleLandmarksForSign,
  HAND_CONNECTIONS,
  NO_HAND_RESET_MS,
  POSE_UPPER_CONNECTIONS,
  type BodySpatialSummary,
  type CaptureSpeedMode,
  type DatasetSampleKey,
  type HandDetectionInput,
  type HandLandmarkPoint,
  type SignRecognitionMode,
} from '../lib/handGestureClassifier';
import {
  appendAccumulatedSentence,
  combineAccumulatedSignMessage,
  QUICK_SENTENCE_SUGGESTIONS,
  suggestLocalArabicSentence,
} from '../lib/signSentenceBuilder';

interface SignCameraStudioProps {
  signSteps: SignStep[];
  sequenceTrigger: number;
  latestAiReplyText: string;
  lastSignUserMessage?: string;
  composedText: string;
  onComposedTextChange: React.Dispatch<React.SetStateAction<string>>;
  accumulatedSentences: string[];
  onAccumulatedSentencesChange: React.Dispatch<React.SetStateAction<string[]>>;
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
  datasetClass?: string;
  spatialSummaryAr?: string;
  arabicMeaning: string;
  englishMeaning: string;
  explanationAr: string;
  responseSigns: SignId[];
}

const SAMPLE_SIGN_TESTS: Array<{ signId: SignId; label: string }> = [
  { signId: 'HELLO', label: 'مرحباً' },
  { signId: 'PEACE', label: 'سلام' },
  { signId: 'GOOD', label: 'ممتاز' },
  { signId: 'STOP', label: 'توقف' },
  { signId: 'LOVE', label: 'أحبك' },
  { signId: 'YES', label: 'نعم' },
  { signId: 'NO', label: 'لا' },
  { signId: 'QUESTION', label: 'سؤال' },
];

const DATASET_SAMPLE_TESTS: Array<{ key: DatasetSampleKey; label: string }> = [
  { key: '3amel_eh', label: 'عامل إيه' },
  { key: 'sabhl_elkheer', label: 'صباح الخير' },
  { key: 'tmam', label: 'تمام' },
  { key: 'bhab', label: 'بحب' },
  { key: 'ktab', label: 'كتاب (يدين)' },
  { key: 'manzel', label: 'بيت (يدين)' },
  { key: 'mafish', label: 'مفيش (يدين)' },
  { key: 'helw_awy', label: 'حلو أوي (يدين)' },
  { key: 'khaly_balk', label: 'خلي بالك' },
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

let sharedVisionPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null;
let sharedHandLandmarkerPromise: Promise<HandLandmarker> | null = null;
let sharedPoseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

function getVisionTasks() {
  if (!sharedVisionPromise) {
    sharedVisionPromise = FilesetResolver.forVisionTasks('/mediapipe/wasm');
  }
  return sharedVisionPromise;
}

async function getHandLandmarker(): Promise<HandLandmarker> {
  if (!sharedHandLandmarkerPromise) {
    sharedHandLandmarkerPromise = (async () => {
      const vision = await getVisionTasks();
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.38,
          minHandPresenceConfidence: 0.38,
          minTrackingConfidence: 0.35,
        });
      } catch {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/hand_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.38,
          minHandPresenceConfidence: 0.38,
          minTrackingConfidence: 0.35,
        });
      }
    })();
  }
  return sharedHandLandmarkerPromise;
}

async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!sharedPoseLandmarkerPromise) {
    sharedPoseLandmarkerPromise = (async () => {
      const vision = await getVisionTasks();
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.38,
        });
      } catch {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/pose_landmarker_lite.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.38,
        });
      }
    })();
  }
  return sharedPoseLandmarkerPromise;
}

function drawBodyAndHandsOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  hands: HandDetectionInput[],
  pose: HandLandmarkPoint[] | null
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

  // 1. Draw upper body pose skeleton (shoulders, arms, torso, face markers)
  if (pose && pose.length >= 25) {
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.72)';
    for (const [a, b] of POSE_UPPER_CONNECTIONS) {
      const pa = pose[a];
      const pb = pose[b];
      if (!pa || !pb) continue;
      if ((pa.visibility ?? 1) < 0.35 || (pb.visibility ?? 1) < 0.35) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x * w, pa.y * h);
      ctx.lineTo(pb.x * w, pb.y * h);
      ctx.stroke();
    }

    // Subtle head focus circle around nose
    const nose = pose[0];
    if (nose && (nose.visibility ?? 1) >= 0.4) {
      ctx.beginPath();
      ctx.arc(nose.x * w, nose.y * h, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
      ctx.stroke();
    }

    // Key upper body joints
    for (const idx of [0, 11, 12, 13, 14, 15, 16]) {
      const p = pose[idx];
      if (!p || (p.visibility ?? 1) < 0.35) continue;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
    }
  }

  // 2. Draw Left & Right hands in distinct colors (Amber = Right, Cyan = Left)
  for (const hand of hands) {
    const landmarks = hand.landmarks;
    if (!landmarks || landmarks.length < 21) continue;
    const isLeft = hand.handedness === 'Left';
    ctx.lineWidth = 3;
    ctx.strokeStyle = isLeft ? '#38bdf8' : '#f59e0b';
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
      ctx.fillStyle = isLeft ? (isTip ? '#e0f2fe' : '#38bdf8') : isTip ? '#fef3c7' : '#2dd4bf';
      ctx.fill();
    }
  }
}

export const SignCameraStudio: React.FC<SignCameraStudioProps> = ({
  signSteps,
  sequenceTrigger,
  latestAiReplyText,
  lastSignUserMessage = '',
  composedText,
  onComposedTextChange,
  accumulatedSentences,
  onAccumulatedSentencesChange,
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
  const [recognitionMode, setRecognitionMode] = useState<SignRecognitionMode>('gestures');
  const [captureSpeed, setCaptureSpeed] = useState<CaptureSpeedMode>('turbo');
  const [activeStageSign, setActiveStageSign] = useState<SignId>('HELLO');
  const [expandReply, setExpandReply] = useState(false);
  const [espFeedback, setEspFeedback] = useState<string | null>(null);
  const [polishingSentence, setPolishingSentence] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

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
  const recognitionModeRef = useRef<SignRecognitionMode>('gestures');
  recognitionModeRef.current = recognitionMode;
  const captureSpeedRef = useRef<CaptureSpeedMode>('turbo');
  captureSpeedRef.current = captureSpeed;
  const captureFnRef = useRef<((isFromAuto?: boolean) => Promise<void>) | null>(null);

  // Real-time stability & zero-wasted-render refs for high-FPS dual-hand + body Pose tracking
  const stableCandidateRef = useRef<{ word: string; startedAt: number }>({ word: '', startedAt: 0 });
  const noHandSinceRef = useRef<number>(0);
  const prevLiveLockedRef = useRef<boolean>(false);
  const prevPreviewLabelRef = useRef<string>('');
  const prevSpatialTextRef = useRef<string>('');
  const latestSpatialRef = useRef<BodySpatialSummary | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [autoCapture, setAutoCapture] = useState(true);
  const [trackerMode, setTrackerMode] = useState<'loading' | 'realtime_local' | 'cloud_fallback'>('loading');
  const [liveHandLocked, setLiveHandLocked] = useState(false);
  const [livePreviewLabel, setLivePreviewLabel] = useState<string>('');
  const [liveSpatialHud, setLiveSpatialHud] = useState<string>('في انتظار رصد الجسم واليدين');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzingSign, setAnalyzingSign] = useState(false);
  const [signResult, setSignResult] = useState<RecognitionResult | null>(null);

  // Pre-warm MediaPipe WASM, Dual-Hand Landmarker & Body Pose Landmarker immediately
  useEffect(() => {
    getHandLandmarker().catch(() => {});
    getPoseLandmarker().catch(() => {});
  }, []);

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
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 60, min: 30 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      lastHandDetectedRef.current = false;
      lastAutoWordRef.current = '';
      stableCandidateRef.current = { word: '', startedAt: 0 };
      prevLiveLockedRef.current = false;
      prevPreviewLabelRef.current = '';
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
          spatialContext: latestSpatialRef.current
            ? {
                bodyDetected: latestSpatialRef.current.bodyDetected,
                handsCount: latestSpatialRef.current.handsCount,
                leftHandZone: latestSpatialRef.current.leftHandZone,
                rightHandZone: latestSpatialRef.current.rightHandZone,
                handsRelation: latestSpatialRef.current.handsRelation,
                locationSummaryAr: latestSpatialRef.current.locationSummaryAr,
              }
            : null,
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
    const maxSide = isFromAuto ? 360 : 480;
    const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(srcH * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', isFromAuto ? 0.72 : 0.8);
    const base64 = dataUrl.split(',')[1] || '';
    if (base64) {
      await analyzeSignBase64(base64, 'image/jpeg', isFromAuto);
    }
  };

  captureFnRef.current = captureFromCamera;

  // Ultra-fast high-FPS local Dual-Hand + Body Pose MediaPipe tracking (with cloud fallback)
  useEffect(() => {
    if (!cameraActive) return;

    let cancelled = false;
    let rafId = 0;
    let fallbackTimerId = 0;
    let lastVideoTime = -1;

    const updateLockedUi = (locked: boolean, label: string, spatialText?: string) => {
      if (prevLiveLockedRef.current !== locked) {
        prevLiveLockedRef.current = locked;
        setLiveHandLocked(locked);
      }
      if (prevPreviewLabelRef.current !== label) {
        prevPreviewLabelRef.current = label;
        setLivePreviewLabel(label);
      }
      if (spatialText !== undefined && prevSpatialTextRef.current !== spatialText) {
        prevSpatialTextRef.current = spatialText;
        setLiveSpatialHud(spatialText);
      }
    };

    const startCloudFallbackLoop = () => {
      if (cancelled) return;
      setTrackerMode('cloud_fallback');
      const runLoop = async (delay: number) => {
        fallbackTimerId = window.setTimeout(async () => {
          if (cancelled) return;
          if (autoCapture && !analyzingRef.current) {
            await captureFnRef.current?.(true);
          }
          if (!cancelled) runLoop(120);
        }, delay);
      };
      runLoop(100);
    };

    (async () => {
      try {
        const [landmarker, poseLandmarker] = await Promise.all([
          getHandLandmarker(),
          getPoseLandmarker().catch(() => null),
        ]);
        if (cancelled) return;
        setTrackerMode('realtime_local');

        const tick = () => {
          if (cancelled) return;
          const video = videoRef.current;
          const overlay = overlayCanvasRef.current;

          if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const now = performance.now();
            const handResult = landmarker.detectForVideo(video, now);
            const poseResult = poseLandmarker ? poseLandmarker.detectForVideo(video, now) : null;

            const poseLm = (poseResult?.landmarks?.[0] as HandLandmarkPoint[] | undefined) ?? null;
            const rawHands = handResult.landmarks ?? [];
            const rawHandedness = handResult.handedness ?? handResult.handednesses ?? [];

            const detectedHands: HandDetectionInput[] = rawHands.slice(0, 2).map((lm, idx) => {
              const cat = rawHandedness[idx]?.[0]?.categoryName;
              const handedness: 'Left' | 'Right' = cat === 'Left' ? 'Left' : 'Right';
              return {
                landmarks: lm as HandLandmarkPoint[],
                handedness,
              };
            });

            if (overlay) {
              drawBodyAndHandsOverlay(overlay, video, detectedHands, poseLm);
            }

            const spatial = computeBodySpatialContext(detectedHands, poseLm);
            latestSpatialRef.current = spatial;

            if (detectedHands.length > 0) {
              noHandSinceRef.current = 0;
              lastHandDetectedRef.current = true;

              const cls = classifyBodyAndHands(detectedHands, poseLm, recognitionModeRef.current);
              if (cls && cls.detectedSignId !== 'OPEN_HAND') {
                updateLockedUi(
                  true,
                  `${cls.recognizedWordAr} (${cls.confidence}%)`,
                  spatial.locationSummaryAr
                );

                if (autoCapture) {
                  const holdMs = CAPTURE_HOLD_MS[captureSpeedRef.current];
                  if (stableCandidateRef.current.word !== cls.recognizedWordAr) {
                    stableCandidateRef.current = { word: cls.recognizedWordAr, startedAt: now };
                  } else if (now - stableCandidateRef.current.startedAt >= holdMs) {
                    if (lastAutoWordRef.current !== cls.recognizedWordAr) {
                      appendRecognizedWord(cls.recognizedWordAr, true, cls.isLetter);
                      setSignResult({
                        handDetected: true,
                        isLetter: cls.isLetter,
                        detectedSignId: cls.detectedSignId,
                        confidence: cls.confidence,
                        recognizedWordAr: cls.recognizedWordAr,
                        datasetClass: cls.datasetClass,
                        spatialSummaryAr: spatial.locationSummaryAr,
                        arabicMeaning: cls.arabicMeaning,
                        englishMeaning: cls.englishMeaning,
                        explanationAr: cls.explanationAr,
                        responseSigns: [cls.detectedSignId],
                      });
                    }
                  }
                }
              } else {
                updateLockedUi(true, `رصد ${detectedHands.length} يد...`, spatial.locationSummaryAr);
              }
            } else {
              if (noHandSinceRef.current === 0) {
                noHandSinceRef.current = now;
              }
              if (now - noHandSinceRef.current >= NO_HAND_RESET_MS) {
                updateLockedUi(
                  false,
                  '',
                  spatial.bodyDetected ? 'الجسم مرصود — ارفع يدك أو يديك للإشارة' : 'في انتظار رصد الجسم واليدين'
                );
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

  const runSampleSignRecognition = (signId: SignId) => {
    setCameraError(null);
    const landmarks = getSampleLandmarksForSign(signId);
    const cls = classifyBodyAndHands(
      [{ landmarks, handedness: 'Right' }],
      null,
      recognitionModeRef.current
    );
    if (cls) {
      appendRecognizedWord(cls.recognizedWordAr, false, cls.isLetter);
      setSignResult({
        handDetected: true,
        isLetter: cls.isLetter,
        detectedSignId: cls.detectedSignId,
        confidence: cls.confidence,
        recognizedWordAr: cls.recognizedWordAr,
        datasetClass: cls.datasetClass,
        spatialSummaryAr: cls.spatial?.locationSummaryAr,
        arabicMeaning: cls.arabicMeaning,
        englishMeaning: cls.englishMeaning,
        explanationAr: cls.explanationAr,
        responseSigns: [cls.detectedSignId],
      });
    } else {
      const def = SIGN_LEXICON[signId] ?? SIGN_LEXICON.HELLO;
      const word = def.glossAr.split('/')[0].trim();
      appendRecognizedWord(word, false, false);
    }
  };

  const runDatasetSampleRecognition = (sampleKey: DatasetSampleKey) => {
    setCameraError(null);
    const sample = getSampleBodyAndHandsForDatasetSign(sampleKey);
    const cls = classifyBodyAndHands(sample.hands, sample.pose, recognitionModeRef.current);
    if (cls) {
      if (cls.spatial) {
        setLiveSpatialHud(cls.spatial.locationSummaryAr);
      }
      appendRecognizedWord(cls.recognizedWordAr, false, cls.isLetter);
      setSignResult({
        handDetected: true,
        isLetter: cls.isLetter,
        detectedSignId: cls.detectedSignId,
        confidence: cls.confidence,
        recognizedWordAr: cls.recognizedWordAr,
        datasetClass: cls.datasetClass,
        spatialSummaryAr: cls.spatial?.locationSummaryAr,
        arabicMeaning: cls.arabicMeaning,
        englishMeaning: cls.englishMeaning,
        explanationAr: cls.explanationAr,
        responseSigns: [cls.detectedSignId],
      });
    }
  };

  const localSentenceSuggestion = useMemo(
    () => suggestLocalArabicSentence(composedText),
    [composedText]
  );

  const fullAccumulatedPreview = useMemo(
    () => combineAccumulatedSignMessage(accumulatedSentences, composedText),
    [accumulatedSentences, composedText]
  );

  const handleLockCurrentSentence = (explicitText?: string) => {
    const candidate = (explicitText ?? localSentenceSuggestion ?? composedText).trim();
    if (!candidate) return;
    setComposeError(null);
    onAccumulatedSentencesChange((prev) => appendAccumulatedSentence(prev, candidate));
    onComposedTextChange('');
    lastAutoWordRef.current = '';
    lastWasLetterRef.current = false;
  };

  const handleAiComposeSentence = async (autoAppend = false) => {
    const rawDraft = composedText.trim();
    if (!rawDraft || polishingSentence) return;
    setPolishingSentence(true);
    setComposeError(null);
    try {
      const resp = await fetch('/api/ai/compose-sign-sentence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawDraft,
          rawTokens: rawDraft.split(/\s+/).filter(Boolean),
          accumulatedContext: accumulatedSentences.join(' '),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'تعذر صياغة الجملة بالذكاء الاصطناعي.');
      }
      const formed = (data.sentenceAr || rawDraft).trim();
      if (autoAppend) {
        handleLockCurrentSentence(formed);
      } else {
        onComposedTextChange(formed);
      }
    } catch (err: unknown) {
      // Fallback smoothly to local Egyptian Arabic suggestion if offline/transient error
      if (localSentenceSuggestion) {
        if (autoAppend) {
          handleLockCurrentSentence(localSentenceSuggestion);
        } else {
          onComposedTextChange(localSentenceSuggestion);
        }
      } else {
        setComposeError(err instanceof Error ? err.message : 'تعذر تكوين الجملة حالياً.');
      }
    } finally {
      setPolishingSentence(false);
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
    onAccumulatedSentencesChange([]);
    setComposeError(null);
  };

  const handleSubmitComposed = async (e: React.FormEvent) => {
    e.preventDefault();
    const combined = combineAccumulatedSignMessage(accumulatedSentences, composedText);
    if (!combined || isSendingAi) return;
    onComposedTextChange('');
    onAccumulatedSentencesChange([]);
    lastAutoWordRef.current = '';
    lastWasLetterRef.current = false;
    setComposeError(null);
    await onSendSignMessage(combined);
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

          {/* Two-Way Sign Dialogue Strip inside Sign Studio */}
          {(latestAiReplyText || lastSignUserMessage) && (
            <div className="px-4 py-2.5 bg-[#191B1F] border-t border-white/10 space-y-2 shrink-0">
              {lastSignUserMessage && (
                <div
                  data-testid="sign-studio-user-sent"
                  className="flex items-start gap-2 text-xs text-amber-200 bg-[#131416] border border-amber-500/20 rounded-xl px-3 py-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="font-bold text-amber-400 ml-1">رسالتك بلغة الإشارة:</span>
                    <span>{lastSignUserMessage}</span>
                  </div>
                </div>
              )}

              {latestAiReplyText && (
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
              )}
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
                  التعرف الفوري على الجسم واليدين ومكان كل إشارة
                </h2>
                <p className="text-xs text-stone-400 leading-relaxed">
                  يتتبع الجسم العلوي (33 نقطة) وكلتا اليدين (21+21 نقطة) لحظياً، ومدعوم بـ 56 إشارة من داتا سيت لغة الإشارة المصرية لترجمة كلمات كاملة بدقة أعلى.
                </p>

                {/* Recognition Focus Mode Selector */}
                <div
                  data-testid="recognition-mode-selector"
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#131416] border border-white/8"
                >
                  {(
                    [
                      { id: 'gestures', label: 'حركات وكلمات كاملة' },
                      { id: 'letters', label: 'تهجئة الاسم (حروف)' },
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

                {/* Capture Speed Selector */}
                <div
                  data-testid="capture-speed-selector"
                  className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#131416] border border-white/8"
                >
                  <button
                    type="button"
                    onClick={() => setCaptureSpeed('turbo')}
                    className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      captureSpeed === 'turbo'
                        ? 'bg-teal-500 text-stone-950'
                        : 'text-stone-400 hover:text-stone-100'
                    }`}
                  >
                    <Zap className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>التقاط فوري سريع (~90ms)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureSpeed('balanced')}
                    className={`inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      captureSpeed === 'balanced'
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-400 hover:text-stone-100'
                    }`}
                  >
                    <span>دقة متوازنة (~220ms)</span>
                  </button>
                </div>

                {/* Live Body & Dual-Hand Spatial Location Readout */}
                <div
                  data-testid="spatial-tracking-hud"
                  className="px-2.5 py-1.5 rounded-lg bg-[#131416] border border-emerald-500/25 flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="text-emerald-300 font-semibold shrink-0">التتبع المكاني:</span>
                  <span className="text-stone-300 truncate">{liveSpatialHud}</span>
                </div>
              </div>

              {/* Camera Mirror Viewport + Live Full-Body & Dual-Hand Skeleton Overlay */}
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
                      اضغط تشغيل الكاميرا لرصد جسمك وكلتا يديك وموقع الإشارات المصرية بدقة عالية
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
                      ? 'جاري تجهيز متتبع الجسم واليدين...'
                      : analyzingSign
                      ? 'جاري التحليل بالداتا سيت والـ AI...'
                      : liveHandLocked && livePreviewLabel
                      ? `رصد: ${livePreviewLabel}`
                      : autoCapture
                      ? 'وجّه جسمك ويديك للكاميرا — الرصد جاهز'
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

              {/* Recognition Result Card */}
              {signResult && (
                <div
                  data-testid="sign-recognition-result"
                  className={`p-3.5 rounded-xl bg-[#131416] border space-y-2 ${
                    signResult.handDetected ? 'border-teal-500/35' : 'border-amber-500/35'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-stone-400">
                    <span>
                      {signResult.handDetected
                        ? signResult.datasetClass
                          ? 'مطابقة داتا سيت الإشارة المصرية'
                          : 'تم التعرف على الإشارة'
                        : 'تنبيه الكاميرا'}
                    </span>
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
                  {signResult.spatialSummaryAr && (
                    <p className="text-[11px] text-emerald-300 font-medium">
                      الموقع المكاني: {signResult.spatialSummaryAr}
                    </p>
                  )}

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

              {/* Quick Sample Gestures + Mendeley Egyptian Sign Dataset Samples */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-stone-300 mb-2">
                    تجربة إشارات سريعة (بتتضاف للجملة الحالية فوراً):
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

                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-2">
                    اختبار داتا سيت المصرية (الجسم + اليدين):
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {DATASET_SAMPLE_TESTS.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        disabled={analyzingSign}
                        onClick={() => runDatasetSampleRecognition(item.key)}
                        className="px-2.5 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-teal-300 mb-2">
                    جُمل جاهزة — اضغط لإضافتها وتجميعها في رسالتك:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_SENTENCE_SUGGESTIONS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleLockCurrentSentence(item.sentence)}
                        className="px-2.5 py-1.5 text-xs bg-teal-500/10 hover:bg-teal-500/20 text-teal-200 border border-teal-500/30 rounded-lg transition-colors whitespace-nowrap"
                      >
                        + {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* BOTTOM BAR: Multi-Sentence Sign Language Accumulator + Current Sentence Composer */}
      <form
        onSubmit={handleSubmitComposed}
        data-testid="sign-composed-bar"
        aria-label="تجميع الجمل المكتوبة بلغة الإشارة من الكاميرا"
        className="sticky bottom-0 z-20 w-full min-w-0 shrink-0 border-t border-white/10 bg-[#131416] px-3 sm:px-4 py-2.5 space-y-2"
      >
        {/* Accumulated Sentences Buffer (persists every sentence user forms until sent) */}
        {accumulatedSentences.length > 0 && (
          <div
            data-testid="sign-accumulated-list"
            className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#191B1F] border border-teal-500/30"
          >
            <span className="text-[11px] font-bold text-teal-400 shrink-0 ml-1">
              الجمل المجمّعة ({accumulatedSentences.length}):
            </span>
            {accumulatedSentences.map((sentence, idx) => (
              <span
                key={`${idx}_${sentence}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-xs text-stone-100"
              >
                <span className="text-teal-300 font-bold">{idx + 1}.</span>
                <span>{sentence}</span>
                <button
                  type="button"
                  onClick={() =>
                    onAccumulatedSentencesChange((prev) => prev.filter((_, i) => i !== idx))
                  }
                  aria-label={`حذف الجملة رقم ${idx + 1}`}
                  className="text-stone-400 hover:text-rose-300 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Instant Local Egyptian Arabic Suggestion Chip */}
        {localSentenceSuggestion && localSentenceSuggestion !== composedText.trim() && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Wand2 className="w-3.5 h-3.5 text-amber-400 shrink-0" aria-hidden="true" />
              <span className="text-stone-300 shrink-0">جملة مقترحة:</span>
              <span className="font-bold text-amber-300 truncate">{localSentenceSuggestion}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onComposedTextChange(localSentenceSuggestion)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold transition-colors"
              >
                <Check className="w-3 h-3" aria-hidden="true" />
                <span>تطبيق</span>
              </button>
              <button
                type="button"
                onClick={() => handleLockCurrentSentence(localSentenceSuggestion)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-500 text-stone-950 hover:bg-teal-400 font-bold transition-colors"
              >
                <ListPlus className="w-3 h-3" aria-hidden="true" />
                <span>أضف للجمل المجمّعة</span>
              </button>
            </div>
          </div>
        )}

        {composeError && <p className="text-xs text-rose-300">{composeError}</p>}

        {/* Active Input & Action Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <Hand className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="text-xs font-bold text-stone-200 whitespace-nowrap">
              كلامك بلغة الإشارة:
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
            placeholder="اعمل الإشارات الكاملة، وجمّع كل جملة لحد ما تخلّص كلامك..."
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
              onClick={() => handleAiComposeSentence(false)}
              disabled={!composedText.trim() || polishingSentence}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-amber-300 hover:bg-[#2B2F37] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{polishingSentence ? 'جاري التكوين...' : 'تكوين جملة (AI)'}</span>
            </button>

            <button
              type="button"
              data-testid="sign-accumulate-btn"
              onClick={() => handleLockCurrentSentence()}
              disabled={!composedText.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/40 hover:bg-teal-500/30 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <ListPlus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>أضف للرسالة</span>
            </button>

            <button
              type="button"
              onClick={handleClearComposed}
              disabled={!fullAccumulatedPreview}
              aria-label="مسح النص بالكامل"
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-[#22252B] text-stone-300 hover:bg-[#2B2F37] disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>مسح</span>
            </button>

            <button
              type="submit"
              data-testid="sign-send-ai-btn"
              disabled={!fullAccumulatedPreview || isSendingAi}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {isSendingAi
                  ? 'جاري الإرسال...'
                  : accumulatedSentences.length > 0
                  ? `إرسال الكل للـ AI (${accumulatedSentences.length + (composedText.trim() ? 1 : 0)})`
                  : 'إرسال للذكاء الاصطناعي'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
