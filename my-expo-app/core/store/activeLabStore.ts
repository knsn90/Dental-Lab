// Aktif lab bağlamı — çoklu-lab klinik/hekim için.
// Klinik hep yalnız KENDİ verisini görür (RLS doctor_id/clinic_id); "aktif lab"
// bir UX BÖLME filtresidir. FAIL-OPEN: my_lab_memberships RPC'si yoksa/hata verirse
// active=null kalır → tüketiciler bugünkü profile.lab_id davranışına düşer.
import { create } from 'zustand';
import { Platform } from 'react-native';
import { myLabMemberships, type LabMembership } from '../../modules/lab-connections/api';

function keyFor(userId: string) { return `active_lab_${userId}`; }

function loadPersisted(userId: string): string | null {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(keyFor(userId)); } catch { return null; }
}
function persist(userId: string, labId: string | null) {
  if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
  try { labId ? localStorage.setItem(keyFor(userId), labId) : localStorage.removeItem(keyFor(userId)); } catch {}
}

interface ActiveLabState {
  loaded: boolean;
  loading: boolean;
  memberships: LabMembership[];
  active: LabMembership | null;
  /** Membership'leri yükle + aktif lab'ı seç (persist eşleşmesi > tek-aktif > mevcut geçerliyse koru). */
  load: (userId: string) => Promise<void>;
  setActive: (userId: string, m: LabMembership) => void;
  clear: (userId?: string) => void;
}

export const useActiveLabStore = create<ActiveLabState>((set, get) => ({
  loaded: false,
  loading: false,
  memberships: [],
  active: null,

  load: async (userId: string) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const all = await myLabMemberships();
      const actives = all.filter((m) => m.status === 'active');
      const persisted = loadPersisted(userId);
      const byLab = (id: string | null | undefined) => actives.find((m) => m.lab_id === id) ?? null;
      const active =
        byLab(persisted) ??
        (actives.length === 1 ? actives[0] : byLab(get().active?.lab_id));
      if (active) persist(userId, active.lab_id);
      set({ memberships: all, active, loaded: true, loading: false });
    } catch {
      // RPC yok / DB henüz uygulanmadı → fail-open (tek-lab davranışı korunur)
      set({ loaded: true, loading: false });
    }
  },

  setActive: (userId: string, m: LabMembership) => {
    persist(userId, m.lab_id);
    set({ active: m });
  },

  clear: (userId?: string) => {
    if (userId) persist(userId, null);
    set({ memberships: [], active: null, loaded: false });
  },
}));

/** Aktif lab_id (yoksa null → tüketici profile.lab_id fallback yapmalı). */
export function getActiveLabId(): string | null {
  return useActiveLabStore.getState().active?.lab_id ?? null;
}
/** Aktif lab'ın o lab'daki CRM clinics satırı (yeni sipariş clinic_id'si). */
export function getActiveLabClinicId(): string | null {
  return useActiveLabStore.getState().active?.lab_clinic_id ?? null;
}
