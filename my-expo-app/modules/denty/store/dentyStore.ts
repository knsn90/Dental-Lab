/**
 * Denty store — global asistan durumu (GlobalSupport deseni gibi tek instance).
 *
 *   • isOpen          — panel açık mı
 *   • display[]       — UI baloncukları (kullanıcı + denty)
 *   • raw[]           — Claude mesaj geçmişi (bağlam sürekliliği için)
 *   • busy            — yanıt bekleniyor mu
 *
 * Araçların çalıştırılması ve edge function çağrısı api.ts'tedir; store
 * yalnızca durum tutar.
 */
import { create } from 'zustand';
import type { ClaudeMessage, DentyMessage, PendingAction, ActionCard } from '../types';

let _idCounter = 0;
function nextId(): string {
  _idCounter += 1;
  return `dm_${_idCounter}_${Date.now()}`;
}

/** Sohbete iliştirilen dosya (yeni sipariş oluşturulunca work_order_photos'a yüklenir). */
export type DentyAttachmentKind = 'photo' | 'scan' | 'video' | 'pdf' | 'other';
export interface DentyAttachment {
  id: string;
  name: string;
  kind: DentyAttachmentKind;
  mime: string;
  size?: number;
  /** Web: File/Blob nesnesi. */
  blob?: any;
  /** Native: dosya uri'si (fetch→blob ile okunur). */
  uri?: string;
}

const KIND_LABEL: Record<DentyAttachmentKind, string> = {
  photo: 'Fotoğraf', scan: 'Tarama', video: 'Video', pdf: 'PDF', other: 'Dosya',
};

/** Dosya adı/mime'den kaba tür tespiti (formdaki resolveFileKind ile aynı ruh). */
export function detectAttachmentKind(name: string, mime?: string): DentyAttachmentKind {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const m = (mime ?? '').toLowerCase();
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'].includes(ext)) return 'photo';
  if (m.startsWith('video/') || ['mp4', 'mov', 'avi', 'webm', 'mkv'].includes(ext)) return 'video';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (['stl', 'ply', 'obj', '3mf', 'dcm', 'zip'].includes(ext)) return 'scan';
  return 'other';
}

export function attachmentKindLabel(kind: DentyAttachmentKind): string {
  return KIND_LABEL[kind];
}

export function newAttachmentId(): string {
  return nextId();
}

interface DentyStore {
  isOpen: boolean;
  voiceOpen: boolean;
  busy: boolean;
  display: DentyMessage[];
  raw: ClaudeMessage[];
  pending: PendingAction | null;
  attachments: DentyAttachment[];

  /** Panel açılırken otomatik gönderilecek istem (ör. sipariş detayındaki "Özet çıkar"). */
  seed: string | null;
  open: () => void;
  openWith: (prompt: string) => void;
  consumeSeed: () => string | null;
  close: () => void;
  toggle: () => void;
  openVoice: () => void;
  closeVoice: () => void;
  reset: () => void;

  setBusy: (b: boolean) => void;
  pushDisplay: (role: 'user' | 'denty' | 'card', text: string, extra?: Partial<DentyMessage>) => string;
  updateDisplay: (id: string, patch: Partial<DentyMessage>) => void;
  setRaw: (raw: ClaudeMessage[]) => void;
  setPending: (p: PendingAction | null) => void;
  pushCard: (card: ActionCard) => string;

  addAttachments: (list: DentyAttachment[]) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
}

export const useDentyStore = create<DentyStore>((set, get) => ({
  isOpen: false,
  seed: null,
  voiceOpen: false,
  busy: false,
  display: [],
  raw: [],
  pending: null,
  attachments: [],

  open: () => set({ isOpen: true }),
  openWith: (prompt) => set({ isOpen: true, seed: prompt }),
  consumeSeed: () => {
    const s = get().seed;
    if (s) set({ seed: null });
    return s;
  },
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  openVoice: () => set({ voiceOpen: true }),
  closeVoice: () => set({ voiceOpen: false }),
  reset: () => set({ display: [], raw: [], busy: false, pending: null, attachments: [] }),

  setBusy: (busy) => set({ busy }),
  pushDisplay: (role, text, extra) => {
    const id = nextId();
    set((s) => ({ display: [...s.display, { id, role, text, ...extra }] }));
    return id;
  },
  updateDisplay: (id, patch) =>
    set((s) => ({ display: s.display.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  setRaw: (raw) => set({ raw }),
  setPending: (pending) => set({ pending }),
  pushCard: (card) => {
    const id = nextId();
    set((s) => ({ display: [...s.display, { id, role: 'card', text: '', card }] }));
    return id;
  },

  addAttachments: (list) => set((s) => ({ attachments: [...s.attachments, ...list] })),
  removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  clearAttachments: () => set({ attachments: [] }),
}));
