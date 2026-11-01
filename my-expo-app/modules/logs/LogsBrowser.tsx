import { localeTag } from '../../core/i18n';
import { autoT } from '../../core/i18n/autoTranslate';
/**
 * LogsBrowser — Loglar ekranı (Ayarlar > Loglar ve (admin)/logs ortak gövdesi).
 * ────────────────────────────────────────────────────────────────────────────
 * Süzme ve sayfalama SUNUCUDA: activity_log_search (20261027120000/130000) — tarih, kişi,
 * kişi tipi, eylem türü, sipariş no ve metin; 100'lük sayfalar, "Daha fazla" ile imleç
 * (created_at, id). Eskiden son 2.000 kayıt indirilip istemcide süzülüyordu.
 *
 * Erişim: yalnız hesap sahibi (user_type='admin' — activity_logs kuralı is_admin_user()).
 * Başkasına ekran boş durum gösterir, sorgu atılmaz. Sipariş satırı o siparişin Geçmiş
 * sekmesini açar (?tab=history).
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable,
  RefreshControl, TextInput, Platform,
} from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import {
  Search, RefreshCw, PlusCircle, UserCheck, Trash2, ArrowLeftRight,
  Pencil, Info, XCircle, LogIn, MessageCircle, Paperclip, Package,
  ClipboardCheck, Ban, Lock, History, Hash,
} from '../../core/ui/icons';
import { supabase } from '../../core/api/supabase';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { useInkUI } from '../../core/theme/inkScale';
import { useAuthStore } from '../../core/store/authStore';
import { GlassTooltip } from '../../core/ui/GlassTooltip';
import { FilterMenu } from '../../core/ui/FilterMenu';
import { LogDetail, logSummaryLine, fullTimestamp, ENTITY_LABEL, logActionText, type NameOf } from './logDetail';
import { PAGE_PADDING } from '../../core/ui/pageMetrics';
import { orderTarget } from './logTarget';

// ── Types ───────────────────────────────────────────────────────────────
type LogTab = 'all' | 'users' | 'technicians' | 'clinics' | 'doctors';
type RangeKey = 'all' | 'today' | '7d' | '30d' | 'this_month' | 'last_month';

interface ActivityLog {
  id: string;
  actor_id: string | null;
  actor_name: string;
  actor_type: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

const PAGE = 100;

/** Sekme → activity_log_search p_actor_type (grup anahtarları sunucuda açılır). */
const TAB_ACTOR_TYPE: Record<LogTab, string | null> = {
  all: null, users: 'users', technicians: 'technician', clinics: 'clinic', doctors: 'doctor',
};

const KIND_ITEMS = [
  { key: 'all',            label: 'Tüm türler' },
  { key: 'work_order',     label: 'Sipariş' },
  { key: 'field_change',   label: 'Sipariş düzenleme' },
  { key: 'status_change',  label: 'Durum değişikliği' },
  { key: 'stage',          label: 'Aşama' },
  { key: 'reassign',       label: 'Aşama devri' },
  { key: 'message',        label: 'Mesaj' },
  { key: 'photo',          label: 'Dosya' },
  { key: 'change_request', label: 'Talepler' },
  { key: 'material',       label: 'Malzeme / stok' },
  { key: 'payment',        label: 'Tahsilat' },
  { key: 'auth',           label: 'Oturum' },
  { key: 'profile',        label: 'Kullanıcı' },
  { key: 'clinic',         label: 'Klinik' },
  { key: 'doctor',         label: 'Hekim' },
];

const RANGE_ITEMS: { key: RangeKey; label: string }[] = [
  { key: 'all',        label: 'Tüm zamanlar' },
  { key: 'today',      label: 'Bugün' },
  { key: '7d',         label: 'Son 7 gün' },
  { key: '30d',        label: 'Son 30 gün' },
  { key: 'this_month', label: 'Bu ay' },
  { key: 'last_month', label: 'Geçen ay' },
];

