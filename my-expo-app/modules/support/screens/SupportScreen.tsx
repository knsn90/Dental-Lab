import { useSegments } from 'expo-router';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag, isRTL } from '../../../core/i18n';
import { confirmAsync } from '../../../core/util/confirm';
/**
 * SupportScreen — Dental Production Support OS
 *
 * Faz 1 — Foundation: 3-sütun mission-control layout.
 *
 *  ┌──────────────┬─────────────────────────────┬──────────────┐
 *  │ Sol: Queue    │ Merkez: Konuşma + Aksiyon  │ Sağ: Vaka    │
 *  │ Filter chips  │ Smart actions row          │ Context      │
 *  │ Ticket cards  │ Thread (modern bubbles)    │ Timeline     │
 *  │ SLA risk      │ Composer (file + screen)   │ Checklist    │
 *  └──────────────┴─────────────────────────────┴──────────────┘
 *
 * Mobile: tek sütun, master-detail stack.
 */
import React, { useContext, useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, Platform, useWindowDimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  HelpCircle, X, Plus, Send, ChevronLeft, ChevronRight, ChevronDown,
  AlertCircle, CheckCircle2, Clock, MessageSquare, MessageCirclePlus,
  Bug, FileWarning, Cog, Truck, Receipt, Plug, GraduationCap, ShieldAlert, ShieldCheck,
  Activity, Box, Layers, Hash, User as UserIcon, Briefcase, FlaskConical,
  ListChecks, Eye, FolderOpen, ExternalLink, Timer, Sparkles, Search,
  Check,
} from 'lucide-react-native';
import { HubContext } from '../../../core/ui/HubContext';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { DS } from '../../../core/theme/dsTokens';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { MOBILE_PANEL_THEMES } from '../../../core/theme/mobileDesignTokens';
import { useAuthStore } from '../../../core/store/authStore';
import { toast } from '../../../core/ui/Toast';
import {
  fetchMyTickets, fetchAllTickets, createTicket, fetchMessages, sendMessage,
  fetchStatusHistory, markTicketReadByUser, markTicketReadByAdmin,
  updateTicketStatus, updateTicketPriority, updateTicketChecklist,
  fetchAttachments, linkAttachmentsToMessage,
} from '../api';
import { AttachmentUploader } from '../components/AttachmentUploader';
import { AttachmentList } from '../components/AttachmentList';
// Lazy chunk — three.js (~600KB) sadece STL/PLY/OBJ açılınca yüklenir.
// Yeni jenerik 3D Viewer modülü — StlPreviewModal yerini aldı.
const Viewer3DModal: any = Platform.OS === 'web'
  ? React.lazy(async () => {
      const mod: any = await import('../../../modules/viewer-3d/components/Viewer3DModal');
      return { default: mod.default ?? mod.Viewer3DModal };
    })
  : () => null;

function detect3DFmt(name: string): 'stl' | 'ply' | 'obj' {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'ply') return 'ply';
  if (ext === 'obj') return 'obj';
  return 'stl'; // default fallback
}
import { SupportDropdown } from '../components/SupportDropdown';
import { getSuggestions } from '../helpers/smartSuggestions';
import { isScreenRecordingSupported, startScreenRecording } from '../helpers/screenRecording';
import { supabase } from '../../../core/api/supabase';
import { createAttachmentRecord } from '../api';
import type { SupportAttachment } from '../types';
import { Video, Square, Lightbulb } from 'lucide-react-native';
import {
  SupportTicket, SupportMessage, SupportStatusHistoryEntry,
  SupportCategory, SupportPriority, SupportStatus,
  CATEGORY_LABELS, PRIORITY_LABELS, STATUS_LABELS,
  PRIORITY_COLORS, STATUS_COLORS,
  ACCENT, ACCENT_SOFT, ACCENT_ORANGE, SLA_HOURS,
} from '../types';

// ─── Tipografi tokens ────────────────────────────────────────────────────
const DISPLAY = {
  fontFamily: Platform.select({ web: 'Inter Tight, Inter, system-ui, sans-serif', default: 'InterTight_300Light' }),
  fontWeight: '300' as const,
};

function hexA(hex: string, a: number) {
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch { return hex; }
}

// ─── Operasyonel UI paleti — nötr graphite inks + panel-aware zemin & accent ──
// `bg` (sayfa zemini) ve `orange` (accent) aktif panele göre güncellenir
// (applyPanelPalette). Lab/admin sıcak kalır, klinik/hekim yeşil, istasyon mavi.
const W = {
  bg:         '#F5F1EB', // sayfa zemini — panel bgPage ile güncellenir
  soft:       '#FAFAFA', // icon kapsül / hover dolgu — panel bgSoft ile güncellenir
  surface:    '#FFFFFF',
  inkStrong:  DS.ink[900], // #0A0A0A — başlık & koyu CTA
  ink:        DS.ink[700], // #2C2C2C — gövde
  inkMute:    DS.ink[500], // #6B6B6B — ikincil
  inkSoft:    DS.ink[400], // #9A9A9A — meta / placeholder
  border:     DS.ink[200], // #EAEAEA — standart kart kenarı
  borderSoft: DS.ink[100], // #F5F5F5 — iç ayraç
  cardBorder: 'rgba(0,0,0,0.05)', // büyük kapsayıcı kart — ev stili ince hairline
  orange:     '#4771AB', // panel primary ile güncellenir
  primaryDeep:'#314F7E', // panel primaryDeep ile güncellenir (gradient ucu)
  orangeSoft: hexA('#4771AB', 0.12),
};

// Aktif panel paletini W'ye uygula. Tek anda tek panel render edildiği için
// modül seviyesindeki W'yi güncellemek güvenli — alt bileşenler aynı render
// turunda güncel değerleri okur.
function applyPanelPalette(panelKey: 'lab' | 'clinic' | 'exec' | 'tech', primary: string) {
  const mobileKey =
    panelKey === 'clinic' ? 'klinik'
    : panelKey === 'exec' ? 'exec'
    : panelKey === 'tech' ? 'teknisyen'
    : 'lab';
  W.bg          = MOBILE_PANEL_THEMES[mobileKey].bgPage;
  W.soft        = DS[panelKey].bgSoft;
  W.orange      = primary;
  W.primaryDeep = DS[panelKey].primaryDeep;
  W.orangeSoft  = hexA(primary, 0.12);
}

// ─── Design-language atom'ları (panel-aware — render anında W'den okur) ─────
// docs/DESIGN_LANGUAGE.md: beyaz kart 18 radius + ink[200] border + gölge YOK,
// eyebrow 10-11px/600 tracking, status pill 999, dark/primary/light pill buton.

function Eyebrow({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <Text style={{ fontSize: 10.5, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: color ?? W.inkSoft }}>
      {children}
    </Text>
  );
}

function DLCard({ children, style }: { children: React.ReactNode; style?: any }) {
  return (
    <View style={[{ backgroundColor: W.surface, borderRadius: 18, borderWidth: 1, borderColor: W.border, padding: 18 }, style]}>
      {children}
    </View>
  );
}

/** Status / öncelik mini rozeti — pill, soft zemin, ● Etiket. */
function StatusPill({ bg, fg, label, dot }: { bg: string; fg: string; label: string; dot?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: bg }}>
      {dot && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: fg }} />}
      <Text style={{ fontSize: 9.5, fontWeight: '700', color: fg, letterSpacing: 0.3 }}>{label}</Text>
    </View>
  );
}

/** Pill buton — dark / primary / light / ghost. radius 999, design-language CTA. */
function PillBtn({
  children, variant = 'dark', onPress, leftIcon, disabled, size = 'md',
}: {
  children: React.ReactNode;
  variant?: 'dark' | 'primary' | 'light' | 'ghost';
  onPress?: () => void;
  leftIcon?: React.ReactNode;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const v = {
    dark:    { bg: W.inkStrong,  fg: '#FFFFFF', border: W.inkStrong, hover: W.ink },
    primary: { bg: W.orange,     fg: '#FFFFFF', border: W.orange,    hover: hexA(W.orange, 0.85) },
    light:   { bg: W.surface,    fg: W.inkStrong, border: W.border,  hover: W.soft },
    ghost:   { bg: 'transparent', fg: W.inkMute, border: 'transparent', hover: W.soft },
  }[variant];
  const s = size === 'sm' ? { px: 12, py: 7, fs: 12 } : { px: 16, py: 10, fs: 13 };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ hovered, pressed }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 7,
        paddingHorizontal: s.px, paddingVertical: s.py, borderRadius: 999,
        borderWidth: 1, borderColor: v.border,
        backgroundColor: disabled ? W.inkSoft : (hovered ? v.hover : v.bg),
        opacity: pressed ? 0.85 : 1,
        ...(Platform.OS === 'web' && !disabled ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {leftIcon}
      <Text style={{ fontSize: s.fs, fontWeight: '700', color: v.fg, letterSpacing: -0.1 }}>{children}</Text>
    </Pressable>
  );
}

