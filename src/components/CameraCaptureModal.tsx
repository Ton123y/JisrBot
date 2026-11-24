import React, { useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCw, SwitchCamera, X } from 'lucide-react';
import type { ChatAttachment } from '../lib/attachments';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAttachPhoto: (attachment: ChatAttachment) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onAttachPhoto,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCamera, setLoadingCamera] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCapturedDataUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const initCamera = async () => {
      setError(null);
      setLoadingCamera(true);
      stopStream();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('الكاميرا غير مدعومة في هذا المتصفح. يمكنك رفع صورة من جهازك بدلاً من ذلك.');
        setLoadingCamera(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (!cancelled) {
          setError('تعذر فتح الكاميرا (تأكد من منح الإذن في المتصفح أو استخدم زر رفع الصورة).');
        }
      } finally {
        if (!cancelled) setLoadingCamera(false);
      }
    };

    if (!capturedDataUrl) {
      initCamera();
    }

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, facingMode, capturedDataUrl]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const maxSide = 1280;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    stopStream();
    setCapturedDataUrl(dataUrl);
  };

  const handleConfirmAttach = () => {
    if (!capturedDataUrl) return;
    const base64 = capturedDataUrl.split(',')[1] || '';
    if (!base64) return;
    const approxBytes = Math.round((base64.length * 3) / 4);
    onAttachPhoto({
      id: `cam_${Date.now()}`,
      name: `camera_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: approxBytes,
      kind: 'image',
      data: base64,
      previewUrl: capturedDataUrl,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[#191B1F] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3">
          <h2 id="camera-capture-title" className="text-sm font-bold text-slate-100">
            التقاط صورة بالكاميرا للسؤال عنها
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق نافذة الكاميرا"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative aspect-video bg-[#0E1013] border border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
            {capturedDataUrl ? (
              <img
                src={capturedDataUrl}
                alt="الصورة الملتقطة"
                className="w-full h-full object-contain"
              />
            ) : (
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full h-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
              />
            )}

            {loadingCamera && !capturedDataUrl && !error && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0E1013]/80 text-xs text-slate-300">
                جاري تشغيل الكاميرا...
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-[#0E1013]">
                <p className="text-xs text-rose-200 leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {capturedDataUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => setCapturedDataUrl(null)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#24262C] text-slate-200 hover:bg-[#2E3138]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>إعادة التصوير</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAttach}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>إرفاق في المحادثة</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFacingMode((m) => (m === 'user' ? 'environment' : 'user'))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#24262C] text-slate-200 hover:bg-[#2E3138]"
                >
                  <SwitchCamera className="w-3.5 h-3.5" />
                  <span>تبديل الكاميرا</span>
                </button>

                <button
                  type="button"
                  disabled={Boolean(error) || loadingCamera}
                  onClick={handleCapture}
                  className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-lg bg-amber-500 text-stone-950 hover:bg-amber-400 disabled:opacity-40"
                >
                  <Camera className="w-4 h-4" />
                  <span>التقاط صورة</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
