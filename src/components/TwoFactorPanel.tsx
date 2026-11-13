import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Copy,
  Check,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Language } from '../types';
import {
  generateTotpSecret,
  formatTotpSecretForDisplay,
  buildOtpAuthUri,
  verifyTotpCode,
  generateRecoveryCodes,
  getTotpRemainingSeconds,
} from '../utils/totp';

interface TwoFactorPanelProps {
  language: Language;
  compact?: boolean;
}

export const TwoFactorPanel: React.FC<TwoFactorPanelProps> = ({
  language,
  compact = false,
}) => {
  const {
    currentUser,
    profile,
    twoFactorEnabled,
    twoFactorConfig,
    enableTwoFactor,
    disableTwoFactor,
  } = useAuth();

  const isKz = language === 'kz';

  const [step, setStep] = useState<'idle' | 'setup' | 'recovery' | 'disable'>('idle');
  const [draftSecret, setDraftSecret] = useState<string>('');
  const [draftRecoveryCodes, setDraftRecoveryCodes] = useState<string[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [verifyCode, setVerifyCode] = useState<string>('');
  const [disableCode, setDisableCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(() => getTotpRemainingSeconds());

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft(getTotpRemainingSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const accountLabel = currentUser?.email || profile?.email || 'user@neurofactory.kz';

  const startSetup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const newSecret = generateTotpSecret();
    const newCodes = generateRecoveryCodes(6);
    const uri = buildOtpAuthUri({
      secret: newSecret,
      accountName: accountLabel,
      issuer: 'NeuroFactory AI',
    });

    try {
      const dataUrl = await QRCode.toDataURL(uri, {
        width: 200,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setQrDataUrl(dataUrl);
    } catch (err) {
      console.warn('QR render error:', err);
      setQrDataUrl('');
    }

    setDraftSecret(newSecret);
    setDraftRecoveryCodes(newCodes);
    setVerifyCode('');
    setStep('setup');
  };

  const handleCopy = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleConfirmSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const clean = verifyCode.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setErrorMsg(
        isKz
          ? 'Google Authenticator қосымшасынан 6 таңбалы сандық кодты енгізіңіз.'
          : 'Введите 6-значный цифровой код из приложения Google Authenticator.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await verifyTotpCode(draftSecret, clean, 1);
      if (!ok) {
        setErrorMsg(
          isKz
            ? 'Код сәйкес келмеді. Телефон уақыты синхрондалғанын тексеріп, жаңа кодты енгізіңіз.'
            : 'Код не совпал. Убедитесь, что отсканировали актуальный QR-код и на телефоне включена автосинхронизация времени.'
        );
        return;
      }

      await enableTwoFactor({
        secret: draftSecret,
        recoveryCodes: draftRecoveryCodes,
      });

      setStep('recovery');
      setVerifyCode('');
      setSuccessMsg(
        isKz
          ? 'Google Authenticator сәтті қосылды! Енді кіру кезінде 6 таңбалы код сұралады.'
          : 'Google Authenticator успешно подключен! Теперь при каждом входе будет запрашиваться 6-значный код.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка активации 2FA');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await disableTwoFactor(disableCode);
      setDisableCode('');
      setStep('idle');
      setSuccessMsg(
        isKz
          ? 'Екі факторлы аутентификация өшірілді.'
          : 'Двухфакторная аутентификация отключена.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Неверный код подтверждения');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadCodes = (codes: string[]) => {
    const content = [
      'NeuroFactory AI — Резервные коды Google Authenticator (2FA)',
      `Аккаунт: ${accountLabel}`,
      `Дата создания: ${new Date().toLocaleString('ru-RU')}`,
      '',
      'Каждый код можно использовать только один раз вместо 6-значного кода приложения:',
      ...codes.map((c, idx) => `${idx + 1}. ${c}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neurofactory-2fa-backup-codes.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-4 ${compact ? 'text-xs' : 'text-xs'}`}>
      {/* Status Banner */}
      <div
        className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          twoFactorEnabled
            ? 'border-emerald-500/40 bg-emerald-950/25'
            : 'border-amber-500/40 bg-amber-950/25'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border ${
              twoFactorEnabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
            }`}
          >
            {twoFactorEnabled ? (
              <ShieldCheck className="h-5 w-5 shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 shrink-0" />
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white text-sm">
                {isKz
                  ? 'Google Authenticator (2FA)'
                  : 'Двухфакторная аутентификация (Google Authenticator)'}
              </span>
              <span
                className={`text-[11px] font-mono font-semibold ${
                  twoFactorEnabled ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                · {twoFactorEnabled ? (isKz ? 'Белсенді' : 'Включена') : isKz ? 'Бапталмаған' : 'Не настроена'}
              </span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {twoFactorEnabled
                ? isKz
                  ? 'Пароль немесе Google арқылы кіргеннен кейін Google Authenticator қосымшасынан 6 таңбалы код міндетті түрде сұралады.'
                  : 'После входа по паролю или через Google система обязательно требует 6-значный код из приложения Google Authenticator.'
                : isKz
                ? 'Қазір кіру кодсыз орындалады. Аккаунтыңызды қорғау үшін Google Authenticator-ды қосуды ұсынамыз.'
                : 'Сейчас вход выполняется без 2FA-кода. Настоятельно рекомендуем включить Google Authenticator для защиты аккаунта и данных завода.'}
            </p>
          </div>
        </div>

        {step === 'idle' && (
          <div className="shrink-0 flex items-center gap-2">
            {!twoFactorEnabled ? (
              <button
                type="button"
                onClick={startSetup}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Smartphone className="h-4 w-4 shrink-0" />
                <span>{isKz ? '2FA қосу' : 'Настроить Google Authenticator'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setDisableCode('');
                  setStep('disable');
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-rose-800/70 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50 hover:text-white font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                <Lock className="h-3.5 w-3.5 shrink-0" />
                <span>{isKz ? '2FA өшіру' : 'Отключить 2FA'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-rose-300 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/60 p-3 text-emerald-300 flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Setup Wizard */}
      {step === 'setup' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 sm:p-5 space-y-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Smartphone className="h-4 w-4 shrink-0 text-cyan-400" />
              <span>
                {isKz
                  ? 'Google Authenticator баптауы'
                  : 'Подключение Google Authenticator'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setErrorMsg(null);
              }}
              className="text-slate-400 hover:text-white text-xs"
            >
              {isKz ? 'Болдырмау' : 'Отмена'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-5 items-start">
            {/* QR Code Column */}
            <div className="flex flex-col items-center space-y-2">
              {qrDataUrl ? (
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 shadow-sm">
                  <img
                    src={qrDataUrl}
                    alt="QR-код для Google Authenticator"
                    className="w-44 h-44 object-contain"
                  />
                </div>
              ) : (
                <div className="w-44 h-44 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                  QR-код
                </div>
              )}
              <span className="text-[11px] font-mono text-slate-400 text-center tabular-nums">
                {isKz ? `Код жаңаруы: ${secondsLeft} с` : `Обновление кода: ${secondsLeft} с`}
              </span>
            </div>

            {/* Instructions + Secret Key + Code Confirm */}
            <div className="space-y-4 min-w-0">
              <div className="space-y-1.5">
                <div className="font-semibold text-white">
                  {isKz
                    ? '1. Google Authenticator қосымшасында QR-кодты сканерлеңіз'
                    : '1. Отсканируйте QR-код в приложении Google Authenticator'}
                </div>
                <p className="text-slate-400 leading-relaxed">
                  {isKz
                    ? 'Телефонда Google Authenticator ашыңыз, «+» батырмасын басып, «QR-кодты сканерлеу» немесе төмендегі құпия кілтті енгізіңіз.'
                    : 'Откройте Google Authenticator (iOS / Android), нажмите «+» → «Сканировать QR-код» или выберите «Ввести ключ настройки» и укажите ключ ниже.'}
                </p>
              </div>

              {/* Manual Secret Key */}
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400 font-medium">
                  {isKz ? 'Қолмен енгізу кілті (Base32):' : 'Ключ для ручного ввода (если нет камеры):'}
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 font-mono text-xs text-cyan-300">
                  <span className="truncate select-all">{formatTotpSecretForDisplay(draftSecret)}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(draftSecret, 'secret')}
                    className="flex items-center gap-1 text-slate-300 hover:text-white shrink-0"
                  >
                    {copiedKey === 'secret' ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Verification Form */}
              <form onSubmit={handleConfirmSetup} className="space-y-3 pt-1">
                <div>
                  <label className="block font-semibold text-white mb-1.5">
                    {isKz
                      ? '2. Қосымшада көрсетілген 6 таңбалы кодты енгізіңіз'
                      : '2. Введите 6-значный код из приложения для подтверждения'}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={7}
                      required
                      value={verifyCode}
                      onChange={(e) => setVerifyCode(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="000 000"
                      className="w-full sm:w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-center text-base font-mono font-bold tracking-[0.25em] text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none tabular-nums"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold whitespace-nowrap transition-colors cursor-pointer"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 shrink-0" />
                      )}
                      <span>{isKz ? 'Растау және қосу' : 'Подтвердить и включить 2FA'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Backup Recovery Codes after activation */}
      {step === 'recovery' && (
        <div className="rounded-xl border border-emerald-500/40 bg-slate-950 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-emerald-300 text-sm">
              <KeyRound className="h-4 w-4 shrink-0" />
              <span>
                {isKz
                  ? 'Бір реттік резервтік кіру кодтары'
                  : 'Сохраните одноразовые резервные коды доступа'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy(draftRecoveryCodes.join('\n'), 'all-codes')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:text-white text-[11px]"
              >
                {copiedKey === 'all-codes' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>{isKz ? 'Көшіру' : 'Копировать'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadCodes(draftRecoveryCodes)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:text-white text-[11px]"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                <span>.TXT</span>
              </button>
            </div>
          </div>
          <p className="text-slate-400">
            {isKz
              ? 'Егер телефонға қолжетімділік жоғалса, кіру үшін осы кодтардың бірін пайдалануға болады (әр код бір рет қана жарамды).'
              : 'Если потеряете доступ к телефону с Google Authenticator, любой из этих кодов можно ввести вместо 6-значного кода (каждый действует один раз).'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono text-xs">
            {draftRecoveryCodes.map((code) => (
              <div
                key={code}
                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center text-cyan-300 font-semibold tracking-wider select-all tabular-nums"
              >
                {code}
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setStep('idle')}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition-colors cursor-pointer"
            >
              {isKz ? 'Сақтадым, дайын' : 'Я сохранил коды, готово'}
            </button>
          </div>
        </div>
      )}

      {/* Disable Confirmation */}
      {step === 'disable' && twoFactorEnabled && (
        <form
          onSubmit={handleConfirmDisable}
          className="rounded-xl border border-rose-500/40 bg-slate-950 p-4 space-y-3"
        >
          <div className="font-bold text-rose-300">
            {isKz
              ? 'Google Authenticator-ды өшіруді растау'
              : 'Подтвердите отключение Google Authenticator'}
          </div>
          <p className="text-slate-400">
            {isKz
              ? 'Қауіпсіздік үшін қосымшадағы ағымдағы 6 таңбалы кодты (немесе резервтік кодты) енгізіңіз.'
              : 'В целях безопасности введите текущий 6-значный код из Google Authenticator или один из резервных кодов.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              required
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="000000"
              className="w-44 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-center text-sm text-white tracking-widest focus:border-rose-500 focus:outline-none tabular-nums"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold transition-colors cursor-pointer"
            >
              {isKz ? 'Растау және өшіру' : 'Отключить 2FA'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setErrorMsg(null);
              }}
              className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
            >
              {isKz ? 'Болдырмау' : 'Отмена'}
            </button>
          </div>
        </form>
      )}

      {/* Existing Recovery Codes summary when active */}
      {step === 'idle' && twoFactorEnabled && twoFactorConfig && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400 font-mono">
          <span>
            {isKz ? 'Белсенді аккаунт:' : 'Привязанный аккаунт:'}{' '}
            <span className="text-slate-200">{twoFactorConfig.accountLabel}</span>
          </span>
          <span>
            {isKz ? 'Резервтік кодтар қалды:' : 'Осталось резервных кодов:'}{' '}
            <span className="text-cyan-300 font-bold tabular-nums">
              {twoFactorConfig.recoveryCodes?.length ?? 0}
            </span>
          </span>
        </div>
      )}
    </div>
  );
};