/** F1 Glassmorphism hero — panel-aware (krem zemin + yarı saydam beyaz cam). */
function HeroGlass({ kicker, title, description, actions, footer }: {
  kicker: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: W.bg, padding: 14 }}>
      <View style={{
        backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 22, padding: 24,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)', gap: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: W.orangeSoft }}>
          <Sparkles size={11} color={W.orange} strokeWidth={1.8} />
          <Text style={{ fontSize: 10, fontWeight: '700', color: W.orange, letterSpacing: 1, textTransform: 'uppercase' }}>{kicker}</Text>
        </View>
        <Text style={{ ...DISPLAY, fontSize: 30, color: W.inkStrong, letterSpacing: -0.9, lineHeight: 36 }}>{title}</Text>
        {description ? (
          <Text style={{ fontSize: 13, color: W.inkMute, lineHeight: 19, maxWidth: 520 }}>{description}</Text>
        ) : null}
        {actions ? <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>{actions}</View> : null}
        {footer}
      </View>
    </View>
  );
}

/** Premium gradient hero şeridi — panel primary→primaryDeep + glow + KPI tile'ları.
 *  Dashboard'daki gradient kart estetiğini taşır (ev stili). */
function HeroStrip({ kpis, onNew, isAdmin }: {
  kpis: { label: string; value: number; alert?: boolean }[];
  onNew: () => void;
  isAdmin: boolean;
}) {
  return (
    <View style={{
      borderRadius: 28, padding: 22, overflow: 'hidden',
      backgroundColor: W.orange,
      ...(Platform.OS === 'web'
        ? { backgroundImage: `linear-gradient(135deg, ${W.orange} 0%, ${W.primaryDeep} 100%)` } as any
        : {}),
    }}>
      {/* glow daireleri */}
      <View style={{ position: 'absolute', top: -50, end: -30, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.16)' }} />
      <View style={{ position: 'absolute', bottom: -60, start: -20, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.05)' }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <View style={{ flexShrink: 1, minWidth: 200 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Sparkles size={12} color="rgba(255,255,255,0.92)" strokeWidth={1.8} />
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
              Üretim Destek Merkezi
            </Text>
          </View>
          <Text style={{ ...DISPLAY, fontSize: 26, color: '#FFFFFF', letterSpacing: -0.6, lineHeight: 30 }}>
            {isAdmin ? 'Vakaları yönet' : 'Vakanı birlikte çözelim'}
          </Text>
          {/* "Yeni Talep" CTA tek yerde (sol liste başlığı) — tekrar kaldırıldı. */}
        </View>

        {/* KPI tile'ları */}
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          {kpis.map(k => (
            <View key={k.label} style={{ minWidth: 88, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)', marginBottom: 4 }}>{k.label}</Text>
              <Text style={{ ...DISPLAY, fontSize: 26, color: '#FFFFFF', letterSpacing: -0.8, lineHeight: 28 }}>{k.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const CATEGORY_ICONS: Record<SupportCategory, any> = {
  teknik_sorun:    Bug,
  stl_dosya:       FileWarning,
  uretim_sureci:   Cog,
  kargo_teslimat:  Truck,
  faturalama:      Receipt,
  entegrasyon:     Plug,
  ozellik_egitim:  GraduationCap,
  yazilim_hatasi:  ShieldAlert,
  kvkk_talebi:     ShieldCheck,
};

const STATUS_FLOW: SupportStatus[] = ['yeni', 'inceleniyor', 'teknik_inceleme', 'klinik_bekleniyor', 'cozuldu', 'kapali'];

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} ${autoT('dk önce')}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${autoT('sa önce')}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${autoT('gün önce')}`;
  return new Date(iso).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

function slaInfo(t: SupportTicket): { label: string; tone: 'safe'|'soon'|'breached' } {
  if (!t.sla_due_at || t.status === 'cozuldu' || t.status === 'kapali') {
    return { label: '—', tone: 'safe' };
  }
  const diff = new Date(t.sla_due_at).getTime() - Date.now();
  const hours = Math.round(diff / 3_600_000);
  if (diff <= 0) return { label: `SLA aşıldı`, tone: 'breached' };
  if (hours <= 2) return { label: `SLA: ${hours}sa`, tone: 'soon' };
  return { label: `SLA: ${hours}sa`, tone: 'safe' };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Screen
// ═══════════════════════════════════════════════════════════════════════════

/** Yeni talep modalına şablondan ön-doldurma. */
type TicketPrefill = {
  subject?: string;
  category?: SupportCategory;
  priority?: SupportPriority;
  body?: string;
};

/** Hızlı talep şablonları — tıklanınca formu ön-doldurur. */
const QUICK_FIXES: { title: string; tip: string; icon: any; prefill: TicketPrefill }[] = [
  {
    title: 'STL dosyası açılmıyor', tip: 'Mesh repair · ters normal · format uyumsuzluğu', icon: FileWarning,
    prefill: {
      subject: 'STL dosyası açılmıyor',
      category: 'stl_dosya',
      body: 'Sipariş no: \nDosya adı: \nSorun: STL dosyası açılmıyor / bozuk görünüyor.\nDenediklerim: \nEkran görüntüsü / dosyayı ekliyorum.',
    },
  },
  {
    title: 'CAM export hatası', tip: 'Çıktı yolu, makine adı ve log doğrulaması', icon: Cog,
    prefill: {
      subject: 'CAM export hatası',
      category: 'uretim_sureci',
      body: 'Sipariş no: \nMakine / yazılım: \nHata mesajı: \nÇıktı yolu: \nLog dosyasını ekliyorum.',
    },
  },
  {
    title: 'Sipariş aşaması ilerlemiyor', tip: 'Onay bekleyen aşama veya teknisyen atama', icon: Layers,
    prefill: {
      subject: 'Sipariş aşaması ilerlemiyor',
      category: 'uretim_sureci',
      body: 'Sipariş no: \nTakılı kaldığı aşama: \nBeklenen sonraki aşama: \nEk açıklama: ',
    },
  },
  {
    title: 'Bildirim gelmiyor', tip: 'E-posta + push izin kontrolü', icon: ShieldAlert,
    prefill: {
      subject: 'Bildirim gelmiyor',
      category: 'teknik_sorun',
      body: 'Hangi bildirim: \nKanal (e-posta / push / WhatsApp): \nNe zamandan beri: \nCihaz / tarayıcı: ',
    },
  },
];

export function SupportScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet  = width >= 760 && width < 1100;
  // Design Language § 3 16px kuralı: sayfa kenarı her zaman 16
  const px = 16;
  const isEmbedded = useContext(HubContext);
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  useEffect(() => { if (!isEmbedded) { setTitle('Destek', ''); } return clear; }, [isEmbedded]);

  // Panel-aware zemin & accent — klinik yeşil, lab sarı, admin mercan, istasyon mavi
  const panelTheme = usePanelTheme();
  applyPanelPalette(panelTheme.key, panelTheme.primary);

  const isAdmin = profile?.user_type === 'admin';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<SupportStatus | 'tumu'>('tumu');
  const [search, setSearch] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<TicketPrefill | null>(null);

  // Tek giriş noktası: opsiyonel şablon prefill ile yeni talep modalını aç.
  const openNew = (pf?: TicketPrefill | null) => { setPrefill(pf ?? null); setNewOpen(true); };

  const load = async () => {
    setLoading(true);
    const { data } = isAdmin ? await fetchAllTickets() : await fetchMyTickets();
    setTickets((data ?? []) as SupportTicket[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, [isAdmin]);

  const filtered = useMemo(() => {
    let list = filter === 'tumu' ? tickets : tickets.filter(t => t.status === filter);
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (q) {
      list = list.filter(t =>
        t.subject.toLocaleLowerCase('tr-TR').includes(q) ||
        (t.user?.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
        (t.user?.email ?? '').toLocaleLowerCase('tr-TR').includes(q) ||
        (t.context?.order_number ?? '').toLocaleLowerCase('tr-TR').includes(q)
      );
    }
    return list;
  }, [tickets, filter, search]);

  const selected = tickets.find(t => t.id === selectedId) ?? null;
  const unreadCount = isAdmin
    ? tickets.filter(t => t.unread_for_admin).length
    : tickets.filter(t => t.unread_for_user).length;

  const handleSelect = async (id: string) => {
    setSelectedId(id);
    const t = tickets.find(x => x.id === id);
    if (isAdmin && t?.unread_for_admin) {
      await markTicketReadByAdmin(id);
      setTickets(prev => prev.map(x => x.id === id ? { ...x, unread_for_admin: false } : x));
    } else if (!isAdmin && t?.unread_for_user) {
      await markTicketReadByUser(id);
      setTickets(prev => prev.map(x => x.id === id ? { ...x, unread_for_user: false } : x));
    }
  };

  // Hero KPI'ları
  const openCount   = tickets.filter(t => t.status !== 'cozuldu' && t.status !== 'kapali').length;
  const solvedCount = tickets.filter(t => t.status === 'cozuldu' || t.status === 'kapali').length;
  const slaRiskCount = tickets.filter(t => slaInfo(t).tone !== 'safe').length;
  const heroKpis = [
    { label: 'Toplam',   value: tickets.length },
    { label: 'Açık',     value: openCount },
    { label: 'SLA Risk', value: slaRiskCount, alert: slaRiskCount > 0 },
    isAdmin
      ? { label: 'Çözülen', value: solvedCount }
      : { label: 'Okunmamış', value: unreadCount, alert: unreadCount > 0 },
  ];

  const Wrapper: any = isEmbedded ? View : SafeAreaView;
  const wrapperProps = isEmbedded ? { style: { flex: 1, backgroundColor: W.bg } } : { style: { flex: 1, backgroundColor: W.bg }, edges: ['top'] as any };

  // Mobile layout — tek sütun, stack
  if (!isDesktop && !isTablet) {
    return (
      <Wrapper {...wrapperProps}>
        {selected ? (
          <View style={{ flex: 1 }}>
            <CenterWorkspace
              ticket={selected}
              isAdmin={isAdmin}
              onUpdate={load}
              onBack={() => setSelectedId(null)}
              showBack
              px={px}
            />
          </View>
        ) : (
          <QueueSidebar
            tickets={filtered}
            loading={loading}
            selectedId={selectedId}
            filter={filter}
            setFilter={setFilter}
            search={search}
            setSearch={setSearch}
            onSelect={handleSelect}
            onNew={() => openNew()}
            isAdmin={isAdmin}
            unreadCount={unreadCount}
            total={tickets.length}
            allTickets={tickets}
            px={px}
          />
        )}
        <NewTicketModal
          visible={newOpen}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { load(); setSelectedId(id); setNewOpen(false); }}
          labId={(profile as any)?.lab_id ?? null}
          prefill={prefill}
        />
      </Wrapper>
    );
  }

  // Desktop / tablet — inbox: premium hero şeridi + 2-pane (liste + detay)
  return (
    <Wrapper {...wrapperProps}>
      <View style={{ flex: 1, padding: 16, gap: 16, backgroundColor: W.bg }}>
        {/* Premium hero şeridi */}
        <HeroStrip kpis={heroKpis} onNew={() => openNew()} isAdmin={isAdmin} />

        {/* 2-pane: sol liste kartı + sağ detay kartı */}
        <View style={{ flex: 1, flexDirection: 'row', gap: 16, minHeight: 0 }}>
          {/* SOL: Talep listesi */}
          <View style={{
            width: 360, borderRadius: 28, overflow: 'hidden',
            borderWidth: 1, borderColor: W.cardBorder, backgroundColor: W.surface,
          }}>
            <QueueSidebar
              tickets={filtered}
              loading={loading}
              selectedId={selectedId}
              filter={filter}
              setFilter={setFilter}
              search={search}
              setSearch={setSearch}
              onSelect={handleSelect}
              onNew={() => openNew()}
              isAdmin={isAdmin}
              unreadCount={unreadCount}
              total={tickets.length}
              allTickets={tickets}
              px={px}
            />
          </View>

          {/* SAĞ: Detay / boş durum */}
          <View style={{
            flex: 1, minWidth: 0, borderRadius: 28, overflow: 'hidden',
            borderWidth: 1, borderColor: W.cardBorder, backgroundColor: W.surface,
          }}>
            {selected ? (
              <CenterWorkspace
                ticket={selected}
                isAdmin={isAdmin}
                onUpdate={load}
                onBack={() => setSelectedId(null)}
                px={px}
              />
            ) : (
              <EmptyWorkspace
                onNew={() => openNew()}
                onTemplate={(pf) => openNew(pf)}
                isAdmin={isAdmin}
                tickets={tickets}
                onSelect={handleSelect}
              />
            )}
          </View>
        </View>
      </View>

      <NewTicketModal
        visible={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => { load(); setSelectedId(id); setNewOpen(false); }}
        labId={(profile as any)?.lab_id ?? null}
        prefill={prefill}
      />
    </Wrapper>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOL — Queue Sidebar
// ═══════════════════════════════════════════════════════════════════════════

function QueueSidebar({
  tickets, loading, selectedId, filter, setFilter, search, setSearch,
  onSelect, onNew, isAdmin, unreadCount, total, allTickets, px,
}: {
  tickets: SupportTicket[];
  loading: boolean;
  selectedId: string | null;
  filter: SupportStatus | 'tumu';
  setFilter: (f: SupportStatus | 'tumu') => void;
  search: string;
  setSearch: (s: string) => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  isAdmin: boolean;
  unreadCount: number;
  total: number;
  allTickets: SupportTicket[];
  px: number;
}) {
  // Statü chip'leri — sayılarla
  const FILTERS: { key: SupportStatus | 'tumu'; label: string }[] = [
    { key: 'tumu',              label: 'Tümü' },
    { key: 'yeni',              label: 'Yeni' },
    { key: 'inceleniyor',       label: 'İnceleniyor' },
    { key: 'teknik_inceleme',   label: 'Teknik' },
    { key: 'klinik_bekleniyor', label: 'Klinik' },
    { key: 'cozuldu',           label: 'Çözüldü' },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Header — page edge + block paddings 16px kuralında */}
      <View style={{ paddingHorizontal: px, paddingTop: 16, paddingBottom: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: W.inkStrong, letterSpacing: -0.2 }}>Talepler</Text>
            {total > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 1.5, borderRadius: 999, backgroundColor: W.soft }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: W.inkMute }}>{total}</Text>
              </View>
            )}
          </View>
          {/* Başlıktaki "+" kaldırıldı — yeni talep için şablonlar / boş-durum CTA'sı kullanılır. */}
        </View>

        {/* Search — sadece vaka varsa */}
        {total > 0 && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
            borderWidth: 1, borderColor: W.border, backgroundColor: W.soft,
          }}>
            <Search size={13} color={W.inkSoft} strokeWidth={1.8} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Vaka, başlık, kullanıcı..."
              placeholderTextColor={W.inkSoft}
              style={{
                flex: 1, fontSize: 12, color: W.ink,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              } as any}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={6}>
                <X size={12} color={W.inkSoft} strokeWidth={1.6} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {/* Filter chips — sadece vaka varsa */}
      {total > 0 && (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, flexShrink: 0 }}
        contentContainerStyle={{ gap: 6, paddingHorizontal: px, paddingBottom: 16, alignItems: 'center' }}
      >
        {FILTERS.map(f => {
          const active = filter === f.key;
          const count = f.key === 'tumu' ? total : allTickets.filter(t => t.status === f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, height: 30, borderRadius: 999,
                borderWidth: active ? 0 : 1,
                borderColor: W.border,
                backgroundColor: active ? W.inkStrong : (hovered ? W.soft : W.surface),
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <Text style={{ fontSize: 11.5, fontWeight: '500', color: active ? '#FFFFFF' : W.inkMute }}>{f.label}</Text>
              {count > 0 && (
                <Text style={{ fontSize: 10, fontWeight: '700', color: active ? 'rgba(255,255,255,0.7)' : W.inkSoft }}>{count}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
      )}

      {/* List */}
      {loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={W.inkSoft} />
        </View>
      ) : tickets.length === 0 ? (
        <QueueEmpty onNew={onNew} isAdmin={isAdmin} />
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: px, paddingBottom: 48, gap: 12 }}>
          {tickets.map(t => (
            <QueueCard
              key={t.id}
              ticket={t}
              selected={t.id === selectedId}
              onPress={() => onSelect(t.id)}
              isAdmin={isAdmin}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function QueueCard({ ticket, selected, onPress, isAdmin }: { ticket: SupportTicket; selected: boolean; onPress: () => void; isAdmin: boolean }) {
  const Icon = CATEGORY_ICONS[ticket.category] ?? HelpCircle;
  const pc = PRIORITY_COLORS[ticket.priority];
  const sc = STATUS_COLORS[ticket.status];
  const sla = slaInfo(ticket);
  const isUnread = isAdmin ? ticket.unread_for_admin : ticket.unread_for_user;

  // Vaka kodu (varsa)
  const caseNo = ticket.context?.order_number ? `#${ticket.context.order_number}` : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: selected ? W.orange : W.border,
        backgroundColor: selected ? W.orangeSoft : (hovered ? W.soft : W.surface),
        gap: 9,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {/* Üst — caseNo + priority + unread */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {caseNo && (
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: W.soft, borderWidth: 1, borderColor: W.border }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: W.inkMute, letterSpacing: 0.3, fontFamily: Platform.select({ web: 'SF Mono, Menlo, monospace', default: 'monospace' }) }}>{caseNo}</Text>
          </View>
        )}
        {ticket.priority !== 'normal' && (
          <StatusPill bg={pc.bg} fg={pc.fg} label={PRIORITY_LABELS[ticket.priority].toLocaleUpperCase('tr-TR')} />
        )}
        <View style={{ flex: 1 }} />
        {isUnread && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: W.orange }} />}
      </View>

      {/* Başlık */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
        <View style={{ width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: W.orangeSoft, flexShrink: 0 }}>
          <Icon size={13} color={W.orange} strokeWidth={1.8} />
        </View>
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '600', color: W.inkStrong, lineHeight: 18, letterSpacing: -0.1 }} numberOfLines={2}>
          {ticket.subject}
        </Text>
      </View>

      {/* Alt — status + sla + time */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <StatusPill bg={sc.bg} fg={sc.fg} label={STATUS_LABELS[ticket.status].toLocaleUpperCase('tr-TR')} dot />
        {sla.tone !== 'safe' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: W.orangeSoft }}>
            <Timer size={9} color={W.orange} strokeWidth={2} />
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: W.orange }}>{sla.label}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 10.5, color: W.inkSoft }}>{timeAgo(ticket.last_message_at)}</Text>
      </View>

      {/* Admin için kullanıcı */}
      {isAdmin && ticket.user?.full_name && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <UserIcon size={11} color={W.inkSoft} strokeWidth={1.8} />
          <Text style={{ fontSize: 10.5, color: W.inkMute, fontWeight: '500', flex: 1 }} numberOfLines={1}>
            {ticket.user.full_name}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function QueueEmpty({ onNew, isAdmin }: { onNew: () => void; isAdmin: boolean }) {
  return (
    <View style={{ padding: 28, alignItems: 'center', gap: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: W.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
        <MessageSquare size={24} color={W.orange} strokeWidth={1.5} />
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: W.ink, textAlign: 'center' }}>
        {isAdmin ? 'Aktif talep yok' : 'Henüz destek talebin yok'}
      </Text>
      {!isAdmin && (
        <PillBtn variant="dark" size="sm" onPress={onNew} leftIcon={<Plus size={13} color="#FFFFFF" strokeWidth={2.2} />}>Yeni Talep</PillBtn>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MERKEZ — Workspace
// ═══════════════════════════════════════════════════════════════════════════

function EmptyWorkspace({ onNew, onTemplate, isAdmin, tickets = [], onSelect }: { onNew: () => void; onTemplate?: (pf: TicketPrefill) => void; isAdmin: boolean; tickets?: SupportTicket[]; onSelect?: (id: string) => void }) {

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 20, gap: 16,
        maxWidth: 760, alignSelf: 'center', width: '100%',
        paddingBottom: 48,
      }}
    >
      {/* Boş durum başlığı */}
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: W.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MessageSquare size={24} color={W.orange} strokeWidth={1.5} />
        </View>
        <Text style={{ ...DISPLAY, fontSize: 24, color: W.inkStrong, letterSpacing: -0.6, textAlign: 'center' }}>
          {isAdmin ? 'Bir talep seç' : 'Vakanı birlikte çözelim'}
        </Text>
        <Text style={{ fontSize: 13, color: W.inkMute, textAlign: 'center', maxWidth: 440, lineHeight: 19 }}>
          {isAdmin
            ? 'Soldaki listeden bir talep seç — detay, mesaj thread\'i ve vaka bilgisi burada açılır.'
            : 'Soldaki listeden bir talebe gir ya da yeni bir talep aç. Problem ekranı, görüntü ve log paylaştığında çözüm hızlanır.'}
        </Text>
      </View>

      {/* Hızlı talep şablonları */}
      <DLCard style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} color={W.orange} strokeWidth={1.8} />
          <Eyebrow>Hızlı Talep Şablonları</Eyebrow>
        </View>
        <View style={{ gap: 8 }}>
          {QUICK_FIXES.map((q, i) => {
            const Icon = q.icon;
            return (
              <Pressable
                key={i}
                onPress={!isAdmin ? () => onTemplate?.(q.prefill) : undefined}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 14, borderRadius: 14,
                  borderWidth: 1, borderColor: W.border,
                  backgroundColor: hovered ? W.soft : W.surface,
                  ...(Platform.OS === 'web' && !isAdmin ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <View style={{ width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: W.orangeSoft }}>
                  <Icon size={16} color={W.orange} strokeWidth={1.8} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: W.inkStrong, letterSpacing: -0.1 }} numberOfLines={1}>{q.title}</Text>
                  <Text style={{ fontSize: 11.5, color: W.inkMute, marginTop: 2, lineHeight: 15 }} numberOfLines={1}>{q.tip}</Text>
                </View>
                {!isAdmin && (isRTL()
                  ? <ChevronLeft size={15} color={W.inkSoft} strokeWidth={1.7} />
                  : <ChevronRight size={15} color={W.inkSoft} strokeWidth={1.7} />)}
              </Pressable>
            );
          })}
        </View>
      </DLCard>

      {/* Açık talepler tablosu */}
      {tickets.length > 0 && (
        <DLCard style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ListChecks size={12} color={W.orange} strokeWidth={1.8} />
            <View style={{ flex: 1 }}><Eyebrow>Açık Destek Talepleri</Eyebrow></View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: W.inkMute }}>{tickets.length}</Text>
          </View>

          {/* Tablo başlığı */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: W.border }}>
            <Text style={{ flex: 2, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }}>Konu</Text>
            <Text style={{ width: 110, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }}>Kategori</Text>
            <Text style={{ width: 110, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }}>Durum</Text>
            <Text style={{ width: 90, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }}>Öncelik</Text>
            <Text style={{ width: 80, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'end' as any }}>Tarih</Text>
          </View>

          {/* Satırlar */}
          {tickets.slice(0, 8).map((t) => {
            const Icon = CATEGORY_ICONS[t.category] ?? HelpCircle;
            const sc   = STATUS_COLORS[t.status];
            const pc   = PRIORITY_COLORS[t.priority];
            const unread = isAdmin ? t.unread_for_admin : t.unread_for_user;
            return (
              <Pressable
                key={t.id}
                onPress={() => onSelect?.(t.id)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12,
                  backgroundColor: hovered ? W.soft : 'transparent',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {unread && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: W.orange }} />}
                  <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: W.orangeSoft }}>
                    <Icon size={13} color={W.orange} strokeWidth={1.8} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: W.inkStrong, flex: 1, letterSpacing: -0.1 }} numberOfLines={1}>
                    {t.subject}
                  </Text>
                </View>
                <View style={{ width: 110 }}>
                  <Text style={{ fontSize: 11.5, color: W.inkMute }} numberOfLines={1}>{CATEGORY_LABELS[t.category]}</Text>
                </View>
                <View style={{ width: 110, flexDirection: 'row' }}>
                  <StatusPill bg={sc.bg} fg={sc.fg} label={STATUS_LABELS[t.status].toLocaleUpperCase('tr-TR')} dot />
                </View>
                <View style={{ width: 90, flexDirection: 'row' }}>
                  <StatusPill bg={pc.bg} fg={pc.fg} label={PRIORITY_LABELS[t.priority].toLocaleUpperCase('tr-TR')} />
                </View>
                <Text style={{ width: 80, fontSize: 10.5, color: W.inkSoft, textAlign: 'end' as any }}>
                  {timeAgo(t.last_message_at)}
                </Text>
              </Pressable>
            );
          })}
          {tickets.length > 8 && (
            <Text style={{ fontSize: 11, color: W.inkSoft, textAlign: 'center', paddingTop: 4 }}>
              +{tickets.length - 8} talep daha — bir vakaya gir, kuyruktan tümünü gör
            </Text>
          )}
        </DLCard>
      )}
    </ScrollView>
  );
}

