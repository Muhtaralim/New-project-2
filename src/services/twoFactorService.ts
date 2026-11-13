import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  db,
  auth,
  isFirebaseConfigured,
  handleFirestoreError,
  OperationType,
} from './firebase';
import { TwoFactorConfig } from '../types';
import { verifyTotpCode } from '../utils/totp';

const LOCAL_2FA_UID_PREFIX = 'neurofactory_2fa_uid_';
const LOCAL_2FA_EMAIL_PREFIX = 'neurofactory_2fa_email_';
const SESSION_2FA_VERIFIED_KEY = 'neurofactory_2fa_verified_uid';

function normalizeEmail(email?: string | null): string {
  return (email || '').trim().toLowerCase();
}

export function readLocalTwoFactorConfig(uid?: string | null, email?: string | null): TwoFactorConfig | null {
  try {
    if (uid) {
      const byUid = localStorage.getItem(`${LOCAL_2FA_UID_PREFIX}${uid}`);
      if (byUid) {
        return JSON.parse(byUid) as TwoFactorConfig;
      }
    }
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail) {
      const byEmail = localStorage.getItem(`${LOCAL_2FA_EMAIL_PREFIX}${cleanEmail}`);
      if (byEmail) {
        return JSON.parse(byEmail) as TwoFactorConfig;
      }
    }
  } catch {
    // ignore corrupted cache
  }
  return null;
}

function saveLocalTwoFactorConfig(config: TwoFactorConfig, email?: string | null): void {
  try {
    if (config.userId) {
      localStorage.setItem(`${LOCAL_2FA_UID_PREFIX}${config.userId}`, JSON.stringify(config));
    }
    const cleanEmail = normalizeEmail(email || config.accountLabel);
    if (cleanEmail) {
      localStorage.setItem(`${LOCAL_2FA_EMAIL_PREFIX}${cleanEmail}`, JSON.stringify(config));
    }
  } catch (err) {
    console.warn('Could not persist 2FA config locally:', err);
  }
}

function clearLocalTwoFactorConfig(uid?: string | null, email?: string | null): void {
  try {
    if (uid) {
      localStorage.removeItem(`${LOCAL_2FA_UID_PREFIX}${uid}`);
    }
    const cleanEmail = normalizeEmail(email);
    if (cleanEmail) {
      localStorage.removeItem(`${LOCAL_2FA_EMAIL_PREFIX}${cleanEmail}`);
    }
  } catch {
    // ignore
  }
}

export function isSessionTwoFactorVerified(uid?: string | null): boolean {
  if (!uid) return false;
  try {
    const raw = sessionStorage.getItem(SESSION_2FA_VERIFIED_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.uid === uid;
  } catch {
    return false;
  }
}

export function markSessionTwoFactorVerified(uid: string): void {
  if (!uid) return;
  try {
    sessionStorage.setItem(
      SESSION_2FA_VERIFIED_KEY,
      JSON.stringify({ uid, verifiedAt: new Date().toISOString() })
    );
  } catch {
    // ignore
  }
}

export function clearSessionTwoFactorVerified(): void {
  try {
    sessionStorage.removeItem(SESSION_2FA_VERIFIED_KEY);
  } catch {
    // ignore
  }
}

export async function fetchTwoFactorConfig(
  uid: string,
  email?: string | null
): Promise<TwoFactorConfig | null> {
  const local = readLocalTwoFactorConfig(uid, email);

  if (!isFirebaseConfigured || !db || !auth?.currentUser || auth.currentUser.uid !== uid) {
    return local;
  }

  const path = `users/${uid}/security/totp`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'security', 'totp'));
    if (snap.exists()) {
      const remote = snap.data() as TwoFactorConfig;
      saveLocalTwoFactorConfig(remote, email);
      return remote;
    }
    return local;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Missing or insufficient permissions')) {
      try {
        handleFirestoreError(err, OperationType.GET, path, auth);
      } catch {
        return local;
      }
    }
    return local;
  }
}

export async function saveTwoFactorConfig(
  config: TwoFactorConfig,
  email?: string | null
): Promise<TwoFactorConfig> {
  const normalized: TwoFactorConfig = {
    userId: config.userId,
    enabled: Boolean(config.enabled),
    secret: config.secret.toUpperCase().replace(/\s+/g, ''),
    issuer: config.issuer || 'NeuroFactory AI',
    accountLabel: config.accountLabel || email || 'user@neurofactory.kz',
    recoveryCodes: Array.isArray(config.recoveryCodes) ? config.recoveryCodes.slice(0, 10) : [],
    enabledAt: config.enabledAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveLocalTwoFactorConfig(normalized, email);

  if (isFirebaseConfigured && db && auth?.currentUser && auth.currentUser.uid === config.userId) {
    const path = `users/${config.userId}/security/totp`;
    try {
      await setDoc(doc(db, 'users', config.userId, 'security', 'totp'), normalized);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.WRITE, path, auth);
      }
      console.warn('Could not sync 2FA config to Firestore (kept locally):', err);
    }
  }

  return normalized;
}

export async function disableTwoFactorConfig(uid: string, email?: string | null): Promise<void> {
  clearLocalTwoFactorConfig(uid, email);

  if (isFirebaseConfigured && db && auth?.currentUser && auth.currentUser.uid === uid) {
    const path = `users/${uid}/security/totp`;
    try {
      await deleteDoc(doc(db, 'users', uid, 'security', 'totp'));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(err, OperationType.DELETE, path, auth);
      }
      console.warn('Could not delete remote 2FA config:', err);
    }
  }
}

export async function verifyTwoFactorInput(
  config: TwoFactorConfig,
  rawCode: string,
  email?: string | null
): Promise<{ valid: boolean; usedRecoveryCode: boolean; updatedConfig?: TwoFactorConfig }> {
  const cleaned = rawCode.trim().toUpperCase();

  // 1) Check 6-digit Google Authenticator TOTP code
  const isTotpValid = await verifyTotpCode(config.secret, cleaned, 1);
  if (isTotpValid) {
    return { valid: true, usedRecoveryCode: false };
  }

  // 2) Check single-use backup recovery code (format XXXX-XXXX or XXXXXXXX)
  const normalizedInput = cleaned.replace(/-/g, '');
  const codes = Array.isArray(config.recoveryCodes) ? config.recoveryCodes : [];
  const matchedIdx = codes.findIndex((c) => c.replace(/-/g, '').toUpperCase() === normalizedInput);

  if (matchedIdx !== -1 && normalizedInput.length >= 8) {
    const remaining = codes.filter((_, idx) => idx !== matchedIdx);
    const updatedConfig = await saveTwoFactorConfig(
      {
        ...config,
        recoveryCodes: remaining,
        updatedAt: new Date().toISOString(),
      },
      email
    );
    return { valid: true, usedRecoveryCode: true, updatedConfig };
  }

  return { valid: false, usedRecoveryCode: false };
}
