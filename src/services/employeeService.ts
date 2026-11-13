import { initializeApp, getApps, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  db,
  auth,
  isFirebaseConfigured,
  DEFAULT_FIREBASE_CONFIG,
  handleFirestoreError,
  OperationType,
} from './firebase';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { EmployeeRoleType, FactoryEmployee, ViolationNotification } from '../types';

const EMPLOYEES_KEY_PREFIX = 'neurofactory_employees_';
const STAFF_DIRECTORY_KEY = 'neurofactory_staff_directory';
const NOTIFICATIONS_KEY_PREFIX = 'neurofactory_notifications_';

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', і: 'i', к: 'k', қ: 'q', л: 'l',
  м: 'm', н: 'n', ң: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ұ: 'u', ү: 'u', ф: 'f', х: 'h', һ: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ә: 'a',
};

export function transliterateToLatin(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT_MAP[ch] !== undefined ? TRANSLIT_MAP[ch] : ch))
    .join('')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '.');
}

export function generateEmployeeCredentials(
  fullName: string,
  existingEmails: string[] = []
): { email: string; password: string } {
  const slugBase = transliterateToLatin(fullName).replace(/\.+/g, '.').replace(/^\.+|\.+$/g, '') || 'staff';
  const normalizedExisting = new Set(existingEmails.map((e) => e.trim().toLowerCase()));

  let email = '';
  for (let i = 0; i < 15; i++) {
    const suffix = Math.floor(100 + Math.random() * 900);
    const candidate = `${slugBase}.${suffix}@neurofactory.kz`;
    if (!normalizedExisting.has(candidate)) {
      email = candidate;
      break;
    }
  }
  if (!email) {
    email = `${slugBase}.${Date.now().toString(36).slice(-4)}@neurofactory.kz`;
  }

  const digits = Math.floor(1000 + Math.random() * 9000);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const c1 = letters[Math.floor(Math.random() * letters.length)];
  const c2 = letters[Math.floor(Math.random() * letters.length)];
  const password = `NF-${digits}-${c1}${c2}`;

  return { email, password };
}

