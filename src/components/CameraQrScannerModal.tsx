import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Language } from '../types';
import { playQrSuccessScanSound, playPingSound } from '../utils/industrialAudio';
import {
  X,
  Camera,
  QrCode,
  RotateCcw,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Flashlight,
  SwitchCamera,
  Plus,
  RefreshCw,
} from 'lucide-react';

export interface ScannedHardwareLabel {
  rawPayload: string;
  deviceType?: 'camera' | 'sensor' | 'machine';
  name?: string;
  area?: string;
  ip?: string;
  code?: string;
  typeName?: string;
}

interface CameraQrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  targetDeviceType?: 'camera' | 'sensor' | 'machine';
  onScanComplete: (rawPayload: string, parsed: ScannedHardwareLabel) => void;
  onQuickAddCamera?: (parsed: ScannedHardwareLabel) => void;
}

export function parseHardwareQrPayload(
  rawPayload: string,
  fallbackType: 'camera' | 'sensor' | 'machine' = 'camera'
): ScannedHardwareLabel {
  const raw = rawPayload.trim();
  const result: ScannedHardwareLabel = {
    rawPayload: raw,
    deviceType: fallbackType,
  };

  if (!raw) return result;

  // 1. JSON format: {"type":"camera","name":"...","area":"...","ip":"..."}
  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw);
      const t =
        parsed.type === 'camera' || parsed.type === 'sensor' || parsed.type === 'machine'
          ? parsed.type
          : fallbackType;
      return {
        rawPayload: raw,
        deviceType: t,
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        area: typeof parsed.area === 'string' ? parsed.area : undefined,
        ip:
          typeof parsed.ip === 'string'
            ? parsed.ip
            : typeof parsed.ipAddress === 'string'
            ? parsed.ipAddress
            : typeof parsed.streamUrl === 'string'
            ? parsed.streamUrl
            : undefined,
        code: typeof parsed.code === 'string' ? parsed.code : undefined,
        typeName: typeof parsed.typeName === 'string' ? parsed.typeName : undefined,
      };
    } catch {
      // fall through to pipe/key-value parsing
    }
  }

  // 2. Pipe/key=value format: NF-HW|type=camera|name=CAM-01|area=Цех №1|ip=192.168.10.101:554/live/ch0
  if (raw.includes('|') || (raw.includes('=') && !raw.startsWith('rtsp://') && !raw.startsWith('http'))) {
    const kv: Record<string, string> = {};
    raw.split('|').forEach((part) => {
      const idx = part.indexOf('=');
      if (idx > 0) {
        kv[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
      }
    });
    const t =
      kv.type === 'camera' || kv.type === 'sensor' || kv.type === 'machine'
        ? kv.type
        : fallbackType;
    return {
      rawPayload: raw,
      deviceType: t,
      name: kv.name,
      area: kv.area,
      ip: kv.ip || kv.ipAddress || kv.url || kv.stream,
      code: kv.code,
      typeName: kv.typeName,
    };
  }

  // 3. Fallback: direct RTSP URL, HTTP stream, or plain IP address / tag string
  return {
    rawPayload: raw,
    deviceType: fallbackType,
    ip: raw,
  };
}