// ── Helpers ─────────────────────────────────────────────────────────────
/** Cihazın yerel gün sınırları (lab kullanıcıları lab saat dilimindedir); bitiş HARİÇ. */
function rangeBounds(k: RangeKey): { from: string | null; to: string | null } {
  const now = new Date();
  const day = (y: number, m: number, d: number) => new Date(y, m, d).toISOString();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  switch (k) {
    case 'today':      return { from: day(y, m, d), to: null };
    case '7d':         return { from: day(y, m, d - 6), to: null };
    case '30d':        return { from: day(y, m, d - 29), to: null };
    case 'this_month': return { from: day(y, m, 1), to: null };
    case 'last_month': return { from: day(y, m - 1, 1), to: day(y, m, 1) };
    default:           return { from: null, to: null };
  }
}

function timeAgo(dateStr: string): string {
  const now  = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60)     return autoT('Az önce');
  if (diff < 3600)   return `${Math.floor(diff / 60)} ${autoT('dk önce')}`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} ${autoT('saat önce')}`;
  if (diff < 172800) return autoT('Dün') + ' ' + date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
  if (diff < 604800) return `${Math.floor(diff / 86400)} ${autoT('gün önce')}`;
  return date.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', year: 'numeric' });
}

// Normalize eski/ham actor_type değerlerini sabit kümeye indir
function normType(t: string): string {
  if (t === 'clinic_admin' || t === 'clinic_secretary') return 'clinic';
  return t;
}

function actionIcon(action: string): { Icon: any; color: string; bg: string } {
  if (action.includes('Giriş'))
    return { Icon: LogIn,           color: '#2563EB', bg: '#DBEAFE' };
  if (action.includes('Mesaj'))
    return { Icon: MessageCircle,   color: '#0891B2', bg: '#CFFAFE' };
  if (action.includes('Dosya'))
    return { Icon: Paperclip,       color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('Malzeme'))
    return { Icon: Package,         color: '#B45309', bg: '#FEF3C7' };
  if (action.includes('Aşama'))
    return { Icon: ArrowLeftRight,  color: '#4338CA', bg: '#E0E7FF' };
  if (action.includes('iptal'))
    return { Icon: Ban,             color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('talebi'))
    return { Icon: ClipboardCheck,  color: '#0369A1', bg: '#E0F2FE' };
  if (action.includes('oluşturdu') || action.includes('oluşturuldu'))
    return { Icon: PlusCircle,      color: '#059669', bg: '#D1FAE5' };
  if (action.includes('aktif edildi'))
    return { Icon: UserCheck,       color: '#059669', bg: '#D1FAE5' };
  if (action.includes('pasif edildi') || action.includes('silindi'))
    return { Icon: Trash2,          color: '#DC2626', bg: '#FEF2F2' };
  if (action.includes('→') || action.includes('Durumu'))
    return { Icon: ArrowLeftRight,  color: '#7C3AED', bg: '#EDE9FE' };
  if (action.includes('düzenledi') || action.includes('güncelledi') || action.includes('güncellendi'))
    return { Icon: Pencil,          color: '#0F172A', bg: '#F1F5F9' };
  return   { Icon: Info,            color: '#64748B', bg: '#F1F5F9' };
}

const CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 16px rgba(0,0,0,0.04)' } as any,
  default: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
});

// ── LogRow ──────────────────────────────────────────────────────────────
function LogRow({ log, isLast, nameOf, onOpenOrder, fallbackOrder }: {
  log: ActivityLog; isLast: boolean; nameOf: NameOf; onOpenOrder: (target: string) => void;
  /** Sipariş no süzgeci açıkken her satır o siparişe aittir. */
  fallbackOrder?: string | null;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Ayrıntı varsayılan kapalı — liste taranabilir kalır, isteyen satırı açar.
  const [open, setOpen] = useState(false);
  const { Icon, color, bg } = actionIcon(log.action);
  const summary = logSummaryLine(log, nameOf);
  const entityName = log.entity_type ? (ENTITY_LABEL[log.entity_type] ?? log.entity_type) : null;
  const target = orderTarget(log, fallbackOrder);
  const at = normType(log.actor_type);
  const badge =
    at === 'admin'      ? { label: 'Admin',     bg: '#FEF3C7', text: '#92400E' } :
    at === 'doctor'     ? { label: 'Hekim',     bg: '#DBEAFE', text: '#1D4ED8' } :
    at === 'clinic'     ? { label: 'Klinik',    bg: '#E0F2FE', text: '#0369A1' } :
    at === 'technician' ? { label: 'Teknisyen', bg: '#E0E7FF', text: '#4338CA' } :
    at === 'courier'    ? { label: 'Kurye',     bg: '#FEF3C7', text: '#B45309' } :
                          { label: 'Lab',       bg: '#DCFCE7', text: '#166534' };
  return (
    <Pressable
      onPress={() => setOpen(v => !v)}
      accessibilityLabel={open ? autoT('Ayrıntıyı gizle') : autoT('Ayrıntı')}
      className="flex-row gap-3 px-4 py-3"
      style={({ hovered }: any) => ({
        ...(!isLast ? { borderBottomWidth: 1, borderBottomColor: T.hairline2 } : {}),
        backgroundColor: open ? U.rowHover : hovered ? U.rowHover : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View className="w-8 h-8 rounded-lg items-center justify-center" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : bg }}>
        <Icon size={15} color={isDark ? T.ink2 : color} strokeWidth={1.8} />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center gap-1.5 mb-0.5">
          <Text className="text-[13px] font-bold" style={{ color: T.ink }} numberOfLines={1}>{log.actor_name}</Text>
          <View className="px-1.5 py-0.5 rounded" style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : badge.bg }}>
            <Text className="text-[9px] font-bold" style={{ color: isDark ? T.ink2 : badge.text }}>{badge.label}</Text>
          </View>
          <Text className="text-[11px] ml-auto" style={{ color: T.ink3 }}>{timeAgo(log.created_at)}</Text>
        </View>
        <Text className="text-[13px]" style={{ color: T.ink2 }}>{logActionText(log)}</Text>
        {/* Bağlam şeridi — açmadan da hangi kayıt/sipariş/aşama olduğu görünsün */}
        {(log.entity_label || summary) ? (
          <View className="flex-row items-center gap-1.5 mt-0.5">
            {entityName ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 5, backgroundColor: U.chipNeutral, flexShrink: 0 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.3, color: U.ink[500] }}>{autoT(entityName)}</Text>
              </View>
            ) : null}
            <Text className="text-[11px]" style={{ color: T.ink3, flexShrink: 1 }} numberOfLines={1}>
              {[log.entity_label, summary].filter(Boolean).join(' · ')}
            </Text>
          </View>
        ) : null}

        {/* Göreli zaman denetim için yetmez → saniyeli tam damga + ayrıntı / sipariş geçmişi */}
        <View className="flex-row items-center gap-3 mt-1">
          <Text style={{ fontSize: 10.5, color: U.ink[400] }}>{fullTimestamp(log.created_at)}</Text>
          {target ? (
            <Pressable
              onPress={() => onOpenOrder(target)}
              accessibilityRole="link"
              hitSlop={6}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginStart: 'auto' as any, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <History size={12} color={isDark ? '#93C5FD' : '#004B87'} strokeWidth={1.8} />
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: isDark ? '#93C5FD' : '#004B87' }}>{autoT('Sipariş geçmişi')}</Text>
            </Pressable>
          ) : null}
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: U.ink[500], marginStart: target ? 0 : 'auto' as any }}>
            {open ? autoT('Ayrıntıyı gizle') + ' ▴' : autoT('Ayrıntı') + ' ▾'}
          </Text>
        </View>

        {open && <LogDetail log={log} nameOf={nameOf} />}
      </View>
    </Pressable>
  );
}

// ── Erişim yok ──────────────────────────────────────────────────────────
function NoAccess() {
  const T = useMobileTokens();
  return (
    <View className="items-center pt-16 gap-3" style={{ paddingHorizontal: PAGE_PADDING }}>
      <Lock size={36} color={T.ink3} strokeWidth={1.4} />
      <Text className="text-[15px] font-semibold" style={{ color: T.ink2 }}>{autoT('Loglar yalnız hesap sahibine açıktır')}</Text>
      <Text className="text-[13px] text-center" style={{ color: T.ink3 }}>
        {autoT('Bir siparişin kayıtlarını o siparişin Geçmiş sekmesinde görebilirsiniz.')}
      </Text>
    </View>
  );
}

// ── Component ──────────────────────────────────────────────────────────
interface Props { accentColor?: string; }

export function LogsBrowser({ accentColor = '#004B87' }: Props) {
  // Kayıtları yalnız sahip okuyabilir (activity_logs kuralı is_admin_user()); başkasına sorgu atılmaz.
  const isOwner = useAuthStore(s => s.profile?.user_type) === 'admin';
  if (!isOwner) return <NoAccess />;
  return <LogsBrowserInner accentColor={accentColor} />;
}

function LogsBrowserInner({ accentColor = '#004B87' }: Props) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const router = useRouter();
  const seg = String((useSegments() as string[])?.[0] ?? '');
  const accent = isDark ? '#93C5FD' : accentColor;

  const [logs,        setLogs]        = useState<ActivityLog[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore,     setHasMore]     = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [tab,         setTab]         = useState<LogTab>('all');
  const [kind,        setKind]        = useState('all');
  const [actor,       setActor]       = useState('all');
  const [range,       setRange]       = useState<RangeKey>('all');
  const [search,      setSearch]      = useState('');
  const [q,           setQ]           = useState('');
  const [searchOpen,  setSearchOpen]  = useState(false);
  const [orderNoText, setOrderNoText] = useState('');
  const [orderNo,     setOrderNo]     = useState('');
  const [actors,      setActors]      = useState<{ actor_id: string; actor_name: string; n: number }[]>([]);
  const reqId = useRef(0);

  // Metin ve sipariş no yazarken her harfte sorgu atılmasın
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { const t = setTimeout(() => setOrderNo(orderNoText.trim()), 350); return () => clearTimeout(t); }, [orderNoText]);

  const params = useMemo(() => {
    const b = rangeBounds(range);
    return {
      p_from: b.from,
      p_to: b.to,
      p_actor: actor === 'all' ? null : actor,
      p_kind: kind === 'all' ? null : kind,
      p_order_no: orderNo || null,
      p_actor_type: TAB_ACTOR_TYPE[tab],
      p_q: q || null,
    };
  }, [range, actor, kind, orderNo, tab, q]);
  const filtered = !!(params.p_from || params.p_actor || params.p_kind || params.p_order_no || params.p_actor_type || params.p_q);

  const fetchPage = useCallback(async (cursor: ActivityLog | null) => {
    const { data, error: err } = await supabase.rpc('activity_log_search', {
      ...params,
      p_before: cursor?.created_at ?? null,
      p_before_id: cursor?.id ?? null,
      p_limit: PAGE,
    });
    if (err) throw err;
    return (data ?? []) as ActivityLog[];
  }, [params]);

  const loadFirst = useCallback(async (isRefresh = false) => {
    const my = ++reqId.current;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const page = await fetchPage(null);
      if (my !== reqId.current) return;
      setLogs(page);
      setHasMore(page.length === PAGE);
      setError(null);
    } catch (e: any) {
      if (my === reqId.current) setError(e?.message ?? autoT('Kayıtlar yüklenemedi'));
    } finally {
      if (my === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || logs.length === 0) return;
    const my = reqId.current;
    setLoadingMore(true);
    try {
      const page = await fetchPage(logs[logs.length - 1]);
      if (my !== reqId.current) return;
      setLogs(prev => {
        const seen = new Set(prev.map(l => l.id));
        return [...prev, ...page.filter(l => !seen.has(l.id))];
      });
      setHasMore(page.length === PAGE);
    } catch (e: any) {
      setError(e?.message ?? autoT('Kayıtlar yüklenemedi'));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, logs, hasMore, loadingMore]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  useEffect(() => {
    supabase.rpc('activity_log_actors').then(({ data }) => {
      if (Array.isArray(data)) setActors(data as any);
    });
  }, []);

  // Realtime: yeni kayıt yalnız süzgeçsiz görünümde başa eklenir (süzgeçliyken sayfa tutarlı kalsın)
  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  useEffect(() => {
    const ch = supabase
      .channel('activity_logs_browser')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs' }, (p) => {
        if (filteredRef.current) return;
        const row = p.new as ActivityLog;
        setLogs(prev => (prev.some(l => l.id === row.id) ? prev : [row, ...prev]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const nameMap = useMemo(() => new Map(actors.map(a => [a.actor_id, a.actor_name])), [actors]);
  const nameOf: NameOf = useCallback((id: string) => nameMap.get(id) ?? null, [nameMap]);

  const openOrder = useCallback((target: string) => {
    const grp = seg.startsWith('(') ? seg : '(admin)';
    router.push(`/${grp}/order/${encodeURIComponent(target)}?tab=history` as any);
  }, [router, seg]);

  const TABS: { key: LogTab; label: string }[] = [
    { key: 'all',         label: 'Tümü' },
    { key: 'users',       label: 'Kullanıcılar' },
    { key: 'technicians', label: 'Teknisyenler' },
    { key: 'clinics',     label: 'Klinikler' },
    { key: 'doctors',     label: 'Hekimler' },
  ];
  const actorItems = useMemo(
    () => [{ key: 'all', label: autoT('Tüm kişiler') }, ...actors.map(a => ({ key: a.actor_id, label: a.actor_name || '—' }))],
    [actors],
  );

  const clearFilters = () => {
    setTab('all'); setKind('all'); setActor('all'); setRange('all');
    setSearch(''); setOrderNoText(''); setSearchOpen(false);
  };

  return (
    <View className="flex-1">
      {/* Toolbar: kişi tipi sekmeleri + arama/yenile */}
      <View className="flex-row items-center px-7 pb-3">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="flex-1"
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
        >
          {TABS.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              className="py-1.5 rounded-lg"
              style={{ paddingHorizontal: tab === t.key ? 18 : 12, backgroundColor: tab === t.key ? `${accent}18` : 'transparent' }}
            >
              <Text className="text-[12px] font-semibold" style={{ color: tab === t.key ? accent : T.ink3 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View className="flex-row items-center gap-1.5 ps-2">
          <GlassTooltip title={autoT('Ara')} text={autoT('Eylem, kayıt ya da kişi adında ara')}>
            <Pressable
              onPress={() => setSearchOpen(v => !v)}
              className="w-8 h-8 rounded-lg items-center justify-center"
              style={{ backgroundColor: searchOpen ? `${accent}14` : 'transparent' }}
            >
              <Search size={15} color={searchOpen ? accent : T.ink3} strokeWidth={1.8} />
            </Pressable>
          </GlassTooltip>
          <GlassTooltip title={autoT('Yenile')} text={autoT('Kayıtları yeniden yükle')}>
            <Pressable onPress={() => loadFirst(true)} className="w-8 h-8 rounded-lg items-center justify-center">
              <RefreshCw size={15} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </GlassTooltip>
        </View>
      </View>

      {/* Süzgeçler: tarih · tür · kişi · sipariş no */}
      <View className="flex-row flex-wrap items-center gap-2 px-7 pb-3">
        <FilterMenu size="sm" label={autoT('Tarih')} items={RANGE_ITEMS.map(r => ({ key: r.key, label: autoT(r.label) }))}
          active={range} onChange={(k) => setRange(k as RangeKey)} accent={accent} />
        <FilterMenu size="sm" label={autoT('Tür')} items={KIND_ITEMS.map(k => ({ key: k.key, label: autoT(k.label) }))}
          active={kind} onChange={setKind} accent={accent} />
        <FilterMenu size="sm" label={autoT('Kişi')} items={actorItems} active={actor} onChange={setActor} accent={accent} />
        <View className="flex-row items-center gap-1.5 rounded-full px-3" style={{ height: 32, borderWidth: 1, borderColor: T.hairline, backgroundColor: U.plainBtn.bg, minWidth: 150 }}>
          <Hash size={13} color={T.ink3} strokeWidth={1.8} />
          <TextInput
            value={orderNoText}
            onChangeText={setOrderNoText}
            placeholder={autoT('Sipariş no')}
            placeholderTextColor={T.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            // @ts-ignore web
            style={{ flex: 1, fontSize: 12, color: T.ink, outlineWidth: 0, paddingVertical: 0 }}
          />
          {orderNoText.length > 0 && (
            <Pressable onPress={() => setOrderNoText('')} hitSlop={6}>
              <XCircle size={13} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
        {filtered && (
          <Pressable onPress={clearFilters} hitSlop={6} style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>{autoT('Süzgeçleri temizle')}</Text>
          </Pressable>
        )}
      </View>

      {/* Search bar */}
      {searchOpen && (
        <View className="px-7 pb-3">
          <View className="flex-row items-center gap-2 rounded-xl px-3 h-10" style={{ borderWidth: 1, borderColor: T.hairline, backgroundColor: T.cardSoft }}>
            <Search size={14} color={T.ink3} strokeWidth={1.8} />
            <TextInput
              className="flex-1 text-[13px]"
              value={search} onChangeText={setSearch}
              placeholder="İsim, aksiyon veya kayıt ara..."
              placeholderTextColor={T.ink3}
              autoFocus
              // @ts-ignore web
              style={{ outlineWidth: 0, color: T.ink }}
            />
            {search.length > 0 && (
              <GlassTooltip title={autoT('Temizle')} text={autoT('Aramayı temizle ve kapat')}>
                <Pressable onPress={() => { setSearch(''); setSearchOpen(false); }}>
                  <XCircle size={14} color={T.ink3} strokeWidth={1.8} />
                </Pressable>
              </GlassTooltip>
            )}
          </View>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View className="flex-1 items-center justify-center gap-3 pt-20">
          <ActivityIndicator size="large" color={accent} />
          <Text className="text-[13px]" style={{ color: T.ink3 }}>Loglar yükleniyor…</Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadFirst(true)} tintColor={accent} />}
        >
          {error ? (
            <View className="items-center pt-16 gap-3">
              <Info size={36} color={isDark ? '#FCA5A5' : '#D94B4B'} strokeWidth={1.4} />
              <Text className="text-[13px] text-center" style={{ color: T.ink2 }}>{error}</Text>
              <Pressable onPress={() => loadFirst()} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Tekrar dene')}</Text>
              </Pressable>
            </View>
          ) : logs.length === 0 ? (
            <View className="items-center pt-16 gap-3">
              <Info size={40} color={T.ink3} strokeWidth={1.2} />
              <Text className="text-[15px] font-semibold" style={{ color: T.ink2 }}>{filtered ? autoT('Bu filtrede kayıt yok') : 'Henüz log yok'}</Text>
              <Text className="text-[13px] text-center" style={{ color: T.ink3 }}>
                {filtered ? autoT('Süzgeçleri değiştirip yeniden deneyin') : 'Eylemler gerçekleştikçe burada görünecek'}
              </Text>
            </View>
          ) : (
            <View className="rounded-[24px] overflow-hidden" style={[CARD_SHADOW, { backgroundColor: T.card }]}>
              <View className="flex-row items-center px-4 py-2.5" style={{ backgroundColor: T.cardSoft, borderBottomWidth: 1, borderBottomColor: T.hairline2 }}>
                <Text className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.ink3 }}>Aktivite</Text>
                <Text className="text-[10px] font-bold tracking-wider uppercase ml-auto" style={{ color: T.ink3 }}>
                  {logs.length}{hasMore ? '+' : ''} {autoT('kayıt')}
                </Text>
              </View>
              {logs.map((log, i) => (
                <LogRow key={log.id} log={log} isLast={i === logs.length - 1 && !hasMore} nameOf={nameOf} onOpenOrder={openOrder} fallbackOrder={params.p_order_no} />
              ))}
              {hasMore && (
                <View className="items-center py-3" style={{ borderTopWidth: 1, borderTopColor: T.hairline2 }}>
                  <Pressable
                    onPress={loadMore}
                    disabled={loadingMore}
                    accessibilityRole="button"
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      paddingHorizontal: 18, paddingVertical: 8, borderRadius: 999,
                      borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    {loadingMore ? <ActivityIndicator size="small" color={T.ink3} /> : null}
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Daha fazla')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}
