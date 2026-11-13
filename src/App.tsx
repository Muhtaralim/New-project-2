import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { OverviewView } from './components/OverviewView';
import { SafeVisionView } from './components/SafeVisionView';
import { EcoPredictView } from './components/EcoPredictView';
import { FailPredictView } from './components/FailPredictView';
import { AuthModal } from './components/AuthModal';
import { ProfileModal } from './components/ProfileModal';
import { AdminProfileModal } from './components/AdminProfileModal';
import { SupportTicketModal } from './components/SupportTicketModal';
import { ChatDrawer } from './components/ChatDrawer';
import { HardwareConnectModal } from './components/HardwareConnectModal';
import { ComplianceReportModal } from './components/ComplianceReportModal';
import { IndustrialSplashLoader } from './components/IndustrialSplashLoader';
import { ScrollController } from './components/ScrollController';
import { CompanyLogo } from './components/CompanyLogo';
import { fetchTickets } from './services/supportService';
import {
  fetchFactoryNotifications,
  createFactoryNotification,
  markFactoryNotificationRead,
  markAllFactoryNotificationsRead,
} from './services/employeeService';
import { db, auth, isFirebaseConfigured } from './services/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { playPingSound } from './utils/industrialAudio';
import {
  Language,
  PPEViolation,
  EcoSensor,
  EcoReadingEvent,
  EcoChartPoint,
  IndustrialMachine,
  IndustrialCamera,
  ViolationNotification,
  VerificationStatus,
} from './types';
import { LifeBuoy, Bell } from 'lucide-react';

interface PlantBroadcastAlert {
  id: string;
  message: string;
  category: 'safety' | 'eco' | 'maintenance' | 'general';
  target: string;
  timestamp: string;
  sender: string;
}

interface PersistedPlantState {
  cameras: IndustrialCamera[];
  violations: PPEViolation[];
  ecoSensors: EcoSensor[];
  ecoReadings: EcoReadingEvent[];
  ecoChartData: EcoChartPoint[];
  machines: IndustrialMachine[];
  updatedAt?: string;
}

const PLANT_STATE_KEY_PREFIX = 'neurofactory_plant_state_';

const EMPTY_PLANT_STATE: PersistedPlantState = {
  cameras: [],
  violations: [],
  ecoSensors: [],
  ecoReadings: [],
  ecoChartData: [],
  machines: [],
};

function readLocalPlantState(factoryId: string): PersistedPlantState {
  if (!factoryId || factoryId === 'guest-zero-plant') {
    return { ...EMPTY_PLANT_STATE };
  }
  try {
    const raw = localStorage.getItem(`${PLANT_STATE_KEY_PREFIX}${factoryId}`);
    if (!raw) return { ...EMPTY_PLANT_STATE };
    const parsed = JSON.parse(raw);
    return {
      cameras: Array.isArray(parsed.cameras) ? parsed.cameras : [],
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
      ecoSensors: Array.isArray(parsed.ecoSensors) ? parsed.ecoSensors : [],
      ecoReadings: Array.isArray(parsed.ecoReadings) ? parsed.ecoReadings : [],
      ecoChartData: Array.isArray(parsed.ecoChartData) ? parsed.ecoChartData : [],
      machines: Array.isArray(parsed.machines) ? parsed.machines : [],
    };
  } catch {
    return { ...EMPTY_PLANT_STATE };
  }
}

function saveLocalPlantState(factoryId: string, state: PersistedPlantState): void {
  if (!factoryId || factoryId === 'guest-zero-plant') return;
  try {
    localStorage.setItem(
      `${PLANT_STATE_KEY_PREFIX}${factoryId}`,
      JSON.stringify({ ...state, updatedAt: new Date().toISOString() })
    );
  } catch (err) {
    console.warn('Could not persist local plant state:', err);
  }
}

