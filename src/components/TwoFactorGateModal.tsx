import React, { useState } from 'react';
import { ShieldCheck, KeyRound, AlertCircle, Loader2, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Language } from '../types';
import { CompanyLogo } from './CompanyLogo';

interface TwoFactorGateModalProps {
  language: Language;
  onSuccess?: () => void;
}

export const TwoFactorGateModal: React.FC<TwoFactorGateModalProps> = ({
  language,
  onSuccess,
}) => {
  const {
    pendingTwoFactor,
    verifyPendingTwoFactor,
    cancelPendingTwoFactor,
    error,
    clearError,
  } = useAuth();

  const [code, setCode] = useState('');
  const [useBackupMode, setUseBackupMode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  if (!pendingTwoFactor) return null;

  const isKz = language === 'kz';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    clearError();

    const cleaned = code.trim();
    if (!cleaned) return;

    setIsVerifying(true);
    try {
      await verifyPendingTwoFactor(cleaned);
      setCode('');
      onSuccess?.();
    } catch (err) {
      setLocalErr(
        err instanceof Error
          ? err.message
          : isKz
          ? 'Растау коды қате'
          : 'Неверный код подтверждения'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const activeError = localErr || error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md">
      <div className="w-full max-w-md rounded-xl border border-cyan-900/60 bg-slate-900 p-6 shadow-2xl space-y-5">
        <div className="space-y-2">
          <div className="mb-2">
            <CompanyLogo size="md" withText={true} glow={true} />
          </div>
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs uppercase tracking-wider font-semibold">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>Google Authenticator · 2FA</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            {isKz ? 'Екі факторлы тексеру' : 'Подтверждение входа'}
          </h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            {isKz
              ? `Аккаунт (${pendingTwoFactor.email}) қорғалған. Кіруді аяқтау үшін Google Authenticator қосымшасындағы 6 таңбалы кодты енгізіңіз.`
              : `Аккаунт ${pendingTwoFactor.email} защищён двухфакторной аутентификацией. Без кода из Google Authenticator вход в систему заблокирован.`}
          </p>
        </div>

        {activeError && (
          <div className="rounded-lg border border-rose-800 bg-rose-950/60 p-3 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{activeError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                {useBackupMode
                  ? isKz
                    ? 'Бір реттік резервтік код'
                    : 'Одноразовый резервный код'
                  : isKz
                  ? 'Google Authenticator 6 таңбалы коды'
                  : '6-значный код из Google Authenticator'}
              </label>
              <button
                type="button"
                onClick={() => {
                  setUseBackupMode(!useBackupMode);
                  setCode('');
                  setLocalErr(null);
                  clearError();
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
              >
                {useBackupMode
                  ? isKz
                    ? '6 таңбалы кодпен кіру'
                    : 'Ввести 6-значный код'
                  : isKz
                  ? 'Резервтік код бар'
                  : 'Использовать резервный код'}
              </button>
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input
                type="text"
                autoFocus
                required
                inputMode={useBackupMode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                maxLength={useBackupMode ? 12 : 7}
                value={code}
                onChange={(e) =>
                  setCode(
                    useBackupMode
                      ? e.target.value.toUpperCase()
                      : e.target.value.replace(/[^\d\s]/g, '')
                  )
                }
                placeholder={useBackupMode ? 'XXXX-XXXX' : '000 000'}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 pl-9 pr-3 py-2.5 text-center text-base font-mono font-bold tracking-[0.25em] text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none tabular-nums"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isVerifying || !code.trim()}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 py-2.5 px-4 text-xs font-bold text-white transition-colors cursor-pointer"
          >
            {isVerifying ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            )}
            <span>{isKz ? 'Растау және кіру' : 'Подтвердить и войти'}</span>
          </button>
        </form>

        <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
          <span className="text-slate-400 font-mono text-[11px]">
            {pendingTwoFactor.method === 'google'
              ? 'Google Sign-In'
              : pendingTwoFactor.method === 'employee'
              ? 'Сотрудник'
              : 'Email / Пароль'}
          </span>
          <button
            type="button"
            onClick={cancelPendingTwoFactor}
            className="flex items-center gap-1.5 text-rose-300 hover:text-white font-semibold cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span>{isKz ? 'Кіруді болдырмау' : 'Отменить и выйти'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
