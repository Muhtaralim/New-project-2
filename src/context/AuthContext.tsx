import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import {
  auth,
  db,
  isFirebaseConfigured,
} from '../services/firebase';
import {
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  UserProfile,
  AdminProfile,
  FactoryEmployee,
  EmployeeRoleType,
  TwoFactorConfig,
  PendingTwoFactorChallenge,
} from '../types';
import {
  fetchFactoryEmployees,
  createFactoryEmployee,
  deleteFactoryEmployee,
  findEmployeeByCredentials,
  fetchStaffLinkByUid,
} from '../services/employeeService';
import {
  fetchTwoFactorConfig,
  saveTwoFactorConfig,
  disableTwoFactorConfig,
  verifyTwoFactorInput,
  isSessionTwoFactorVerified,
  markSessionTwoFactorVerified,
  clearSessionTwoFactorVerified,
} from '../services/twoFactorService';

export type LoginStepResult = 'authenticated' | 'two_factor_required';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  profile: UserProfile | null;
  adminProfile: AdminProfile | null;
  isAdmin: boolean;
  isWorker: boolean;
  isSpecialist: boolean;
  effectiveFactoryId: string;
  employees: FactoryEmployee[];
  isLoading: boolean;
  isFirebaseReady: boolean;
  error: string | null;
  twoFactorConfig: TwoFactorConfig | null;
  twoFactorEnabled: boolean;
  pendingTwoFactor: PendingTwoFactorChallenge | null;
  loginWithEmail: (email: string, pass: string) => Promise<LoginStepResult>;
  registerWithEmail: (email: string, pass: string, factoryName: string, region: string) => Promise<void>;
  loginWithGoogle: () => Promise<LoginStepResult>;
  verifyPendingTwoFactor: (code: string) => Promise<void>;
  cancelPendingTwoFactor: () => Promise<void>;
  enableTwoFactor: (params: { secret: string; recoveryCodes: string[] }) => Promise<TwoFactorConfig>;
  disableTwoFactor: (code: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  logout: () => Promise<void>;
  saveFactoryProfile: (updated: Partial<UserProfile>) => Promise<void>;
  updateAdminProfile: (updated: Partial<AdminProfile>) => Promise<void>;
  setHardwareConnectedState: (connected: boolean) => Promise<void>;
  addEmployee: (params: {
    fullName: string;
    specialty: string;
    roleType: EmployeeRoleType;
    department?: string;
  }) => Promise<FactoryEmployee>;
  removeEmployee: (employeeId: string, authUid?: string) => Promise<void>;
  refreshEmployees: () => Promise<void>;
  toggleAdminMode: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_USER_KEY = 'neurofactory_demo_user';
const LOCAL_STORAGE_PROFILE_KEY = 'neurofactory_demo_profile';
const LOCAL_STORAGE_ADMIN_KEY = 'neurofactory_admin_profile';
const LOCAL_STORAGE_EMPLOYEE_SESSION_KEY = 'neurofactory_employee_session';

const DEFAULT_ADMIN_PROFILE: AdminProfile = {
  userId: 'usr-admin-root',
  email: 'bochaevmuhtarali@mail.ru',
  fullName: 'Бочаев Мухтарали',
  role: 'Главный системный администратор NeuroFactory',
  accessLevel: 4,
  phone: '+7 (777) 001-99-88',
  department: 'Департамент системной архитектуры и промышленной безопасности',
  twoFactorEnabled: false,
  lastLogin: 'Сегодня, 11:20 (Сессия активна)',
  systemMetrics: {
    yoloNodeStatus: 'healthy',
    lstmEcoStatus: 'healthy',
    vibrationCoreStatus: 'healthy',
    totalInferencesToday: 148290,
    activeNodesCount: 6,
  },
  updatedAt: new Date().toISOString(),
};

const DEFAULT_NEW_PROFILE_TEMPLATE: UserProfile = {
  userId: 'usr-local',
  email: '',
  factoryName: 'Производственный комплекс',
  region: 'г. Тараз',
  industrySector: 'Черная и цветная металлургия',
  contactPerson: '',
  contactPhone: '',
  emailVerified: false,
  hasConnectedHardware: false,
  isNewAccount: true,
  role: 'enterprise_user',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function formatAuthErrorMessage(err: unknown): string {
  const isKz = (localStorage.getItem('neurofactory_lang') || 'ru') === 'kz';
  const code = (err as any)?.code || (err instanceof Error ? err.message : String(err));

  if (typeof code === 'string') {
    if (code.includes('auth/email-already-in-use')) {
      return isKz
        ? 'Бұл электрондық пошта (email) жүйеде тіркелген. Жүйеге кіру үшін «Кіру» бөліміне өтіңіз немесе құпия сөзді қалпына келтіріңіз.'
        : 'Этот адрес электронной почты уже зарегистрирован. Войдите в систему или воспользуйтесь восстановлением пароля.';
    }
    if (code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) {
      return isKz
        ? 'Қате құпия сөз немесе есептік деректер. Тексеріп, қайта енгізіңіз.'
        : 'Неверный пароль или учетные данные. Пожалуйста, проверьте правильность ввода.';
    }
    if (code.includes('auth/user-not-found')) {
      return isKz
        ? 'Мұндай email бар қолданушы табылмады. Алдымен зауытты тіркеңіз.'
        : 'Пользователь с таким email не найден. Пожалуйста, пройдите регистрацию завода.';
    }
    if (code.includes('auth/weak-password')) {
      return isKz
        ? 'Құпия сөз тым қысқа. Құпия сөз кемінде 6 таңбадан тұруы керек.'
        : 'Слишком слабый пароль. Пароль должен содержать минимум 6 символов.';
    }
    if (code.includes('auth/invalid-email')) {
      return isKz
        ? 'Электрондық пошта пішімі дұрыс емес. Жарамды email енгізіңіз.'
        : 'Некорректный формат email. Введите правильный адрес почты.';
    }
    if (code.includes('auth/too-many-requests')) {
      return isKz
        ? 'Сәтсіз әрекеттер саны тым көп. Бірнеше минут күтіңіз немесе құпия сөзді қалпына келтіріңіз.'
        : 'Слишком много неудачных попыток входа. Подождите несколько минут или сбросьте пароль.';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return isKz
        ? 'Авторизация терезесі жабылды.'
        : 'Окно авторизации было закрыто до завершения входа.';
    }
    if (code.includes('auth/popup-blocked')) {
      return isKz
        ? 'Браузер қалқымалы терезені (popup) бұғаттады. Рұқсат етіңіз немесе email арқылы кіріңіз.'
        : 'Браузер заблокировал всплывающее окно Google. Разрешите всплывающие окна или войдите по email.';
    }
    if (code.includes('auth/unauthorized-domain')) {
      return isKz
        ? 'Бұл домен Firebase Console-дегі «Authorized domains» тізімінде әлі жоқ. Доменді қосқанша email арқылы кіріңіз.'
        : 'Этот домен пока не добавлен в «Authorized domains» в Firebase Console. Добавьте его в настройках Firebase Authentication или используйте вход по email.';
    }
    if (code.includes('auth/network-request-failed')) {
      return isKz
        ? 'Желілік байланыс қатесі. Интернет байланысын тексеріңіз.'
        : 'Ошибка сетевого соединения. Проверьте подключение к интернету.';
    }
  }

  if (err instanceof Error) {
    const match = err.message.match(/auth\/([a-z-]+)/);
    if (match) {
      return isKz
        ? `Авторизация қатесі (${match[1]}). Деректерді қайта тексеріңіз.`
        : `Ошибка авторизации (${match[1]}). Проверьте правильность введенных данных.`;
    }
    return err.message;
  }
  return isKz ? 'Авторизация кезінде қате орын алды' : 'Произошла ошибка авторизации';
}

function buildFirestoreFactoryPayload(
  p: Partial<UserProfile>,
  uid: string,
  userEmailVerified?: boolean
) {
  const payload: Record<string, any> = {
    userId: uid,
    factoryName: p.factoryName || 'Производственный комплекс',
    region: p.region || 'г. Тараз',
    updatedAt: new Date().toISOString(),
  };

  if (p.email) payload.email = p.email;
  if (p.emailVerified !== undefined || userEmailVerified !== undefined) {
    payload.emailVerified = Boolean(p.emailVerified ?? userEmailVerified);
  }
  if (p.hasConnectedHardware !== undefined) {
    payload.hasConnectedHardware = Boolean(p.hasConnectedHardware);
  }
  if (p.isNewAccount !== undefined) {
    payload.isNewAccount = Boolean(p.isNewAccount);
  }
  if (p.role) payload.role = p.role;
  if (p.industrySector) payload.industrySector = p.industrySector;
  if (p.contactPerson) payload.contactPerson = p.contactPerson;
  if (p.contactPhone) payload.contactPhone = p.contactPhone;
  if (p.createdAt) payload.createdAt = p.createdAt;

  return payload;
}

function buildFirestoreUserPayload(
  p: Partial<UserProfile>,
  uid: string,
  email: string,
  userEmailVerified?: boolean
) {
  const payload: Record<string, any> = {
    userId: uid,
    email,
    updatedAt: new Date().toISOString(),
  };

  if (p.contactPerson || p.displayName) {
    payload.displayName = p.contactPerson || p.displayName;
  }
  if (p.factoryName) payload.factoryName = p.factoryName;
  if (p.region) payload.region = p.region;
  if (p.role) payload.role = p.role;
  if (p.emailVerified !== undefined || userEmailVerified !== undefined) {
    payload.emailVerified = Boolean(p.emailVerified ?? userEmailVerified);
  }
  if (p.hasConnectedHardware !== undefined) {
    payload.hasConnectedHardware = Boolean(p.hasConnectedHardware);
  }
  if (p.isNewAccount !== undefined) {
    payload.isNewAccount = Boolean(p.isNewAccount);
  }
  if (p.createdAt) payload.createdAt = p.createdAt;

  return payload;
}

function buildFullUserProfile(
  firestoreData: any,
  user: FirebaseUser,
  localStored?: Partial<UserProfile> | null
): UserProfile {
  const normalizedEmail = (user.email || '').trim().toLowerCase();
  const isAuthAdmin =
    normalizedEmail === 'bochaevmuhtarali@mail.ru' ||
    normalizedEmail === 'bochaevmuhtarali@gmail.com' ||
    normalizedEmail === 'muhtaraliboc@gmail.com';

  // Ensure cached local profile is ONLY used if it belongs to the exact same UID
  const safeLocal = localStored && localStored.userId === user.uid ? localStored : null;

  // NEW ACCOUNTS ALWAYS START WITH NO CONNECTED HARDWARE (0 cameras, 0 sensors, 0 machines)
  const hasHardware =
    firestoreData?.hasConnectedHardware !== undefined
      ? Boolean(firestoreData.hasConnectedHardware)
      : Boolean(safeLocal?.hasConnectedHardware ?? false);

  const isNew =
    firestoreData?.isNewAccount !== undefined
      ? Boolean(firestoreData.isNewAccount)
      : !hasHardware;

  return {
    userId: user.uid,
    email: user.email || safeLocal?.email || '',
    emailVerified: user.emailVerified || Boolean(firestoreData?.emailVerified),
    factoryName:
      firestoreData?.factoryName ||
      safeLocal?.factoryName ||
      (isAuthAdmin
        ? 'NeuroFactory AI — Центр системного администрирования'
        : 'Производственный комплекс'),
    region: firestoreData?.region || safeLocal?.region || 'г. Тараз',
    industrySector:
      firestoreData?.industrySector ||
      safeLocal?.industrySector ||
      'Черная и цветная металлургия',
    contactPerson:
      firestoreData?.contactPerson ||
      safeLocal?.contactPerson ||
      (isAuthAdmin ? 'Бочаев Мухтарали' : user.displayName || ''),
    contactPhone:
      firestoreData?.contactPhone || safeLocal?.contactPhone || '+7 (777) 001-99-88',
    hasConnectedHardware: hasHardware,
    isNewAccount: isNew,
    role: isAuthAdmin ? 'admin' : (firestoreData?.role || safeLocal?.role || 'enterprise_user'),
    createdAt: firestoreData?.createdAt || safeLocal?.createdAt || new Date().toISOString(),
    updatedAt: firestoreData?.updatedAt || new Date().toISOString(),
  };
}

interface FactoryMetaCache {
  factoryName?: string;
  region?: string;
  industrySector?: string;
  hasConnectedHardware?: boolean;
}

function readFactoryMetaCache(factoryId: string): FactoryMetaCache & {
  camerasCount: number;
  sensorsCount: number;
  machinesCount: number;
} {
  let meta: FactoryMetaCache = {};
  let camerasCount = 0;
  let sensorsCount = 0;
  let machinesCount = 0;

  try {
    const rawMeta = localStorage.getItem(`neurofactory_factory_meta_${factoryId}`);
    if (rawMeta) {
      meta = JSON.parse(rawMeta) || {};
    }
  } catch {
    // ignore
  }

  try {
    const rawState = localStorage.getItem(`neurofactory_plant_state_${factoryId}`);
    if (rawState) {
      const parsed = JSON.parse(rawState);
      camerasCount = Array.isArray(parsed?.cameras) ? parsed.cameras.length : 0;
      sensorsCount = Array.isArray(parsed?.ecoSensors) ? parsed.ecoSensors.length : 0;
      machinesCount = Array.isArray(parsed?.machines) ? parsed.machines.length : 0;
    }
  } catch {
    // ignore
  }

  const hasHardware =
    Boolean(meta.hasConnectedHardware) ||
    camerasCount > 0 ||
    sensorsCount > 0 ||
    machinesCount > 0;

  return {
    ...meta,
    hasConnectedHardware: hasHardware,
    camerasCount,
    sensorsCount,
    machinesCount,
  };
}

function saveFactoryMetaCache(factoryId: string, meta: FactoryMetaCache) {
  if (!factoryId || factoryId === 'guest-zero' || factoryId === 'guest-zero-plant') return;
  try {
    const existing = readFactoryMetaCache(factoryId);
    localStorage.setItem(
      `neurofactory_factory_meta_${factoryId}`,
      JSON.stringify({
        factoryName: meta.factoryName || existing.factoryName || 'Производственный комплекс',
        region: meta.region || existing.region || 'г. Тараз',
        industrySector: meta.industrySector || existing.industrySector || 'Черная и цветная металлургия',
        hasConnectedHardware:
          meta.hasConnectedHardware !== undefined
            ? Boolean(meta.hasConnectedHardware)
            : Boolean(existing.hasConnectedHardware),
      })
    );
  } catch {
    // ignore
  }
}

function buildEmployeeSessionData(emp: FactoryEmployee, factoryMeta?: FactoryMetaCache) {
  const cached = readFactoryMetaCache(emp.factoryId);
  const resolvedName = factoryMeta?.factoryName || cached.factoryName || 'Производственный комплекс';
  const resolvedRegion = factoryMeta?.region || cached.region || 'г. Тараз';
  const resolvedSector = factoryMeta?.industrySector || cached.industrySector || 'Промышленное предприятие';
  const resolvedHasHardware =
    Boolean(factoryMeta?.hasConnectedHardware) || Boolean(cached.hasConnectedHardware);

  const mockUser = {
    uid: emp.authUid || emp.id,
    email: emp.email,
    emailVerified: true,
    displayName: emp.fullName,
  } as unknown as FirebaseUser;

  const empProfile: UserProfile = {
    userId: emp.authUid || emp.id,
    email: emp.email,
    factoryName: resolvedName,
    region: resolvedRegion,
    industrySector: resolvedSector,
    contactPerson: emp.fullName,
    displayName: emp.fullName,
    emailVerified: true,
    hasConnectedHardware: resolvedHasHardware,
    isNewAccount: false,
    role: emp.roleType === 'specialist' ? 'specialist' : 'worker',
    employeeId: emp.id,
    employeeRole: emp.roleType,
    specialty: emp.specialty,
    department: emp.department || 'Основное производство',
    factoryId: emp.factoryId,
    autoPassword: emp.password,
    createdAt: emp.createdAt,
    updatedAt: new Date().toISOString(),
  };

  return { mockUser, empProfile };
}

interface PendingAuthSnapshot {
  user: FirebaseUser;
  profile: UserProfile;
  storageMode: 'firebase' | 'employee' | 'local';
  employeeSessionPayload?: { mockUser: FirebaseUser; empProfile: UserProfile };
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [internalUser, setInternalUser] = useState<FirebaseUser | null>(null);
  const [internalProfile, setInternalProfile] = useState<UserProfile | null>(null);
  const [twoFactorConfig, setTwoFactorConfig] = useState<TwoFactorConfig | null>(null);
  const [pendingTwoFactor, setPendingTwoFactor] = useState<PendingTwoFactorChallenge | null>(null);
  const [pendingAuthSnapshot, setPendingAuthSnapshot] = useState<PendingAuthSnapshot | null>(null);

  const [employees, setEmployees] = useState<FactoryEmployee[]>([]);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_ADMIN_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_ADMIN_PROFILE;
    } catch {
      return DEFAULT_ADMIN_PROFILE;
    }
  });
  const [isAdminModeForced, setIsAdminModeForced] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Publicly exposed user/profile remain strictly null while a 2FA code challenge is pending
  const currentUser = pendingTwoFactor ? null : internalUser;
  const profile = pendingTwoFactor ? null : internalProfile;
  const twoFactorEnabled = Boolean(
    !pendingTwoFactor && twoFactorConfig?.enabled && twoFactorConfig?.secret
  );

  const effectiveFactoryId = profile?.factoryId || currentUser?.uid || 'guest-zero';

  const applyAuthenticatedOrChallenge = useCallback(
    async (params: {
      user: FirebaseUser;
      userProfile: UserProfile;
      method: 'password' | 'google' | 'employee';
      storageMode: 'firebase' | 'employee' | 'local';
      employeeSessionPayload?: { mockUser: FirebaseUser; empProfile: UserProfile };
    }): Promise<LoginStepResult> => {
      const { user, userProfile, method, storageMode, employeeSessionPayload } = params;
      const totpCfg = await fetchTwoFactorConfig(user.uid, user.email || userProfile.email);
      setTwoFactorConfig(totpCfg);

      const hasActiveTotp = Boolean(totpCfg?.enabled && totpCfg?.secret);
      if (hasActiveTotp && totpCfg && !isSessionTwoFactorVerified(user.uid)) {
        setInternalUser(user);
        setInternalProfile(userProfile);
        setPendingAuthSnapshot({
          user,
          profile: userProfile,
          storageMode,
          employeeSessionPayload,
        });
        setPendingTwoFactor({
          uid: user.uid,
          email: user.email || userProfile.email || '',
          displayName: userProfile.contactPerson || user.displayName || undefined,
          method,
          config: totpCfg,
        });
        return 'two_factor_required';
      }

      setPendingTwoFactor(null);
      setPendingAuthSnapshot(null);
      setInternalUser(user);
      setInternalProfile(userProfile);

      if (storageMode === 'employee' && employeeSessionPayload) {
        localStorage.setItem(
          LOCAL_STORAGE_EMPLOYEE_SESSION_KEY,
          JSON.stringify(employeeSessionPayload)
        );
        localStorage.setItem(
          LOCAL_STORAGE_PROFILE_KEY,
          JSON.stringify(employeeSessionPayload.empProfile)
        );
      } else if (storageMode === 'local') {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(userProfile));
      } else {
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(userProfile));
      }

      return 'authenticated';
    },
    []
  );

  const refreshEmployees = useCallback(async () => {
    if (!currentUser || !effectiveFactoryId || effectiveFactoryId === 'guest-zero') {
      setEmployees([]);
      return;
    }
    const list = await fetchFactoryEmployees(effectiveFactoryId);
    setEmployees(list);
  }, [currentUser, effectiveFactoryId]);

  useEffect(() => {
    refreshEmployees();
  }, [refreshEmployees]);

  useEffect(() => {
    if (isFirebaseConfigured && auth && db) {
      const firestore = db;
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          const authMethod: 'google' | 'password' = user.providerData?.some(
            (p) => p.providerId === 'google.com'
          )
            ? 'google'
            : 'password';
          try {
            // Check if this Firebase Auth user is an employee linked to a parent factory
            const staffLink = await fetchStaffLinkByUid(user.uid);
            if (staffLink && staffLink.factoryId) {
              let parentFactoryData: any = null;
              let employeeRecord: FactoryEmployee | null = null;
              let hasRemoteDevices = false;
              try {
                const fSnap = await getDoc(doc(firestore, 'factories', staffLink.factoryId));
                if (fSnap.exists()) parentFactoryData = fSnap.data();
                const eSnap = await getDoc(
                  doc(firestore, 'factories', staffLink.factoryId, 'employees', staffLink.employeeId)
                );
                if (eSnap.exists()) employeeRecord = eSnap.data() as FactoryEmployee;
                const hwSnap = await getDoc(doc(firestore, 'factories', staffLink.factoryId, 'hardware', 'state'));
                if (hwSnap.exists()) {
                  const hwData = hwSnap.data() as any;
                  hasRemoteDevices =
                    (Array.isArray(hwData?.cameras) && hwData.cameras.length > 0) ||
                    (Array.isArray(hwData?.ecoSensors) && hwData.ecoSensors.length > 0) ||
                    (Array.isArray(hwData?.machines) && hwData.machines.length > 0);
                }
              } catch {
                // ignore
              }

              const localMeta = readFactoryMetaCache(staffLink.factoryId);
              const resolvedFactoryName =
                parentFactoryData?.factoryName ||
                staffLink.factoryName ||
                localMeta.factoryName ||
                'Производственный комплекс';
              const resolvedRegion =
                parentFactoryData?.region || staffLink.region || localMeta.region || 'г. Тараз';
              const resolvedSector =
                parentFactoryData?.industrySector ||
                localMeta.industrySector ||
                'Промышленное предприятие';
              const resolvedHardware =
                Boolean(parentFactoryData?.hasConnectedHardware) ||
                hasRemoteDevices ||
                Boolean(localMeta.hasConnectedHardware);

              saveFactoryMetaCache(staffLink.factoryId, {
                factoryName: resolvedFactoryName,
                region: resolvedRegion,
                industrySector: resolvedSector,
                hasConnectedHardware: resolvedHardware,
              });

              const staffProfile: UserProfile = {
                userId: user.uid,
                email: user.email || staffLink.email || '',
                emailVerified: true,
                factoryName: resolvedFactoryName,
                region: resolvedRegion,
                industrySector: resolvedSector,
                contactPerson: staffLink.fullName || employeeRecord?.fullName || user.displayName || '',
                displayName: staffLink.fullName || employeeRecord?.fullName || '',
                hasConnectedHardware: resolvedHardware,
                isNewAccount: false,
                role: staffLink.roleType,
                employeeId: staffLink.employeeId,
                employeeRole: staffLink.roleType,
                specialty: staffLink.specialty || employeeRecord?.specialty || '',
                department: employeeRecord?.department || 'Основное производство',
                factoryId: staffLink.factoryId,
                autoPassword: employeeRecord?.password,
                createdAt: staffLink.createdAt,
                updatedAt: new Date().toISOString(),
              };

              await applyAuthenticatedOrChallenge({
                user,
                userProfile: staffProfile,
                method: authMethod,
                storageMode: 'firebase',
              });
              setIsLoading(false);
              return;
            }

            const docRef = doc(firestore, 'factories', user.uid);
            let snap;
            try {
              snap = await getDoc(docRef);
            } catch (err) {
              console.warn('Error reading factory profile from Firestore:', err);
            }

            let storedLocal: Partial<UserProfile> | null = null;
            try {
              const raw = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.userId === user.uid) {
                  storedLocal = parsed;
                }
              }
            } catch {}

            if (snap && snap.exists()) {
              const fullProfile = buildFullUserProfile(snap.data(), user, storedLocal);
              saveFactoryMetaCache(user.uid, {
                factoryName: fullProfile.factoryName,
                region: fullProfile.region,
                industrySector: fullProfile.industrySector,
                hasConnectedHardware: fullProfile.hasConnectedHardware,
              });
              try {
                const userPayload = buildFirestoreUserPayload(
                  fullProfile,
                  user.uid,
                  user.email || fullProfile.email,
                  user.emailVerified
                );
                await setDoc(doc(firestore, 'users', user.uid), userPayload, { merge: true });
              } catch (userWriteErr) {
                console.warn('Could not sync user profile to users collection:', userWriteErr);
              }
              await applyAuthenticatedOrChallenge({
                user,
                userProfile: fullProfile,
                method: authMethod,
                storageMode: 'firebase',
              });
            } else {
              // Brand-new account ALWAYS starts at 0 connected hardware
              const defaultProfile = buildFullUserProfile(
                { hasConnectedHardware: false, isNewAccount: true },
                user,
                null
              );
              try {
                const factoryPayload = buildFirestoreFactoryPayload(
                  defaultProfile,
                  user.uid,
                  user.emailVerified
                );
                await setDoc(docRef, factoryPayload, { merge: true });

                const userPayload = buildFirestoreUserPayload(
                  defaultProfile,
                  user.uid,
                  user.email || defaultProfile.email,
                  user.emailVerified
                );
                await setDoc(doc(firestore, 'users', user.uid), userPayload, { merge: true });
              } catch (writeErr) {
                console.warn('Could not write factory profile to remote Firestore:', writeErr);
              }
              await applyAuthenticatedOrChallenge({
                user,
                userProfile: defaultProfile,
                method: authMethod,
                storageMode: 'firebase',
              });
            }
          } catch (fetchErr: unknown) {
            console.error('Error fetching factory profile:', fetchErr);
            setError(fetchErr instanceof Error ? fetchErr.message : 'Error fetching profile');
          }
        } else {
          // Check if an employee session or fallback local session is active
          try {
            const empRaw = localStorage.getItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
            const storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
            const storedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);
            if (empRaw) {
              const parsedEmp = JSON.parse(empRaw);
              const cachedMeta = parsedEmp?.empProfile?.factoryId
                ? readFactoryMetaCache(parsedEmp.empProfile.factoryId)
                : null;
              const hydratedProfile: UserProfile = {
                ...parsedEmp.empProfile,
                ...(cachedMeta?.factoryName ? { factoryName: cachedMeta.factoryName } : {}),
                ...(cachedMeta?.region ? { region: cachedMeta.region } : {}),
                ...(cachedMeta?.industrySector ? { industrySector: cachedMeta.industrySector } : {}),
                hasConnectedHardware:
                  Boolean(parsedEmp?.empProfile?.hasConnectedHardware) ||
                  Boolean(cachedMeta?.hasConnectedHardware),
              };
              await applyAuthenticatedOrChallenge({
                user: parsedEmp.mockUser,
                userProfile: hydratedProfile,
                method: 'employee',
                storageMode: 'employee',
                employeeSessionPayload: { mockUser: parsedEmp.mockUser, empProfile: hydratedProfile },
              });
            } else if (storedUser && storedProfile) {
              await applyAuthenticatedOrChallenge({
                user: JSON.parse(storedUser),
                userProfile: JSON.parse(storedProfile),
                method: 'password',
                storageMode: 'local',
              });
            } else {
              setInternalUser(null);
              setInternalProfile(null);
              setTwoFactorConfig(null);
              setPendingTwoFactor(null);
              setPendingAuthSnapshot(null);
            }
          } catch {
            setInternalUser(null);
            setInternalProfile(null);
            setTwoFactorConfig(null);
            setPendingTwoFactor(null);
            setPendingAuthSnapshot(null);
          }
        }
        setIsLoading(false);
      });

      return () => unsubscribe();
    } else {
      // Offline / No Firebase configured: check explicit saved session only; NEVER auto-load demo hardware
      (async () => {
        try {
          const empRaw = localStorage.getItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
          const storedUser = localStorage.getItem(LOCAL_STORAGE_USER_KEY);
          const storedProfile = localStorage.getItem(LOCAL_STORAGE_PROFILE_KEY);

          if (empRaw) {
            const parsedEmp = JSON.parse(empRaw);
            const cachedMeta = parsedEmp?.empProfile?.factoryId
              ? readFactoryMetaCache(parsedEmp.empProfile.factoryId)
              : null;
            const hydratedProfile: UserProfile = {
              ...parsedEmp.empProfile,
              ...(cachedMeta?.factoryName ? { factoryName: cachedMeta.factoryName } : {}),
              ...(cachedMeta?.region ? { region: cachedMeta.region } : {}),
              ...(cachedMeta?.industrySector ? { industrySector: cachedMeta.industrySector } : {}),
              hasConnectedHardware:
                Boolean(parsedEmp?.empProfile?.hasConnectedHardware) ||
                Boolean(cachedMeta?.hasConnectedHardware),
            };
            await applyAuthenticatedOrChallenge({
              user: parsedEmp.mockUser,
              userProfile: hydratedProfile,
              method: 'employee',
              storageMode: 'employee',
              employeeSessionPayload: { mockUser: parsedEmp.mockUser, empProfile: hydratedProfile },
            });
          } else if (storedUser && storedProfile) {
            await applyAuthenticatedOrChallenge({
              user: JSON.parse(storedUser),
              userProfile: JSON.parse(storedProfile),
              method: 'password',
              storageMode: 'local',
            });
          } else {
            setInternalUser(null);
            setInternalProfile(null);
          }
        } catch {
          setInternalUser(null);
          setInternalProfile(null);
        }
        setIsLoading(false);
      })();
    }
  }, [applyAuthenticatedOrChallenge]);

  const clearError = () => setError(null);

  const loginWithEmail = async (email: string, pass: string): Promise<LoginStepResult> => {
    setIsLoading(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const isAdminCreds =
      (normalizedEmail === 'bochaevmuhtarali@mail.ru' ||
        normalizedEmail === 'bochaevmuhtarali@gmail.com' ||
        normalizedEmail === 'muhtaraliboc@gmail.com') &&
      pass === 'Muha1122p';

    try {
      // Clear previous local/employee sessions & 2FA session verification before logging in
      clearSessionTwoFactorVerified();
      setPendingTwoFactor(null);
      setPendingAuthSnapshot(null);
      localStorage.removeItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);

      if (isFirebaseConfigured && auth) {
        try {
          const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
          const totpCfg = await fetchTwoFactorConfig(cred.user.uid, cred.user.email || email);
          return totpCfg?.enabled && totpCfg?.secret ? 'two_factor_required' : 'authenticated';
        } catch (fbErr: any) {
          // 1) Check if credentials match an auto-generated factory employee account
          const matchedEmp = findEmployeeByCredentials(email, pass);
          if (matchedEmp) {
            const factoryMeta = readFactoryMetaCache(matchedEmp.factoryId);
            const session = buildEmployeeSessionData(matchedEmp, factoryMeta);
            return await applyAuthenticatedOrChallenge({
              user: session.mockUser,
              userProfile: session.empProfile,
              method: 'employee',
              storageMode: 'employee',
              employeeSessionPayload: session,
            });
          }

          // 2) Admin credentials fallback
          if (
            isAdminCreds &&
            (fbErr?.code === 'auth/user-not-found' ||
              fbErr?.code === 'auth/invalid-credential' ||
              fbErr?.code === 'auth/wrong-password')
          ) {
            try {
              const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
              const totpCfg = await fetchTwoFactorConfig(cred.user.uid, cred.user.email || email);
              return totpCfg?.enabled && totpCfg?.secret ? 'two_factor_required' : 'authenticated';
            } catch {
              const adminUser = {
                uid: 'usr-admin-bochaev',
                email: normalizedEmail,
                emailVerified: true,
                displayName: 'Бочаев Мухтарали',
              } as unknown as FirebaseUser;
              const adminFactoryP: UserProfile = {
                userId: 'usr-admin-bochaev',
                email: normalizedEmail,
                factoryName: 'NeuroFactory AI — Центр системного администрирования',
                region: 'г. Астана',
                contactPerson: 'Бочаев Мухтарали',
                contactPhone: '+7 (777) 001-99-88',
                emailVerified: true,
                hasConnectedHardware: false,
                isNewAccount: true,
                role: 'admin',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              return await applyAuthenticatedOrChallenge({
                user: adminUser,
                userProfile: adminFactoryP,
                method: 'password',
                storageMode: 'local',
              });
            }
          }
          throw fbErr;
        }
      } else {
        // Local/offline auth mode: check employee directory first
        const matchedEmp = findEmployeeByCredentials(email, pass);
        if (matchedEmp) {
          const factoryMeta = readFactoryMetaCache(matchedEmp.factoryId);
          const session = buildEmployeeSessionData(matchedEmp, factoryMeta);
          return await applyAuthenticatedOrChallenge({
            user: session.mockUser,
            userProfile: session.empProfile,
            method: 'employee',
            storageMode: 'employee',
            employeeSessionPayload: session,
          });
        }

        const isAuthAdmin = isAdminCreds || normalizedEmail === 'bochaevmuhtarali@mail.ru';
        const mockUser = {
          uid: isAuthAdmin ? 'usr-admin-bochaev' : 'usr-' + Math.random().toString(36).substring(2, 9),
          email,
          emailVerified: true,
          displayName: isAuthAdmin ? 'Бочаев Мухтарали' : email.split('@')[0],
        } as unknown as FirebaseUser;

        const currentP: UserProfile = {
          userId: mockUser.uid,
          email,
          factoryName: isAuthAdmin
            ? 'NeuroFactory AI — Центр системного администрирования'
            : 'Промышленное предприятие',
          region: 'г. Тараз',
          emailVerified: true,
          hasConnectedHardware: false,
          isNewAccount: true,
          role: isAuthAdmin ? 'admin' : 'enterprise_user',
          updatedAt: new Date().toISOString(),
        };

        return await applyAuthenticatedOrChallenge({
          user: mockUser,
          userProfile: currentP,
          method: 'password',
          storageMode: 'local',
        });
      }
    } catch (err: unknown) {
      setError(formatAuthErrorMessage(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const registerWithEmail = async (
    email: string,
    pass: string,
    factoryName: string,
    region: string
  ) => {
    setIsLoading(true);
    setError(null);
    const normalizedEmail = email.trim().toLowerCase();
    const isAuthAdmin =
      normalizedEmail === 'bochaevmuhtarali@mail.ru' ||
      normalizedEmail === 'bochaevmuhtarali@gmail.com' ||
      normalizedEmail === 'muhtaraliboc@gmail.com';
    const isAdminCreds = isAuthAdmin && pass === 'Muha1122p';

    try {
      clearSessionTwoFactorVerified();
      setPendingTwoFactor(null);
      setPendingAuthSnapshot(null);
      localStorage.removeItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);

      if (isFirebaseConfigured && auth && db) {
        const firestore = db;
        let user: FirebaseUser;
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
          user = userCredential.user;
          try {
            await sendEmailVerification(user);
          } catch (verErr) {
            console.warn('Verification email deferred or failed:', verErr);
          }
        } catch (createErr: any) {
          if (createErr?.code === 'auth/email-already-in-use') {
            try {
              const signRes = await signInWithEmailAndPassword(auth, email.trim(), pass);
              user = signRes.user;
            } catch {
              if (isAdminCreds) {
                const adminUser = {
                  uid: 'usr-admin-bochaev',
                  email: normalizedEmail,
                  emailVerified: true,
                  displayName: 'Бочаев Мухтарали',
                } as unknown as FirebaseUser;
                const adminFactoryP: UserProfile = {
                  userId: 'usr-admin-bochaev',
                  email: normalizedEmail,
                  factoryName: factoryName || 'NeuroFactory AI — Центр системного администрирования',
                  region: region || 'г. Астана',
                  contactPerson: 'Бочаев Мухтарали',
                  contactPhone: '+7 (777) 001-99-88',
                  emailVerified: true,
                  hasConnectedHardware: false,
                  isNewAccount: true,
                  role: 'admin',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                };
                setInternalUser(adminUser);
                setInternalProfile(adminFactoryP);
                localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(adminUser));
                localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(adminFactoryP));
                return;
              }
              throw createErr;
            }
          } else {
            throw createErr;
          }
        }

        const effectiveFactoryName = (factoryName || '').trim() || 'Производственный комплекс';
        const effectiveRegion = (region || '').trim() || 'г. Тараз';

        const newProfile = buildFullUserProfile(
          {
            email: user.email || email,
            factoryName: effectiveFactoryName,
            region: effectiveRegion,
            hasConnectedHardware: false,
            isNewAccount: true,
          },
          user,
          null
        );

        try {
          const factoryPayload = buildFirestoreFactoryPayload(newProfile, user.uid, false);
          await setDoc(doc(firestore, 'factories', user.uid), factoryPayload, { merge: true });

          const userPayload = buildFirestoreUserPayload(newProfile, user.uid, user.email || email, false);
          await setDoc(doc(firestore, 'users', user.uid), userPayload, { merge: true });
        } catch (writeErr) {
          console.warn('Could not write to remote Firestore in register, saving locally:', writeErr);
        }

        saveFactoryMetaCache(user.uid, {
          factoryName: effectiveFactoryName,
          region: effectiveRegion,
          industrySector: newProfile.industrySector,
          hasConnectedHardware: false,
        });
        setInternalProfile(newProfile);
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
      } else {
        const mockUser = {
          uid: 'usr-' + Math.random().toString(36).substring(2, 9),
          email,
          emailVerified: false,
          displayName: email.split('@')[0],
        } as unknown as FirebaseUser;

        const effectiveFactoryName = (factoryName || '').trim() || 'Производственный комплекс';
        const effectiveRegion = (region || '').trim() || 'г. Тараз';

        const newProfile: UserProfile = {
          userId: mockUser.uid,
          email,
          factoryName: effectiveFactoryName,
          region: effectiveRegion,
          industrySector: 'Черная и цветная металлургия',
          emailVerified: false,
          hasConnectedHardware: false,
          isNewAccount: true,
          role: 'enterprise_user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        saveFactoryMetaCache(mockUser.uid, {
          factoryName: effectiveFactoryName,
          region: effectiveRegion,
          industrySector: newProfile.industrySector,
          hasConnectedHardware: false,
        });
        setInternalUser(mockUser);
        setInternalProfile(newProfile);
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(mockUser));
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(newProfile));
      }
    } catch (err: unknown) {
      setError(formatAuthErrorMessage(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const loginWithGoogle = async (): Promise<LoginStepResult> => {
    setIsLoading(true);
    setError(null);
    try {
      clearSessionTwoFactorVerified();
      setPendingTwoFactor(null);
      setPendingAuthSnapshot(null);
      localStorage.removeItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);

      if (isFirebaseConfigured && auth && db) {
        const firestore = db;
        const provider = new GoogleAuthProvider();
        const res = await signInWithPopup(auth, provider);
        const user = res.user;

        const docRef = doc(firestore, 'factories', user.uid);
        let snap;
        try {
          snap = await getDoc(docRef);
        } catch (err) {
          console.warn('Google auth factory fetch warning:', err);
        }

        let resolvedProfile: UserProfile;
        if (!snap || !snap.exists()) {
          resolvedProfile = buildFullUserProfile(
            {
              factoryName: user.displayName ? `Предприятие (${user.displayName})` : 'Производственный комплекс',
              region: 'г. Тараз',
              hasConnectedHardware: false,
              isNewAccount: true,
            },
            user,
            null
          );
          try {
            const payload = buildFirestoreFactoryPayload(resolvedProfile, user.uid, user.emailVerified);
            await setDoc(docRef, payload, { merge: true });

            const userPayload = buildFirestoreUserPayload(
              resolvedProfile,
              user.uid,
              user.email || '',
              user.emailVerified
            );
            await setDoc(doc(firestore, 'users', user.uid), userPayload, { merge: true });
          } catch (wErr) {
            console.warn('Could not write Google user profile to Firestore:', wErr);
          }
          saveFactoryMetaCache(user.uid, {
            factoryName: resolvedProfile.factoryName,
            region: resolvedProfile.region,
            industrySector: resolvedProfile.industrySector,
            hasConnectedHardware: resolvedProfile.hasConnectedHardware,
          });
        } else {
          resolvedProfile = buildFullUserProfile(snap.data(), user, null);
          saveFactoryMetaCache(user.uid, {
            factoryName: resolvedProfile.factoryName,
            region: resolvedProfile.region,
            industrySector: resolvedProfile.industrySector,
            hasConnectedHardware: resolvedProfile.hasConnectedHardware,
          });
        }

        return await applyAuthenticatedOrChallenge({
          user,
          userProfile: resolvedProfile,
          method: 'google',
          storageMode: 'firebase',
        });
      } else {
        const mockUser = {
          uid: 'google-usr-local',
          email: 'safety.lead@kazprom.kz',
          emailVerified: true,
          displayName: 'Даулет Касымов',
        } as unknown as FirebaseUser;

        const googleProfile: UserProfile = {
          userId: mockUser.uid,
          email: 'safety.lead@kazprom.kz',
          factoryName: 'Производственный комплекс',
          region: 'г. Тараз',
          industrySector: 'Черная и цветная металлургия',
          contactPerson: 'Даулет Касымов',
          contactPhone: '+7 (7182) 55-44-33',
          emailVerified: true,
          hasConnectedHardware: false,
          isNewAccount: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return await applyAuthenticatedOrChallenge({
          user: mockUser,
          userProfile: googleProfile,
          method: 'google',
          storageMode: 'local',
        });
      }
    } catch (err: unknown) {
      setError(formatAuthErrorMessage(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const sendPasswordReset = async (email: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (isFirebaseConfigured && auth) {
        await sendPasswordResetEmail(auth, email);
      } else {
        await new Promise((r) => setTimeout(r, 600));
      }
    } catch (err: unknown) {
      setError(formatAuthErrorMessage(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    try {
      if (isFirebaseConfigured && auth && auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
      } else {
        await new Promise((r) => setTimeout(r, 400));
        if (profile) {
          const updated = { ...profile, emailVerified: true };
          setInternalProfile(updated);
          localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(updated));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification email');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      clearSessionTwoFactorVerified();
      setPendingTwoFactor(null);
      setPendingAuthSnapshot(null);
      setTwoFactorConfig(null);
      localStorage.removeItem(LOCAL_STORAGE_USER_KEY);
      localStorage.removeItem(LOCAL_STORAGE_PROFILE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_EMPLOYEE_SESSION_KEY);
      if (isFirebaseConfigured && auth && auth.currentUser) {
        await firebaseSignOut(auth);
      }
      setInternalUser(null);
      setInternalProfile(null);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyPendingTwoFactor = async (code: string) => {
    if (!pendingTwoFactor) return;
    setError(null);
    const isKz = (localStorage.getItem('neurofactory_lang') || 'ru') === 'kz';
    const result = await verifyTwoFactorInput(
      pendingTwoFactor.config,
      code,
      pendingTwoFactor.email
    );
    if (!result.valid) {
      const msg = isKz
        ? 'Google Authenticator коды қате. Қосымшадағы 6 таңбалы кодты немесе резервтік кодты тексеріңіз.'
        : 'Неверный код Google Authenticator. Проверьте 6-значный код в приложении (или резервный код) и время на устройстве.';
      setError(msg);
      throw new Error(msg);
    }

    markSessionTwoFactorVerified(pendingTwoFactor.uid);
    if (result.updatedConfig) {
      setTwoFactorConfig(result.updatedConfig);
    }

    if (pendingAuthSnapshot) {
      const { user, profile: snapProfile, storageMode, employeeSessionPayload } = pendingAuthSnapshot;
      setInternalUser(user);
      setInternalProfile(snapProfile);
      if (storageMode === 'employee' && employeeSessionPayload) {
        localStorage.setItem(
          LOCAL_STORAGE_EMPLOYEE_SESSION_KEY,
          JSON.stringify(employeeSessionPayload)
        );
        localStorage.setItem(
          LOCAL_STORAGE_PROFILE_KEY,
          JSON.stringify(employeeSessionPayload.empProfile)
        );
      } else if (storageMode === 'local') {
        localStorage.setItem(LOCAL_STORAGE_USER_KEY, JSON.stringify(user));
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(snapProfile));
      } else {
        localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(snapProfile));
      }
    }

    setPendingTwoFactor(null);
    setPendingAuthSnapshot(null);
  };

  const cancelPendingTwoFactor = async () => {
    setError(null);
    await logout();
  };

  const enableTwoFactor = async (params: {
    secret: string;
    recoveryCodes: string[];
  }): Promise<TwoFactorConfig> => {
    const activeUid = internalUser?.uid || profile?.userId;
    if (!activeUid) {
      throw new Error('Требуется авторизация для настройки 2FA');
    }
    const activeEmail = internalUser?.email || profile?.email || 'user@neurofactory.kz';
    const saved = await saveTwoFactorConfig(
      {
        userId: activeUid,
        enabled: true,
        secret: params.secret,
        issuer: 'NeuroFactory AI',
        accountLabel: activeEmail,
        recoveryCodes: params.recoveryCodes,
        enabledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeEmail
    );
    setTwoFactorConfig(saved);
    markSessionTwoFactorVerified(activeUid);

    if (adminProfile) {
      const updatedAdmin = {
        ...adminProfile,
        twoFactorEnabled: true,
        updatedAt: new Date().toISOString(),
      };
      setAdminProfile(updatedAdmin);
      localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, JSON.stringify(updatedAdmin));
    }
    return saved;
  };

  const disableTwoFactor = async (code: string) => {
    const activeUid = internalUser?.uid || profile?.userId;
    if (!activeUid || !twoFactorConfig) return;
    const isKz = (localStorage.getItem('neurofactory_lang') || 'ru') === 'kz';

    const check = await verifyTwoFactorInput(
      twoFactorConfig,
      code,
      internalUser?.email || profile?.email
    );
    if (!check.valid) {
      throw new Error(
        isKz
          ? 'Өшіру үшін Google Authenticator-дағы ағымдағы 6 таңбалы кодты енгізіңіз.'
          : 'Для отключения 2FA введите действующий 6-значный код из Google Authenticator.'
      );
    }

    await disableTwoFactorConfig(activeUid, internalUser?.email || profile?.email);
    setTwoFactorConfig(null);
    if (adminProfile) {
      const updatedAdmin = {
        ...adminProfile,
        twoFactorEnabled: false,
        updatedAt: new Date().toISOString(),
      };
      setAdminProfile(updatedAdmin);
      localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, JSON.stringify(updatedAdmin));
    }
  };

  const isWorker = profile?.employeeRole === 'worker';
  const isSpecialist = profile?.employeeRole === 'specialist';

  const saveFactoryProfile = async (updatedData: Partial<UserProfile>) => {
    if (isWorker) {
      throw new Error('Обычный рабочий не имеет прав на изменение профиля предприятия.');
    }
    setIsLoading(true);
    setError(null);
    try {
      const targetFactoryId = profile?.factoryId || currentUser?.uid || profile?.userId || 'usr-local';
      const activeUid = currentUser?.uid || profile?.userId || 'usr-local';
      const merged: UserProfile = {
        ...(profile || DEFAULT_NEW_PROFILE_TEMPLATE),
        ...updatedData,
        userId: activeUid,
        updatedAt: new Date().toISOString(),
      };

      saveFactoryMetaCache(targetFactoryId, {
        factoryName: merged.factoryName,
        region: merged.region,
        industrySector: merged.industrySector,
        hasConnectedHardware: merged.hasConnectedHardware,
      });

      if (isFirebaseConfigured && db && currentUser && auth?.currentUser) {
        const firestore = db;
        try {
          const factoryPayload = buildFirestoreFactoryPayload(
            merged,
            targetFactoryId,
            currentUser.emailVerified
          );
          await setDoc(doc(firestore, 'factories', targetFactoryId), factoryPayload, { merge: true });

          const userPayload = buildFirestoreUserPayload(
            merged,
            currentUser.uid,
            currentUser.email || merged.email,
            currentUser.emailVerified
          );
          await setDoc(doc(firestore, 'users', currentUser.uid), userPayload, { merge: true });
        } catch (err) {
          console.warn('Firestore remote update warning (stored in local cache):', err);
        }
      }

      localStorage.setItem(LOCAL_STORAGE_PROFILE_KEY, JSON.stringify(merged));
      setInternalProfile(merged);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save factory profile');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateAdminProfile = async (updated: Partial<AdminProfile>) => {
    setIsLoading(true);
    try {
      const merged: AdminProfile = {
        ...(adminProfile || DEFAULT_ADMIN_PROFILE),
        ...updated,
        updatedAt: new Date().toISOString(),
      };
      setAdminProfile(merged);
      localStorage.setItem(LOCAL_STORAGE_ADMIN_KEY, JSON.stringify(merged));

      if (isFirebaseConfigured && db && currentUser && auth?.currentUser) {
        try {
          await setDoc(doc(db, 'admins', currentUser.uid), merged, { merge: true });
        } catch (err) {
          console.warn('Could not persist admin profile to Firestore:', err);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const setHardwareConnectedState = async (connected: boolean) => {
    if (!profile || isWorker) return;
    const updated = {
      ...profile,
      hasConnectedHardware: connected,
      isNewAccount: !connected,
    };
    await saveFactoryProfile(updated);
  };

  const addEmployee = async (params: {
    fullName: string;
    specialty: string;
    roleType: EmployeeRoleType;
    department?: string;
  }): Promise<FactoryEmployee> => {
    if (isWorker) {
      throw new Error('Недостаточно прав для добавления сотрудников.');
    }
    const created = await createFactoryEmployee({
      factoryId: effectiveFactoryId,
      factoryName: profile?.factoryName || 'Производственный комплекс',
      region: profile?.region || 'г. Тараз',
      ...params,
    });
    setEmployees((prev) => [created, ...prev]);
    return created;
  };

  const removeEmployee = async (employeeId: string, authUid?: string) => {
    if (isWorker) return;
    const next = await deleteFactoryEmployee(effectiveFactoryId, employeeId, authUid);
    setEmployees(next);
  };

  const toggleAdminMode = () => {
    setIsAdminModeForced((prev) => !prev);
  };

  const isAdmin = Boolean(
    currentUser &&
      !isWorker &&
      !isSpecialist &&
      (currentUser.email?.toLowerCase() === 'bochaevmuhtarali@mail.ru' ||
        currentUser.email?.toLowerCase() === 'bochaevmuhtarali@gmail.com' ||
        currentUser.email?.toLowerCase() === 'muhtaraliboc@gmail.com' ||
        profile?.email?.toLowerCase() === 'bochaevmuhtarali@mail.ru' ||
        profile?.email?.toLowerCase() === 'bochaevmuhtarali@gmail.com' ||
        profile?.email?.toLowerCase() === 'muhtaraliboc@gmail.com' ||
        profile?.role === 'admin' ||
        profile?.isAdmin ||
        isAdminModeForced)
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        profile,
        adminProfile,
        isAdmin,
        isWorker,
        isSpecialist,
        effectiveFactoryId,
        employees,
        isLoading,
        isFirebaseReady: isFirebaseConfigured,
        error,
        twoFactorConfig,
        twoFactorEnabled,
        pendingTwoFactor,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        verifyPendingTwoFactor,
        cancelPendingTwoFactor,
        enableTwoFactor,
        disableTwoFactor,
        sendPasswordReset,
        resendVerificationEmail,
        logout,
        saveFactoryProfile,
        updateAdminProfile,
        setHardwareConnectedState,
        addEmployee,
        removeEmployee,
        refreshEmployees,
        toggleAdminMode,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