function CenterWorkspace({ ticket, isAdmin, onUpdate, onBack, showBack, px }: {
  ticket: SupportTicket;
  isAdmin: boolean;
  onUpdate: () => void;
  onBack: () => void;
  showBack?: boolean;
  px: number;
}) {
  // Vaka linki AKTİF panelde açılsın (destek ekranı lab+admin'de paylaşılıyor)
  const panelBase = String((useSegments() as string[])?.[0] ?? '(lab)');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [attachments, setAttachments] = useState<SupportAttachment[]>([]);
  const [pendingAtts, setPendingAtts] = useState<SupportAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [stlPreview, setStlPreview] = useState<{ url: string; name: string } | null>(null);
  const [recording, setRecording] = useState<import('../helpers/screenRecording').ActiveRecording | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  const [dismissedSuggests, setDismissedSuggests] = useState(false);
  const [showContext, setShowContext] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: msgs }, { data: atts }] = await Promise.all([
      fetchMessages(ticket.id),
      fetchAttachments(ticket.id),
    ]);
    setMessages(msgs ?? []);
    setAttachments(atts ?? []);
    // pending = ticket'a yüklenmiş ama henüz mesaja bağlanmamış olanlar
    setPendingAtts((atts ?? []).filter(a => !a.message_id));
    setLoading(false);
  };
  useEffect(() => { load(); }, [ticket.id]);

  // Kayıt süresi tick'i
  useEffect(() => {
    if (!recording) { setRecElapsed(0); return; }
    const t = setInterval(() => setRecElapsed(Math.floor((Date.now() - recording.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [recording]);

  const handleRecordToggle = async () => {
    if (recording) {
      try {
        const blob = await recording.stop();
        setRecording(null);
        const fileName = `kayit-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
        const path     = `${ticket.id}/${Date.now()}_${fileName}`;
        const { error } = await supabase.storage.from('support-attachments').upload(path, blob, {
          contentType: 'video/webm', upsert: false,
        });
        if (error) throw error;
        const { data: rec, error: rErr } = await createAttachmentRecord({
          ticket_id:    ticket.id,
          kind:         'recording',
          storage_path: path,
          file_name:    fileName,
          file_size:    blob.size,
          mime_type:    'video/webm',
        });
        if (rErr || !rec) throw rErr;
        setPendingAtts(prev => [...prev, rec as SupportAttachment]);
        toast.success('Ekran kaydı eklendi');
      } catch (e: any) {
        toast.error(e?.message ?? 'Kayıt kaydedilemedi');
      }
    } else {
      try {
        const r = await startScreenRecording();
        setRecording(r);
      } catch (e: any) {
        toast.error(e?.message ?? 'Ekran kaydı başlatılamadı');
      }
    }
  };

  const suggestions = React.useMemo(() => getSuggestions(ticket), [ticket]);

  // Attachment lookup: messageId → attachments[]
  const attachmentsByMsg = React.useMemo(() => {
    const map: Record<string, SupportAttachment[]> = {};
    for (const a of attachments) if (a.message_id) (map[a.message_id] ??= []).push(a);
    return map;
  }, [attachments]);

  const sla = slaInfo(ticket);
  const Icon = CATEGORY_ICONS[ticket.category] ?? HelpCircle;
  const canReply = ticket.status !== 'kapali';

  const handleSend = async () => {
    // İçerik VE/VEYA en az 1 ek olmalı
    if (!reply.trim() && pendingAtts.length === 0) return;
    setSending(true);
    try {
      const body = reply.trim() || (pendingAtts.length === 1 ? pendingAtts[0].file_name : `${pendingAtts.length} dosya eklendi`);
      const { data: msg, error } = await sendMessage({ ticket_id: ticket.id, body, is_internal: isAdmin && isInternal });
      if (error) throw error;
      if (pendingAtts.length > 0 && msg?.id) {
        await linkAttachmentsToMessage(pendingAtts.map(a => a.id), msg.id);
      }
      setReply(''); setIsInternal(false); setPendingAtts([]);
      await load(); onUpdate();
    } catch (e: any) {
      toast.error(e?.message ?? 'Mesaj gönderilemedi');
    } finally { setSending(false); }
  };

  const handleStatus = async (s: SupportStatus) => {
    // Resolve gate — checklist'in eksiklerini kontrol et
    if (s === 'cozuldu' && ticket.checklist && ticket.checklist.length > 0) {
      const remaining = ticket.checklist.filter(it => !it.checked);
      if (remaining.length > 0) {
        const labels = remaining.map(r => '• ' + r.label).join('\n');
        const msg = `Çözüldü olarak işaretlemeden önce şu kontroller tamamlanmalı:\n\n${labels}\n\nYine de devam edilsin mi?`;
        const ok = await confirmAsync('Çözüldü İşaretle', msg, { confirmText: 'Devam Et' });
        if (!ok) return;
      }
    }
    const { error } = await updateTicketStatus(ticket.id, s);
    if (error) { toast.error(error.message); return; }
    toast.success('Durum güncellendi.');
    onUpdate();
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header — 16px sayfa kenar + 16px block-to-block iç boşluk */}
      <View style={{
        paddingHorizontal: px, paddingVertical: 16,
        backgroundColor: W.surface,
        borderBottomWidth: 1, borderBottomColor: W.border,
        gap: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          {showBack && (
            <Pressable onPress={onBack} style={{ padding: 4, ...(isRTL() ? { marginRight: -4 } : { marginLeft: -4 }), alignSelf: 'flex-start' }} hitSlop={8}>
              {isRTL()
                ? <ChevronRight size={20} color={W.inkMute} strokeWidth={1.8} />
                : <ChevronLeft size={20} color={W.inkMute} strokeWidth={1.8} />}
            </Pressable>
          )}
          <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: W.orangeSoft }}>
            <Icon size={18} color={W.orange} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {ticket.context?.order_number && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: W.soft, borderWidth: 1, borderColor: W.border }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', color: W.inkMute, letterSpacing: 0.4, fontFamily: Platform.select({ web: 'SF Mono, Menlo, monospace', default: 'monospace' }) }}>
                    #{ticket.context.order_number}
                  </Text>
                </View>
              )}
              <StatusPill bg={STATUS_COLORS[ticket.status].bg} fg={STATUS_COLORS[ticket.status].fg} label={STATUS_LABELS[ticket.status].toLocaleUpperCase('tr-TR')} dot />
              <StatusPill bg={PRIORITY_COLORS[ticket.priority].bg} fg={PRIORITY_COLORS[ticket.priority].fg} label={PRIORITY_LABELS[ticket.priority].toLocaleUpperCase('tr-TR')} />
              {sla.tone !== 'safe' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: W.orangeSoft }}>
                  <Timer size={9} color={W.orange} strokeWidth={2} />
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: W.orange }}>{sla.label}</Text>
                </View>
              )}
            </View>
            <Text style={{ ...DISPLAY, fontSize: 22, color: W.inkStrong, letterSpacing: -0.5, lineHeight: 26 }}>{ticket.subject}</Text>
            <Text style={{ fontSize: 11.5, color: W.inkSoft }}>{CATEGORY_LABELS[ticket.category]} · {timeAgo(ticket.created_at)} açıldı</Text>
          </View>
        </View>

        {/* Smart actions row */}
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {ticket.context?.order_id && (
            <SmartAction
              icon={ExternalLink}
              label="Vaka ekranı"
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.open(`/${panelBase}/order/${ticket.context.order_id}`, '_blank');
                }
              }}
            />
          )}
          {ticket.context?.file_url && (
            <SmartAction icon={FolderOpen} label="Dosya görüntüle" onPress={() => {
              if (Platform.OS === 'web' && typeof window !== 'undefined' && ticket.context?.file_url) {
                window.open(ticket.context.file_url, '_blank');
              }
            }} />
          )}
          {ticket.context?.error_code && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: W.orangeSoft }}>
              <AlertCircle size={11} color={W.orange} strokeWidth={1.8} />
              <Text style={{ fontSize: 11, fontWeight: '700', color: W.orange, fontFamily: Platform.select({ web: 'SF Mono, Menlo, monospace', default: 'monospace' }) }}>
                {ticket.context.error_code}
              </Text>
            </View>
          )}
          {/* Status quick action */}
          {!isAdmin && ticket.status !== 'cozuldu' && ticket.status !== 'kapali' && (
            <SmartAction icon={CheckCircle2} label="Çözüldü" onPress={() => handleStatus('cozuldu')} accent />
          )}
          {!isAdmin && (ticket.status === 'cozuldu' || ticket.status === 'kapali') && (
            <SmartAction icon={Activity} label="Yeniden aç" onPress={() => handleStatus('inceleniyor')} />
          )}
          <SmartAction icon={Briefcase} label={showContext ? 'Vaka detayını gizle' : 'Vaka detayı'} onPress={() => setShowContext(v => !v)} />
        </View>
      </View>

      {/* Smart Suggestions */}
      {!dismissedSuggests && suggestions.length > 0 && (
        <View style={{
          marginHorizontal: px, marginTop: 16,
          padding: 14, borderRadius: 14,
          backgroundColor: W.orangeSoft, borderWidth: 1, borderColor: hexA(W.orange, 0.18),
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Lightbulb size={12} color={W.orange} strokeWidth={2} />
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: W.orange, letterSpacing: 1, textTransform: 'uppercase', flex: 1 }}>
              Hızlı çözüm önerileri
            </Text>
            <Pressable onPress={() => setDismissedSuggests(true)} hitSlop={6}>
              <Text style={{ fontSize: 10, color: W.inkMute, fontWeight: '700' }}>kapat</Text>
            </Pressable>
          </View>
          <View style={{ gap: 5 }}>
            {suggestions.map(s => (
              <View key={s.id} style={{ paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: W.inkStrong, marginBottom: 1 }}>{s.title}</Text>
                <Text style={{ fontSize: 11, color: W.inkMute, lineHeight: 15 }}>{s.hint}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={W.inkSoft} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: px, gap: 12 }}>
          {showContext && (
            <View style={{ marginBottom: 4, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: W.borderSoft }}>
              <CaseContextPanel ticket={ticket} onUpdate={onUpdate} isAdmin={isAdmin} embedded />
            </View>
          )}
          {messages.map(m => (
            <MessageBubble
              key={m.id}
              message={m}
              attachments={attachmentsByMsg[m.id] ?? []}
              isOwnPanel={(isAdmin && m.sender_role === 'support') || (!isAdmin && m.sender_role === 'user')}
              onPreviewStl={(att, signedUrl) => setStlPreview({ url: signedUrl, name: att.file_name })}
            />
          ))}
        </ScrollView>
      )}

      {/* Composer */}
      {canReply ? (
        <View style={{
          paddingHorizontal: px, paddingVertical: 16,
          borderTopWidth: 1, borderTopColor: W.border,
          backgroundColor: isInternal ? W.orangeSoft : W.surface,
          gap: 12,
        }}>
          {isAdmin && (
            <Pressable
              onPress={() => setIsInternal(v => !v)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 8,
                alignSelf: 'flex-start',
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 9999,
                borderWidth: 1,
                borderColor: isInternal ? W.orange : W.border,
                backgroundColor: isInternal ? W.orangeSoft : (hovered ? W.bg : W.surface),
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              })}
            >
              <View style={{
                width: 15, height: 15, borderRadius: 5,
                borderWidth: 1.5, borderColor: isInternal ? W.orange : W.inkSoft,
                backgroundColor: isInternal ? W.orange : W.surface,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {isInternal && <Check size={10} color="#FFF" strokeWidth={3} />}
              </View>
              <Text style={{ fontSize: 11, fontWeight: '700', color: isInternal ? W.orange : W.inkMute, letterSpacing: 0.4, textTransform: 'uppercase' }}>İç Not</Text>
            </Pressable>
          )}
          {/* Ek yükleyici + ekran kaydı */}
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'stretch' }}>
            <View style={{ flex: 1 }}>
              <AttachmentUploader
                ticketId={ticket.id}
                onUploaded={(att) => setPendingAtts(prev => [...prev, att])}
                onError={(msg) => toast.error(msg)}
                compact
              />
            </View>
            {Platform.OS === 'web' && isScreenRecordingSupported() && (
              <Pressable
                onPress={handleRecordToggle}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: recording ? '#9F1239' : W.border,
                  backgroundColor: recording ? 'rgba(159,18,57,0.10)' : (hovered ? W.soft : W.surface),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                {recording ? (
                  <>
                    <Square size={11} color="#9F1239" strokeWidth={2} fill="#9F1239" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#9F1239' }}>
                      Durdur · {String(Math.floor(recElapsed / 60)).padStart(2, '0')}:{String(recElapsed % 60).padStart(2, '0')}
                    </Text>
                  </>
                ) : (
                  <>
                    <Video size={12} color={W.inkMute} strokeWidth={1.8} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: W.ink }}>Ekran kaydı</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder={isInternal ? 'İç not — sadece destek ekibi görür...' : 'Yanıtını yaz...'}
              placeholderTextColor={W.inkSoft}
              multiline
              style={{
                flex: 1, minHeight: 44, maxHeight: 140,
                paddingHorizontal: 16, paddingVertical: 11,
                borderRadius: 16,
                borderWidth: 1, borderColor: isInternal ? W.orange : W.border,
                backgroundColor: isInternal ? W.surface : W.soft,
                fontSize: 13.5, color: W.ink,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              } as any}
            />
            <Pressable
              onPress={handleSend}
              disabled={sending || (!reply.trim() && pendingAtts.length === 0)}
              style={({ hovered }: any) => {
                const canSend = reply.trim() || pendingAtts.length > 0;
                return {
                  width: 44, height: 44, borderRadius: 999,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: !canSend
                    ? W.inkSoft
                    : isInternal
                      ? (hovered ? hexA(W.orange, 0.85) : W.orange)
                      : (hovered ? W.ink : W.inkStrong),
                  ...(Platform.OS === 'web' && canSend ? { cursor: 'pointer' } as any : {}),
                };
              }}
            >
              <Send size={16} color="#FFF" strokeWidth={2} />
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{
          paddingHorizontal: px, paddingVertical: 16,
          borderTopWidth: 1, borderTopColor: W.border,
          backgroundColor: W.bg,
          flexDirection: 'row', alignItems: 'center', gap: 8,
        }}>
          <Clock size={13} color={W.inkSoft} strokeWidth={1.7} />
          <Text style={{ fontSize: 11.5, color: W.inkMute, flex: 1 }}>
            Bu vaka kapatıldı. "Yeniden aç" ile thread'i tekrar başlat.
          </Text>
        </View>
      )}

      {/* 3D Viewer — STL/PLY/OBJ önizleme için lazy chunk */}
      {stlPreview && Platform.OS === 'web' && (
        <React.Suspense fallback={null}>
          <Viewer3DModal
            visible={!!stlPreview}
            files={[{
              id: stlPreview.url,
              name: stlPreview.name,
              url: stlPreview.url,
              format: detect3DFmt(stlPreview.name),
            }]}
            title={stlPreview.name}
            onClose={() => setStlPreview(null)}
          />
        </React.Suspense>
      )}
    </View>
  );
}

function SmartAction({ icon: Icon, label, onPress, accent }: { icon: any; label: string; onPress?: () => void; accent?: boolean }) {
  const acc = '#2D9A6B'; // DS success (tüm panellerde ortak)
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
        borderWidth: 1,
        borderColor: accent ? hexA(acc, 0.4) : W.border,
        backgroundColor: hovered
          ? (accent ? hexA(acc, 0.14) : W.soft)
          : (accent ? hexA(acc, 0.08) : W.surface),
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <Icon size={12} color={accent ? acc : W.inkMute} strokeWidth={1.8} />
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: accent ? acc : W.ink }}>{label}</Text>
    </Pressable>
  );
}

function MessageBubble({ message, isOwnPanel, attachments = [], onPreviewStl }: { message: SupportMessage; isOwnPanel: boolean; attachments?: SupportAttachment[]; onPreviewStl?: (att: SupportAttachment, url: string) => void }) {
  const date = new Date(message.created_at);
  const timeStr = date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const isInternal = message.is_internal;
  return (
    <View style={{ alignItems: isOwnPanel ? 'flex-end' : 'flex-start' }}>
      <View style={{
        maxWidth: '80%',
        paddingHorizontal: 14, paddingVertical: 11,
        borderRadius: 18,
        borderTopEndRadius: isOwnPanel ? 5 : 18,
        borderTopStartRadius:  isOwnPanel ? 18 : 5,
        backgroundColor: isInternal
          ? W.orangeSoft
          : isOwnPanel
            ? W.inkStrong
            : W.surface,
        borderWidth: isInternal ? 1 : (isOwnPanel ? 0 : 1),
        borderColor: isInternal ? W.orange : W.border,
        gap: 6,
      }}>
        {isInternal && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <ShieldAlert size={10} color={W.orange} strokeWidth={2} />
            <Text style={{ fontSize: 9.5, fontWeight: '600', color: W.orange, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              İç Not — sadece destek ekibi
            </Text>
          </View>
        )}
        <Text style={{ fontSize: 13.5, lineHeight: 19, color: isOwnPanel && !isInternal ? '#FFF' : W.ink }}>
          {message.body}
        </Text>
        {attachments.length > 0 && <AttachmentList attachments={attachments} onPreviewStl={onPreviewStl} />}
      </View>
      <Text style={{ fontSize: 10, color: W.inkSoft, marginTop: 3, fontWeight: '500' }}>
        {message.sender?.full_name ?? (message.sender_role === 'support' ? 'Destek Ekibi' : 'Sen')} · {timeStr}
      </Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SAĞ — Case Context Panel (Mission Control)
// ═══════════════════════════════════════════════════════════════════════════

function CaseContextEmpty() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }}>
      <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: W.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Activity size={24} color={W.orange} strokeWidth={1.5} />
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: W.ink, textAlign: 'center' }}>Mission Control</Text>
      <Text style={{ fontSize: 11.5, color: W.inkSoft, textAlign: 'center', maxWidth: 220, lineHeight: 16 }}>
        Bir talep seçince vaka detayları, üretim timeline'ı ve checklist burada görünür.
      </Text>
    </View>
  );
}

function CaseContextPanel({ ticket, onUpdate, isAdmin, embedded }: { ticket: SupportTicket; onUpdate: () => void; isAdmin: boolean; embedded?: boolean }) {
  const [history, setHistory] = useState<SupportStatusHistoryEntry[]>([]);

  useEffect(() => {
    fetchStatusHistory(ticket.id).then(({ data }) => setHistory(data ?? []));
  }, [ticket.id]);

  const ctx = ticket.context ?? {};
  const ctxRows: { label: string; value: string }[] = [];
  if (ctx.order_number) ctxRows.push({ label: 'Vaka No', value: `#${ctx.order_number}` });
  if (ctx.patient_name) ctxRows.push({ label: 'Hasta', value: ctx.patient_name });
  if (ctx.doctor_name) ctxRows.push({ label: 'Hekim', value: ctx.doctor_name });
  if (ctx.clinic_name) ctxRows.push({ label: 'Klinik', value: ctx.clinic_name });
  if (ctx.stage_label || ticket.stage_key) ctxRows.push({ label: 'Aşama', value: ctx.stage_label ?? ticket.stage_key ?? '' });
  if (ctx.machine) ctxRows.push({ label: 'Makine', value: ctx.machine });
  if (ctx.last_action) ctxRows.push({ label: 'Son Eylem', value: ctx.last_action });
  if (ticket.error_code || ctx.error_code) ctxRows.push({ label: 'Hata Kodu', value: ticket.error_code ?? ctx.error_code ?? '' });
  if (ctx.browser) ctxRows.push({ label: 'Tarayıcı', value: ctx.browser });
  if (ctx.device) ctxRows.push({ label: 'Cihaz', value: ctx.device });

  const Body: any = embedded ? View : ScrollView;
  const bodyProps: any = embedded
    ? { style: { gap: 16 } }
    : { style: { flex: 1 }, contentContainerStyle: { padding: 16, gap: 16 } };

  return (
    <Body {...bodyProps}>
      {/* Vaka Bilgisi */}
      <SectionTitle icon={Briefcase} label="Vaka Bilgisi" />
      {ctxRows.length > 0 ? (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: W.border, overflow: 'hidden' }}>
          {ctxRows.map((r, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'baseline', gap: 10,
              paddingHorizontal: 12, paddingVertical: 9,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: W.borderSoft,
              backgroundColor: i % 2 === 0 ? W.surface : W.soft,
            }}>
              <Text style={{ width: 78, fontSize: 9.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 0.8, textTransform: 'uppercase' }}>{r.label}</Text>
              <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: W.ink }} numberOfLines={2}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ padding: 14, borderRadius: 14, backgroundColor: W.soft }}>
          <Text style={{ fontSize: 11.5, color: W.inkMute, lineHeight: 16 }}>
            Manuel açılan talep — vaka context'i yok. Sipariş veya aşamadan açarsan otomatik dolar.
          </Text>
        </View>
      )}

      {/* SLA */}
      <SectionTitle icon={Timer} label="SLA Durumu" />
      <View style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: W.border, backgroundColor: W.surface, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: W.inkMute }}>Öncelik</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: PRIORITY_COLORS[ticket.priority].fg }}>
            {PRIORITY_LABELS[ticket.priority]} · {SLA_HOURS[ticket.priority]}sa
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: W.inkMute }}>Son Tarih</Text>
          <Text style={{ fontSize: 11.5, fontWeight: '700', color: W.inkStrong }}>
            {ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
          </Text>
        </View>
        {(() => {
          const s = slaInfo(ticket);
          if (s.tone === 'safe') return null;
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: W.orangeSoft, alignSelf: 'flex-start' }}>
              <AlertCircle size={11} color={W.orange} strokeWidth={2} />
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: W.orange }}>{s.label}</Text>
            </View>
          );
        })()}
      </View>

      {/* Timeline */}
      <SectionTitle icon={Activity} label="Aktivite Timeline" />
      <View style={{ gap: 6 }}>
        {history.length === 0 ? (
          <Text style={{ fontSize: 11.5, color: W.inkSoft, fontStyle: 'italic' }}>Henüz aktivite yok.</Text>
        ) : (
          history.map(h => (
            <View key={h.id} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: STATUS_COLORS[h.to_status as SupportStatus]?.fg ?? W.inkSoft }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: W.ink }}>
                  {h.from_status ? `${STATUS_LABELS[h.from_status]} → ` : ''}
                  {STATUS_LABELS[h.to_status]}
                </Text>
                <Text style={{ fontSize: 10, color: W.inkSoft, marginTop: 1 }}>
                  {h.actor?.full_name ?? 'Sistem'} · {timeAgo(h.created_at)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Checklist */}
      <ChecklistSection ticket={ticket} isAdmin={isAdmin} onUpdate={onUpdate} />
    </Body>
  );
}

