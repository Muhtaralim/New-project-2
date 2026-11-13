import React, { useState, useEffect } from 'react';
import {
  IndustrialCamera,
  PPEViolation,
  TimeFilter,
  VerificationStatus,
  Language,
  IndustrialMachine,
  FactoryEmployee,
} from '../types';
import { translations } from '../i18n/translations';
import { calculatePpeComplianceRate, filterPpeViolations } from '../utils/industrialMath';
import { EquipmentQrScannerModal } from './EquipmentQrScannerModal';
import safeVisionFeedImg from '../assets/images/safevision_ppe_feed_1792688516637.jpg';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Camera,
  CheckCircle2,
  XCircle,
  Clock,
  Sliders,
  HardHat,
  Glasses,
  Radio,
  RotateCcw,
  QrCode,
  Trash2,
  Plus,
  User,
  Lock,
} from 'lucide-react';

interface SafeVisionViewProps {
  cameras: IndustrialCamera[];
  violations: PPEViolation[];
  machines?: IndustrialMachine[];
  employees?: FactoryEmployee[];
  onUpdateViolationStatus: (id: string, newStatus: VerificationStatus) => void;
  onSimulateViolation: (employeeId?: string) => void;
  onDispatchWorkOrder?: (machineId: string) => void;
  onNavigateToFailPredict?: (machineId: string) => void;
  language: Language;
  onOpenConnectCamera?: () => void;
  onDeleteCamera?: (id: string) => void;
  isWorker?: boolean;
  currentEmployeeId?: string;
}

