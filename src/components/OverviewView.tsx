import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Language } from '../types';
import { translations } from '../i18n/translations';
import {
  ShieldCheck,
  Leaf,
  Activity,
  ArrowRight,
  Building2,
  MapPin,
  Camera,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Layers,
  Wifi,
  QrCode,
  Lock,
  User,
  Briefcase,
} from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';
import heroIndustrialPlantImg from '../assets/images/hero_industrial_plant_1792688516649.jpg';

interface OverviewViewProps {
  onNavigate: (tab: string) => void;
  language: Language;
  camerasCount: number;
  sensorsCount: number;
  machinesCount: number;
  isHardwareConnected: boolean;
  onOpenConnectHardware?: () => void;
  onResetToZero?: () => void;
  isWorker?: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  onNavigate,
  language,
  camerasCount,
  sensorsCount,
  machinesCount,
  isHardwareConnected,
  onOpenConnectHardware,
  onResetToZero,
  isWorker = false,
}) => {
  const { currentUser, profile, isAdmin, isSpecialist } = useAuth();
  const t = translations[language];
  const isEmployee = Boolean(profile?.employeeRole || profile?.employeeId);
  const camerasStatusText =
    camerasCount > 0
      ? language === 'kz'
        ? `Камералар қосылған (${camerasCount} дана)`
        : `Камеры подключены (${camerasCount} шт.)`
      : isHardwareConnected
      ? language === 'kz'
        ? `Жабдық қосылған (0 камера · ${sensorsCount + machinesCount} құрылғы)`
        : `Оборудование подключено (0 камер · устр: ${sensorsCount + machinesCount})`
      : language === 'kz'
      ? 'Камералар қосылмаған (0 камера)'
      : 'Камеры не подключены (0 камер)';

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Organization & Employee Registration Passport (visible when signed in) */}
      {currentUser && profile && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-cyan-300">
                <Building2 className="h-4 w-4 text-cyan-400 shrink-0" />
                <span>
                  {isEmployee
                    ? language === 'kz'
                      ? 'Қызметкер тіркелген ұйым'
                      : 'Организация регистрации сотрудника'
                    : language === 'kz'
                    ? 'Тіркелген кәсіпорын'
                    : 'Зарегистрированная организация'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {profile.factoryName || (language === 'kz' ? 'Өндірістік кешен' : 'Производственный комплекс')}
                </h2>
                {isWorker ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs font-semibold text-rose-300">
                    <Lock className="h-3.5 w-3.5 text-rose-400" />
                    <span>{language === 'kz' ? 'Қолжетімділік жабық · Қарапайым қызметкер' : 'Доступ закрыт · Обычный сотрудник'}</span>
                  </span>
                ) : isSpecialist ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{language === 'kz' ? 'Маман · Толық қолжетімділік' : 'Специалист · Полный доступ'}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/40 text-xs font-semibold text-cyan-300">
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />
                    <span>
                      {isAdmin
                        ? language === 'kz'
                          ? 'Жүйе әкімшісі'
                          : 'Администратор системы'
                        : language === 'kz'
                        ? 'Кәсіпорын басшысы'
                        : 'Руководитель предприятия'}
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Live Camera & Hardware Status Pill */}
            <div
              className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold self-start lg:self-center ${
                camerasCount > 0 || isHardwareConnected
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
              }`}
            >
              <Camera className={`h-4 w-4 shrink-0 ${camerasCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div className="tabular-nums">
                <div>{camerasStatusText}</div>
                <div className="text-[11px] font-normal text-slate-300">
                  {language === 'kz'
                    ? `Датчиктер: ${sensorsCount} · Агрегаттар: ${machinesCount}`
                    : `Эко-датчики: ${sensorsCount} · Агрегаты: ${machinesCount}`}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
              <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                <User className="h-3.5 w-3.5 text-cyan-400" />
                <span>{language === 'kz' ? 'Қызметкер / Өкіл' : 'Сотрудник / Представитель'}</span>
              </div>
              <div className="font-semibold text-white truncate">
                {profile.contactPerson || profile.displayName || profile.email}
              </div>
              <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{profile.email}</div>
            </div>

            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
              <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                <Briefcase className="h-3.5 w-3.5 text-cyan-400" />
                <span>{language === 'kz' ? 'Мамандығы және цех' : 'Специальность и цех'}</span>
              </div>
              <div className="font-semibold text-white truncate">
                {profile.specialty || (isAdmin ? 'Главный администратор' : 'Управление предприятием')}
              </div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {profile.department || profile.industrySector || 'Основное производство'}
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
              <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                <MapPin className="h-3.5 w-3.5 text-emerald-400" />
                <span>{language === 'kz' ? 'Аймақ және сала' : 'Регион и отрасль'}</span>
              </div>
              <div className="font-semibold text-white truncate">{profile.region || 'г. Тараз'}</div>
              <div className="text-[11px] text-slate-400 truncate mt-0.5">
                {profile.industrySector || 'Промышленное предприятие'}
              </div>
            </div>

            <div className="rounded-lg bg-slate-950/70 border border-slate-800/80 px-3 py-2.5">
              <div className="text-slate-400 flex items-center gap-1.5 mb-1">
                <Camera className="h-3.5 w-3.5 text-emerald-400" />
                <span>{language === 'kz' ? 'Бейнебақылау және телеметрия' : 'Камеры и телеметрия'}</span>
              </div>
              <div className={`font-semibold tabular-nums ${camerasCount > 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {camerasCount > 0
                  ? language === 'kz'
                    ? `Камералар қосылған: ${camerasCount}`
                    : `Камеры подключены: ${camerasCount}`
                  : language === 'kz'
                  ? 'Камералар қосылмаған: 0'
                  : 'Камеры не подключены: 0'}
              </div>
              <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                {language === 'kz'
                  ? `Барлық құрылғы: ${camerasCount + sensorsCount + machinesCount}`
                  : `Всего устройств: ${camerasCount + sensorsCount + machinesCount}`}
              </div>
            </div>
          </div>

          {isWorker && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 px-4 py-3 flex items-start sm:items-center gap-3 text-xs text-rose-200">
              <Lock className="h-4 w-4 text-rose-400 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="font-bold text-rose-300">
                  {language === 'kz' ? 'Қолжетімділік жабық: ' : 'Доступ закрыт: '}
                </span>
                <span>
                  {language === 'kz'
                    ? 'қарапайым қызметкер үшін камераларды қосу, жабдықты басқару, ұйым баптаулары, EcoPredict, FailPredict және актілер жабық. Тек ұйым туралы мәліметтер мен жеке ЖҚҚ бұзушылық журналы қолжетімді.'
                    : 'для обычного сотрудника управление камерами, подключение оборудования, настройки организации, модули EcoPredict/FailPredict и формирование актов закрыты. Доступны сведения о вашей организации и журнал ваших нарушений СИЗ.'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Hero Section with Industrial Digital Twin Banner */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-xl">
        <div className="relative aspect-[21/9] sm:aspect-[24/8] min-h-[300px] w-full overflow-hidden">
          <img
            src={heroIndustrialPlantImg}
            alt="NeuroFactory Plant Digital Twin"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
          
          {/* Cybernetic laser scanline */}
          <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-40 animate-scanline pointer-events-none" />

          {/* Hero Content */}
          <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-8 lg:p-10">
            <div className="max-w-3xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-md bg-cyan-950/80 border border-cyan-800/80 px-2.5 py-1 text-xs font-mono font-semibold text-cyan-300">
                <CompanyLogo size="xs" withText={false} glow={true} />
                <span>NeuroFactory Enterprise AI Platform</span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                {t.overview.heroTitle}
              </h1>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {t.overview.heroSubtitle}
              </p>

              {/* Plant info bar */}
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-2 text-xs sm:text-sm text-slate-300 font-mono">
                <div className="flex items-center gap-1.5 text-white font-bold">
                  <Building2 className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>{profile?.factoryName || 'Производственный комплекс'}</span>
                </div>
                <span className="text-slate-600">·</span>
                <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                  <MapPin className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{profile?.region || 'г. Тараз'}</span>
                </div>
                <span className="text-slate-600">·</span>
                <div className={`flex items-center gap-2 ${camerasCount > 0 || isHardwareConnected ? 'text-emerald-400' : 'text-amber-400 font-semibold'}`}>
                  <span className={`h-2 w-2 rounded-full ${camerasCount > 0 || isHardwareConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                  <span>{camerasStatusText}</span>
                </div>
                {isHardwareConnected && onResetToZero && !isWorker && (
                  <button
                    onClick={onResetToZero}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800/90 hover:bg-rose-950/50 border border-slate-700 hover:border-rose-500/50 text-[11px] font-mono text-slate-300 hover:text-rose-300 transition-colors cursor-pointer"
                    title={language === 'kz' ? 'Нөлдік күйге қайтару (Әзірге ештеңе қосылмаған)' : 'Сбросить до 0 устройств (Пока ничего не подключено)'}
                  >
                    <span>{language === 'kz' ? 'Тазарту (0 жабдық)' : 'Сбросить до 0 (Очистить)'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column KPI strip (Dynamic Zero State for new accounts) */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-800 border-t border-slate-800 bg-slate-950/80 p-4 sm:p-6 text-xs">
          <div className="p-3 space-y-1">
            <div className="text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>{t.overview.kpiSafety}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
              {camerasCount > 0 ? '96.4%' : '0%'}
            </div>
            <div className="text-[10px] text-slate-400">
              {camerasCount > 0 ? 'Каски, жилеты, очки в норме' : t.emptyStates.camerasNotConnected}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="text-slate-400 flex items-center gap-1.5">
              <Leaf className="h-4 w-4 text-emerald-400" />
              <span>{t.overview.kpiEco}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-300 tabular-nums">
              {sensorsCount > 0 ? '91.2%' : '0 станций'}
            </div>
            <div className="text-[10px] text-slate-400">
              {sensorsCount > 0 ? 'Концентрации в рамках ПДК РК' : t.emptyStates.sensorsNotConnected}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="text-slate-400 flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-amber-400" />
              <span>{t.overview.kpiEquipment}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {machinesCount > 0 ? '86.2%' : '0 ед.'}
            </div>
            <div className="text-[10px] text-slate-400">
              {machinesCount > 0 ? '1 агрегат требует ТО подшипника' : t.emptyStates.machinesNotConnected}
            </div>
          </div>

          <div className="p-3 space-y-1">
            <div className="text-slate-400 flex items-center gap-1.5">
              <Camera className="h-4 w-4 text-cyan-400" />
              <span>{t.overview.kpiActiveCams}</span>
            </div>
            <div className="text-2xl font-bold font-mono text-white tabular-nums">
              {camerasCount > 0 ? `${camerasCount} / ${camerasCount}` : '0 / 0'}
            </div>
            <div className="text-[10px] text-slate-400">
              {camerasCount > 0 ? '25-30 FPS инференс YOLOv11' : t.emptyStates.noActiveCameras}
            </div>
          </div>
        </div>
      </div>

      {/* New Account Alert & Telemetry Connection Banner */}
      {!isHardwareConnected && (
        <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/30 via-slate-900 to-amber-950/20 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg animate-in fade-in duration-300">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                {language === 'kz' ? 'Жаңа аккаунт күйі' : 'Статус нового аккаунта'}
              </div>
              <h3 className="text-base font-bold text-white">
                {t.emptyStates.notConnectedNotice}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                {t.emptyStates.notConnectedNoticeDesc}
              </p>
            </div>
          </div>

          {!isWorker && onOpenConnectHardware ? (
            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
              <button
                type="button"
                onClick={onOpenConnectHardware}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white transition-all shadow-md hover:shadow-cyan-500/20 cursor-pointer"
              >
                <Wifi className="h-4 w-4" />
                <QrCode className="h-4 w-4" />
                <span>
                  {language === 'kz'
                    ? 'Жабдықты қосу (IP / QR)'
                    : 'Подключить оборудование (IP / QR)'}
                </span>
              </button>
            </div>
          ) : isWorker ? (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-950/40 text-xs font-semibold text-rose-300 shrink-0 self-start sm:self-center">
              <Lock className="h-4 w-4 text-rose-400" />
              <span>{language === 'kz' ? 'Қолжетімділік жабық' : 'Доступ закрыт'}</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Three Core Modules Showcase */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white tracking-tight">
            Производственные ИИ-модули предприятия
          </h2>
          <p className="text-xs text-slate-400">
            Выберите модуль для перехода к детализированной телеметрии, настройке порогов и журналу событий.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Module 1: SafeVision */}
          <div
            onClick={() => onNavigate('safevision')}
            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/90 p-6 shadow-sm hover:border-cyan-500/60 hover:bg-slate-850 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(6,182,212,0.18)] transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 group-hover:border-cyan-400 group-hover:scale-110 transition-all">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-mono text-cyan-400 font-semibold">
                  SafeVision
                </span>
              </div>

              <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                {t.safevision.title.split('—')[0]}
              </h3>

              <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                {t.safevision.taskDescription}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>{language === 'kz' ? 'Камералар мәртебесі:' : 'Статус камер:'}</span>
                  <span className={`font-mono font-semibold tabular-nums ${camerasCount > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {camerasCount > 0
                      ? language === 'kz'
                        ? `Қосылған (${camerasCount})`
                        : `Подключены (${camerasCount})`
                      : language === 'kz'
                      ? 'Қосылмаған (0)'
                      : 'Не подключены (0)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Опасные зоны кранов:</span>
                  <span className="font-mono text-cyan-400 font-semibold">
                    {isWorker ? (language === 'kz' ? 'Тек жеке журнал' : 'Только личный журнал') : '100% покрытие'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
                <span>{t.overview.openModule}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
              {isWorker && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                  <Lock className="h-3 w-3" />
                  <span>{language === 'kz' ? 'Басқару жабық' : 'Управление закрыто'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Module 2: EcoPredict */}
          <div
            onClick={() => onNavigate('ecopredict')}
            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/90 p-6 shadow-sm hover:border-emerald-500/60 hover:bg-slate-850 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(16,185,129,0.18)] transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 group-hover:border-emerald-400 group-hover:scale-110 transition-all">
                  <Leaf className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                  EcoPredict
                </span>
              </div>

              <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors">
                {t.ecopredict.title.split('—')[0]}
              </h3>

              <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                {t.ecopredict.taskDescription}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>Газоанализ SO₂, CO, NO₂:</span>
                  <span className="font-mono text-emerald-400 font-semibold">ПДК РК</span>
                </div>
                <div className="flex justify-between">
                  <span>Прогноз залповых рисков:</span>
                  <span className="font-mono text-cyan-400 font-semibold">LSTM 24ч</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 group-hover:gap-2.5 transition-all">
                <span>{t.overview.openModule}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
              {isWorker && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-[11px] font-semibold text-rose-300">
                  <Lock className="h-3 w-3 text-rose-400" />
                  <span>{language === 'kz' ? 'Қолжетімділік жабық' : 'Доступ закрыт'}</span>
                </span>
              )}
            </div>
          </div>

          {/* Module 3: FailPredict */}
          <div
            onClick={() => onNavigate('failpredict')}
            className="group cursor-pointer rounded-xl border border-slate-800 bg-slate-900/90 p-6 shadow-sm hover:border-amber-500/60 hover:bg-slate-850 hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(245,158,11,0.18)] transition-all duration-300 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 group-hover:border-amber-400 transition-colors">
                  <Activity className="h-5 w-5" />
                </div>
                <span className="text-[11px] font-mono text-amber-400 font-semibold">
                  FailPredict
                </span>
              </div>

              <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition-colors">
                {t.failpredict.title.split('—')[0]}
              </h3>

              <p className="text-xs text-slate-400 mt-2 line-clamp-3 leading-relaxed">
                {t.failpredict.taskDescription}
              </p>

              <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>Стандарт вибродиагностики:</span>
                  <span className="font-mono text-cyan-400 font-semibold">ISO 10816-3</span>
                </div>
                <div className="flex justify-between">
                  <span>Расчет ресурса RUL:</span>
                  <span className="font-mono text-amber-400 font-semibold">Подшипники</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400 group-hover:gap-2.5 transition-all">
                <span>{t.overview.openModule}</span>
                <ArrowRight className="h-4 w-4" />
              </div>
              {isWorker && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-950/60 border border-rose-500/40 text-[11px] font-semibold text-rose-300">
                  <Lock className="h-3 w-3 text-rose-400" />
                  <span>{language === 'kz' ? 'Қолжетімділік жабық' : 'Доступ закрыт'}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
