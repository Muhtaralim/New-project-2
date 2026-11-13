import React, { useState } from 'react';
import {
  EcoSensor,
  EcoReadingEvent,
  EcoChartPoint,
  TimeFilter,
  EcoStatus,
  Language,
} from '../types';
import { translations } from '../i18n/translations';
import { filterEcoReadings } from '../utils/industrialMath';
import ecoSensorsBannerImg from '../assets/images/ecopredict_sensors_1792688518080.jpg';
import {
  Leaf,
  AlertTriangle,
  TrendingUp,
  Zap,
  Sliders,
  RotateCcw,
  CheckCircle2,
  Gauge,
  Plus,
  Trash2,
  Lock,
  Wind,
  Activity,
} from 'lucide-react';

interface EcoPredictViewProps {
  sensors: EcoSensor[];
  readings: EcoReadingEvent[];
  chartData: EcoChartPoint[];
  onSimulateSpike: () => void;
  language: Language;
  onOpenConnectSensor?: () => void;
  onDeleteSensor?: (id: string) => void;
  isWorker?: boolean;
}

export const EcoPredictView: React.FC<EcoPredictViewProps> = ({
  sensors,
  readings,
  chartData,
  onSimulateSpike,
  language,
  onOpenConnectSensor,
  onDeleteSensor,
  isWorker = false,
}) => {
  const t = translations[language];

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Input data simulation sliders
  const [windSpeed, setWindSpeed] = useState<number>(4.2);
  const [furnaceLoad, setFurnaceLoad] = useState<number>(85);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Active chart metric selection
  const [selectedMetric, setSelectedMetric] = useState<'SO2' | 'CO' | 'PM2_5' | 'NO2'>('SO2');

  const filteredReadings = filterEcoReadings(readings, areaFilter, statusFilter, timeFilter);
  const uniqueAreas = Array.from(new Set(sensors.map((s) => s.area)));

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  };

  // Find threshold for selected metric
  const metricMeta = {
    SO2: { name: 'Диоксид серы (SO₂)', unit: 'мг/м³', thresholdPdk: 0.5, warningPdk: 0.4 },
    CO: { name: 'Оксид углерода (CO)', unit: 'мг/м³', thresholdPdk: 5.0, warningPdk: 4.0 },
    PM2_5: { name: 'Пыль мелкодисперсная (PM2.5)', unit: 'мг/м³', thresholdPdk: 0.15, warningPdk: 0.12 },
    NO2: { name: 'Диоксид азота (NO₂)', unit: 'мг/м³', thresholdPdk: 0.2, warningPdk: 0.15 },
  }[selectedMetric];

  // SVG Chart Geometry
  const chartHeight = 220;
  const chartWidth = 720;
  const paddingX = 40;
  const paddingY = 30;

  const maxVal = metricMeta.thresholdPdk * 1.35;
  const denom = chartData.length > 1 ? chartData.length - 1 : 1;
  const points = chartData.map((d, index) => {
    const val = d[selectedMetric];
    const x =
      chartData.length === 1
        ? chartWidth / 2
        : paddingX + (index / denom) * (chartWidth - paddingX * 2);
    const y = chartHeight - paddingY - (val / maxVal) * (chartHeight - paddingY * 2);
    return { x, y, val, time: d.time };
  });

  const pathD = points.reduce((acc, p, idx) => {
    return idx === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
  }, '');

  const warningY = chartHeight - paddingY - (metricMeta.warningPdk / maxVal) * (chartHeight - paddingY * 2);
  const criticalY = chartHeight - paddingY - (metricMeta.thresholdPdk / maxVal) * (chartHeight - paddingY * 2);

  return (
    <div className="space-y-6">
      {/* Module Overview Banner */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-lg">
        {/* Top precision accent hairline */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />

        {/* Atmospheric backdrop with readability scrim */}
        <div className="relative overflow-hidden">
          <img
            src={ecoSensorsBannerImg}
            alt="EcoPredict Industrial Gas Analysis Station"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/92 to-slate-950/65" />

          <div className="relative p-6 sm:p-7 space-y-5">
            {/* Title + Refresh Row */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="space-y-2 max-w-3xl">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                  <Leaf className="h-4 w-4 shrink-0" />
                  <span>
                    {language === 'kz'
                      ? 'Экологиялық бақылау · LSTM уақыттық қатар болжамы'
                      : 'Экологический интеллект · Прогноз временных рядов LSTM'}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white text-balance leading-snug">
                  {t.ecopredict.title}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300/90 leading-relaxed">
                  {t.ecopredict.taskDescription}
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
            {!isWorker ? (
              <div className="pt-4 border-t border-slate-800/70 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  {onOpenConnectSensor && (
                    <button
                      type="button"
                      onClick={onOpenConnectSensor}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>{t.emptyStates.connectSensorBtn}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onSimulateSpike}
                  disabled={sensors.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/60 px-4 py-2 text-xs font-medium text-amber-200 hover:bg-amber-900/60 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span>{t.ecopredict.simulateSpike}</span>
                </button>
              </div>
            ) : (
              <div className="pt-4 border-t border-slate-800/70 flex items-center">
                <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/35 text-xs font-semibold text-rose-300">
                  <Lock className="h-3.5 w-3.5 text-rose-400" />
                  <span>{language === 'kz' ? 'Модуль жабық: Қолжетімділік жабық' : 'Модуль EcoPredict: Доступ закрыт'}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Status KPI Strip with architectural dividers */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y sm:divide-y-0 md:divide-x divide-slate-800/80 border-t border-slate-800 bg-slate-950/85">
          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Wind className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>{t.ecopredict.ambientIndex}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {sensors.length > 0 ? '91.4%' : '0%'}
            </div>
            <div className="text-[11px] text-slate-400">
              {sensors.length > 0
                ? t.ecopredict.airQualityNormal
                : language === 'kz'
                ? 'Белсенді газоанализаторлар жоқ'
                : 'Нет активных газоанализаторов'}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Gauge className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>{t.ecopredict.sensorsActive}</span>
            </div>
            <div className="flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-2xl font-bold text-white">{sensors.length}</span>
              <span className="text-sm font-medium text-slate-400">
                {language === 'kz' ? 'бекет' : 'станций'}
              </span>
            </div>
            <div className={`text-[11px] font-medium ${sensors.length > 0 ? 'text-emerald-400' : 'text-amber-400/90'}`}>
              {sensors.length > 0
                ? language === 'kz'
                  ? 'Нақты уақыттағы телеметрия'
                  : 'Телеметрия стабильна'
                : language === 'kz'
                ? 'IP немесе QR-код арқылы қосыңыз'
                : 'Подключите по IP или QR-коду'}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span>{t.ecopredict.criticalDeviations}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400 tabular-nums">
              {readings.filter((r) => r.status === 'critical').length}
            </div>
            <div className="text-[11px] text-slate-400">
              {sensors.length > 0
                ? 'SO₂, CO, NO₂, PM2.5'
                : language === 'kz'
                ? 'Шектен асу тіркелмеген'
                : 'Нарушений не зафиксировано'}
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6 space-y-1">
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>{language === 'kz' ? 'Шығарынды қаупі болжамы' : 'Прогноз залпового риска'}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {sensors.length > 0 ? 'SO₂ (15:00)' : '—'}
            </div>
            <div className="text-[11px] text-slate-400">
              {sensors.length > 0
                ? language === 'kz'
                  ? 'Тарту күшейгенде 72% ықтималдық'
                  : 'Вероятность 72% при росте тяги'
                : language === 'kz'
                ? 'Датчик деректері күтілуде'
                : 'Требуются данные датчиков'}
            </div>
          </div>
        </div>
      </div>

      {/* Sensors and Graph or Worker Lock / Disconnected Empty State Banner */}
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
                ? 'Экологиялық телеметрия, LSTM ШРК болжамы және газ анализаторларын басқару тек мамандар мен кәсіпорын басшылығына ашық.'
                : 'Экологический мониторинг, графики ПДК, LSTM-прогноз выбросов и управление газоанализаторами доступны только специалистам и руководству организации.'}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold tabular-nums ${
            sensors.length > 0
              ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
              : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
          }`}>
            <Gauge className="h-4 w-4" />
            <span>
              {sensors.length > 0
                ? language === 'kz'
                  ? `Ұйым мәртебесі: Эко-датчиктер қосылған (${sensors.length} дана)`
                  : `Статус организации: Эко-датчики подключены (${sensors.length} шт.)`
                : language === 'kz'
                ? 'Ұйым мәртебесі: Эко-датчиктер қосылмаған (0 дана)'
                : 'Статус организации: Эко-датчики не подключены (0 шт.)'}
            </span>
          </div>
        </div>
      ) : sensors.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 sm:p-10 text-center flex flex-col items-center justify-center space-y-5 shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <Leaf className="h-7 w-7" />
          </div>
          <div className="max-w-lg space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {t.emptyStates.sensorsNotConnected}
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
              {t.emptyStates.sensorsNotConnectedDesc}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!isWorker && onOpenConnectSensor ? (
              <button
                type="button"
                onClick={onOpenConnectSensor}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-colors shadow-sm cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>{t.emptyStates.connectSensorBtn}</span>
              </button>
            ) : isWorker ? (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 bg-slate-800/80 text-xs text-slate-300">
                <Lock className="h-3.5 w-3.5 text-amber-400" />
                <span>
                  {language === 'kz'
                    ? 'Эко-сенсор қосу тек мамандар мен әкімшіге рұқсат етілген'
                    : 'Подключение эко-датчиков доступно только специалистам и руководству'}
                </span>
              </div>
            ) : null}
          </div>
          <div className="w-full max-w-2xl pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-left text-[11px] font-mono">
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">SO₂ (ПДК РК)</div>
              <div className="text-emerald-400 font-semibold mt-0.5 tabular-nums">0.50 мг/м³</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">CO (ПДК РК)</div>
              <div className="text-emerald-400 font-semibold mt-0.5 tabular-nums">5.00 мг/м³</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">NO₂ (ПДК РК)</div>
              <div className="text-emerald-400 font-semibold mt-0.5 tabular-nums">0.20 мг/м³</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800/80">
              <div className="text-slate-400">PM2.5 (ПДК РК)</div>
              <div className="text-emerald-400 font-semibold mt-0.5 tabular-nums">0.15 мг/м³</div>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* SVG Dynamic Forecast Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span>{t.ecopredict.trendGraphTitle}</span>
              </h2>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Красная черта — Лимит ПДК РК ({metricMeta.thresholdPdk} {metricMeta.unit})
              </div>
            </div>

            {/* Metric Selector Tabs */}
            <div className="flex items-center rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-mono">
              {(['SO2', 'CO', 'PM2_5', 'NO2'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                    selectedMetric === m
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {m === 'PM2_5' ? 'PM2.5' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Responsive SVG Chart */}
          {points.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/50 text-xs text-slate-400">
              <span>{language === 'kz' ? 'График деректері жиналуда...' : 'Ожидание первых точек телеметрии...'}</span>
            </div>
          ) : (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto min-w-[500px]"
            >
              {/* Background grid lines */}
              <line x1={paddingX} y1={paddingY} x2={chartWidth - paddingX} y2={paddingY} stroke="#334155" strokeDasharray="3 3" />
              <line x1={paddingX} y1={chartHeight / 2} x2={chartWidth - paddingX} y2={chartHeight / 2} stroke="#1e293b" />
              <line x1={paddingX} y1={chartHeight - paddingY} x2={chartWidth - paddingX} y2={chartHeight - paddingY} stroke="#334155" />

              {/* Warning Threshold Line */}
              <line
                x1={paddingX}
                y1={warningY}
                x2={chartWidth - paddingX}
                y2={warningY}
                stroke="#f59e0b"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text x={chartWidth - paddingX - 10} y={warningY - 5} fill="#f59e0b" fontSize="10" textAnchor="end" fontFamily="monospace">
                Порог внимания: {metricMeta.warningPdk}
              </text>

              {/* Critical PDK Threshold Line */}
              <line
                x1={paddingX}
                y1={criticalY}
                x2={chartWidth - paddingX}
                y2={criticalY}
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="6 4"
              />
              <text x={chartWidth - paddingX - 10} y={criticalY - 6} fill="#ef4444" fontSize="10" textAnchor="end" fontFamily="monospace" fontWeight="bold">
                ПДК (РК): {metricMeta.thresholdPdk} {metricMeta.unit}
              </text>

              {/* Sensor Curve Line */}
              <path
                d={pathD}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              {points.map((p, idx) => {
                const isOver = p.val >= metricMeta.thresholdPdk;
                const isWarn = p.val >= metricMeta.warningPdk;
                return (
                  <g key={idx}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="4.5"
                      fill={isOver ? '#ef4444' : isWarn ? '#f59e0b' : '#10b981'}
                      stroke="#020617"
                      strokeWidth="2"
                    />
                    <text
                      x={p.x}
                      y={p.y - 9}
                      fill="#e2e8f0"
                      fontSize="9"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {p.val}
                    </text>
                    {/* X axis labels */}
                    <text
                      x={p.x}
                      y={chartHeight - 8}
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {p.time}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          )}

          {/* Weather / Furnace Parameters Input Section */}
          <div className="mt-4 pt-4 border-t border-slate-800 bg-slate-950/60 -mx-6 -mb-6 p-4 rounded-b-xl">
            <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center gap-1.5">
              <Sliders className="h-3.5 w-3.5 text-emerald-400" />
              <span>{t.ecopredict.inputDataTitle}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{t.ecopredict.windSpeed}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{windSpeed} м/с</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  step="0.5"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-400 mb-1">
                  <span>{t.ecopredict.furnaceLoad}</span>
                  <span className="font-mono text-emerald-400 font-semibold">{furnaceLoad}%</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="120"
                  value={furnaceLoad}
                  onChange={(e) => setFurnaceLoad(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Industrial Sensors Roster Cards */}
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 shadow-sm flex flex-col">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Gauge className="h-4 w-4 text-emerald-400" />
              <span>{t.ecopredict.sensorRoster}</span>
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {sensors.length} поста
            </span>
          </div>

          <div className="space-y-2.5 flex-1 overflow-y-auto no-scrollbar">
            {sensors.map((sensor) => {
              const isOver = sensor.currentValue >= sensor.thresholdCritical;
              const isWarn = sensor.currentValue >= sensor.thresholdWarning;
              const percentOfCrit = Math.min(100, Math.round((sensor.currentValue / sensor.thresholdCritical) * 100));

              return (
                <div
                  key={sensor.id}
                  className="rounded-lg p-3 border border-slate-800 bg-slate-950/60 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-xs text-white truncate max-w-[180px]">
                      {sensor.name}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOver ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-rose-950 border border-rose-800 text-rose-300 font-bold">
                          {t.common.statusCritical}
                        </span>
                      ) : isWarn ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 border border-amber-800 text-amber-300 font-semibold">
                          {t.common.statusWarning}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 border border-emerald-800 text-emerald-300">
                          {t.common.statusNormal}
                        </span>
                      )}
                      {!isWorker && onDeleteSensor && (
                        <button
                          type="button"
                          onClick={() => onDeleteSensor(sensor.id)}
                          className="p-1 rounded bg-slate-900 border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-500/50 transition-colors cursor-pointer"
                          title={language === 'kz' ? 'Датчикті өшіру' : 'Удалить датчик'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-400 mb-2">
                    <span className="truncate">{sensor.area}</span>
                    <div className="flex items-center gap-1 font-mono text-[10px]">
                      {sensor.connectionMethod && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/70 text-emerald-300 uppercase">
                          {sensor.connectionMethod}
                        </span>
                      )}
                      {sensor.ipAddress && (
                        <span className="text-slate-500 truncate max-w-[120px]">{sensor.ipAddress}</span>
                      )}
                    </div>
                  </div>

                  {/* Meter Value & Progress */}
                  <div className="flex items-baseline justify-between font-mono mb-1.5">
                    <span className="text-base font-bold text-white tabular-nums">
                      {sensor.currentValue} <span className="text-xs font-normal text-slate-400">{sensor.unit}</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      ПДК: {sensor.thresholdCritical} {sensor.unit}
                    </span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        isOver ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${percentOfCrit}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {/* Deviations & Warning Events Log */}
      {!isWorker && (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>{t.ecopredict.historyTableTitle}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Мониторинг отклонений экологических показателей от утвержденных нормативов Республики Казахстан.
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
                      ? 'bg-emerald-500/20 text-emerald-300 font-semibold'
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
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
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
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
            >
              <option value="all">{t.common.allStatuses}</option>
              <option value="normal">{t.common.statusNormal}</option>
              <option value="warning">{t.common.statusWarning}</option>
              <option value="critical">{t.common.statusCritical}</option>
            </select>
          </div>
        </div>

        {/* Readings Table */}
        {filteredReadings.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <div className="text-xs font-semibold text-slate-300">{t.common.noData}</div>
            <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
              В данном временном срезе все показатели находятся строго в пределах санитарных норм.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                <tr>
                  <th className="py-2.5 px-3">{t.common.time}</th>
                  <th className="py-2.5 px-3">{t.ecopredict.indicator}</th>
                  <th className="py-2.5 px-3">{t.common.zone}</th>
                  <th className="py-2.5 px-3 text-right">{t.ecopredict.currentReading}</th>
                  <th className="py-2.5 px-3 text-right">{t.common.threshold}</th>
                  <th className="py-2.5 px-3">{t.ecopredict.emissionRisk}</th>
                  <th className="py-2.5 px-3">Рекомендация эко-инженера</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredReadings.map((r) => {
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-300 whitespace-nowrap">
                        {new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-semibold text-white">{r.indicator}</div>
                        {r.predictedPeakTime && (
                          <div className="text-[10px] text-amber-400 font-mono mt-0.5">
                            Прогноз пика: {r.predictedPeakTime}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-300">
                        {r.area}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-white tabular-nums">
                        <span className={r.status === 'critical' ? 'text-rose-400' : r.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}>
                          {r.value}
                        </span>{' '}
                        <span className="text-[10px] font-normal text-slate-500">{r.unit}</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-400 tabular-nums">
                        {r.threshold} {r.unit}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        {r.status === 'critical' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-400"></span>
                            Превышение ПДК
                          </span>
                        )}
                        {r.status === 'warning' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400">
                            <AlertTriangle className="h-3 w-3 text-amber-400" />
                            Зона риска
                          </span>
                        )}
                        {r.status === 'normal' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                            Норма
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-300 text-[11px]">
                        {r.mitigationAction || 'Продолжать непрерывный мониторинг'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
};