function ChecklistSection({ ticket, isAdmin, onUpdate }: { ticket: SupportTicket; isAdmin: boolean; onUpdate: () => void }) {
  const [items, setItems] = useState(ticket.checklist ?? []);
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => { setItems(ticket.checklist ?? []); }, [ticket.id, ticket.checklist]);

  const persist = async (next: typeof items) => {
    setItems(next);
    const { error } = await updateTicketChecklist(ticket.id, next);
    if (error) {
      toast.error('Checklist güncellenemedi');
      setItems(items); // rollback
      return;
    }
    onUpdate();
  };

  const toggle = (idx: number) => {
    const next = items.map((it, i) => i === idx ? { ...it, checked: !it.checked, checked_at: !it.checked ? new Date().toISOString() : undefined } : it);
    persist(next);
  };

  const remove = (idx: number) => {
    persist(items.filter((_, i) => i !== idx));
  };

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    const key = `c_${Date.now()}`;
    persist([...items, { key, label, checked: false }]);
    setNewLabel('');
    setAdding(false);
  };

  const allChecked = items.length > 0 && items.every(it => it.checked);
  const checkedCount = items.filter(it => it.checked).length;

  if (items.length === 0 && !isAdmin) return null;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ListChecks size={12} color={W.orange} strokeWidth={1.8} />
          <Text style={{ fontSize: 10.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            Doğrulama Checklist
          </Text>
        </View>
        {items.length > 0 && (
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: allChecked ? '#2D9A6B' : W.inkMute }}>
            {checkedCount}/{items.length}
          </Text>
        )}
      </View>

      <View style={{ gap: 6 }}>
        {items.length === 0 ? (
          <Text style={{ fontSize: 11.5, color: W.inkSoft, fontStyle: 'italic' }}>
            Henüz doğrulama maddesi yok. Çözmeden önce eklemek istediğin kontrolleri ekle.
          </Text>
        ) : items.map((it, i) => (
          <View key={i} style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12,
            borderWidth: 1, borderColor: it.checked ? hexA('#2D9A6B', 0.3) : W.border, backgroundColor: it.checked ? hexA('#2D9A6B', 0.06) : W.surface,
          }}>
            <Pressable onPress={() => toggle(i)} hitSlop={4}>
              <View style={{
                width: 18, height: 18, borderRadius: 6,
                borderWidth: 1.5,
                borderColor: it.checked ? '#2D9A6B' : W.inkSoft,
                backgroundColor: it.checked ? '#2D9A6B' : W.surface,
                alignItems: 'center', justifyContent: 'center',
              }}>
                {it.checked && <Check size={11} color="#FFF" strokeWidth={3} />}
              </View>
            </Pressable>
            <Text style={{ flex: 1, fontSize: 11.5, color: it.checked ? W.inkMute : W.ink, textDecorationLine: it.checked ? 'line-through' : 'none' }}>
              {it.label}
            </Text>
            {isAdmin && (
              <Pressable onPress={() => remove(i)} hitSlop={4}>
                <X size={11} color={W.inkSoft} strokeWidth={1.7} />
              </Pressable>
            )}
          </View>
        ))}

        {isAdmin && (
          <View>
            {adding ? (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                <TextInput
                  value={newLabel}
                  onChangeText={setNewLabel}
                  placeholder="Yeni kontrol maddesi…"
                  placeholderTextColor={W.inkSoft}
                  autoFocus
                  onSubmitEditing={add}
                  style={{
                    flex: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 11.5,
                    borderRadius: 12, borderWidth: 1, borderColor: W.inkSoft, backgroundColor: W.surface,
                    color: W.ink,
                    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
                  } as any}
                />
                <Pressable onPress={add} style={({ hovered }: any) => ({
                  paddingHorizontal: 12, justifyContent: 'center',
                  borderRadius: 12, backgroundColor: hovered ? W.ink : W.inkStrong,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}>
                  <Plus size={13} color="#FFF" strokeWidth={2} />
                </Pressable>
                <Pressable onPress={() => { setAdding(false); setNewLabel(''); }} hitSlop={6} style={{ width: 30, alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} color={W.inkSoft} strokeWidth={1.7} />
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setAdding(true)}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                  borderWidth: 1, borderStyle: 'dashed', borderColor: W.inkSoft,
                  backgroundColor: hovered ? W.soft : 'transparent',
                  alignSelf: 'flex-start',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Plus size={11} color={W.inkMute} strokeWidth={1.8} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: W.inkMute }}>Kontrol ekle</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon size={12} color={W.orange} strokeWidth={1.8} />
      <Text style={{ fontSize: 10.5, fontWeight: '600', color: W.inkSoft, letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// New Ticket Modal
// ═══════════════════════════════════════════════════════════════════════════

function NewTicketModal({ visible, onClose, onCreated, labId, prefill }: {
  visible: boolean; onClose: () => void; onCreated: (id: string) => void; labId: string | null;
  prefill?: TicketPrefill | null;
}) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('teknik_sorun');
  const [priority, setPriority] = useState<SupportPriority>('normal');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setSubject(''); setCategory('teknik_sorun'); setPriority('normal'); setBody(''); };

  // Modal her açıldığında şablon prefill'ini uygula (yoksa boş başla).
  useEffect(() => {
    if (!visible) return;
    setSubject(prefill?.subject ?? '');
    setCategory(prefill?.category ?? 'teknik_sorun');
    setPriority(prefill?.priority ?? 'normal');
    setBody(prefill?.body ?? '');
  }, [visible, prefill]);

  const handleSubmit = async () => {
    if (!subject.trim()) { toast.error('Başlık zorunlu.'); return; }
    if (!body.trim())    { toast.error('Açıklama zorunlu.'); return; }
    setSaving(true);
    try {
      const { data, error } = await createTicket({
        subject, category, priority, body,
        lab_id: labId,
        context: {
          source: 'manual',
          browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : undefined,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      });
      if (error || !data) throw error;
      toast.success('Talep oluşturuldu.');
      reset();
      onCreated(data.id);
    } catch (e: any) {
      toast.error(e?.message ?? 'Talep oluşturulamadı');
    } finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{ width: 580, maxWidth: '100%', maxHeight: '92%', backgroundColor: W.surface, borderRadius: 22, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 22, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: W.border, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 22, color: W.inkStrong, letterSpacing: -0.5 }}>Yeni Destek Talebi</Text>
              <Text style={{ fontSize: 12, color: W.inkMute, marginTop: 4 }}>Üretim ekibimiz vakayla birlikte çözer.</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={18} color={W.inkMute} strokeWidth={1.6} />
            </Pressable>
          </View>

          <ScrollView style={{ padding: 18 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}>
            <Text style={fieldLabel}>Başlık</Text>
            <TextInput
              value={subject}
              onChangeText={setSubject}
              placeholder="Örn: CAM export hatası — LAB-2026-0044"
              placeholderTextColor={W.inkSoft}
              style={fieldInput as any}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Kategori</Text>
            <SupportDropdown
              value={category}
              onChange={(v) => setCategory(v as SupportCategory)}
              options={(Object.keys(CATEGORY_LABELS) as SupportCategory[]).map(k => ({
                value: k, label: CATEGORY_LABELS[k], icon: CATEGORY_ICONS[k],
              }))}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Öncelik</Text>
            <SupportDropdown
              value={priority}
              onChange={(v) => setPriority(v as SupportPriority)}
              options={(['dusuk','normal','yuksek','kritik','acil_mudahale'] as SupportPriority[]).map(k => ({
                value: k, label: PRIORITY_LABELS[k], colorDot: PRIORITY_COLORS[k].fg,
              }))}
            />

            <View style={{ height: 14 }} />
            <Text style={fieldLabel}>Açıklama</Text>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Sorunu net anlat — adım adım ne yaptın, ne bekledin, ne oldu? Hata mesajı, vaka numarası vs."
              placeholderTextColor={W.inkSoft}
              multiline
              style={[fieldInput, { minHeight: 140, textAlignVertical: 'top' }] as any}
            />
            <Text style={{ fontSize: 10.5, color: W.inkSoft, marginTop: 6, lineHeight: 15 }}>
              İpucu: vaka veya aşama ekranından destek açarsan vaka/dosya/hata kodu otomatik eklenir.
            </Text>
            <View style={{ height: 4 }} />
          </ScrollView>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: W.border }}>
            <PillBtn variant="ghost" onPress={onClose}>İptal</PillBtn>
            <PillBtn
              variant="dark"
              onPress={handleSubmit}
              disabled={saving}
              leftIcon={<MessageCirclePlus size={14} color="#FFF" strokeWidth={1.8} />}
            >
              {saving ? 'Oluşturuluyor…' : 'Talep Aç'}
            </PillBtn>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const fieldLabel: any = {
  fontSize: 10.5, fontWeight: '600', color: W.inkSoft,
  letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 7,
};
const fieldInput: any = {
  paddingHorizontal: 14, paddingVertical: 11,
  borderRadius: 14, borderWidth: 1, borderColor: W.border,
  backgroundColor: W.surface,
  fontSize: 13.5, color: W.ink,
  ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
};
