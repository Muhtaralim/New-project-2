import React from 'react';
import { X, ShieldCheck } from 'lucide-react';
import { Language } from '../types';
import { TwoFactorPanel } from './TwoFactorPanel';

interface TwoFactorSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

export const TwoFactorSetupModal: React.FC<TwoFactorSetupModalProps> = ({
  isOpen,
  onClose,
  language,
}) => {
  if (!isOpen) return null;
  const isKz = language === 'kz';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="relative w-full max-w-2xl my-auto max-h-[92dvh] flex flex-col rounded-xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-5 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldCheck className="h-5 w-5 shrink-0 text-cyan-400" />
            <h2 className="text-base font-bold text-white truncate">
              {isKz
                ? 'Екі факторлы қорғаныс · Google Authenticator'
                : 'Защита аккаунта · Google Authenticator (2FA)'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors shrink-0"
            aria-label={isKz ? 'Жабу' : 'Закрыть'}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 sm:p-6">
          <TwoFactorPanel language={language} />
        </div>
      </div>
    </div>
  );
};
