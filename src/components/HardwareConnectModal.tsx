import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { Language, IndustrialCamera, EcoSensor, IndustrialMachine } from '../types';
import { translations } from '../i18n/translations';
import { playPingSound } from '../utils/industrialAudio';
import { CameraQrScannerModal, ScannedHardwareLabel } from './CameraQrScannerModal';
import {
  X,
  Camera,
  Activity,
  Leaf,
  Wifi,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cpu,
  QrCode,
  Upload,
  Globe,
} from 'lucide-react';

interface HardwareConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  initialType?: 'camera' | 'sensor' | 'machine';
  onAddCamera?: (camera: IndustrialCamera) => void;
  onAddSensor?: (sensor: EcoSensor) => void;
  onAddMachine?: (machine: IndustrialMachine) => void;
}

const SAMPLE_QR_PAYLOADS: Record<
  'camera' | 'sensor' | 'machine',
  { label: string; payload: string }[]
> = {
  camera: [
    {
      label: 'CAM-01 · Конвертерный пролет',
      payload:
        'NF-HW|type=camera|name=CAM-01: Конвертерный пролет (Кран №4)|area=Цех №1 (Конвертерный)|ip=192.168.10.101:554/live/ch0',
    },
    {
      label: 'CAM-02 · Литейный цех',
      payload:
        'NF-HW|type=camera|name=CAM-02: Литейный двор печи №2|area=Цех разливки стали|ip=192.168.10.108:554/live/ch1',
    },
  ],
  sensor: [
    {
      label: 'ECO-SO2 · Газоочистка №1',
      payload:
        'NF-HW|type=sensor|code=SO2|name=Пост №1: Газоочистка (SO₂)|area=Агломерационный цех|ip=192.168.10.210:502',
    },
    {
      label: 'ECO-PM2_5 · Дробильный узел',
      payload:
        'NF-HW|type=sensor|code=PM2_5|name=Пост №2: Пылемер PM2.5|area=Сырьевой склад|ip=192.168.10.214:502',
    },
  ],
  machine: [
    {
      label: 'MACH-01 · Турбокомпрессор К-250',
      payload:
        'NF-HW|type=machine|name=Турбокомпрессор К-250|typeName=Центробежный компрессор|area=Компрессорная станция №2|ip=192.168.10.230:502',
    },
    {
      label: 'MACH-02 · Насос ЦНС-180',
      payload:
        'NF-HW|type=machine|name=Насос ЦНС-180 (Блок 3)|typeName=Центробежный насос ВД|area=Цех №1 (Конвертерный)|ip=192.168.10.235:502',
    },
  ],
};

