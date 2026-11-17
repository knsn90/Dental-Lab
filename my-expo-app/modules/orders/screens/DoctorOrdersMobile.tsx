// modules/orders/screens/DoctorOrdersMobile.tsx
// Hekim vakalar sayfası (mobil). 2026-11 yeniden tasarım (apple-design):
//   büyük başlık → yapışık cam bant (arama + sıralama + çipler) → gruplu liste
//   • Acil & Geciken (öncelik)
//   • Bu hafta teslim
//   • Yaklaşan
//   • Tamamlanan
// Sabit yeşil özet kartı kaldırıldı: sayılar çiplerde, ekranın tamamı liste.

import React, { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, RefreshControl, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search, Plus, ArrowUpDown, Check, X, Inbox,
  Flame, Clock, CheckCircle2, CornerDownRight, CornerDownLeft,
} from '../../../core/ui/icons';
import { MOBILE_PANEL_THEMES, useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { isRTL, fmtDayMonthShort, localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { WorkOrder, WorkOrderStatus } from '../types';
import { buildRevisionCases } from '../revisionGroups';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isOverdueOrder } from '../../../core/metrics/orderDefs';

const DOCTOR = MOBILE_PANEL_THEMES.doctor;

interface Props {
  orders: WorkOrder[];
  loading: boolean;
  refetch: () => void;
  onOpenOrder: (o: WorkOrder) => void;
  onNewOrder?: () => void;
}

type FilterKey = 'all' | 'active' | 'production' | 'ready' | 'delivered' | 'overdue';
type SortKey = 'newest' | 'due' | 'name';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tümü' },
  { key: 'active',      label: 'Aktif' },
  { key: 'overdue',     label: 'Geciken' },
  { key: 'production',  label: 'Üretimde' },
  { key: 'ready',       label: 'Hazır' },
  { key: 'delivered',   label: 'Teslim' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'newest', label: 'En yeni' },
  { key: 'due',    label: 'Teslim tarihi' },
  { key: 'name',   label: 'Hasta adı' },
];

const STATUS_LABEL: Record<string, string> = {
  atama_bekleniyor: 'Atama Bekliyor',
  alindi:           'Alındı',
  asamada:          'Üretimde',
  uretimde:         'Üretimde',
  kalite_kontrol:   'Kalite Kontrol',
  teslimata_hazir:  'Hazır',
  kurye_bekleniyor: 'Kurye Bekleniyor',
  kuryede:          'Kuryede',
  teslim_edildi:    'Teslim Edildi',
  iptal:            'İptal',
};

// Status → 5 aşamalı progress (0-4 index)
const STATUS_STEP: Record<string, number> = {
  atama_bekleniyor: 0,
  alindi:           0,
  asamada:          1,
  uretimde:         1,
  kalite_kontrol:   2,
  teslimata_hazir:  3,
  kurye_bekleniyor: 3,
  kuryede:          3,
  teslim_edildi:    4,
  iptal:            0,
};

const webDisplay = (T: any) => (Platform.OS === 'web' ? ({ fontFamily: T.display } as any) : {});

