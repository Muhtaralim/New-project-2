import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Language,
  PPEViolation,
  ViolationNotification,
  EmployeeRoleType,
  FactoryEmployee,
} from '../types';
import { translations } from '../i18n/translations';
import {
  X,
  Building2,
  MapPin,
  Briefcase,
  User,
  Phone,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Database,
  LogOut,
  ShieldAlert,
  LifeBuoy,
  Users,
  UserPlus,
  Copy,
  Check,
  KeyRound,
  Bell,
  Trash2,
  Lock,
} from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
  onOpenAdminProfile?: () => void;
  onOpenSupport?: () => void;
  violations?: PPEViolation[];
  notifications?: ViolationNotification[];
  onMarkNotificationRead?: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onResetToZero?: () => void;
  camerasCount?: number;
  sensorsCount?: number;
  machinesCount?: number;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  language,
  onOpenAdminProfile,
  onOpenSupport,
  violations = [],
  notifications = [],
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  camerasCount = 0,
}) => {
  const {
    currentUser,
    profile,
    saveFactoryProfile,
    resendVerificationEmail,
    logout,
    isAdmin,
    isWorker,
    isSpecialist,
    employees,
    addEmployee,
    removeEmployee,
    isLoading,
  } = useAuth();

  const t = translations[language];
  const [activeTab, setActiveTab] = useState<'profile' | 'employees' | 'violations'>('profile');

  // Factory fields
  const [factoryName, setFactoryName] = useState('');
  const [region, setRegion] = useState('');
  const [customCity, setCustomCity] = useState('');
  const [isCustomCity, setIsCustomCity] = useState(false);
  const [industrySector, setIndustrySector] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Employee registration form
  const [empFullName, setEmpFullName] = useState('');
  const [empSpecialty, setEmpSpecialty] = useState('');
  const [empRoleType, setEmpRoleType] = useState<EmployeeRoleType>('worker');
  const [empDepartment, setEmpDepartment] = useState('');
  const [isCreatingEmp, setIsCreatingEmp] = useState(false);
  const [newlyCreatedEmp, setNewlyCreatedEmp] = useState<FactoryEmployee | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFactoryName(profile.factoryName || 'Производственный комплекс');
      const currentRegion = profile.region || 'г. Тараз';
      setRegion(currentRegion);
      if (!t.regions.includes(currentRegion)) {
        setIsCustomCity(true);
        setCustomCity(currentRegion);
      }
      setIndustrySector(profile.industrySector || t.industries[0]);
      setContactPerson(profile.contactPerson || '');
      setContactPhone(profile.contactPhone || '');
    }
  }, [profile, t.regions, t.industries]);

  useEffect(() => {
    if (isOpen && isWorker) {
      setActiveTab('violations');
    } else if (isOpen) {
      setActiveTab('profile');
    }
  }, [isOpen, isWorker]);

  if (!isOpen || !currentUser) return null;

  const copyValue = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      onClose();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error logging out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWorker) return;
    setSaveError(null);
    setIsSaved(false);

    const effectiveRegion =
      isCustomCity && customCity.trim() ? customCity.trim() : region || 'г. Тараз';
    const effectiveFactory = factoryName.trim() || 'Производственный комплекс';

    try {
      await saveFactoryProfile({
        factoryName: effectiveFactory,
        region: effectiveRegion,
        industrySector,
        contactPerson,
        contactPhone,
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 3500);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Error updating profile');
    }
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empFullName.trim() || !empSpecialty.trim() || !empDepartment.trim() || isWorker) return;
    setIsCreatingEmp(true);
    setSaveError(null);
    try {
      const created = await addEmployee({
        fullName: empFullName.trim(),
        specialty: empSpecialty.trim(),
        roleType: empRoleType,
        department: empDepartment.trim(),
      });
      setNewlyCreatedEmp(created);
      setEmpFullName('');
      setEmpSpecialty('');
      setEmpDepartment('');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Ошибка при регистрации сотрудника');
    } finally {
      setIsCreatingEmp(false);
    }
  };

  const myViolations = isWorker
    ? violations.filter(
        (v) =>
          v.employeeId === profile?.employeeId ||
          (profile?.contactPerson &&
            v.employeeName?.toLowerCase() === profile.contactPerson.toLowerCase())
      )
    : violations;

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-3xl my-auto max-h-[92dvh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          aria-label={t.common.close}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="overflow-y-auto p-5 sm:p-6 no-scrollbar space-y-5">
          {/* Modal Header */}
          <div>
            <div className="mb-3">
              <CompanyLogo size="md" withText={true} glow={true} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5 text-cyan-400 font-mono text-xs uppercase tracking-wider font-semibold">
              <Building2 className="h-4 w-4" />
              <span>
                {language === 'kz'
                  ? `Кәсіпорынның жеке кабинеті · ${profile?.factoryName || 'Зауыт'}`
                  : `Личный кабинет предприятия · ${profile?.factoryName || 'Завод'}`}
              </span>
              {isWorker && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px]">
                  <Lock className="h-3 w-3" />
                  <span>{language === 'kz' ? 'Қолжетімділік жабық · Қарапайым қызметкер' : 'Доступ закрыт · Обычный рабочий'}</span>
                </span>
              )}
              {isSpecialist && (
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px]">
                  {language === 'kz' ? 'Маман · Толық қолжетімділік' : 'Специалист · Полный доступ + Уведомления'}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              {profile?.factoryName || t.auth.factoryName}
            </h2>
          </div>

          {/* User Account / Session Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shrink-0">
                <User className="h-4 w-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">
                    {profile?.contactPerson || currentUser.email || 'Представитель предприятия'}
                  </span>
                  {profile?.specialty && (
                    <span className="text-[11px] font-mono text-cyan-300">
                      · {profile.specialty}
                      {profile?.department ? ` (${profile.department})` : ''}
                    </span>
                  )}
                  {profile?.emailVerified && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-mono">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.auth.verified}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Email: {currentUser.email}</span>
                  {profile?.autoPassword && (
                    <span className="text-amber-300">· Пароль: {profile.autoPassword}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenSupport && !isWorker && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSupport();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200 hover:text-cyan-300 hover:border-cyan-500/50 transition-colors"
                >
                  <LifeBuoy className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Техподдержка</span>
                </button>
              )}

              {isAdmin && onOpenAdminProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAdminProfile();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400 transition-colors"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                  <span>{t.nav.adminBadge}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoading || isLoggingOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-900/50 bg-rose-950/30 text-xs font-semibold text-rose-300 hover:bg-rose-900/60 hover:text-white transition-colors"
              >
                {isLoggingOut ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-rose-400" />
                ) : (
                  <LogOut className="h-3.5 w-3.5 text-rose-400" />
                )}
                <span>{t.auth.logout}</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 text-xs font-semibold overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              className={`px-4 py-2.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === 'profile'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Building2 className="h-4 w-4" />
              <span>{language === 'kz' ? 'Зауыт профилі' : 'Профиль завода'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('employees')}
              className={`px-4 py-2.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === 'employees'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>
                {language === 'kz' ? 'Қызметкерлер және рұқсат' : 'Сотрудники и доступ'}
              </span>
              {isWorker ? (
                <Lock className="h-3.5 w-3.5 text-rose-400" />
              ) : (
                <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] font-mono text-slate-300">
                  {employees.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('violations')}
              className={`px-4 py-2.5 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === 'violations'
                  ? 'border-cyan-400 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Bell className="h-4 w-4" />
              <span>
                {isWorker
                  ? language === 'kz'
                    ? 'Менің бұзушылықтарым'
                    : 'Мои нарушения'
                  : language === 'kz'
                  ? 'Бұзушылық хабарламалары'
                  : 'Нарушения и уведомления'}
              </span>
              {!isWorker && unreadNotifCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-[10px] font-mono text-white font-bold">
                  {unreadNotifCount}
                </span>
              )}
              {isWorker && myViolations.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-[10px] font-mono text-white font-bold">
                  {myViolations.length}
                </span>
              )}
            </button>
          </div>

          {saveError && (
            <div className="rounded-lg bg-rose-950/60 border border-rose-800 p-3 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{saveError}</span>
            </div>
          )}

          {/* TAB 1: FACTORY PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {profile?.autoPassword && (
                <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 space-y-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-cyan-300">
                    <KeyRound className="h-4 w-4" />
                    <span>
                      {language === 'kz'
                        ? 'Сіздің автоматты түрде берілген кіру деректеріңіз'
                        : 'Ваши учетные данные сотрудника (видны для входа)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="truncate text-slate-200">Email: {profile.email}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(profile.email, 'self-email')}
                        className="text-cyan-400 hover:text-white ml-2"
                      >
                        {copiedKey === 'self-email' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-950 p-2 rounded border border-slate-800">
                      <span className="truncate text-amber-300">Пароль: {profile.autoPassword}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(profile.autoPassword || '', 'self-pass')}
                        className="text-cyan-400 hover:text-white ml-2"
                      >
                        {copiedKey === 'self-pass' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!profile?.emailVerified && !isWorker && (
                <div className="flex items-center justify-between rounded-lg bg-amber-950/40 border border-amber-800/80 p-3 text-xs text-amber-200">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>{t.auth.unverified} ({currentUser.email})</span>
                  </div>
                  <button
                    type="button"
                    onClick={resendVerificationEmail}
                    disabled={isLoading}
                    className="text-xs text-amber-300 hover:text-white underline font-medium ml-2 shrink-0"
                  >
                    {t.auth.resendVerification}
                  </button>
                </div>
              )}

              {isSaved && (
                <div className="rounded-lg bg-emerald-950/60 border border-emerald-800 p-3 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{t.auth.savedSuccess}</span>
                </div>
              )}

              {/* Employee Organization & Registration Summary Card */}
              {(profile?.employeeRole || profile?.employeeId) && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-white flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-cyan-400" />
                      <span>
                        {language === 'kz' ? 'Тіркелген ұйым мәліметтері' : 'Сведения о регистрации в организации'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                      camerasCount > 0 || profile?.hasConnectedHardware
                        ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300'
                        : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
                    }`}>
                      {camerasCount > 0
                        ? language === 'kz'
                          ? `Камералар қосылған (${camerasCount})`
                          : `Камеры подключены (${camerasCount} шт.)`
                        : profile?.hasConnectedHardware
                        ? language === 'kz'
                          ? 'Жабдық қосылған'
                          : 'Оборудование подключено'
                        : language === 'kz'
                        ? 'Камералар қосылмаған (0)'
                        : 'Камеры не подключены (0)'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                    <div>
                      <span className="text-slate-400">{language === 'kz' ? 'Ұйым: ' : 'Организация: '}</span>
                      <span className="font-semibold text-white">{profile.factoryName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">{language === 'kz' ? 'Аймақ: ' : 'Регион: '}</span>
                      <span className="font-semibold text-white">{profile.region}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">{language === 'kz' ? 'Сала: ' : 'Отрасль: '}</span>
                      <span className="text-slate-200">{profile.industrySector || 'Промышленное предприятие'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">{language === 'kz' ? 'Цех / Мамандық: ' : 'Цех и специальность: '}</span>
                      <span className="text-cyan-300">
                        {profile.specialty || 'Сотрудник'}{profile.department ? ` · ${profile.department}` : ''}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {isWorker && (
                <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-3.5 text-xs text-rose-200 flex items-start gap-2.5">
                  <Lock className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-rose-300">
                      {language === 'kz' ? 'Қолжетімділік жабық: ' : 'Доступ закрыт: '}
                    </span>
                    <span>
                      {language === 'kz'
                        ? '«Қарапайым қызметкер» деңгейінде зауыт профилін өзгерту, жабдықты қосу/өшіру және қызметкерлер тізімін басқару жабық. Тек ұйым деректері мен жеке бұзушылықтарыңызды көруге болады.'
                        : 'уровень «Обычный рабочий» — редактирование профиля организации, подключение/сброс оборудования и управление персоналом закрыты. Доступен просмотр сведений об организации и список ваших нарушений.'}
                    </span>
                  </div>
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.factoryName} *
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        required
                        disabled={isWorker}
                        value={factoryName}
                        onChange={(e) => setFactoryName(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-300">
                        {language === 'kz' ? 'Қала / Аймақ *' : 'Город / Регион *'}
                      </label>
                      {!isWorker && (
                        <button
                          type="button"
                          onClick={() => setIsCustomCity(!isCustomCity)}
                          className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          {isCustomCity ? 'Из списка' : '+ Другой'}
                        </button>
                      )}
                    </div>

                    {!isCustomCity ? (
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-emerald-400" />
                        <select
                          disabled={isWorker}
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                        >
                          {t.regions.map((reg) => (
                            <option key={reg} value={reg}>
                              {reg}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="relative">
                        <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-emerald-400" />
                        <input
                          type="text"
                          disabled={isWorker}
                          value={customCity}
                          onChange={(e) => setCustomCity(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.industrySector}
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <select
                        disabled={isWorker}
                        value={industrySector}
                        onChange={(e) => setIndustrySector(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                      >
                        {t.industries.map((ind) => (
                          <option key={ind} value={ind}>
                            {ind}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.contactPerson}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        disabled={isWorker}
                        value={contactPerson}
                        onChange={(e) => setContactPerson(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      {t.auth.contactPhone}
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                      <input
                        type="text"
                        disabled={isWorker}
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2 text-xs text-white disabled:opacity-60 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {!isWorker && (
                  <div className="pt-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-950 text-xs font-medium text-slate-300 hover:bg-slate-800"
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg bg-cyan-600 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
                    >
                      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span>{t.auth.saveProfile}</span>
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}

          {/* TAB 2: EMPLOYEES & AUTO CREDENTIALS */}
          {activeTab === 'employees' && (
            isWorker ? (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-8 text-center flex flex-col items-center justify-center space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-400">
                  <Lock className="h-6 w-6" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {language === 'kz' ? 'Қолжетімділік жабық' : 'Доступ закрыт'}
                </h3>
                <p className="text-xs text-slate-300 max-w-md leading-relaxed">
                  {language === 'kz'
                    ? 'Қызметкерлер тізімі, кіру деректері және рұқсат деңгейлерін басқару тек мамандар мен кәсіпорын басшылығына ашық.'
                    : 'Реестр сотрудников, учетные данные персонала и управление правами доступа закрыты для обычного сотрудника. Перейдите во вкладку «Мои нарушения» или «Профиль завода».'}
                </p>
              </div>
            ) : (
            <div className="space-y-5 text-xs">
              {!isWorker && (
                <form
                  onSubmit={handleCreateEmployee}
                  className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 font-bold text-cyan-300 text-sm">
                    <UserPlus className="h-4 w-4" />
                    <span>
                      {language === 'kz'
                        ? 'Мамандығы бойынша қызметкер қосу (Email және құпия сөз автоматты түрде беріледі)'
                        : 'Добавить сотрудника по специальности (Email и пароль выдаются автоматически)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">ФИО сотрудника *</label>
                      <input
                        type="text"
                        required
                        value={empFullName}
                        onChange={(e) => setEmpFullName(e.target.value)}
                        placeholder="Ерлан Сериков"
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        {language === 'kz' ? 'Мамандығы *' : 'Специальность *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={empSpecialty}
                        onChange={(e) => setEmpSpecialty(e.target.value)}
                        placeholder={language === 'kz' ? 'Мамандығын енгізіңіз' : 'Введите специальность'}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">Уровень доступа и права *</label>
                      <select
                        value={empRoleType}
                        onChange={(e) => setEmpRoleType(e.target.value as EmployeeRoleType)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                      >
                        <option value="worker">
                          Обычный рабочий (нет прав — только журнал своих нарушений)
                        </option>
                        <option value="specialist">
                          Специалист (полный доступ ко всем + уведомления о нарушениях)
                        </option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        {language === 'kz' ? 'Цех / Учаске *' : 'Цех / Участок *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={empDepartment}
                        onChange={(e) => setEmpDepartment(e.target.value)}
                        placeholder={language === 'kz' ? 'Мыс: №1 цех (Конвертерлік)' : 'Напр. Цех №1 (Конвертерный)'}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isCreatingEmp}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors disabled:opacity-50"
                    >
                      {isCreatingEmp ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      <span>Зарегистрировать сотрудника</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Newly Created Credentials Highlight Card */}
              {newlyCreatedEmp && (
                <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-4 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-emerald-300">
                      <KeyRound className="h-4 w-4" />
                      <span>
                        Сотрудник «{newlyCreatedEmp.fullName}» зарегистрирован! Данные для входа:
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewlyCreatedEmp(null)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono">
                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-emerald-500/30">
                      <span className="text-white truncate">Email: {newlyCreatedEmp.email}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(newlyCreatedEmp.email, 'new-email')}
                        className="text-cyan-400 hover:text-white ml-2"
                      >
                        {copiedKey === 'new-email' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded border border-emerald-500/30">
                      <span className="text-amber-300 truncate">Пароль: {newlyCreatedEmp.password}</span>
                      <button
                        type="button"
                        onClick={() => copyValue(newlyCreatedEmp.password, 'new-pass')}
                        className="text-cyan-400 hover:text-white ml-2"
                      >
                        {copiedKey === 'new-pass' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Registered Staff Roster (Visible to employees & managers) */}
              <div className="space-y-2.5">
                <div className="font-bold text-slate-300 uppercase tracking-wider text-[11px] font-mono">
                  Реестр сотрудников завода ({employees.length}) — Почта, пароль и нарушения видны всем
                </div>

                {employees.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-slate-400">
                    Сотрудники еще не добавлены. Зарегистрируйте рабочих или специалистов выше.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {employees.map((emp) => {
                      const empViolations = violations.filter(
                        (v) =>
                          v.employeeId === emp.id ||
                          v.employeeName?.toLowerCase() === emp.fullName.toLowerCase()
                      );
                      return (
                        <div
                          key={emp.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-white text-sm">{emp.fullName}</span>
                                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[10px]">
                                  {emp.specialty}
                                </span>
                                {emp.roleType === 'specialist' ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700/60 text-emerald-300 text-[10px] font-semibold">
                                    Специалист · Полный доступ + Уведомления
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-700/50 text-amber-300 text-[10px] font-semibold">
                                    Обычный рабочий · Нет прав
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                Участок: {emp.department || 'Основное производство'}
                              </div>
                            </div>

                            {!isWorker && (
                              <button
                                type="button"
                                onClick={() => removeEmployee(emp.id, emp.authUid)}
                                className="p-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 text-rose-400 hover:bg-rose-900/40 hover:text-white transition-colors"
                                title="Удалить сотрудника"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Visible Auto-Generated Credentials */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
                            <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
                              <span className="text-cyan-300 truncate">Email: {emp.email}</span>
                              <button
                                type="button"
                                onClick={() => copyValue(emp.email, `e-${emp.id}`)}
                                className="text-slate-400 hover:text-white ml-2 shrink-0"
                              >
                                {copiedKey === `e-${emp.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                            <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
                              <span className="text-amber-300 truncate">Пароль: {emp.password}</span>
                              <button
                                type="button"
                                onClick={() => copyValue(emp.password, `p-${emp.id}`)}
                                className="text-slate-400 hover:text-white ml-2 shrink-0"
                              >
                                {copiedKey === `p-${emp.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                              </button>
                            </div>
                          </div>

                          {/* Employee Personal Violations Summary */}
                          <div className="pt-2 border-t border-slate-800/70">
                            <div className="text-[11px] font-semibold text-slate-300 mb-1">
                              Зафиксированные нарушения сотрудника ({empViolations.length}):
                            </div>
                            {empViolations.length === 0 ? (
                              <div className="text-[11px] text-emerald-400">
                                Нарушений техники безопасности и СИЗ не зафиксировано
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {empViolations.slice(0, 3).map((v) => (
                                  <div
                                    key={v.id}
                                    className="flex items-center justify-between text-[11px] bg-rose-950/30 border border-rose-800/40 rounded px-2 py-1 text-rose-200"
                                  >
                                    <span>
                                      {v.violationType === 'no_helmet' && 'Без защитной каски'}
                                      {v.violationType === 'no_vest' && 'Без сигнального жилета'}
                                      {v.violationType === 'no_goggles' && 'Без защитных очков'}
                                      {v.violationType === 'hazard_zone_entry' && 'Вход в опасную зону'}
                                      {' · '}
                                      {v.area}
                                    </span>
                                    <span className="font-mono text-[10px] text-rose-300">
                                      {new Date(v.timestamp).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            )
          )}

          {/* TAB 3: VIOLATIONS & SPECIALIST NOTIFICATIONS */}
          {activeTab === 'violations' && (
            <div className="space-y-4 text-xs">
              {isWorker ? (
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-amber-200">
                    Ваши зафиксированные нарушения СИЗ и техники безопасности:
                  </div>
                  {myViolations.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-emerald-400">
                      У вас 0 нарушений. Соблюдайте правила СИЗ!
                    </div>
                  ) : (
                    myViolations.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-lg border border-rose-800/50 bg-rose-950/20 p-3 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-rose-300">
                            {v.violationType === 'no_helmet' && 'Отсутствие защитной каски'}
                            {v.violationType === 'no_vest' && 'Отсутствие сигнального жилета'}
                            {v.violationType === 'no_goggles' && 'Отсутствие защитных очков'}
                            {v.violationType === 'hazard_zone_entry' && 'Вход в опасную зону'}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {v.area} · {v.cameraName}
                          </div>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">
                          {new Date(v.timestamp).toLocaleString('ru-RU')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-slate-200 flex items-center gap-2">
                      <Bell className="h-4 w-4 text-amber-400" />
                      <span>Уведомления специалистам о нарушениях ({notifications.length})</span>
                    </div>
                    {unreadNotifCount > 0 && onMarkAllNotificationsRead && (
                      <button
                        type="button"
                        onClick={onMarkAllNotificationsRead}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold"
                      >
                        Отметить все прочитанными
                      </button>
                    )}
                  </div>

                  {notifications.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-slate-400">
                      Уведомлений о нарушениях пока нет. Когда камера зафиксирует нарушение, специалисты мгновенно получат сигнал.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => !n.read && onMarkNotificationRead?.(n.id)}
                          className={`rounded-lg border p-3 transition-colors cursor-pointer ${
                            n.read
                              ? 'border-slate-800 bg-slate-950/60 text-slate-400'
                              : 'border-rose-500/50 bg-rose-950/20 text-white'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold flex items-center gap-2">
                              {!n.read && <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />}
                              <span>{n.title}</span>
                            </span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(n.timestamp).toLocaleTimeString('ru-RU')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-300">{n.message}</div>
                          {(n.employeeName || n.area) && (
                            <div className="text-[10px] font-mono text-cyan-300 mt-1">
                              {n.employeeName ? `Сотрудник: ${n.employeeName}` : ''}
                              {n.employeeSpecialty ? ` (${n.employeeSpecialty})` : ''}
                              {n.area ? ` · ${n.area}` : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