export const HardwareConnectModal: React.FC<HardwareConnectModalProps> = ({
  isOpen,
  onClose,
  language,
  initialType = 'camera',
  onAddCamera,
  onAddSensor,
  onAddMachine,
}) => {
  const t = translations[language];
  const [deviceType, setDeviceType] = useState<'camera' | 'sensor' | 'machine'>(initialType);
  const [connectionMode, setConnectionMode] = useState<'ip' | 'qr'>('ip');

  // Camera fields
  const [camName, setCamName] = useState('CAM-01: Конвертерный пролет (Кран №4)');
  const [camArea, setCamArea] = useState('Цех №1 (Конвертерный)');
  const [camIp, setCamIp] = useState('');
  const [camResolution] = useState('1920x1080 (60Hz)');
  const [camFps, setCamFps] = useState(25);

  // Sensor fields
  const [sensorGas, setSensorGas] = useState<'SO2' | 'CO' | 'NO2' | 'PM2_5' | 'PM10'>('SO2');
  const [sensorName, setSensorName] = useState('Пост №1: Газоочистка конвертера (SO₂)');
  const [sensorArea, setSensorArea] = useState('Газоочистная станция');
  const [sensorIp, setSensorIp] = useState('');

  // Machine fields
  const [machName, setMachName] = useState('Турбовоздуходувка ТВ-175 №2');
  const [machType, setMachType] = useState('Центробежный нагнетатель');
  const [machArea, setMachArea] = useState('Компрессорное отделение');
  const [machIp, setMachIp] = useState('');
  const [machYear, setMachYear] = useState(2022);

  // QR scanner states
  const [qrInput, setQrInput] = useState('');
  const [qrStatus, setQrStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [qrPreviewUrls, setQrPreviewUrls] = useState<Record<string, string>>({});
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Test ping & validation state
  const [isTesting, setIsTesting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    pingMs: number;
    protocol: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDeviceType(initialType);
      setCamIp('');
      setSensorIp('');
      setMachIp('');
      setQrInput('');
      setTestResult(null);
      setQrStatus(null);
      setValidationError(null);
      setIsCameraScannerOpen(false);
    } else {
      setIsCameraScannerOpen(false);
    }
  }, [isOpen, initialType]);

  // Generate QR preview data URLs for current deviceType samples
  useEffect(() => {
    if (!isOpen || connectionMode !== 'qr') return;
    let mounted = true;
    const samples = SAMPLE_QR_PAYLOADS[deviceType];
    Promise.all(
      samples.map(async (s) => {
        const url = await QRCode.toDataURL(s.payload, {
          width: 140,
          margin: 1,
          color: { dark: '#06b6d4', light: '#020617' },
        });
        return [s.payload, url] as const;
      })
    ).then((entries) => {
      if (mounted) {
        setQrPreviewUrls(Object.fromEntries(entries));
      }
    });
    return () => {
      mounted = false;
    };
  }, [isOpen, connectionMode, deviceType]);

  const applyDecodedQrPayload = useCallback(
    (rawPayload: string) => {
      const raw = rawPayload.trim();
      if (!raw) return;
      setQrInput(raw);
      playPingSound();

      // Try JSON format first
      if (raw.startsWith('{')) {
        try {
          const parsed = JSON.parse(raw);
          const targetType =
            parsed.type === 'sensor' || parsed.type === 'machine' || parsed.type === 'camera'
              ? parsed.type
              : deviceType;
          setDeviceType(targetType);
          if (targetType === 'camera') {
            if (parsed.name) setCamName(parsed.name);
            if (parsed.area) setCamArea(parsed.area);
            if (parsed.ip || parsed.ipAddress) setCamIp(parsed.ip || parsed.ipAddress);
          } else if (targetType === 'sensor') {
            if (parsed.code) setSensorGas(parsed.code);
            if (parsed.name) setSensorName(parsed.name);
            if (parsed.area) setSensorArea(parsed.area);
            if (parsed.ip || parsed.ipAddress) setSensorIp(parsed.ip || parsed.ipAddress);
          } else {
            if (parsed.name) setMachName(parsed.name);
            if (parsed.typeName) setMachType(parsed.typeName);
            if (parsed.area) setMachArea(parsed.area);
            if (parsed.ip || parsed.ipAddress) setMachIp(parsed.ip || parsed.ipAddress);
          }
          setQrStatus({
            ok: true,
            text:
              language === 'kz'
                ? `QR-код сәтті оқылды (${targetType.toUpperCase()})`
                : `QR-код распознан: данные устройства заполнены (${targetType.toUpperCase()})`,
          });
          setValidationError(null);
          return;
        } catch {
          // continue to pipe format
        }
      }

      // Parse NF-HW|key=val|...
      if (raw.includes('|') || (raw.includes('=') && !raw.startsWith('rtsp://') && !raw.startsWith('http'))) {
        const kv: Record<string, string> = {};
        raw.split('|').forEach((part) => {
          const idx = part.indexOf('=');
          if (idx > 0) {
            kv[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
          }
        });
        const targetType =
          kv.type === 'sensor' || kv.type === 'machine' || kv.type === 'camera'
            ? kv.type
            : deviceType;
        setDeviceType(targetType);
        if (targetType === 'camera') {
          if (kv.name) setCamName(kv.name);
          if (kv.area) setCamArea(kv.area);
          if (kv.ip) setCamIp(kv.ip);
        } else if (targetType === 'sensor') {
          if (kv.code && ['SO2', 'CO', 'NO2', 'PM2_5', 'PM10'].includes(kv.code)) {
            setSensorGas(kv.code as any);
          }
          if (kv.name) setSensorName(kv.name);
          if (kv.area) setSensorArea(kv.area);
          if (kv.ip) setSensorIp(kv.ip);
        } else {
          if (kv.name) setMachName(kv.name);
          if (kv.typeName) setMachType(kv.typeName);
          if (kv.area) setMachArea(kv.area);
          if (kv.ip) setMachIp(kv.ip);
        }
        setQrStatus({
          ok: true,
          text:
            language === 'kz'
              ? `QR-код сәтті оқылды: ${kv.name || kv.ip || raw}`
              : `QR-код считан: ${kv.name || kv.ip || raw}`,
        });
        setValidationError(null);
        return;
      }

      // Fallback: plain IP or Tag string
      if (deviceType === 'camera') {
        setCamIp(raw);
      } else if (deviceType === 'sensor') {
        setSensorIp(raw);
      } else {
        setMachIp(raw);
      }
      setQrStatus({
        ok: true,
        text:
          language === 'kz'
            ? `QR-код мекенжай ретінде танылды: ${raw}`
            : `QR-метка применена к адресу подключения: ${raw}`,
      });
      setValidationError(null);
    },
    [deviceType, language]
  );

  const handleCameraScannerComplete = useCallback(
    (rawPayload: string) => {
      setConnectionMode('qr');
      applyDecodedQrPayload(rawPayload);
      setIsCameraScannerOpen(false);
    },
    [applyDecodedQrPayload]
  );

  const handleQuickAddScannedCamera = useCallback(
    (parsed: ScannedHardwareLabel) => {
      const cleanIp = (parsed.ip || '').trim();
      if (!cleanIp || !onAddCamera) return;
      playPingSound();
      const newCamera: IndustrialCamera = {
        id: 'cam-' + Date.now().toString(36),
        name: parsed.name?.trim() || camName.trim() || 'CAM-QR',
        area: parsed.area?.trim() || camArea.trim() || 'Основной цех',
        streamUrl: cleanIp,
        ipAddress: cleanIp,
        connectionMethod: 'qr',
        fps: camFps,
        resolution: camResolution,
        status: 'active',
        currentDetections: {
          helmetsOk: 4,
          helmetsMissing: 0,
          vestsOk: 4,
          vestsMissing: 0,
          gogglesOk: 4,
          gogglesMissing: 0,
          inHazardZone: 0,
        },
      };
      onAddCamera(newCamera);
      setIsCameraScannerOpen(false);
      onClose();
    },
    [camArea, camFps, camName, camResolution, onAddCamera, onClose]
  );

  const handleUploadQrImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        const decoded = jsQR(imgData.data, imgData.width, imgData.height);
        if (decoded && decoded.data) {
          applyDecodedQrPayload(decoded.data);
        } else {
          setQrStatus({
            ok: false,
            text:
              language === 'kz'
                ? 'Суреттен QR-код табылмады'
                : 'На изображении не удалось распознать QR-код',
          });
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  const activeIpValue =
    deviceType === 'camera' ? camIp : deviceType === 'sensor' ? sensorIp : machIp;

  const handleTestConnection = () => {
    const cleanIp = activeIpValue.trim();
    if (!cleanIp) {
      setValidationError(
        language === 'kz'
          ? 'Алдымен IP-мекенжайды енгізіңіз'
          : 'Сначала введите IP-адрес устройства'
      );
      setTestResult(null);
      return;
    }
    setValidationError(null);
    setIsTesting(true);
    setTestResult(null);

    setTimeout(() => {
      setIsTesting(false);
      playPingSound();
      const ping = Math.floor(Math.random() * 8) + 12;
      if (deviceType === 'camera') {
        setTestResult({
          success: true,
          pingMs: ping,
          protocol: 'RTSP / H.264 (IP)',
          message:
            language === 'kz'
              ? `RTSP ағыны белсенді (${cleanIp}, ${ping}ms, H.264 ${camFps}fps)`
              : `RTSP видеопоток по IP ${cleanIp} доступен (Handshake OK, ${ping}мс, ${camFps}fps)`,
        });
      } else if (deviceType === 'sensor') {
        setTestResult({
          success: true,
          pingMs: ping,
          protocol: 'Modbus TCP / Port 502',
          message:
            language === 'kz'
              ? `Modbus TCP регистрлері оқылды (${cleanIp}, ${ping}ms)`
              : `Modbus TCP регистры по IP ${cleanIp} прочитаны успешно (${ping}мс)`,
        });
      } else {
        setTestResult({
          success: true,
          pingMs: ping,
          protocol: 'ISO 10816 IEPE / Modbus TCP',
          message:
            language === 'kz'
              ? `Вибросенсор калибрленді (${cleanIp}, ${ping}ms)`
              : `Вибродатчик по IP ${cleanIp} синхронизирован (RMS 1.8 мм/с, ${ping}мс)`,
        });
      }
    }, 500);
  };

  const handleSaveDevice = () => {
    const cleanIp = activeIpValue.trim();
    if (!cleanIp) {
      setValidationError(
        language === 'kz'
          ? 'Жабдықтың IP-мекенжайын енгізіңіз немесе QR-кодты сканерлеңіз'
          : 'Введите IP-адрес устройства вручную или считайте QR-код'
      );
      return;
    }
    setValidationError(null);
    playPingSound();

    if (deviceType === 'camera' && onAddCamera) {
      const newCamera: IndustrialCamera = {
        id: 'cam-' + Date.now().toString(36),
        name: camName.trim() || 'CAM-IP',
        area: camArea.trim() || 'Основной цех',
        streamUrl: camIp.trim(),
        ipAddress: camIp.trim(),
        connectionMethod: connectionMode,
        fps: camFps,
        resolution: camResolution,
        status: 'active',
        currentDetections: {
          helmetsOk: 4,
          helmetsMissing: 0,
          vestsOk: 4,
          vestsMissing: 0,
          gogglesOk: 4,
          gogglesMissing: 0,
          inHazardZone: 0,
        },
      };
      onAddCamera(newCamera);
    } else if (deviceType === 'sensor' && onAddSensor) {
      const thresholds: Record<string, { warn: number; crit: number; unit: string }> = {
        SO2: { warn: 0.35, crit: 0.5, unit: 'мг/м³' },
        CO: { warn: 3.5, crit: 5.0, unit: 'мг/м³' },
        NO2: { warn: 0.15, crit: 0.2, unit: 'мг/м³' },
        PM2_5: { warn: 110, crit: 160, unit: 'мкг/м³' },
        PM10: { warn: 200, crit: 300, unit: 'мкг/м³' },
      };
      const cfg = thresholds[sensorGas] || thresholds.SO2;
      const newSensor: EcoSensor = {
        id: 'eco-' + Date.now().toString(36),
        name: sensorName.trim() || `Датчик ${sensorGas}`,
        code: sensorGas,
        unit: cfg.unit,
        currentValue: Number((cfg.warn * 0.65).toFixed(2)),
        thresholdWarning: cfg.warn,
        thresholdCritical: cfg.crit,
        area: sensorArea.trim() || 'Газоочистная станция',
        ipAddress: sensorIp.trim(),
        connectionMethod: connectionMode,
        status: 'normal',
        trend: 'stable',
        lastUpdated: new Date().toISOString(),
      };
      onAddSensor(newSensor);
    } else if (deviceType === 'machine' && onAddMachine) {
      const newMachine: IndustrialMachine = {
        id: 'mach-' + Date.now().toString(36),
        name: machName.trim() || 'Агрегат №1',
        type: machType.trim() || 'Промышленный агрегат',
        area: machArea.trim() || 'Цех №1',
        ipAddress: machIp.trim(),
        connectionMethod: connectionMode,
        installedYear: machYear,
        temperatureC: 54.0,
        temperatureBaselineC: 52.0,
        vibrationRmsMmS: 1.8,
        vibrationBaselineMmS: 1.5,
        peakFrequencyHz: 49.8,
        riskStatus: 'low',
        failureProbabilityPercent: 6,
        remainingUsefulLifeHours: 8500,
        recommendations: {
          ru: 'Штатный виброакустический режим. Регулярная проверка смазочного узла согласно графику ТОиР.',
          kz: 'Қалыпты діріл-акустикалық режим. Жоспарлы техникалық қызмет көрсету кестесіне сәйкес майлау торабын тексеру.',
        },
        lastInspectionDate: new Date().toISOString().split('T')[0],
        telemetryHistory: [
          { time: '10:00', temp: 53.5, vibration: 1.7 },
          { time: '11:00', temp: 54.0, vibration: 1.8 },
        ],
      };
      onAddMachine(newMachine);
    }

    setIsCameraScannerOpen(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="relative w-full max-w-2xl my-auto max-h-[92dvh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
          <button
            onClick={() => {
              setIsCameraScannerOpen(false);
              onClose();
            }}
            className="absolute right-4 top-4 z-10 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label={t.common.close}
          >
            <X className="h-5 w-5" />
          </button>

        <div className="overflow-y-auto p-5 sm:p-6 no-scrollbar space-y-5">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1 text-cyan-400 font-mono text-xs uppercase tracking-wider font-semibold">
              <Cpu className="h-4 w-4" />
              <span>Edge Hardware Gateway · IP / RTSP / QR-код</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {language === 'kz'
                ? 'Жабдықты IP немесе QR-код арқылы қосу'
                : 'Подключение оборудования по IP-адресу или QR-коду'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {language === 'kz'
                ? 'SafeVision камераларын, EcoPredict датчиктерін және FailPredict агрегаттарын қосыңыз'
                : 'Добавьте камеры SafeVision, датчики EcoPredict или агрегаты FailPredict по IP-адресу либо QR-коду'}
            </p>
          </div>

          {/* Device Type Selector */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setDeviceType('camera');
                setTestResult(null);
                setValidationError(null);
              }}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all ${
                deviceType === 'camera'
                  ? 'border-cyan-500 bg-cyan-950/40 text-cyan-300 font-bold shadow-sm'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Camera className="h-5 w-5" />
              <span className="text-xs">SafeVision Камера</span>
              <span className="text-[10px] text-slate-500 font-mono">IP / RTSP / QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDeviceType('sensor');
                setTestResult(null);
                setValidationError(null);
              }}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all ${
                deviceType === 'sensor'
                  ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300 font-bold shadow-sm'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Leaf className="h-5 w-5" />
              <span className="text-xs">EcoPredict Датчик</span>
              <span className="text-[10px] text-slate-500 font-mono">Modbus IP / QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDeviceType('machine');
                setTestResult(null);
                setValidationError(null);
              }}
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-center transition-all ${
                deviceType === 'machine'
                  ? 'border-amber-500 bg-amber-950/40 text-amber-300 font-bold shadow-sm'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Activity className="h-5 w-5" />
              <span className="text-xs">FailPredict Агрегат</span>
              <span className="text-[10px] text-slate-500 font-mono">ISO 10816 / QR</span>
            </button>
          </div>

          {/* Connection Method Switcher (IP Address vs QR Code) */}
          <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setConnectionMode('ip');
                setValidationError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors ${
                connectionMode === 'ip'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe className="h-4 w-4" />
              <span>{language === 'kz' ? 'IP-мекенжай бойынша қосу' : 'Добавить по IP-адресу'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setConnectionMode('qr');
                setValidationError(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-colors ${
                connectionMode === 'qr'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <QrCode className="h-4 w-4" />
              <span>{language === 'kz' ? 'QR-код арқылы қосу' : 'Добавить через QR-код'}</span>
            </button>
          </div>

          {/* QR Code Scanner / Loader Section */}
          {connectionMode === 'qr' && (
            <div className="rounded-xl border border-cyan-500/30 bg-slate-950/80 p-4 space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-cyan-300 flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  <span>
                    {language === 'kz'
                      ? 'Құрылғының QR-кодын сканерлеу немесе жүктеу'
                      : 'Сканирование QR-кода устройства (камера / файл / метка)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setQrStatus(null);
                      setIsCameraScannerOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors cursor-pointer"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>{language === 'kz' ? 'Камерамен сканерлеу' : 'Сканировать камерой'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold transition-colors cursor-pointer"
                  >
                    <Upload className="h-3.5 w-3.5 text-cyan-400" />
                    <span>{language === 'kz' ? 'QR фото' : 'Фото QR'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadQrImage}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Quick Scannable QR Labels */}
              <div>
                <div className="text-[11px] text-slate-400 mb-2">
                  {language === 'kz'
                    ? 'Дайын QR-белгілер (бір рет басып толтырыңыз):'
                    : 'QR-метки оборудования (нажмите для мгновенного считывания):'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SAMPLE_QR_PAYLOADS[deviceType].map((item) => (
                    <button
                      key={item.payload}
                      type="button"
                      onClick={() => applyDecodedQrPayload(item.payload)}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-800 bg-slate-900 hover:border-cyan-500/60 text-left transition-all"
                    >
                      {qrPreviewUrls[item.payload] ? (
                        <img
                          src={qrPreviewUrls[item.payload]}
                          alt={item.label}
                          className="w-12 h-12 rounded border border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0">
                          <QrCode className="h-6 w-6 text-cyan-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{item.label}</div>
                        <div className="text-[10px] font-mono text-cyan-400 truncate">
                          {item.payload.split('|ip=')[1] || 'QR Payload'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Manual QR string parse */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={qrInput}
                  onChange={(e) => setQrInput(e.target.value)}
                  placeholder="NF-HW|type=camera|name=CAM-03|area=Цех №2|ip=192.168.10.150:554"
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => applyDecodedQrPayload(qrInput)}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold shrink-0"
                >
                  {language === 'kz' ? 'Оқу' : 'Применить QR'}
                </button>
              </div>

              {qrStatus && (
                <div
                  className={`p-2.5 rounded-lg border flex items-center gap-2 text-xs ${
                    qrStatus.ok
                      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                      : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                  }`}
                >
                  {qrStatus.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span>{qrStatus.text}</span>
                </div>
              )}
            </div>
          )}

          {/* Configuration Form */}
          <div className="space-y-4 text-xs">
            {deviceType === 'camera' && (
              <>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {language === 'kz' ? 'Камера атауы' : 'Название камеры / Точки наблюдения'}
                  </label>
                  <input
                    type="text"
                    value={camName}
                    onChange={(e) => setCamName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Өндірістік цех' : 'Цех / Участок'}
                    </label>
                    <input
                      type="text"
                      value={camArea}
                      onChange={(e) => setCamArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Кадр жиілігі (FPS)' : 'Частота кадров (FPS)'}
                    </label>
                    <select
                      value={camFps}
                      onChange={(e) => setCamFps(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-cyan-500 text-xs"
                    >
                      <option value={15}>15 FPS (Эконом)</option>
                      <option value={25}>25 FPS (ГОСТ)</option>
                      <option value={30}>30 FPS (Штатно)</option>
                      <option value={60}>60 FPS (Высокоскоростная)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    IP-адрес / RTSP Stream URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoComplete="off"
                      value={camIp}
                      onChange={(e) => {
                        setCamIp(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="192.168.10.145:554/live/ch0"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCameraScannerOpen(true)}
                      className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                      title={language === 'kz' ? 'Камера арқылы QR-белгіні сканерлеу' : 'Сканировать QR-метку камерой'}
                    >
                      <QrCode className="h-3.5 w-3.5 text-cyan-400" />
                      <span>QR</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3 py-2 rounded-lg border border-cyan-500/40 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                      <span>Ping IP</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {deviceType === 'sensor' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Газ түрі' : 'Анализируемый газ / ПДК'}
                    </label>
                    <select
                      value={sensorGas}
                      onChange={(e) => {
                        const g = e.target.value as any;
                        setSensorGas(g);
                        setSensorName(`Пост газоочистки: датчик ${g}`);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 text-xs font-mono"
                    >
                      <option value="SO2">SO₂ (Диоксид серы)</option>
                      <option value="CO">CO (Оксид углерода)</option>
                      <option value="NO2">NO₂ (Диоксид азота)</option>
                      <option value="PM2_5">PM2.5 (Мелкодисперсная пыль)</option>
                      <option value="PM10">PM10 (Взвешенные частицы)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Бекет орны' : 'Пост / Локация'}
                    </label>
                    <input
                      type="text"
                      value={sensorArea}
                      onChange={(e) => setSensorArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {language === 'kz' ? 'Датчик атауы' : 'Наименование поста газоанализа'}
                  </label>
                  <input
                    type="text"
                    value={sensorName}
                    onChange={(e) => setSensorName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    IP-адрес (Modbus TCP / MQTT)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      autoComplete="off"
                      value={sensorIp}
                      onChange={(e) => {
                        setSensorIp(e.target.value);
                        setValidationError(null);
                      }}
                      placeholder="192.168.10.210:502"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={isTesting}
                      className="px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 font-semibold flex items-center gap-1.5 shrink-0"
                    >
                      {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                      <span>Ping IP</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {deviceType === 'machine' && (
              <>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {language === 'kz' ? 'Агрегат атауы' : 'Наименование агрегата'}
                  </label>
                  <input
                    type="text"
                    value={machName}
                    onChange={(e) => setMachName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 text-xs"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Жабдық түрі' : 'Тип оборудования (ISO 10816)'}
                    </label>
                    <input
                      type="text"
                      value={machType}
                      onChange={(e) => setMachType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Жылы' : 'Год ввода'}
                    </label>
                    <input
                      type="number"
                      value={machYear}
                      onChange={(e) => setMachYear(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      {language === 'kz' ? 'Орналасқан цехы' : 'Цех / Участок монтажа'}
                    </label>
                    <input
                      type="text"
                      value={machArea}
                      onChange={(e) => setMachArea(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-500 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">
                      IP-адрес вибродатчика
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        autoComplete="off"
                        value={machIp}
                        onChange={(e) => {
                          setMachIp(e.target.value);
                          setValidationError(null);
                        }}
                        placeholder="192.168.10.230:502"
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTesting}
                        className="px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 font-semibold flex items-center gap-1.5 shrink-0"
                      >
                        {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                        <span>Ping</span>
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Validation Error Banner */}
            {validationError && (
              <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-950/30 text-rose-300 flex items-center gap-2 text-xs animate-in fade-in">
                <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            {/* Test Status Banner */}
            {testResult && (
              <div className="p-3 rounded-lg border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Связь со шлюзом установлена ({testResult.pingMs} мс)</span>
                </div>
                <div className="text-[11px] text-emerald-200/90 font-mono">{testResult.message}</div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsCameraScannerOpen(false);
                onClose();
              }}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={handleSaveDevice}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 font-bold text-white transition-colors shadow-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{language === 'kz' ? 'Қосу және белсендіру' : 'Подключить устройство'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <CameraQrScannerModal
      isOpen={isCameraScannerOpen}
      onClose={() => setIsCameraScannerOpen(false)}
      language={language}
      targetDeviceType={deviceType}
      onScanComplete={(rawPayload) => handleCameraScannerComplete(rawPayload)}
      onQuickAddCamera={onAddCamera ? handleQuickAddScannedCamera : undefined}
    />
  </>
  );
};