export function DoctorOrdersMobile({ orders, loading, refetch, onOpenOrder, onNewOrder }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const [query, setQuery]   = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort]     = useState<SortKey>('newest');
  const [sortOpen, setSortOpen] = useState(false);

  // Tek tanım (2026-10-26): core/metrics/orderDefs + lab günü (beklemedeki/arşivdeki gecikmez).
  const today = useLabToday();
  const isOverdue = (o: WorkOrder) => isOverdueOrder(o as any, today);

  const counts = useMemo(() => ({
    all: orders.length,
    active:     orders.filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal').length,
    production: orders.filter(o => o.status === 'uretimde' || o.status === 'kalite_kontrol').length,
    ready:      orders.filter(o => o.status === 'teslimata_hazir').length,
    overdue:    orders.filter(isOverdue).length,
    delivered:  orders.filter(o => o.status === 'teslim_edildi').length,
  } as Record<FilterKey, number>), [orders, today]);

  const filtered = useMemo(() => {
    let list = orders;
    if (filter === 'active')     list = list.filter(o => o.status !== 'teslim_edildi' && o.status !== 'iptal');
    if (filter === 'production') list = list.filter(o => o.status === 'uretimde' || o.status === 'kalite_kontrol');
    if (filter === 'ready')      list = list.filter(o => o.status === 'teslimata_hazir');
    if (filter === 'overdue')    list = list.filter(isOverdue);
    if (filter === 'delivered')  list = list.filter(o => o.status === 'teslim_edildi');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(o =>
        (o.patient_name?.toLowerCase().includes(q)) ||
        (o.order_number?.toLowerCase().includes(q)) ||
        (o.work_type?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [orders, filter, query]);

  // Grupla: urgent/overdue → thisWeek → later → delivered
  const groups = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);

    const urgent: WorkOrder[] = [];
    const thisWeek: WorkOrder[] = [];
    const later: WorkOrder[] = [];
    const delivered: WorkOrder[] = [];

    // Revizyonlar: vaka grubu tek satır olur; gruba YALNIZ en güncel üye girer,
    // eskiler onun altında alt-liste olarak çizilir (bkz. revisionGroups).
    // YALNIZ revizyon gruplanır: devam siparişi asıl işin yerine geçmez, ayrı
    // (bağlantılı) bir iştir → masaüstündeki gibi kendi kartı olur.
    const { anchors, children } = buildRevisionCases(filtered as any[], { linkBy: 'revision' });
    for (const o of anchors as WorkOrder[]) {
      if (o.status === 'teslim_edildi') { delivered.push(o); continue; }
      if (isOverdue(o) || o.is_urgent)  { urgent.push(o);    continue; }
      const d = new Date(o.delivery_date + 'T00:00:00');
      if (d.getTime() <= in7.getTime()) thisWeek.push(o);
      else later.push(o);
    }
    // Bucket-içi sıralama kullanıcı seçimine göre; varsayılan en yeni üstte
    // (teslim-bazlı gruplama her durumda korunur).
    const cmp = (a: WorkOrder, b: WorkOrder) => {
      if (sort === 'due') {
        return String(a.delivery_date ?? '').localeCompare(String(b.delivery_date ?? ''));
      }
      if (sort === 'name') {
        return String(a.patient_name ?? '').localeCompare(String(b.patient_name ?? ''), localeTag());
      }
      return String((b as any).created_at ?? '').localeCompare(String((a as any).created_at ?? ''));
    };
    urgent.sort(cmp); thisWeek.sort(cmp); later.sort(cmp); delivered.sort(cmp);
    return { urgent, thisWeek, later, delivered, revChildren: children };
  }, [filtered, sort]);

  const top = Math.max(insets.top, 8);
  const openNew = onNewOrder ?? (() => router.push('/(doctor)/new-order' as any));

  const card = (o: WorkOrder, overdue: boolean) => (
    <OrderCard
      key={o.id}
      order={o}
      overdue={overdue}
      onPress={() => onOpenOrder(o)}
      history={groups.revChildren.get(String(o.id)) as WorkOrder[] | undefined}
      onOpenOrder={onOpenOrder}
    />
  );

  // Cam bant — web'de kaydırınca logo/üst butonların hemen altına yapışır.
  // (Mobil tarayıcıda belge kayar, PWA'da kaydırma alanı; ikisinde de sticky
  //  aynı noktaya oturur. Native'de içerikle birlikte kayar.)
  const bandStyle: any = Platform.OS === 'web'
    ? {
        position: 'sticky', top: top + 52, zIndex: 9,
        backgroundColor: isDark ? 'rgba(14,14,14,0.82)' : 'rgba(249,250,251,0.82)',
        backdropFilter: 'blur(22px) saturate(180%)',
        WebkitBackdropFilter: 'blur(22px) saturate(180%)',
      }
    : { backgroundColor: T.bg };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: top + 60, paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={DOCTOR.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ═══ Büyük başlık ═══ */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingBottom: 14, flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              style={{ fontSize: 32, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, color: T.ink, ...webDisplay(T) }}
            >
              {autoT('Siparişler')}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 14, color: T.ink2 }}>
              <Text>{counts.active} {autoT('aktif')}</Text>
              {counts.overdue > 0 && (
                <>
                  <Text> · </Text>
                  <Text style={{ color: T.ruby, fontWeight: '600' }}>{counts.overdue} {autoT('geciken')}</Text>
                </>
              )}
            </Text>
          </View>
          <Pressable
            onPress={openNew}
            accessibilityRole="button"
            accessibilityLabel={autoT('Yeni sipariş')}
          >
            {({ pressed }: any) => (
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: DOCTOR.primary,
                transform: [{ scale: pressed ? 0.94 : 1 }],
              }}>
                <Plus size={20} color="#FFFFFF" strokeWidth={2.4} />
              </View>
            )}
          </Pressable>
        </View>

        {/* ═══ Cam bant: arama + sıralama + çipler ═══ */}
        <View style={[{ paddingTop: 8, paddingBottom: 10 }, bandStyle]}>
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: PAGE_PADDING }}>
            <View style={{
              flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
              height: 44, paddingHorizontal: 14,
              backgroundColor: T.card, borderRadius: 999,
              borderWidth: 1, borderColor: T.hairline,
            }}>
              <Search size={16} color={T.ink3} strokeWidth={1.9} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Hasta, sipariş no veya iş tipi…"
                placeholderTextColor={T.ink3}
                accessibilityLabel={autoT('Hasta, sipariş no veya iş tipi…')}
                returnKeyType="search"
                style={{
                  flex: 1, fontSize: 16, color: T.ink, paddingVertical: 0,
                  // @ts-ignore web outline reset
                  outlineWidth: 0,
                }}
              />
              {!!query && (
                <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel={autoT('Kapat')}>
                  <X size={15} color={T.ink3} strokeWidth={2} />
                </Pressable>
              )}
            </View>
            <SortButton active={sort !== 'newest'} onPress={() => setSortOpen(true)} />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, gap: 6, flexDirection: 'row', alignItems: 'center' }}
            style={{ flexGrow: 0 }}
          >
            {FILTERS.map(f => (
              <FilterChip
                key={f.key}
                label={autoT(f.label)}
                count={counts[f.key] ?? 0}
                active={filter === f.key}
                danger={f.key === 'overdue' && (counts.overdue ?? 0) > 0}
                onPress={() => setFilter(f.key)}
              />
            ))}
          </ScrollView>
        </View>

        {/* ═══ Gruplu liste ═══ */}
        {filtered.length === 0 ? (
          <EmptyState query={query} />
        ) : (
          <>
            <Group title={autoT('Acil & Geciken')} icon={Flame} iconColor={T.ruby} items={groups.urgent}
              renderItem={o => card(o, isOverdue(o))} />
            <Group title={autoT('Bu hafta teslim')} icon={Clock} iconColor={DOCTOR.primary} items={groups.thisWeek}
              renderItem={o => card(o, false)} />
            <Group title={autoT('Yaklaşan')} icon={Clock} iconColor={T.ink3} items={groups.later}
              renderItem={o => card(o, false)} />
            <Group title={autoT('Tamamlanan')} icon={CheckCircle2} iconColor={T.jade} items={groups.delivered}
              renderItem={o => card(o, false)} />
          </>
        )}
      </ScrollView>

      <SortSheet
        open={sortOpen}
        value={sort}
        onClose={() => setSortOpen(false)}
        onPick={(k) => { setSort(k); setSortOpen(false); }}
      />
    </View>
  );
}

