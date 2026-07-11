// Dashboard cache store — sayfaya 2. kez gelindiğinde önceki rakamlar anında
// gözüksün, arka planda yeni veri çekilirken eski değerler render edilsin.
// Veri taze gelince NumberTickerX yumuşak count-up ile yeni rakama geçer.
//
// localStorage'a da yansıtılır → tam sayfa reload sonrası da rakamlar anında.

import { create } from 'zustand';
import { Platform } from 'react-native';
import type { CurrencyTotal } from '../money/aggregations';

const LS_KEY = 'dashboard_cache_v2';  // v2: finMonthly/finPending number → CurrencyTotal[] (eski sayı-cache geçersiz)

export interface AdminDashboardCache {
  pipelineCounts: Record<string, number>;
  byStatus:       { key: string; label: string; count: number }[];
  totalOrders:    number;
  totalActive:    number;
  monthly:        { label: string; count: number }[];
  weekCounts:     Record<string, number>;
  weekDone:       Record<string, number>;
  byWorkType:     { label: string; count: number }[];
  overdue:        number;
  todayDelivery:  number;
  todayOrders:    number;
  recentOrders:   any[];
  upcoming:       any[];
  totalDoctors:   number;
  totalLabUsers:  number;
  finMonthly:     CurrencyTotal[];
  finPending:     CurrencyTotal[];
  finPaidCount:   number;
  lastUpdated:    number;
}

export interface LabDashboardCache {
  pipelineCounts: Record<string, number>;
  totalActive:    number;
  totalCases:     number;
  todayNewCount:  number;
  pendingCount:   number;
  monthly:        { month: string; count: number; teeth?: number }[];
  weekCounts:     Record<string, number>;
  weekTeeth?:     Record<string, number>;
  recentOrders:   any[];
  triagePending:  any[];
  stationStats:   any[];
  topTechs:       any[];
  stockSummary:   { lowCount: number; materialCostMtd: number; wasteCostMtd: number; topUsedName: string | null } | null;
  provas:         any[];
  lastUpdated:    number;
}

export interface DoctorDashboardCache {
  // pendingApprovals + derived stats orders'tan türetildiği için sadece
  // approval ve notif state'i. Sayılar orders zaten cache'lendiyse useOrders'tan
  // gelir. Bu cache şimdilik boş — useOrders cache'i ileride buraya alınabilir.
  lastUpdated: number;
}

export interface ClinicDashboardCache {
  // Aynı durum — orders cache'i useClinicOrders'ta.
  lastUpdated: number;
}

interface DashboardCacheState {
  admin:  AdminDashboardCache  | null;
  lab:    LabDashboardCache    | null;
  doctor: DoctorDashboardCache | null;
  clinic: ClinicDashboardCache | null;
  setAdmin:  (data: Partial<AdminDashboardCache>) => void;
  setLab:    (data: Partial<LabDashboardCache>) => void;
  setDoctor: (data: Partial<DoctorDashboardCache>) => void;
  setClinic: (data: Partial<ClinicDashboardCache>) => void;
}

type Persisted = {
  admin:  AdminDashboardCache  | null;
  lab:    LabDashboardCache    | null;
  doctor: DoctorDashboardCache | null;
  clinic: ClinicDashboardCache | null;
};

function loadFromStorage(): Persisted {
  const empty: Persisted = { admin: null, lab: null, doctor: null, clinic: null };
  if (Platform.OS !== 'web' || typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      admin:  parsed?.admin  ?? null,
      lab:    parsed?.lab    ?? null,
      doctor: parsed?.doctor ?? null,
      clinic: parsed?.clinic ?? null,
    };
  } catch { return empty; }
}

function saveToStorage(state: Persisted) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* quota */ }
}

const initial = loadFromStorage();

export const useDashboardCache = create<DashboardCacheState>((set, get) => ({
  admin:  initial.admin,
  lab:    initial.lab,
  doctor: initial.doctor,
  clinic: initial.clinic,
  setAdmin: (patch) => {
    const prev = get().admin;
    const next: AdminDashboardCache = {
      pipelineCounts: {}, byStatus: [], totalOrders: 0, totalActive: 0,
      monthly: [], weekCounts: {}, weekDone: {}, byWorkType: [],
      overdue: 0, todayDelivery: 0, todayOrders: 0,
      recentOrders: [], upcoming: [], totalDoctors: 0, totalLabUsers: 0,
      finMonthly: [], finPending: [], finPaidCount: 0,
      ...prev, ...patch, lastUpdated: Date.now(),
    };
    set({ admin: next });
    saveToStorage({ ...get(), admin: next });
  },
  setLab: (patch) => {
    const prev = get().lab;
    const next: LabDashboardCache = {
      pipelineCounts: {}, totalActive: 0, totalCases: 0,
      todayNewCount: 0, pendingCount: 0,
      monthly: [], weekCounts: {}, recentOrders: [], triagePending: [],
      stationStats: [], topTechs: [], stockSummary: null, provas: [],
      ...prev, ...patch, lastUpdated: Date.now(),
    };
    set({ lab: next });
    saveToStorage({ ...get(), lab: next });
  },
  setDoctor: (patch) => {
    const prev = get().doctor;
    const next: DoctorDashboardCache = { ...prev, ...patch, lastUpdated: Date.now() };
    set({ doctor: next });
    saveToStorage({ ...get(), doctor: next });
  },
  setClinic: (patch) => {
    const prev = get().clinic;
    const next: ClinicDashboardCache = { ...prev, ...patch, lastUpdated: Date.now() };
    set({ clinic: next });
    saveToStorage({ ...get(), clinic: next });
  },
}));