export const SafeVisionView: React.FC<SafeVisionViewProps> = ({
  cameras,
  violations,
  machines = [],
  employees = [],
  onUpdateViolationStatus,
  onSimulateViolation,
  onDispatchWorkOrder,
  onNavigateToFailPredict,
  language,
  onOpenConnectCamera,
  onDeleteCamera,
  isWorker = false,
  currentEmployeeId,
}) => {
  const t = translations[language];

  // Equipment QR Code Scanner Modal
  const [isQrScannerOpen, setIsQrScannerOpen] = useState<boolean>(false);

  // Filters state
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Active camera feed selection
  const [selectedCameraId, setSelectedCameraId] = useState<string>(cameras[0]?.id || '');

  useEffect(() => {
    if (cameras.length === 0) {
      setSelectedCameraId('');
    } else if (!cameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(cameras[0].id);
    }
  }, [cameras, selectedCameraId]);

  // Input data parameter controls
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(85);
  const [minObjectSize, setMinObjectSize] = useState<number>(32);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) || cameras[0];
  const complianceScore = cameras.length > 0 ? calculatePpeComplianceRate(cameras) : 0;

  // For ordinary workers, only show their personal violations
  const scopedViolations = isWorker
    ? violations.filter((v) => !currentEmployeeId || v.employeeId === currentEmployeeId)
    : violations;

  // Filtered violations
  const filteredViolations = filterPpeViolations(scopedViolations, areaFilter, statusFilter, timeFilter);

  // Available unique areas from cameras
  const uniqueAreas = Array.from(new Set(cameras.map((c) => c.area)));

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  };

  return (
    <div className="space-y-6">
      {/* Module Banner / Description Card */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" />

        <div className="relative overflow-hidden">
          <img
            src={safeVisionFeedImg}
            alt="SafeVision Computer Vision PPE Monitoring"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/92 to-slate-950/65" />

          <div className="relative p-6 sm:p-7 space-y-5">
            {/* Title + Refresh Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-2 max-w-3xl">
                <div className="flex items-center gap-2 text-xs font-medium text-cyan-400">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>
                    {language === 'kz'
                      ? 'Компьютерлік көру · YOLOv11 Edge бейнеаналитикасы'
                      : 'Компьютерное зрение · YOLOv11 TensorRT Edge'}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white text-balance leading-snug">
                  {t.safevision.title}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                  {t.safevision.taskDescription}
                </p>
              </div>

              <button
                type="button"
                onClick={handleRefresh}
                className="self-start flex items-center gap-1.5 rounded-lg border border-slate-700/90 bg-slate-900/90 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={t.common.refreshData}
              >
                <RotateCcw className={`h-3.5 w-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{t.common.refreshData}</span>
              </button>
            </div>

            {/* Organized Action Toolbar Row */}
            <div className="pt-4 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-3">
              {/* Primary Operations */}
              <div className="flex flex-wrap items-center gap-2.5">
                {!isWorker && onOpenConnectCamera && (
                  <button
                    type="button"
                    onClick={onOpenConnectCamera}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>{t.emptyStates.connectCameraBtn}</span>
                  </button>
                )}
                {!isWorker && (
                  <button
                    type="button"
                    onClick={() => setIsQrScannerOpen(true)}
                    className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-slate-900/90 hover:bg-slate-800 px-4 py-2 text-xs font-semibold text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <QrCode className="h-4 w-4 shrink-0" />
                    <span>{t.safevision.scanQrBtn}</span>
                  </button>
                )}
                {isWorker && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/35 text-xs font-semibold text-rose-300">
                    <Lock className="h-3.5 w-3.5 text-rose-400" />
                    <span>
                      {language === 'kz'
                        ? 'Камераларды басқару: Қолжетімділік жабық'
                        : 'Управление камерами: Доступ закрыт'}
                    </span>
                  </div>
                )}
              </div>

              {/* Simulation Control Group */}
              {!isWorker && (
                <div className="inline-flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 p-1.5">
                  {employees.length > 0 && (
                    <select
                      value={selectedEmployeeId}
                      onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      className="rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none max-w-[200px]"
                      title="Выберите сотрудника для привязки инцидента"
                    >
                      <option value="">
                        {language === 'kz' ? 'Кездейсоқ / Жалпы' : 'Любой / Общий'}
                      </option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.fullName} ({emp.specialty})
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => onSimulateViolation(selectedEmployeeId || undefined)}
                    disabled={cameras.length === 0}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/70 px-3.5 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-900/70 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    <span>{t.safevision.simulateDetection}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 4 Status KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 md:divide-x divide-slate-800/80 border-t border-slate-800 bg-slate-950/85">
          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>{t.safevision.complianceScore}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {cameras.length > 0 ? `${complianceScore}%` : '0%'}
            </div>
            <div className="text-[11px] text-slate-400">
              {cameras.length > 0
                ? 'Порог нормы: > 92%'
                : language === 'kz'
                ? 'Белсенді бейнеағындар жоқ'
                : 'Нет активных видеопотоков'}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>{t.safevision.activeCameras}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {cameras.filter((c) => c.status === 'active').length} / {cameras.length}
            </div>
            <div className={`text-[11px] font-medium ${cameras.length > 0 ? 'text-emerald-400' : 'text-amber-400/90'}`}>
              {cameras.length > 0
                ? language === 'kz'
                  ? `Камералар қосылған (${cameras.length} дана · 25 FPS)`
                  : `Камеры подключены (${cameras.length} шт. · 25 FPS)`
                : language === 'kz'
                ? 'Камералар қосылмаған (0)'
                : 'Камеры не подключены (0)'}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>{t.safevision.violationsToday}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {violations.length}
            </div>
            <div className="text-[11px] text-slate-400">
              {language === 'kz'
                ? `${violations.filter((v) => v.status === 'new').length} тексеруді күтуде`
                : `${violations.filter((v) => v.status === 'new').length} ожидают верификации`}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span>{t.safevision.hazardousIncidents}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400 tabular-nums">
              {violations.filter((v) => v.violationType === 'hazard_zone_entry').length}
            </div>
            <div className="text-[11px] text-slate-400">
              {cameras.length > 0
                ? language === 'kz'
                  ? 'Қолжетімділікті бұғаттау белсенді'
                  : 'Блокировка доступа активна'
                : language === 'kz'
                ? 'Оқиғалар тіркелмеген'
                : 'Инцидентов не зафиксировано'}
            </div>
          </div>
        </div>
      </div>

      {/* Camera Live Stream Feed or Worker Lock / Empty Disconnected Banner */}
      {isWorker ? (
        <div className="rounded-2xl border border-rose-500/40 bg-slate-900/80 p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-4 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400">
            <Lock className="h-7 w-7" />
          </div>
          <div className="max-w-lg space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {language === 'kz' ? 'Қолжетімділік жабық' : 'Доступ закрыт'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {language === 'kz'
                ? 'Бейнекамера ағындарын көру, жаңа камера қосу және ЖҚҚ оқиғаларын верификациялау тек мамандар мен басшылыққа қолжетімді. Төменде тек сіздің жеке бұзушылық журналыңыз ашық.'
                : 'Просмотр видеопотоков камер, подключение оборудования, симуляция и верификация инцидентов доступны только специалистам и руководству организации. Ниже отображается только ваш личный журнал нарушений СИЗ.'}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold tabular-nums ${
            cameras.length > 0
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
          }`}>
            <Camera className="h-4 w-4" />
            <span>
              {cameras.length > 0
                ? language === 'kz'
                  ? `Ұйым мәртебесі: Камералар қосылған (${cameras.length} дана)`
                  : `Статус организации: Камеры подключены (${cameras.length} шт.)`
                : language === 'kz'
                ? 'Ұйым мәртебесі: Камералар қосылмаған (0 дана)'
                : 'Статус организации: Камеры не подключены (0 шт.)'}
            </span>
          </div>
        </div>
      ) : cameras.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-5 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Camera className="h-7 w-7" />
          </div>
          <div className="max-w-lg space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {t.emptyStates.camerasNotConnected}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              {t.emptyStates.camerasNotConnectedDesc}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!isWorker && onOpenConnectCamera ? (
              <button
                type="button"
                onClick={onOpenConnectCamera}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{t.emptyStates.connectCameraBtn}</span>
              </button>
            ) : isWorker ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/80 text-xs text-slate-300">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {language === 'kz'
                    ? 'Камера қосу тек мамандар мен әкімшіге рұқсат етілген'
                    : 'Подключение камер доступно только специалистам и руководству'}
                </span>
              </div>
            ) : null}
          </div>
          <div className="w-full max-w-2xl pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left text-[11px] font-mono">
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">{language === 'kz' ? 'Дулығалар (ГОСТ)' : 'Каски (ГОСТ)'}</div>
              <div className="text-cyan-400 font-semibold mt-0.5 tabular-nums">94.2% mAP</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">{language === 'kz' ? 'Кеудешелер' : 'Жилеты (СИЗ)'}</div>
              <div className="text-cyan-400 font-semibold mt-0.5 tabular-nums">25 FPS Edge</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">{language === 'kz' ? 'Қорғаныс көзілдірігі' : 'Защитные очки'}</div>
              <div className="text-cyan-400 font-semibold mt-0.5 tabular-nums">Face ROI</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">{language === 'kz' ? 'Қауіпті аймақтар' : 'Опасные зоны'}</div>
              <div className="text-cyan-400 font-semibold mt-0.5 tabular-nums">&lt; 0.3 сек</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{selectedCamera?.name}</span>
              </div>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-slate-400 font-mono">
                {selectedCamera?.resolution} · {selectedCamera?.fps} FPS
              </span>
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-cyan-400">
              <button
                type="button"
                onClick={() => setIsQrScannerOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs transition-colors"
                title="Сканировать QR-бирки агрегатов на этом участке"
              >
                <QrCode className="h-3.5 w-3.5" />
                <span>QR-сканер</span>
              </button>
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
                <Radio className="h-3.5 w-3.5 text-rose-500 animate-pulse" />
                <span>LIVE AI INFERENCE</span>
              </div>
            </div>
          </div>

          {/* Camera Frame with Interactive Detection Bounding Boxes */}
          <div className="relative aspect-video bg-black overflow-hidden flex items-center justify-center group">
            <img
              src={safeVisionFeedImg}
              alt="CCTV Industrial Feed"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-102"
            />

            {/* Live scanning laser line effect */}
            <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-70 animate-scanline pointer-events-none" />

            {/* Camera Viewfinder Crosshairs */}
            <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-400/70 pointer-events-none" />
            <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-400/70 pointer-events-none" />
            <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-400/70 pointer-events-none" />
            <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-400/70 pointer-events-none" />

            {/* Simulated Live Detection Bounding Boxes */}
            {/* Box 1: Worker 1 with Hardhat OK, Vest OK */}
            <div
              className="absolute border-2 border-emerald-500 bg-emerald-500/10 pointer-events-none transition-all"
              style={{ top: '60%', left: '30%', width: '12%', height: '32%' }}
            >
              <div className="absolute -top-6 left-0 bg-emerald-950/90 border border-emerald-500 px-1.5 py-0.5 text-[9px] font-mono text-emerald-300 font-semibold rounded whitespace-nowrap">
                Каска: 97% · Жилет: 95%
              </div>
            </div>

            {/* Box 2: Worker 2 in Crane Hazard Zone with Missing Goggles */}
            <div
              className="absolute border-2 border-amber-500 bg-amber-500/10 pointer-events-none transition-all"
              style={{ top: '62%', left: '46%', width: '11%', height: '30%' }}
            >
              <div className="absolute -top-6 left-0 bg-amber-950/90 border border-amber-500 px-1.5 py-0.5 text-[9px] font-mono text-amber-200 font-semibold rounded whitespace-nowrap">
                Каска: 94% · НЕТ ОЧКОВ
              </div>
            </div>

            {/* Box 3: Overhead Crane Danger Zone Polygon Overlay */}
            <div
              className="absolute border-2 border-dashed border-rose-500/70 bg-rose-950/20 pointer-events-none"
              style={{ top: '10%', left: '15%', width: '70%', height: '40%' }}
            >
              <div className="absolute top-2 left-2 bg-rose-900/90 border border-rose-500 px-2 py-0.5 text-[10px] font-mono font-bold text-rose-200 uppercase rounded">
                Опасная зона: Кран-балка г/п 20Т (Активно)
              </div>
            </div>

            {/* Bottom HUD metadata */}
            <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-white/80 bg-slate-950/70 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <HardHat className="h-3 w-3 text-emerald-400" />
                  <span>Каски: {selectedCamera?.currentDetections.helmetsOk} ОК / {selectedCamera?.currentDetections.helmetsMissing} НЕТ</span>
                </span>
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  <span>Жилеты: {selectedCamera?.currentDetections.vestsOk} ОК / {selectedCamera?.currentDetections.vestsMissing} НЕТ</span>
                </span>
                <span className="flex items-center gap-1">
                  <Glasses className="h-3 w-3 text-amber-400" />
                  <span>Очки: {selectedCamera?.currentDetections.gogglesOk} ОК / {selectedCamera?.currentDetections.gogglesMissing} НЕТ</span>
                </span>
              </div>
              <div className="text-cyan-300 font-semibold">
                Задержка: 18мс
              </div>
            </div>
          </div>

          {/* Camera Parameter Sliders (Data Input Section) */}
          <div className="border-t border-slate-800 bg-slate-950/60 p-4">
            <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-cyan-400" />
              <span>{t.safevision.inputDataTitle}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{t.safevision.thresholdSensitivity}</span>
                  <span className="font-mono text-cyan-400 font-semibold">{confidenceThreshold}%</span>
                </div>
                <input
                  type="range"
                  min="60"
                  max="99"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{t.safevision.minBoxSize}</span>
                  <span className="font-mono text-cyan-400 font-semibold">{minObjectSize} px</span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="64"
                  value={minObjectSize}
                  onChange={(e) => setMinObjectSize(Number(e.target.value))}
                  className="w-full accent-cyan-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Camera List / Switching Panel */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm flex flex-col">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Camera className="h-4 w-4 text-cyan-400" />
              <span>{t.safevision.monitoringFeeds}</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {cameras.length} канала
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
            {cameras.map((cam) => {
              const isSelected = cam.id === selectedCameraId;
              const hasViolations =
                cam.currentDetections.helmetsMissing > 0 ||
                cam.currentDetections.vestsMissing > 0 ||
                cam.currentDetections.inHazardZone > 0;

              return (
                <div
                  key={cam.id}
                  onClick={() => setSelectedCameraId(cam.id)}
                  className={`w-full text-left rounded-lg p-3 border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-cyan-500 bg-slate-800/90 shadow-sm'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-semibold text-xs text-white truncate max-w-[180px]">
                      {cam.name}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasViolations ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950 border border-rose-800 text-rose-300 font-semibold">
                          Нарушение
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-300">
                          ОК
                        </span>
                      )}
                      {!isWorker && onDeleteCamera && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCamera(cam.id);
                          }}
                          className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors cursor-pointer"
                          title={language === 'kz' ? 'Камераны өшіру' : 'Удалить камеру'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 mb-2">
                    <span className="truncate">{cam.area}</span>
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      {cam.connectionMethod && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/70 text-cyan-300 uppercase">
                          {cam.connectionMethod}
                        </span>
                      )}
                      {cam.ipAddress && (
                        <span className="text-slate-500 truncate max-w-[120px]">{cam.ipAddress}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400 bg-slate-900/80 p-1.5 rounded">
                    <div>Каски: {cam.currentDetections.helmetsOk}</div>
                    <div>Жилеты: {cam.currentDetections.vestsOk}</div>
                    <div>Зона: {cam.currentDetections.inHazardZone}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Violations and Event Log with Multi-Criteria Filters */}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        {isWorker && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/25 px-4 py-2.5 flex items-center gap-2 text-xs text-rose-200">
            <Lock className="h-4 w-4 text-rose-400 shrink-0" />
            <span>
              {language === 'kz'
                ? 'Қолжетімділік жабық (Қарапайым қызметкер): басқару құқығы жоқ. Мұнда тек сіздің тіркелген бұзушылықтарыңыз көрсетіледі.'
                : 'Доступ закрыт для управления (Обычный рабочий): отображаются только ваши зафиксированные нарушения СИЗ.'}
            </span>
          </div>
        )}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              <span>{t.safevision.eventLog}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Фиксация нарушений ношения СИЗ и прохода в опасные зоны с подтверждением инженера охраны труда.
            </p>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Time Filter */}
            <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-1 text-xs">
              {(['1h', '8h', '24h', '7d'] as TimeFilter[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeFilter(tf)}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    timeFilter === tf
                      ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf === '1h' && t.common.time1h}
                  {tf === '8h' && t.common.time8h}
                  {tf === '24h' && t.common.time24h}
                  {tf === '7d' && t.common.time7d}
                </button>
              ))}
            </div>

            {/* Area Filter */}
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">{t.common.allAreas}</option>
              {uniqueAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
            >
              <option value="all">{t.common.allStatuses}</option>
              <option value="new">{t.safevision.statusNew}</option>
              <option value="verified">{t.safevision.statusVerified}</option>
              <option value="false_positive">{t.safevision.statusFalse}</option>
              <option value="resolved">{t.safevision.statusResolved}</option>
            </select>
          </div>
        </div>

        {/* Violations Table */}
        {filteredViolations.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg">
            <ShieldCheck className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-300">{t.common.noData}</div>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
              Нарушений по выбранным фильтрам не зарегистрировано.
            </p>
            <button
              onClick={() => {
                setAreaFilter('all');
                setStatusFilter('all');
                setTimeFilter('24h');
              }}
              className="mt-3 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:text-white"
            >
              {t.common.resetFilters}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                <tr>
                  <th className="py-2.5 px-3">{t.common.time}</th>
                  <th className="py-2.5 px-3">{t.common.zone} / Камера</th>
                  <th className="py-2.5 px-3">Сотрудник</th>
                  <th className="py-2.5 px-3">{t.safevision.violationType}</th>
                  <th className="py-2.5 px-3 text-right">{t.safevision.confidence}</th>
                  <th className="py-2.5 px-3">{t.safevision.verificationStatus}</th>
                  {!isWorker && <th className="py-2.5 px-3 text-right">{t.common.actions}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredViolations.map((v) => {
                  return (
                    <tr key={v.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {new Date(v.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        <span className="text-slate-500 block text-[10px]">
                          {new Date(v.timestamp).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-medium text-white">{v.area}</div>
                        <div className="text-[11px] text-slate-400">{v.cameraName}</div>
                      </td>

                      <td className="py-3 px-3">
                        {v.employeeName ? (
                          <div>
                            <div className="font-medium text-cyan-300 flex items-center gap-1">
                              <User className="h-3 w-3 shrink-0" />
                              <span>{v.employeeName}</span>
                            </div>
                            {v.employeeSpecialty && (
                              <div className="text-[10px] text-slate-400">{v.employeeSpecialty}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">—</span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          {v.violationType === 'no_helmet' && (
                            <span className="text-rose-400 font-medium">
                              Отсутствие защитной каски
                            </span>
                          )}
                          {v.violationType === 'no_vest' && (
                            <span className="text-amber-400 font-medium">
                              Отсутствие сигнального жилета
                            </span>
                          )}
                          {v.violationType === 'no_goggles' && (
                            <span className="text-amber-300 font-medium">
                              Отсутствие защитных очков при шлифовке
                            </span>
                          )}
                          {v.violationType === 'hazard_zone_entry' && (
                            <span className="text-rose-400 font-medium">
                              Несанкционированный вход в опасную зону
                            </span>
                          )}
                        </div>
                        {v.notes && (
                          <div className="text-[10px] text-slate-400 mt-0.5 max-w-md truncate">
                            {v.notes}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-300">
                        {Math.round(v.confidence * 100)}%
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {v.status === 'new' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
                            {t.safevision.statusNew}
                          </span>
                        )}
                        {v.status === 'verified' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                            <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                            {t.safevision.statusVerified}
                          </span>
                        )}
                        {v.status === 'false_positive' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
                            <XCircle className="h-3.5 w-3.5 text-slate-500" />
                            {t.safevision.statusFalse}
                          </span>
                        )}
                        {v.status === 'resolved' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            {t.safevision.statusResolved}
                          </span>
                        )}
                      </td>

                      {!isWorker && (
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {v.status === 'new' && (
                              <>
                                <button
                                  onClick={() => onUpdateViolationStatus(v.id, 'verified')}
                                  className="px-2 py-1 rounded bg-amber-950/80 border border-amber-800 text-[11px] font-medium text-amber-300 hover:bg-amber-900 transition-colors"
                                >
                                  {t.safevision.verifyBtn}
                                </button>
                                <button
                                  onClick={() => onUpdateViolationStatus(v.id, 'false_positive')}
                                  className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
                                >
                                  {t.safevision.markFalseBtn}
                                </button>
                              </>
                            )}
                            {v.status === 'verified' && (
                              <button
                                onClick={() => onUpdateViolationStatus(v.id, 'resolved')}
                                className="px-2 py-1 rounded bg-emerald-950/80 border border-emerald-800 text-[11px] font-medium text-emerald-300 hover:bg-emerald-900 transition-colors"
                              >
                                {t.safevision.resolveBtn}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Equipment QR Code Scanner & Maintenance History Modal */}
      <EquipmentQrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        machines={machines}
        language={language}
        onDispatchWorkOrder={onDispatchWorkOrder}
        onNavigateToFailPredict={onNavigateToFailPredict}
      />
    </div>
  );
};