function buildBaselineChartData(sensor?: EcoSensor): EcoChartPoint[] {
  const now = Date.now();
  const baseSO2 = sensor?.code === 'SO2' ? sensor.currentValue : 0.16;
  const baseCO = sensor?.code === 'CO' ? sensor.currentValue : 1.8;
  const baseNO2 = sensor?.code === 'NO2' ? sensor.currentValue : 0.08;
  const basePM = sensor?.code === 'PM2_5' ? sensor.currentValue : 0.06;

  return [-5, -4, -3, -2, -1, 0].map((offsetHours, idx) => {
    const ts = now + offsetHours * 3600 * 1000;
    const jitter = (idx % 2 === 0 ? 1 : -1) * 0.01;
    const timeLabel = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      time: timeLabel,
      timestamp: ts,
      CO: Number(Math.max(0.2, baseCO + jitter * 4).toFixed(2)),
      NO2: Number(Math.max(0.01, baseNO2 + jitter * 0.4).toFixed(3)),
      SO2: Number(Math.max(0.02, baseSO2 + jitter).toFixed(3)),
      PM2_5: Number(Math.max(0.01, basePM + jitter * 0.3).toFixed(3)),
    };
  });
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

function MainApp() {
  const {
    currentUser,
    profile,
    isAdmin,
    isWorker,
    effectiveFactoryId,
    employees,
    setHardwareConnectedState,
  } = useAuth();

  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('neurofactory_lang') as Language) || 'ru';
  });

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('neurofactory_lang', lang);
  };

  const [currentTab, setCurrentTab] = useState<string>('overview');
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isProfileOpen, setIsProfileOpen] = useState<boolean>(false);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminModalInitialTab, setAdminModalInitialTab] = useState<'general' | 'telemetry' | 'system' | 'audit' | 'tickets'>('general');
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [openTicketsCount, setOpenTicketsCount] = useState<number>(0);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(false);

  const [connectModalState, setConnectModalState] = useState<{
    open: boolean;
    type: 'camera' | 'sensor' | 'machine';
  }>({ open: false, type: 'camera' });

  const openHardwareConnect = (type: 'camera' | 'sensor' | 'machine') => {
    if (isWorker) return;
    setConnectModalState({ open: true, type });
  };

  const refreshTicketsCount = useCallback(async () => {
    if (!currentUser || !isAdmin) {
      setOpenTicketsCount(0);
      return;
    }
    try {
      const list = await fetchTickets(currentUser.email, currentUser.uid, true);
      const openCount = list.filter((t) => t.status === 'open').length;
      setOpenTicketsCount(openCount);
    } catch (e) {
      console.warn('Error refreshing tickets count:', e);
    }
  }, [currentUser, isAdmin]);

  useEffect(() => {
    refreshTicketsCount();
    const interval = setInterval(refreshTicketsCount, 30000);
    return () => clearInterval(interval);
  }, [refreshTicketsCount]);

  // Real-Time Plant Emergency & Safety Broadcast Listener
  const [activeBroadcast, setActiveBroadcast] = useState<PlantBroadcastAlert | null>(() => {
    try {
      const raw = localStorage.getItem('neurofactory_active_broadcast');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handleBroadcastEvent = (e: CustomEvent<PlantBroadcastAlert>) => {
      if (e.detail) {
        setActiveBroadcast(e.detail);
      }
    };
    window.addEventListener('neurofactory-broadcast', handleBroadcastEvent as EventListener);
    return () => window.removeEventListener('neurofactory-broadcast', handleBroadcastEvent as EventListener);
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  // Every new or guest account strictly initializes with 0 devices & 0 events
  const [cameras, setCameras] = useState<IndustrialCamera[]>(() =>
    readLocalPlantState(effectiveFactoryId).cameras
  );
  const [violations, setViolations] = useState<PPEViolation[]>(() =>
    readLocalPlantState(effectiveFactoryId).violations
  );
  const [ecoSensors, setEcoSensors] = useState<EcoSensor[]>(() =>
    readLocalPlantState(effectiveFactoryId).ecoSensors
  );
  const [ecoReadings, setEcoReadings] = useState<EcoReadingEvent[]>(() =>
    readLocalPlantState(effectiveFactoryId).ecoReadings
  );
  const [ecoChartData, setEcoChartData] = useState<EcoChartPoint[]>(() =>
    readLocalPlantState(effectiveFactoryId).ecoChartData
  );
  const [machines, setMachines] = useState<IndustrialMachine[]>(() =>
    readLocalPlantState(effectiveFactoryId).machines
  );

  // Specialist violation notifications
  const [notifications, setNotifications] = useState<ViolationNotification[]>([]);

  const isLoadingFactoryStateRef = useRef<boolean>(false);

  // Load factory hardware state + notifications whenever account/factory changes
  useEffect(() => {
    let isMounted = true;
    isLoadingFactoryStateRef.current = true;

    const loadForFactory = async () => {
      if (!effectiveFactoryId || effectiveFactoryId === 'guest-zero' || effectiveFactoryId === 'guest-zero-plant') {
        setCameras([]);
        setViolations([]);
        setEcoSensors([]);
        setEcoReadings([]);
        setEcoChartData([]);
        setMachines([]);
        setNotifications([]);
        isLoadingFactoryStateRef.current = false;
        return;
      }

      const localState = readLocalPlantState(effectiveFactoryId);
      if (isMounted) {
        setCameras(localState.cameras);
        setViolations(localState.violations);
        setEcoSensors(localState.ecoSensors);
        setEcoReadings(localState.ecoReadings);
        setEcoChartData(localState.ecoChartData);
        setMachines(localState.machines);
      }

      if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
          const hwSnap = await getDoc(doc(db, 'factories', effectiveFactoryId, 'hardware', 'state'));
          if (hwSnap.exists() && isMounted) {
            const remote = hwSnap.data() as PersistedPlantState;
            const hasLocal =
              localState.cameras.length > 0 ||
              localState.ecoSensors.length > 0 ||
              localState.machines.length > 0;
            if (!hasLocal || (remote.cameras?.length || remote.ecoSensors?.length || remote.machines?.length)) {
              const merged: PersistedPlantState = {
                cameras: Array.isArray(remote.cameras) ? remote.cameras : localState.cameras,
                violations: Array.isArray(remote.violations) ? remote.violations : localState.violations,
                ecoSensors: Array.isArray(remote.ecoSensors) ? remote.ecoSensors : localState.ecoSensors,
                ecoReadings: Array.isArray(remote.ecoReadings) ? remote.ecoReadings : localState.ecoReadings,
                ecoChartData: Array.isArray(remote.ecoChartData) ? remote.ecoChartData : localState.ecoChartData,
                machines: Array.isArray(remote.machines) ? remote.machines : localState.machines,
              };
              setCameras(merged.cameras);
              setViolations(merged.violations);
              setEcoSensors(merged.ecoSensors);
              setEcoReadings(merged.ecoReadings);
              setEcoChartData(merged.ecoChartData);
              setMachines(merged.machines);
              saveLocalPlantState(effectiveFactoryId, merged);
            }
          }
        } catch (err) {
          console.warn('Firestore hardware state load fallback to local:', err);
        }
      }

      try {
        const notifs = await fetchFactoryNotifications(effectiveFactoryId);
        if (isMounted) {
          setNotifications(notifs);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) {
          isLoadingFactoryStateRef.current = false;
        }
      }
    };

    loadForFactory();

    return () => {
      isMounted = false;
    };
  }, [effectiveFactoryId]);

  // Persist hardware & telemetry changes per factory
  useEffect(() => {
    if (isLoadingFactoryStateRef.current) return;
    if (!effectiveFactoryId || effectiveFactoryId === 'guest-zero' || effectiveFactoryId === 'guest-zero-plant') return;

    const snapshot: PersistedPlantState = {
      cameras,
      violations,
      ecoSensors,
      ecoReadings,
      ecoChartData,
      machines,
      updatedAt: new Date().toISOString(),
    };
    saveLocalPlantState(effectiveFactoryId, snapshot);

    if (isFirebaseConfigured && db && auth?.currentUser) {
      setDoc(doc(db, 'factories', effectiveFactoryId, 'hardware', 'state'), snapshot).catch((err) => {
        console.warn('Firestore hardware state sync warning:', err);
      });
    }
  }, [effectiveFactoryId, cameras, violations, ecoSensors, ecoReadings, ecoChartData, machines]);

  const hasAnyHardware = cameras.length > 0 || ecoSensors.length > 0 || machines.length > 0;

  const handleResetToZero = async () => {
    if (isWorker) return;
    setCameras([]);
    setViolations([]);
    setEcoSensors([]);
    setEcoReadings([]);
    setEcoChartData([]);
    setMachines([]);
    await setHardwareConnectedState(false);
  };

  // Add / Delete Cameras
  const handleAddCamera = (newCam: IndustrialCamera) => {
    if (isWorker) return;
    setCameras((prev) => [newCam, ...prev]);
    setHardwareConnectedState(true);
  };

  const handleDeleteCamera = (id: string) => {
    if (isWorker) return;
    setCameras((prev) => {
      const next = prev.filter((c) => c.id !== id);
      const stillHasDevices = next.length > 0 || ecoSensors.length > 0 || machines.length > 0;
      if (!stillHasDevices) {
        setHardwareConnectedState(false);
      }
      return next;
    });
  };

  // Add / Delete Eco Sensors
  const handleAddSensor = (newSensor: EcoSensor) => {
    if (isWorker) return;
    setEcoSensors((prev) => [newSensor, ...prev]);
    setEcoChartData((prev) => (prev.length === 0 ? buildBaselineChartData(newSensor) : prev));
    setHardwareConnectedState(true);
  };

  const handleDeleteSensor = (id: string) => {
    if (isWorker) return;
    setEcoSensors((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        setEcoChartData([]);
      }
      const stillHasDevices = cameras.length > 0 || next.length > 0 || machines.length > 0;
      if (!stillHasDevices) {
        setHardwareConnectedState(false);
      }
      return next;
    });
  };

  // Add / Delete FailPredict Machines
  const handleAddMachine = (newMach: IndustrialMachine) => {
    if (isWorker) return;
    setMachines((prev) => [newMach, ...prev]);
    setHardwareConnectedState(true);
  };

  const handleDeleteMachine = (id: string) => {
    if (isWorker) return;
    setMachines((prev) => {
      const next = prev.filter((m) => m.id !== id);
      const stillHasDevices = cameras.length > 0 || ecoSensors.length > 0 || next.length > 0;
      if (!stillHasDevices) {
        setHardwareConnectedState(false);
      }
      return next;
    });
  };

  // SafeVision Handlers
  const handleUpdateViolationStatus = (id: string, newStatus: VerificationStatus) => {
    if (isWorker) return;
    setViolations((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status: newStatus } : v))
    );
  };

  const handleSimulateViolation = async (employeeId?: string) => {
    if (isWorker) return;
    const targetCam = cameras[0];
    if (!targetCam) return;

    const targetEmployee =
      (employeeId ? employees.find((e) => e.id === employeeId) : undefined) ||
      employees.find((e) => e.roleType === 'worker') ||
      employees[0];

    const empLabel = targetEmployee
      ? `${targetEmployee.fullName} (${targetEmployee.specialty})`
      : 'Персонал участка';

    const newViol: PPEViolation = {
      id: 'viol-' + Date.now(),
      timestamp: new Date().toISOString(),
      cameraId: targetCam.id,
      cameraName: targetCam.name,
      area: targetCam.area,
      violationType: 'no_helmet',
      confidence: 0.97,
      workerCount: 1,
      status: 'new',
      notes: `Зафиксировано камерой ${targetCam.name}: отсутствие каски (${empLabel})`,
      ...(targetEmployee
        ? {
            employeeId: targetEmployee.id,
            employeeName: targetEmployee.fullName,
            employeeSpecialty: targetEmployee.specialty,
          }
        : {}),
    };

    setViolations((prev) => [newViol, ...prev]);

    setCameras((prev) =>
      prev.map((cam) =>
        cam.id === targetCam.id
          ? {
              ...cam,
              currentDetections: {
                ...cam.currentDetections,
                helmetsMissing: cam.currentDetections.helmetsMissing + 1,
              },
            }
          : cam
      )
    );

    if (effectiveFactoryId && effectiveFactoryId !== 'guest-zero-plant') {
      try {
        const notif = await createFactoryNotification(effectiveFactoryId, {
          title:
            language === 'kz'
              ? 'ЖҚҚ бұзушылығы тіркелді'
              : 'Зафиксировано нарушение СИЗ',
          message: targetEmployee
            ? `${targetEmployee.fullName} (${targetEmployee.specialty}) — отсутствие защитной каски · ${targetCam.area}`
            : `Отсутствие защитной каски в зоне ${targetCam.area} (${targetCam.name})`,
          category: 'safevision',
          employeeId: targetEmployee?.id,
          employeeName: targetEmployee?.fullName,
          employeeSpecialty: targetEmployee?.specialty,
          area: targetCam.area,
          timestamp: newViol.timestamp,
        });
        setNotifications((prev) => [notif, ...prev]);
      } catch {
        // ignore
      }
    }

    playPingSound();
    const alertMsg = targetEmployee
      ? `Нарушение СИЗ: ${targetEmployee.fullName} (${targetEmployee.specialty}) — ${targetCam.area}`
      : `Нарушение СИЗ зафиксировано камерой ${targetCam.name} (${targetCam.area})`;
    setActiveBroadcast({
      id: 'alert-' + Date.now(),
      message: alertMsg,
      category: 'safety',
      target: targetCam.area,
      timestamp: newViol.timestamp,
      sender: 'SafeVision Edge AI',
    });
  };

  // EcoPredict Handlers
  const handleSimulateEcoSpike = async () => {
    if (isWorker || ecoSensors.length === 0) return;
    const targetSensor = ecoSensors[0];
    const nowIso = new Date().toISOString();

    const newReading: EcoReadingEvent = {
      id: 'eco-spike-' + Date.now(),
      sensorId: targetSensor.id,
      indicator: `${targetSensor.code} (${targetSensor.name})`,
      value: Number((targetSensor.thresholdCritical * 1.1).toFixed(2)),
      unit: targetSensor.unit,
      threshold: targetSensor.thresholdCritical,
      time: nowIso,
      area: targetSensor.area,
      status: 'critical',
      predictedPeakTime: 'Фиксация скачка! Продувка газоочистных скрубберов',
      mitigationAction: 'Снизить подачу шихты, запустить резервную дымососную станцию',
    };

    setEcoReadings((prev) => [newReading, ...prev]);
    setEcoSensors((prev) =>
      prev.map((s, idx) =>
        idx === 0 || s.code === 'SO2'
          ? {
              ...s,
              currentValue: Number((s.thresholdCritical * 1.1).toFixed(2)),
              status: 'critical',
              trend: 'up',
              lastUpdated: new Date().toLocaleTimeString(),
            }
          : s
      )
    );
    setEcoChartData((prev) => [
      ...prev.slice(-11),
      {
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: Date.now(),
        CO: 2.4,
        NO2: 0.14,
        SO2: 0.55,
        PM2_5: 0.11,
      },
    ]);

    if (effectiveFactoryId && effectiveFactoryId !== 'guest-zero-plant') {
      try {
        const notif = await createFactoryNotification(effectiveFactoryId, {
          title: language === 'kz' ? 'ШРК шегінен асып кетті' : 'Превышение ПДК (EcoPredict)',
          message: `${targetSensor.name}: ${newReading.value} ${newReading.unit} (норма ${newReading.threshold}) · ${targetSensor.area}`,
          category: 'ecopredict',
          area: targetSensor.area,
          timestamp: nowIso,
        });
        setNotifications((prev) => [notif, ...prev]);
      } catch {
        // ignore
      }
    }
    playPingSound();
  };

  // FailPredict Handlers
  const handleDispatchWorkOrder = (machineId: string) => {
    if (isWorker) return;
    setMachines((prev) =>
      prev.map((m) =>
        m.id === machineId ? { ...m, hasActiveWorkOrder: true } : m
      )
    );
  };

  const handleSimulateMachineAnomaly = async () => {
    if (isWorker || machines.length === 0) return;
    const targetMachine = machines[0];
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setMachines((prev) =>
      prev.map((m) =>
        m.id === targetMachine.id
          ? {
              ...m,
              vibrationRmsMmS: 8.4,
              temperatureC: 86.0,
              riskStatus: 'critical',
              failureProbabilityPercent: 94,
              remainingUsefulLifeHours: 24,
              telemetryHistory: [
                ...m.telemetryHistory,
                { time: nowTime, temp: 86.0, vibration: 8.4 },
              ],
            }
          : m
      )
    );

    if (effectiveFactoryId && effectiveFactoryId !== 'guest-zero-plant') {
      try {
        const notif = await createFactoryNotification(effectiveFactoryId, {
          title: language === 'kz' ? 'Жабдық дірілі сыни деңгейде' : 'Критическая вибрация агрегата',
          message: `${targetMachine.name}: 8.4 мм/с RMS, 86°C (риск отказа 94%) · ${targetMachine.area}`,
          category: 'failpredict',
          area: targetMachine.area,
          timestamp: new Date().toISOString(),
        });
        setNotifications((prev) => [notif, ...prev]);
      } catch {
        // ignore
      }
    }
    playPingSound();
  };

  // Notifications handlers
  const handleMarkNotificationRead = async (notifId: string) => {
    if (!effectiveFactoryId || effectiveFactoryId === 'guest-zero-plant') return;
    const next = await markFactoryNotificationRead(effectiveFactoryId, notifId);
    setNotifications(next);
  };

  const handleMarkAllNotificationsRead = async () => {
    if (!effectiveFactoryId || effectiveFactoryId === 'guest-zero-plant') return;
    const next = await markAllFactoryNotificationsRead(effectiveFactoryId);
    setNotifications(next);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans w-full max-w-full overflow-x-hidden">
      {/* Top Navigation */}
      <Header
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        language={language}
        setLanguage={handleSetLanguage}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenProfile={() => setIsProfileOpen(true)}
        onOpenAdminProfile={() => {
          setAdminModalInitialTab('general');
          setIsAdminOpen(true);
        }}
        onOpenAdminProfileWithTab={(tab) => {
          setAdminModalInitialTab(tab);
          setIsAdminOpen(true);
        }}
        onOpenSupport={() => setIsSupportOpen(true)}
        openTicketsCount={openTicketsCount}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        isChatOpen={isChatOpen}
        onReplaySplash={() => setShowSplash(true)}
        onOpenReport={() => setIsReportOpen(true)}
        onOpenConnectHardware={() => openHardwareConnect('camera')}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onNavigateToViolations={() => {
          setCurrentTab('safevision');
          setIsProfileOpen(true);
        }}
        camerasCount={cameras.length}
        sensorsCount={ecoSensors.length}
        machinesCount={machines.length}
        isHardwareConnected={hasAnyHardware}
      />

      {/* Real-Time Plant Emergency & Safety Broadcast Banner */}
      {activeBroadcast && (!isWorker || activeBroadcast.category !== 'safety') && (
        <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-amber-950/90 border-b border-amber-500/50 px-4 py-2.5 shadow-lg animate-in slide-in-from-top duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="p-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0 animate-pulse">
                <Bell className="h-4 w-4" />
              </span>
              <div className="flex items-baseline gap-2 truncate">
                <span className="font-bold font-mono text-amber-300 uppercase shrink-0">
                  {language === 'kz' ? 'ШҰҒЫЛ ХАБАРЛАМА:' : 'ОПОВЕЩЕНИЕ:'}
                </span>
                <span className="text-white font-medium truncate">{activeBroadcast.message}</span>
                <span className="text-slate-400 text-[10px] hidden md:inline shrink-0 font-mono">
                  ({activeBroadcast.sender} · {new Date(activeBroadcast.timestamp).toLocaleTimeString('ru-RU')})
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveBroadcast(null);
                try {
                  localStorage.removeItem('neurofactory_active_broadcast');
                } catch {
                  // ignored
                }
              }}
              className="text-slate-400 hover:text-white px-2 py-0.5 rounded text-xs hover:bg-slate-800 transition-colors shrink-0"
              title="Закрыть оповещение"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8 py-5 sm:py-8 animate-in fade-in duration-300">
        <div key={currentTab} className="transition-all duration-300">
          {currentTab === 'overview' && (
            <OverviewView
              onNavigate={setCurrentTab}
              language={language}
              camerasCount={cameras.length}
              sensorsCount={ecoSensors.length}
              machinesCount={machines.length}
              isHardwareConnected={hasAnyHardware}
              onOpenConnectHardware={() => openHardwareConnect('camera')}
              onResetToZero={handleResetToZero}
              isWorker={isWorker}
            />
          )}

          {currentTab === 'safevision' && (
            <SafeVisionView
              cameras={cameras}
              violations={violations}
              machines={machines}
              employees={employees}
              onUpdateViolationStatus={handleUpdateViolationStatus}
              onSimulateViolation={handleSimulateViolation}
              onDispatchWorkOrder={handleDispatchWorkOrder}
              onNavigateToFailPredict={() => setCurrentTab('failpredict')}
              language={language}
              onOpenConnectCamera={() => openHardwareConnect('camera')}
              onDeleteCamera={handleDeleteCamera}
              isWorker={isWorker}
              currentEmployeeId={profile?.employeeId}
            />
          )}

          {currentTab === 'ecopredict' && (
            <EcoPredictView
              sensors={ecoSensors}
              readings={ecoReadings}
              chartData={ecoChartData}
              onSimulateSpike={handleSimulateEcoSpike}
              language={language}
              onOpenConnectSensor={() => openHardwareConnect('sensor')}
              onDeleteSensor={handleDeleteSensor}
              isWorker={isWorker}
            />
          )}

          {currentTab === 'failpredict' && (
            <FailPredictView
              machines={machines}
              onDispatchWorkOrder={handleDispatchWorkOrder}
              onSimulateAnomaly={handleSimulateMachineAnomaly}
              language={language}
              onOpenConnectMachine={() => openHardwareConnect('machine')}
              onDeleteMachine={handleDeleteMachine}
              isWorker={isWorker}
            />
          )}
        </div>
      </main>

      {/* Industrial Footer */}
      <footer className="border-t border-slate-850 bg-slate-950 py-8 text-xs text-slate-400">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1.5 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <CompanyLogo size="xs" withText={true} glow={false} />
              <span className="text-slate-600">·</span>
              <span className="font-normal text-slate-400 font-mono text-[11px]">
                {language === 'kz' ? 'Өндірістік ЖИ кешені' : 'Платформа промышленного ИИ'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Стандарты: ГОСТ 12.4.011-89 (СИЗ), Экологический кодекс РК (ПДК), ISO 10816-3 (Вибрация).
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-4 text-[11px] font-mono text-slate-400">
            {!isWorker && (
              <>
                <button
                  onClick={() => setIsSupportOpen(true)}
                  className="text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1.5 font-semibold"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  <span>Техподдержка (Заявка основателю)</span>
                </button>
                <span>·</span>
              </>
            )}
            <span>Cloud Firestore</span>
            <span>·</span>
            <span>© 2026 NeuroFactory AI</span>
          </div>
        </div>
      </footer>

      {/* Modals & AI Assistant Drawer */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        language={language}
        onLoginSuccess={() => setShowSplash(true)}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        language={language}
        onOpenAdminProfile={() => {
          setIsProfileOpen(false);
          setAdminModalInitialTab('general');
          setIsAdminOpen(true);
        }}
        onOpenSupport={() => {
          setIsProfileOpen(false);
          setIsSupportOpen(true);
        }}
        violations={violations}
        notifications={notifications}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onResetToZero={handleResetToZero}
        camerasCount={cameras.length}
        sensorsCount={ecoSensors.length}
        machinesCount={machines.length}
      />

      <AdminProfileModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        language={language}
        onAddCamera={handleAddCamera}
        onAddSensor={handleAddSensor}
        onAddMachine={handleAddMachine}
        onResetToZero={handleResetToZero}
        onOpenConnectHardware={() => openHardwareConnect('camera')}
        isHardwareConnected={hasAnyHardware}
        initialTab={adminModalInitialTab}
      />

      <HardwareConnectModal
        isOpen={connectModalState.open}
        onClose={() => setConnectModalState((prev) => ({ ...prev, open: false }))}
        language={language}
        initialType={connectModalState.type}
        onAddCamera={handleAddCamera}
        onAddSensor={handleAddSensor}
        onAddMachine={handleAddMachine}
      />

      <ComplianceReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        language={language}
        profile={profile}
        violations={violations}
        ecoSensors={ecoSensors}
        machines={machines}
      />

      <SupportTicketModal
        isOpen={isSupportOpen}
        onClose={() => {
          setIsSupportOpen(false);
          refreshTicketsCount();
        }}
        language={language}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        language={language}
      />

      {/* Floating smooth back-to-top button & reading depth indicator */}
      <ScrollController language={language} />

      {/* Industrial High-Tech Boot Splash Screen */}
      {showSplash && (
        <IndustrialSplashLoader
          onComplete={handleSplashComplete}
          language={language}
        />
      )}
    </div>
  );
}