// ─── Sıralama düğmesi ────────────────────────────────────────────────────

function SortButton({ active, onPress }: { active: boolean; onPress: () => void }) {
  const T = useMobileTokens();
  const U = useInkUI();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={autoT('Sırala')}>
      {({ pressed }: any) => (
        <View style={{
          width: 44, height: 44, borderRadius: 22,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: active ? `${DOCTOR.primary}24` : (U.isDark ? U.plainBtn.bg : T.card),
          borderWidth: 1, borderColor: active ? `${DOCTOR.primary}66` : (U.isDark ? U.plainBtn.border : T.hairline),
          transform: [{ scale: pressed ? 0.94 : 1 }],
        }}>
          <ArrowUpDown size={17} color={active ? (U.isDark ? '#74E1A8' : '#0C8F56') : T.ink} strokeWidth={1.8} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Çip (seçili daha geniş: 18 / 12) ───────────────────────────────────

function FilterChip({ label, count, active, danger, onPress }:
  { label: string; count: number; active: boolean; danger?: boolean; onPress: () => void }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const fg = active ? '#FFFFFF' : danger ? T.ruby : T.ink;
  const bg = active ? DOCTOR.primary : danger ? T.rubySoft : (U.isDark ? U.plainBtn.bg : T.card);
  const border = active ? DOCTOR.primary : danger ? `${T.ruby}40` : (U.isDark ? U.plainBtn.border : T.hairline);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: active ? 18 : 12, paddingVertical: 8,
        borderRadius: 999, backgroundColor: bg, borderWidth: 1, borderColor: border,
      }}>
        <Text style={{ fontSize: 14, fontWeight: active || danger ? '600' : '500', color: fg }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '500', color: active ? 'rgba(255,255,255,0.82)' : danger ? T.ruby : T.ink3 }}>
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Sıralama penceresi (ortada popup — proje kuralı) ────────────────────

function SortSheet({ open, value, onClose, onPick }:
  { open: boolean; value: SortKey; onClose: () => void; onPick: (k: SortKey) => void }) {
  const U = useInkUI();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={U.modalOverlay} onPress={onClose}>
        <Pressable style={[U.modalCard, { maxWidth: 380 }]} onPress={(e: any) => e?.stopPropagation?.()}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>{autoT('Sıralama')}</Text>
            <Pressable onPress={onClose} style={U.modalCloseBtn} accessibilityLabel={autoT('Kapat')}>
              <X size={16} color={U.ink[700]} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={{ paddingVertical: 6 }}>
            {SORTS.map((s, i) => {
              const sel = s.key === value;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => onPick(s.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                >
                  {({ pressed }: any) => (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      minHeight: 50, paddingHorizontal: 20,
                      backgroundColor: pressed ? U.rowHover : 'transparent',
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: U.hairlineSoft,
                    }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: sel ? '600' : '400', color: U.ink[900] }}>
                        {autoT(s.label)}
                      </Text>
                      {sel && <Check size={18} color={U.isDark ? '#74E1A8' : '#0C8F56'} strokeWidth={2.4} />}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({ query }: { query: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ marginTop: 40, alignItems: 'center', paddingHorizontal: 32, gap: 12 }}>
      <View style={{
        width: 64, height: 64, borderRadius: 22,
        backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Inbox size={28} color={T.ink3} strokeWidth={1.5} />
      </View>
      <Text style={{ fontSize: 16, fontWeight: '600', color: T.ink, textAlign: 'center', ...webDisplay(T) }}>
        {query ? 'Sonuç bulunamadı' : 'Bu filtrede sipariş yok'}
      </Text>
      <Text style={{ fontSize: 14, color: T.ink2, textAlign: 'center', lineHeight: 20 }}>
        {query ? 'Farklı bir anahtar kelime deneyin.' : 'Yeni bir sipariş açmak için + butonuna dokunun.'}
      </Text>
    </View>
  );
}

// ─── Group (bölüm başlığı) ───────────────────────────────────────────────

function Group<X>({ title, icon: Icon, iconColor, items, renderItem }:
  { title: string; icon: any; iconColor: string; items: X[]; renderItem: (i: X) => React.ReactNode }) {
  const T = useMobileTokens();
  if (items.length === 0) return null;
  return (
    <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingHorizontal: 2 }}>
        <Icon size={14} color={iconColor} strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>{title}</Text>
        <Text style={{ fontSize: 14, color: T.ink3 }}>{items.length}</Text>
      </View>
      <View style={{ gap: 10 }}>
        {items.map(renderItem)}
      </View>
    </View>
  );
}

// ─── Order card ──────────────────────────────────────────────────────────

function OrderCard({ order, overdue, onPress, history, onOpenOrder }:
  { order: WorkOrder; overdue: boolean; onPress: () => void;
    /** Aynı vakanın eski revizyonları — kartın altında girintili alt-liste */
    history?: WorkOrder[]; onOpenOrder?: (o: WorkOrder) => void }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const rtl = isRTL();
  const step = STATUS_STEP[order.status] ?? 0;
  const progressPct = ((step + 1) / 5) * 100;
  const due = formatDue(order.delivery_date, order.status);
  const statusLabel = autoT(STATUS_LABEL[order.status] ?? '');
  const teethStr = order.tooth_numbers?.length ? order.tooth_numbers.join(', ') : '';
  const workLine = [order.work_type ?? autoT('Sipariş'), teethStr, order.shade].filter(Boolean).join(' · ');
  const isContinuation = !(order as any).revision_of_id && !!(order as any).continues_order_id;
  const done = order.status === 'teslim_edildi';

  return (
    <>
    <Pressable onPress={onPress} accessibilityRole="button">
      {({ pressed }: any) => (
      <View style={{
        backgroundColor: pressed ? T.cardSoft : T.card, borderRadius: 18,
        paddingHorizontal: 16, paddingVertical: 14,
        borderWidth: 1, borderColor: overdue ? `${T.ruby}40` : T.hairline,
        transform: [{ scale: pressed ? 0.98 : 1 }],
        ...(Platform.OS === 'web' && !isDark ? { boxShadow: '0 1px 2px rgba(16,24,20,0.05)' } as any : {}),
      }}>
        {/* Satır 1 — hasta + göreli teslim */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text
            style={{ flex: 1, fontSize: 16, fontWeight: '600', color: T.ink, letterSpacing: -0.2, ...webDisplay(T) }}
            numberOfLines={1}
          >
            {order.patient_name ?? 'Hasta belirtilmemiş'}
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: overdue ? T.ruby : done ? T.jade : T.ink, flexShrink: 0 }}>
            {due}
          </Text>
        </View>

        {/* Satır 2 — rozetler + iş · dişler · renk, sağda sipariş no */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, minWidth: 0 }}>
          {order.is_urgent && (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: T.rubySoft, flexShrink: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: T.ruby, letterSpacing: 0.3 }}>{autoT('ACİL')}</Text>
            </View>
          )}
          {isContinuation && (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: isDark ? 'rgba(147,197,253,0.18)' : 'rgba(53,99,168,0.12)', flexShrink: 0 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#93C5FD' : '#2F5C9A', letterSpacing: 0.3 }}>{autoT('DEVAM')}</Text>
            </View>
          )}
          <Text
            style={{ flex: 1, fontSize: 13, color: T.ink2, textAlign: rtl ? 'right' : undefined }}
            numberOfLines={1}
          >
            {workLine}
          </Text>
          <Text style={{ fontSize: 12, color: T.ink3, fontFamily: T.mono, flexShrink: 0 }} numberOfLines={1}>
            #{order.order_number}
          </Text>
        </View>

        {/* Satır 3 — ince ilerleme + durum */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 999, backgroundColor: T.hairline, overflow: 'hidden' }}>
            <View style={{
              width: `${progressPct}%` as any, height: 4, borderRadius: 999,
              backgroundColor: overdue ? T.ruby : done ? T.jade : DOCTOR.primary,
            }} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2, flexShrink: 0 }}>
            {statusLabel}
          </Text>
        </View>
      </View>
      )}
    </Pressable>

    {/* Vakanın eski revizyonları — ayrı kart değil, girintili alt satır */}
    {(history ?? []).map(h => (
      <Pressable
        key={h.id}
        onPress={() => onOpenOrder?.(h)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          ...(rtl ? { marginRight: 20 } : { marginLeft: 20 }),
          marginTop: -2,
          paddingHorizontal: 12, paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: `${DOCTOR.primary}0D`,
          borderWidth: 1, borderColor: `${DOCTOR.primary}1F`,
        }}
      >
        {rtl
          ? <CornerDownLeft  size={13} color={T.ink3} strokeWidth={2} />
          : <CornerDownRight size={13} color={T.ink3} strokeWidth={2} />}
        <Text style={{ flex: 1, fontSize: 12, color: T.ink2, fontFamily: T.mono, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
          #{String((h as any).order_number ?? h.id).slice(-6)}
        </Text>
        <Text style={{ fontSize: 12, color: h.status === 'teslim_edildi' ? T.jade : T.ink3, fontWeight: '600' }}>
          {h.status === 'teslim_edildi' ? 'Teslim edildi' : 'Önceki'}
        </Text>
      </Pressable>
    ))}
    </>
  );
}

/** Göreli teslim: «2 gün gecikti» · «Bugün» · «Yarın» · «Cuma» · «24 Kas» */
function formatDue(dateStr: string, status: WorkOrderStatus): string {
  if (status === 'teslim_edildi') return autoT('Teslim edildi');
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return `${Math.abs(diff)} ${autoT('gün gecikti')}`;
  if (diff === 0) return autoT('Bugün');
  if (diff === 1) return autoT('Yarın');
  if (diff <= 6) {
    try { return new Intl.DateTimeFormat(localeTag(), { weekday: 'long' }).format(d); }
    catch { /* düş */ }
  }
  return fmtDayMonthShort(d);
}