export const CameraQrScannerModal: React.FC<CameraQrScannerModalProps> = ({
  isOpen,
  onClose,
  language,
  targetDeviceType = 'camera',
  onScanComplete,
  onQuickAddCamera,
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [torchEnabled, setTorchEnabled] = useState<boolean>(false);
  const [scannedLabel, setScannedLabel] = useState<ScannedHardwareLabel | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanRequestIdRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    scanRequestIdRef.current += 1;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setTorchEnabled(false);
    setTorchSupported(false);
  }, []);

  const handleDecodedRaw = useCallback(
    (rawData: string) => {
      const parsed = parseHardwareQrPayload(rawData, targetDeviceType);
      playQrSuccessScanSound();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 100]);
      }
      stopCamera();
      setFileError(null);
      setScannedLabel(parsed);
    },
    [stopCamera, targetDeviceType]
  );

  const tickScan = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (decoded && decoded.data) {
          handleDecodedRaw(decoded.data);
          return;
        }
      }
    }

    rafRef.current = requestAnimationFrame(tickScan);
  }, [handleDecodedRaw]);

  const acquireCameraStream = useCallback(async (): Promise<MediaStream> => {
    const primaryConstraint: MediaTrackConstraints = selectedDeviceId
      ? {
          deviceId: { exact: selectedDeviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      : {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };

    try {
      return await navigator.mediaDevices.getUserMedia({
        video: primaryConstraint,
        audio: false,
      });
    } catch (firstErr: any) {
      const errName = firstErr?.name || '';
      if (
        errName === 'OverconstrainedError' ||
        errName === 'NotFoundError' ||
        errName === 'ConstraintNotSatisfiedError'
      ) {
        return await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      throw firstErr;
    }
  }, [facingMode, selectedDeviceId]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const requestId = scanRequestIdRef.current;
    setCameraError(null);
    setFileError(null);
    setIsInitializing(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw Object.assign(new Error('MediaDevices API unavailable'), { name: 'NotSupportedError' });
      }

      const stream = await acquireCameraStream();

      // Abort cleanly if modal closed or another startCamera call superseded this one
      if (requestId !== scanRequestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        try {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        } catch {
          setTorchSupported(false);
        }
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (requestId === scanRequestIdRef.current) {
          setVideoDevices(devices.filter((d) => d.kind === 'videoinput'));
        }
      } catch {
        // ignore enumerate failure
      }

      const video = videoRef.current;
      if (video && requestId === scanRequestIdRef.current) {
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;

        try {
          await video.play();
        } catch (playErr: any) {
          // Wait briefly for metadata if play was interrupted during attach
          if (playErr?.name !== 'AbortError') {
            throw playErr;
          }
          await new Promise<void>((resolve) => {
            const onReady = () => {
              video.removeEventListener('loadedmetadata', onReady);
              resolve();
            };
            if (video.readyState >= 1) {
              resolve();
            } else {
              video.addEventListener('loadedmetadata', onReady, { once: true });
              setTimeout(resolve, 600);
            }
          });
          if (requestId === scanRequestIdRef.current) {
            await video.play().catch(() => {});
          }
        }

        if (requestId === scanRequestIdRef.current) {
          setIsCameraActive(true);
          rafRef.current = requestAnimationFrame(tickScan);
        }
      }
    } catch (err: any) {
      if (requestId !== scanRequestIdRef.current) return;
      stopCamera();
      const errName = err?.name || 'Error';

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          language === 'kz'
            ? 'Браузер камераға рұқсатты бұғаттады (NotAllowedError). Мекенжай жолағындағы камера белгішесі арқылы рұқсат беріңіз немесе төменде QR фотосын жүктеңіз.'
            : 'Доступ к камере заблокирован браузером (NotAllowedError). Разрешите доступ в адресной строке браузера и нажмите «Повторить запуск» или загрузите фото QR-метки.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError(
          language === 'kz'
            ? 'Бұл құрылғыда бейнекамера табылмады (NotFoundError). Төмендегі түйме арқылы QR-белгінің фотосын жүктеңіз.'
            : 'На устройстве не найдена подключённая камера (NotFoundError). Загрузите фото QR-метки ниже.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          language === 'kz'
            ? 'Камераны басқа бағдарлама немесе қойынды пайдаланып жатыр (NotReadableError). Оны жауып, қайта қосып көріңіз.'
            : 'Камера занята другим приложением или вкладкой браузера (NotReadableError). Закройте его и повторите запуск.'
        );
      } else if (errName === 'NotSupportedError' || errName === 'SecurityError') {
        setCameraError(
          language === 'kz'
            ? 'Камера тек қауіпсіз HTTPS қосылымында жұмыс істейді. Төменде QR фотосын жүктей аласыз.'
            : 'Камера недоступна в текущем контексте безопасности (требуется HTTPS и разрешение фрейма). Загрузите фото QR-метки ниже.'
        );
      } else {
        setCameraError(
          language === 'kz'
            ? `Құрылғы камерасын қосу мүмкін болмады (${errName}). Браузер рұқсаттарын тексеріңіз немесе QR-белгі фотосын жүктеңіз.`
            : `Не удалось запустить камеру устройства (${errName}). Проверьте разрешения браузера или загрузите фото QR-метки ниже.`
        );
      }
    } finally {
      if (requestId === scanRequestIdRef.current) {
        setIsInitializing(false);
      }
    }
  }, [acquireCameraStream, language, stopCamera, tickScan]);

  useEffect(() => {
    if (isOpen && !scannedLabel) {
      startCamera();
    } else if (!isOpen) {
      stopCamera();
      setScannedLabel(null);
      setCameraError(null);
      setFileError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, scannedLabel, startCamera, stopCamera]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        stopCamera();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, stopCamera]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const nextState = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextState } as MediaTrackConstraintSet],
      });
      setTorchEnabled(nextState);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleFlipCamera = () => {
    setSelectedDeviceId('');
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleUploadQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imgData.data, imgData.width, imgData.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (decoded && decoded.data) {
          handleDecodedRaw(decoded.data);
        } else {
          playPingSound();
          setFileError(
            language === 'kz'
              ? 'Таңдалған суреттен QR-код табылмады. Белгіні анық түсірілген фотосын жүктеңіз.'
              : 'На изображении не удалось распознать QR-код. Попробуйте более четкое фото этикетки.'
          );
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRescan = () => {
    setScannedLabel(null);
    setFileError(null);
  };

  if (!isOpen) return null;

  const canQuickAddCamera =
    Boolean(onQuickAddCamera) &&
    scannedLabel !== null &&
    (scannedLabel.deviceType === 'camera' || targetDeviceType === 'camera') &&
    Boolean(scannedLabel.ip && scannedLabel.ip.trim().length > 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-camera-scanner-title"
    >
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Top accent hairline */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 bg-slate-950/90 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shrink-0">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 id="qr-camera-scanner-title" className="text-base font-bold text-white truncate">
                {language === 'kz'
                  ? 'Камера арқылы QR-белгіні сканерлеу'
                  : 'Сканер QR-меток через камеру'}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {language === 'kz'
                  ? 'Құрылғы камерасын зауыттық жабдықтың QR-стикеріне бағыттаңыз'
                  : 'Наведите камеру устройства на QR-этикетку камеры или оборудования'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors shrink-0 cursor-pointer"
            aria-label={language === 'kz' ? 'Жабу' : 'Закрыть'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto no-scrollbar">
          {scannedLabel ? (
            /* Decoded Label Result State */
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-4 space-y-3">
                <div className="flex items-center gap-2.5 text-emerald-300 font-semibold text-sm">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                  <span>
                    {language === 'kz'
                      ? 'QR-белгі сәтті оқылды'
                      : 'QR-этикетка успешно распознана'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-500/20 text-xs">
                  <div>
                    <div className="text-slate-400 mb-0.5">
                      {language === 'kz' ? 'Құрылғы түрі' : 'Тип устройства'}
                    </div>
                    <div className="font-semibold text-white font-mono">
                      {scannedLabel.deviceType === 'sensor'
                        ? 'EcoPredict Sensor'
                        : scannedLabel.deviceType === 'machine'
                        ? 'FailPredict Unit'
                        : 'SafeVision Camera'}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 mb-0.5">
                      {language === 'kz' ? 'IP / Ағын мекенжайы' : 'IP-адрес / Поток'}
                    </div>
                    <div className="font-mono text-cyan-300 break-all">
                      {scannedLabel.ip || '—'}
                    </div>
                  </div>

                  {scannedLabel.name && (
                    <div>
                      <div className="text-slate-400 mb-0.5">
                        {language === 'kz' ? 'Атауы' : 'Название'}
                      </div>
                      <div className="font-medium text-slate-100">{scannedLabel.name}</div>
                    </div>
                  )}

                  {scannedLabel.area && (
                    <div>
                      <div className="text-slate-400 mb-0.5">
                        {language === 'kz' ? 'Цех / Учаске' : 'Цех / Участок'}
                      </div>
                      <div className="font-medium text-slate-100">{scannedLabel.area}</div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/80">
                  <div className="text-[11px] text-slate-400 mb-1">
                    {language === 'kz' ? 'Оқылған деректер:' : 'Содержимое метки:'}
                  </div>
                  <div className="rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 font-mono text-[11px] text-slate-300 break-all">
                    {scannedLabel.rawPayload}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleRescan}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
                  <span>
                    {language === 'kz' ? 'Қайта сканерлеу' : 'Сканировать заново'}
                  </span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onScanComplete(scannedLabel.rawPayload, scannedLabel)}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      canQuickAddCamera
                        ? 'border border-cyan-500/40 bg-slate-800 hover:bg-slate-700 text-cyan-200'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>
                      {language === 'kz' ? 'Өрістерге толтыру' : 'Заполнить форму'}
                    </span>
                  </button>

                  {canQuickAddCamera && onQuickAddCamera && (
                    <button
                      type="button"
                      onClick={() => onQuickAddCamera(scannedLabel)}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                      <span>
                        {language === 'kz' ? 'Камераны бірден қосу' : 'Добавить камеру'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Live Camera Viewfinder State */
            <>
              <div className="relative aspect-video w-full rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {/* Viewfinder Reticle Overlay when camera is active */}
                {isCameraActive && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="relative h-48 w-48 sm:h-52 sm:w-52 rounded-xl border border-cyan-400/35">
                      <div className="absolute -top-0.5 -left-0.5 h-6 w-6 rounded-tl-lg border-t-[3px] border-l-[3px] border-cyan-400" />
                      <div className="absolute -top-0.5 -right-0.5 h-6 w-6 rounded-tr-lg border-t-[3px] border-r-[3px] border-cyan-400" />
                      <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-cyan-400" />
                      <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 rounded-br-lg border-b-[3px] border-r-[3px] border-cyan-400" />
                      <div className="absolute inset-x-2 h-[2px] bg-cyan-400/90 shadow-[0_0_10px_rgba(6,182,212,0.9)] animate-scanline" />
                    </div>
                  </div>
                )}

                {/* Active Camera Controls Overlay */}
                {isCameraActive && (
                  <div className="absolute top-3 right-3 flex items-center gap-2">
                    {torchSupported && (
                      <button
                        type="button"
                        onClick={handleToggleTorch}
                        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium backdrop-blur-md transition-colors cursor-pointer ${
                          torchEnabled
                            ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                            : 'border-slate-700/80 bg-slate-950/80 text-slate-200 hover:bg-slate-900'
                        }`}
                        title={language === 'kz' ? 'Жарықдиодты қосу' : 'Фонарик'}
                      >
                        <Flashlight className="h-3.5 w-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleFlipCamera}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-md hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <SwitchCamera className="h-3.5 w-3.5 text-cyan-400" />
                      <span>{language === 'kz' ? 'Ауыстыру' : 'Камера'}</span>
                    </button>
                  </div>
                )}

                {/* Initializing / Error Overlay */}
                {(!isCameraActive || cameraError) && (
                  <div className="absolute inset-0 bg-slate-950/92 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-cyan-400">
                      <Camera className="h-6 w-6" />
                    </div>
                    <div className="max-w-sm space-y-1">
                      <div className="text-sm font-semibold text-white">
                        {isInitializing
                          ? language === 'kz'
                            ? 'Камера қосылуда...'
                            : 'Активация камеры...'
                          : cameraError
                          ? language === 'kz'
                            ? 'Камера қолжетімсіз'
                            : 'Камера недоступна'
                          : language === 'kz'
                          ? 'Камера дайын емес'
                          : 'Ожидание камеры'}
                      </div>
                      {cameraError && (
                        <p className="text-xs text-slate-400 leading-relaxed">{cameraError}</p>
                      )}
                    </div>
                    {!isInitializing && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={startCamera}
                          className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>
                            {language === 'kz' ? 'Қайта қосу' : 'Повторить запуск'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Upload className="h-3.5 w-3.5 text-cyan-400" />
                          <span>
                            {language === 'kz' ? 'QR фотосын жүктеу' : 'Загрузить фото QR'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Video input device selector when multiple cameras exist */}
              {videoDevices.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <label className="text-slate-400 shrink-0">
                    {language === 'kz' ? 'Бейне көзі:' : 'Источник видео:'}
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="">
                      {language === 'kz' ? 'Автоматты таңдау' : 'Автоматический выбор'}
                    </option>
                    {videoDevices.map((dev, idx) => (
                      <option key={dev.deviceId || idx} value={dev.deviceId}>
                        {dev.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {fileError && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-300">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  <span>{fileError}</span>
                </div>
              )}

              {/* Bottom Utility Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3.5 py-2 font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5 text-cyan-400" />
                  <span>
                    {language === 'kz' ? 'Суреттен QR оқу' : 'Распознать из фото'}
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadQrFile}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2 font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {language === 'kz' ? 'Бас тарту' : 'Отмена'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