function readLocalEmployees(factoryId: string): FactoryEmployee[] {
  try {
    const raw = localStorage.getItem(`${EMPLOYEES_KEY_PREFIX}${factoryId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalEmployees(factoryId: string, list: FactoryEmployee[]): void {
  try {
    localStorage.setItem(`${EMPLOYEES_KEY_PREFIX}${factoryId}`, JSON.stringify(list));
    // Also maintain global staff lookup directory for email/password sign-in
    const rawDir = localStorage.getItem(STAFF_DIRECTORY_KEY);
    const dir: FactoryEmployee[] = rawDir ? JSON.parse(rawDir) : [];
    const filteredDir = dir.filter((e) => e.factoryId !== factoryId);
    localStorage.setItem(STAFF_DIRECTORY_KEY, JSON.stringify([...list, ...filteredDir]));
  } catch (err) {
    console.warn('Error saving employees locally:', err);
  }
}

export function findEmployeeByCredentials(email: string, password: string): FactoryEmployee | null {
  const targetEmail = email.trim().toLowerCase();
  try {
    const rawDir = localStorage.getItem(STAFF_DIRECTORY_KEY);
    if (rawDir) {
      const dir: FactoryEmployee[] = JSON.parse(rawDir);
      const found = dir.find(
        (e) => e.email.trim().toLowerCase() === targetEmail && e.password === password
      );
      if (found) return found;
    }
    // Scan per-factory employee keys as fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(EMPLOYEES_KEY_PREFIX)) {
        const list: FactoryEmployee[] = JSON.parse(localStorage.getItem(key) || '[]');
        const found = list.find(
          (e) => e.email.trim().toLowerCase() === targetEmail && e.password === password
        );
        if (found) return found;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function fetchStaffLinkByUid(uid: string): Promise<{
  factoryId: string;
  employeeId: string;
  roleType: EmployeeRoleType;
  specialty: string;
  fullName: string;
  email: string;
  factoryName?: string;
  region?: string;
  createdAt?: string;
} | null> {
  if (!isFirebaseConfigured || !db) return null;
  try {
    const snap = await getDoc(doc(db, 'staff_links', uid));
    if (snap.exists()) {
      return snap.data() as any;
    }
  } catch (err) {
    console.warn('fetchStaffLinkByUid skipped:', err);
  }
  return null;
}

async function provisionEmployeeFirebaseAuth(email: string, password: string): Promise<string | undefined> {
  if (!isFirebaseConfigured) return undefined;
  const appName = `staffProvisioner_${Date.now()}`;
  let secApp: ReturnType<typeof initializeApp> | null = null;
  try {
    const existingApp = getApps().find((a) => a.name === 'staffProvisioner');
    const cfg = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig?.apiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseAppletConfig?.authDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseAppletConfig?.projectId || DEFAULT_FIREBASE_CONFIG.projectId,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseAppletConfig?.storageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig?.messagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig?.appId || DEFAULT_FIREBASE_CONFIG.appId,
    };
    secApp = existingApp || initializeApp(cfg, appName);
    const secAuth = getAuth(secApp);
    const cred = await createUserWithEmailAndPassword(secAuth, email, password);
    const uid = cred.user.uid;
    await firebaseSignOut(secAuth);
    return uid;
  } catch (err) {
    console.warn('Secondary Auth provisioning fallback (using local/directory login):', err);
    return undefined;
  } finally {
    if (secApp && secApp.name !== '[DEFAULT]') {
      try {
        await deleteApp(secApp);
      } catch {
        // ignore
      }
    }
  }
}

export async function fetchFactoryEmployees(factoryId: string): Promise<FactoryEmployee[]> {
  const local = readLocalEmployees(factoryId);
  if (!isFirebaseConfigured || !db || !auth?.currentUser) {
    return local;
  }
  try {
    const empCol = collection(db, 'factories', factoryId, 'employees');
    const q = query(empCol, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const remote: FactoryEmployee[] = [];
    snap.forEach((d) => {
      remote.push({ ...(d.data() as FactoryEmployee), id: d.id });
    });

    const mergedMap = new Map<string, FactoryEmployee>();
    for (const item of [...remote, ...local]) {
      if (!mergedMap.has(item.id)) {
        mergedMap.set(item.id, item);
      }
    }
    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    saveLocalEmployees(factoryId, merged);
    return merged;
  } catch (err) {
    console.warn('Firestore fetchFactoryEmployees fallback to local cache:', err);
    return local;
  }
}

export async function createFactoryEmployee(params: {
  factoryId: string;
  factoryName: string;
  region: string;
  fullName: string;
  specialty: string;
  roleType: EmployeeRoleType;
  department?: string;
}): Promise<FactoryEmployee> {
  const existing = readLocalEmployees(params.factoryId);
  const { email, password } = generateEmployeeCredentials(
    params.fullName,
    existing.map((e) => e.email)
  );

  const authUid = await provisionEmployeeFirebaseAuth(email, password);
  const empId = 'emp-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

  const employee: FactoryEmployee = {
    id: empId,
    factoryId: params.factoryId,
    fullName: params.fullName.trim(),
    specialty: params.specialty.trim(),
    roleType: params.roleType,
    department: params.department?.trim() || 'Основное производство',
    email,
    password,
    ...(authUid ? { authUid } : {}),
    createdAt: new Date().toISOString(),
  };

  const next = [employee, ...existing];
  saveLocalEmployees(params.factoryId, next);

  if (isFirebaseConfigured && db && auth?.currentUser) {
    const empPath = `factories/${params.factoryId}/employees/${empId}`;
    try {
      await setDoc(doc(db, 'factories', params.factoryId, 'employees', empId), employee);
    } catch (err) {
      console.warn('Firestore employee write fallback:', err);
      if (String(err).includes('Missing or insufficient permissions')) {
        try {
          handleFirestoreError(err, OperationType.CREATE, empPath, auth);
        } catch {
          // keep local copy working smoothly
        }
      }
    }

    if (authUid) {
      const linkPath = `staff_links/${authUid}`;
      try {
        await setDoc(doc(db, 'staff_links', authUid), {
          uid: authUid,
          factoryId: params.factoryId,
          employeeId: empId,
          roleType: employee.roleType,
          specialty: employee.specialty,
          fullName: employee.fullName,
          email: employee.email,
          factoryName: params.factoryName,
          region: params.region,
          createdAt: employee.createdAt,
        });
      } catch (err) {
        console.warn('Firestore staff_link write fallback:', err);
        if (String(err).includes('Missing or insufficient permissions')) {
          try {
            handleFirestoreError(err, OperationType.CREATE, linkPath, auth);
          } catch {
            // keep local copy
          }
        }
      }
    }
  }

  return employee;
}

export async function deleteFactoryEmployee(
  factoryId: string,
  employeeId: string,
  authUid?: string
): Promise<FactoryEmployee[]> {
  const existing = readLocalEmployees(factoryId);
  const next = existing.filter((e) => e.id !== employeeId);
  saveLocalEmployees(factoryId, next);

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await deleteDoc(doc(db, 'factories', factoryId, 'employees', employeeId));
      if (authUid) {
        await deleteDoc(doc(db, 'staff_links', authUid));
      }
    } catch (err) {
      console.warn('Firestore deleteFactoryEmployee warning:', err);
    }
  }
  return next;
}

// Specialist Violation Notifications
export function readLocalNotifications(factoryId: string): ViolationNotification[] {
  try {
    const raw = localStorage.getItem(`${NOTIFICATIONS_KEY_PREFIX}${factoryId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalNotifications(factoryId: string, list: ViolationNotification[]): void {
  try {
    localStorage.setItem(`${NOTIFICATIONS_KEY_PREFIX}${factoryId}`, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export async function fetchFactoryNotifications(factoryId: string): Promise<ViolationNotification[]> {
  const local = readLocalNotifications(factoryId);
  if (!isFirebaseConfigured || !db || !auth?.currentUser) {
    return local;
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'factories', factoryId, 'notifications'), orderBy('timestamp', 'desc'))
    );
    const remote: ViolationNotification[] = [];
    snap.forEach((d) => {
      remote.push({ ...(d.data() as ViolationNotification), id: d.id });
    });
    const mergedMap = new Map<string, ViolationNotification>();
    for (const item of [...remote, ...local]) {
      if (!mergedMap.has(item.id)) mergedMap.set(item.id, item);
    }
    const merged = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    saveLocalNotifications(factoryId, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function createFactoryNotification(
  factoryId: string,
  notif: Omit<ViolationNotification, 'id' | 'factoryId' | 'read'>
): Promise<ViolationNotification> {
  const newNotif: ViolationNotification = {
    ...notif,
    id: 'notif-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 5),
    factoryId,
    read: false,
  };
  const existing = readLocalNotifications(factoryId);
  const next = [newNotif, ...existing].slice(0, 100);
  saveLocalNotifications(factoryId, next);

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await setDoc(doc(db, 'factories', factoryId, 'notifications', newNotif.id), newNotif);
    } catch (err) {
      console.warn('Firestore notification write warning:', err);
    }
  }
  return newNotif;
}

export async function markFactoryNotificationRead(
  factoryId: string,
  notifId: string
): Promise<ViolationNotification[]> {
  const existing = readLocalNotifications(factoryId);
  const next = existing.map((n) => (n.id === notifId ? { ...n, read: true } : n));
  saveLocalNotifications(factoryId, next);

  if (isFirebaseConfigured && db && auth?.currentUser) {
    try {
      await setDoc(
        doc(db, 'factories', factoryId, 'notifications', notifId),
        { read: true },
        { merge: true }
      );
    } catch {
      // ignore
    }
  }
  return next;
}

export async function markAllFactoryNotificationsRead(
  factoryId: string
): Promise<ViolationNotification[]> {
  const existing = readLocalNotifications(factoryId);
  const next = existing.map((n) => ({ ...n, read: true }));
  saveLocalNotifications(factoryId, next);

  if (isFirebaseConfigured && db && auth?.currentUser) {
    for (const n of existing.filter((x) => !x.read)) {
      try {
        await setDoc(
          doc(db, 'factories', factoryId, 'notifications', n.id),
          { read: true },
          { merge: true }
        );
      } catch {
        // ignore
      }
    }
  }
  return next;
}
