import { localeTag } from '../../../core/i18n';
/**
 * OrdersKanbanB2Mobile — Mobil siparişler.
 *
 * Görünüm: Liste (varsayılan) veya Kanban kulvarları (filtre penceresinden).
 *
 * Filtre DURUMU bu bileşende tutulmaz: durum sekmeleri + sayıları, Acil/Geciken/
 * Arşiv, arama ve sıralama OrdersListScreenV2'den gelir — masaüstüyle TEK kaynak,
 * iki görünüm hiçbir zaman farklı sayı göstermez. `orders` zaten süzülmüş ve
 * sıralanmış gelir.
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet, Modal, Image, Platform,
} from 'react-native';
import {
  Search, X, SlidersHorizontal, Hash, CalendarDays, Clock, CornerDownRight, CornerDownLeft,
  Inbox, Flame, Archive, Check, CalendarClock, Pause,
} from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { holdBadgeText } from '../holdCategories';
import { ProvaListBadge } from '../prova/ProvaListBadge';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';
import { navBarMetrics } from '../../../core/ui/mobile/navGlass';
import { RowActionsMenu, type RowAction } from '../../../core/ui/RowActionsMenu';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import type { WorkOrder } from '../types';
import { buildRevisionCases } from '../revisionGroups';
import { getOrderStageLabel } from '../utils/currentStage';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { SlideTabBar } from '../../../core/ui/SlideTabBar';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { isOverdueOrder, labTodayOf } from '../../../core/metrics/orderDefs';
import { useLabToday, cachedLabTz } from '../../../core/metrics/useLabToday';
import { heldAgeDays } from '../holdDates';
import { MobileTableX } from '../../../core/ui/MobileTableX';
void DS;
void Svg; void Defs; void Rect; void RadialGradient; void Stop;

interface LaneDef {
  key: string;
  title: string;
  dot: string;
  /** work_orders status keys that belong to this lane */
  match: string[];
  /** Extra filter for triage-aware lanes (alindi + triaged_at) */
  triageState?: 'pending' | 'done';
}

const LANES: LaneDef[] = [
  // Masaüstü Siparişler sayfasıyla AYNI kategori mantığı (STATUS_FILTERS):
  // Planlama(alindi) · Üretim(uretimde) · KK(kalite_kontrol) · Hazır(teslimata_hazir) · Teslim(teslim_edildi).
  // 'asamada' = üretimin ilk aşaması → uygulama genelinde 'Üretim' sayılır, bu yüzden Üretim'e dahil.
  { key: 'planlama', title: 'Planlama', dot: '#C97A2A', match: ['alindi'] },
  { key: 'uretim',   title: 'Üretim',   dot: 'PRIMARY', match: ['uretimde', 'asamada'] },
  { key: 'kk',       title: 'KK',       dot: '#4A8FC9', match: ['kalite_kontrol'] },
  { key: 'hazir',    title: 'Hazır',    dot: '#2D9A6B', match: ['teslimata_hazir'] },
  { key: 'teslim',   title: 'Teslim',   dot: '#64748B', match: ['teslim_edildi'] },
];

type ViewMode = 'list' | 'kanban';

/** Acil / Geciken / Arşiv kapsül tonları — masaüstü 2. satırla aynı */
/** MobilePageTitle ile aynı display font (Inter Tight 300). */
const PAGE_DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

const TONE_URGENT = '#D97706';
const TONE_OVERDUE = '#DC2626';
const TONE_DUE = '#1D4ED8';
const TONE_ARCHIVE = '#92400E';
const TONE_DOCTOR = '#1D4ED8';
const TONE_HOLD = '#9C5E0E';

interface Props {
  /** OrdersListScreenV2'nin süzülmüş + sıralanmış listesi */
  orders: WorkOrder[];
  loading?: boolean;
  refetch?: () => void;
  onOpenOrder: (order: WorkOrder) => void;
  onAddInLane?: (laneKey: string) => void;
  statusTabs: { key: string; label: string; count: number }[];
  statusFilter: string;
  onStatusChange: (key: string) => void;
  search: string;
  onSearchChange: (q: string) => void;
  urgent: { active: boolean; count: number; toggle: () => void };
  overdue: { active: boolean; count: number; toggle: () => void };
  /** Teslim günü bugün / yarın olan açık işler (isteğe bağlı) */
  dueToday?: { active: boolean; count: number; toggle: () => void };
  dueTomorrow?: { active: boolean; count: number; toggle: () => void };
  /** Prova takibi (2. dalga 4) — yalnız lab/admin: "Provada" ve "Randevu riski" */
  prova?: { active: boolean; count: number; toggle: () => void };
  risk?: { active: boolean; count: number; toggle: () => void };
  /** Madde 13 — yalnız lab/admin: "Beklemede" (prova hariç bekleyen işler) */
  hold?: { active: boolean; count: number; toggle: () => void };
  /** Yalnız admin — masaüstündeki "Arşivi göster" ile aynı */
  archive?: { active: boolean; toggle: () => void };
  /** ?doctor= süzgeci (genel arama → hekimin siparişleri); dokununca kalkar */
  doctorChip?: { label: string; clear: () => void };
  /** Yalnız lab/admin — manuel (WhatsApp/kağıt) gelen kutusu */
  manual?: { count: number; open: () => void };
  sort: {
    by: string;
    dir: 'asc' | 'desc';
    options: { value: string; label: string }[];
    setBy: (v: any) => void;
    setDir: (d: 'asc' | 'desc') => void;
  };
  /** Kart ••• menüsü — masaüstü satırıyla AYNI işlem listesi (rowActions) */
  rowActionsFor?: (o: WorkOrder) => RowAction[];
}

export function OrdersKanbanB2Mobile({
  orders, loading, refetch, onOpenOrder, onAddInLane,
  statusTabs, statusFilter, onStatusChange, search, onSearchChange,
  urgent, overdue, dueToday, dueTomorrow, prova, risk, hold, archive, manual, sort, rowActionsFor, doctorChip,
}: Props) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const styles = useMemo(() => makeStyles(T, isDark, theme.primary), [T, isDark, theme.primary]);

  // SlideTabBar cursor'ı beyaz metin basar → koyu ink accent şart (lab safranında
  // beyaz yazı okunmaz). Masaüstü sekmeleriyle aynı kaynak.
  const panelTheme = usePanelTheme();
  const [viewMode, setViewMode]     = useState<ViewMode>('list');
  const [filterOpen, setFilterOpen] = useState(false);

  /** Lane assignment for an order */
  const laneOf = (o: WorkOrder): LaneDef | undefined =>
    LANES.find(l => l.match.includes(o.status));

  // Kanban kulvarları — liste zaten süzülmüş gelir
  const grouped = useMemo(() => {
    const m: Record<string, WorkOrder[]> = {};
    LANES.forEach(l => { m[l.key] = []; });
    orders.forEach(o => {
      const lane = laneOf(o);
      if (lane) m[lane.key].push(o);
    });
    return m;
  }, [orders]);

  // Filtre butonundaki nokta: varsayılandan sapma (sıralama ya da Kanban)
  const sheetDirty = viewMode !== 'list' || sort.by !== 'created_at' || sort.dir !== 'desc';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: navBarMetrics(insets.bottom).clearance + 16 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refetch
        ? <RefreshControl refreshing={!!loading} onRefresh={refetch} tintColor={theme.accent} />
        : undefined}
      showsVerticalScrollIndicator={false}
    >
      {/* ════ Başlık ════ (+72: üstteki yüzen logo/ikon şeridi) */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: Math.max(insets.top, 8) + 72 }}>
        {/* Site geneli sayfa başlığı (MobilePageTitle) ölçüsü: display 300 / 26 + 13 alt yazı.
            Önceden 34/800 + 15'ti; diğer mobil sayfaların iki kademe üstündeydi. */}
        <Text style={{ fontSize: 26, lineHeight: 32, fontWeight: '300', letterSpacing: -0.6, color: T.ink, fontFamily: PAGE_DISPLAY_FONT }}>
          Siparişler
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: T.ink3, marginTop: 2, fontFamily: MFONT.uiRegular }}>
          Tüm vakaların operasyonel görünümü
        </Text>
      </View>

      {/* ════ Durum sekmeleri — masaüstüyle AYNI kanonik SlideTabBar (sm) ════
          Faturalar / Onaylar / Kurumlar ile tek dil; uzun liste yatay kayar. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAGE_PADDING }}
        style={{ marginTop: 16, flexGrow: 0 }}
      >
        <SlideTabBar
          size="sm"
          items={statusTabs.map(t => ({ key: t.key, label: t.label, count: t.count }))}
          activeKey={statusFilter}
          onChange={onStatusChange}
          accentColor={panelTheme.accent}
          style={{ marginStart: -3 }}
        />
      </ScrollView>

      {/* ════ Hızlı filtre kapsülleri — masaüstü 2. satırla aynı ince kapsül ════ */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, gap: 6 }}
        style={{ marginTop: 10, flexGrow: 0 }}
      >
        {doctorChip && (
          <FilterChip icon={X} label={doctorChip.label} tone={TONE_DOCTOR} active onPress={doctorChip.clear} />
        )}
        {manual && (
          <FilterChip icon={Inbox} label="Manuel" count={manual.count} onPress={manual.open} />
        )}
        <FilterChip icon={Flame} label="Acil" count={urgent.count} tone={TONE_URGENT} active={urgent.active} onPress={urgent.toggle} />
        <FilterChip icon={Clock} label="Geciken" count={overdue.count} tone={TONE_OVERDUE} active={overdue.active} onPress={overdue.toggle} />
        {hold && (
          <FilterChip icon={Pause} label="Beklemede" count={hold.count} tone={TONE_HOLD} active={hold.active} onPress={hold.toggle} />
        )}
        {dueToday && (
          <FilterChip icon={CalendarClock} label="Bugün çıkacak" count={dueToday.count} tone={TONE_DUE} active={dueToday.active} onPress={dueToday.toggle} />
        )}
        {dueTomorrow && (
          <FilterChip icon={CalendarClock} label="Yarın çıkacak" count={dueTomorrow.count} tone={TONE_DUE} active={dueTomorrow.active} onPress={dueTomorrow.toggle} />
        )}
        {prova && (
          <FilterChip icon={CalendarClock} label="Provada" count={prova.count} tone={TONE_URGENT} active={prova.active} onPress={prova.toggle} />
        )}
        {risk && (
          <FilterChip icon={CalendarClock} label="Randevu riski" count={risk.count} tone={TONE_OVERDUE} active={risk.active} onPress={risk.toggle} />
        )}
        {archive && (
          <FilterChip icon={Archive} label="Arşiv" tone={TONE_ARCHIVE} active={archive.active} onPress={archive.toggle} />
        )}
      </ScrollView>

      {/* ════ Arama + sıralama — Faturalar arama kutusuyla aynı (hairline, 44) ════ */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: PAGE_PADDING, marginTop: 10 }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
          height: 44, borderRadius: 999, paddingHorizontal: 16,
          backgroundColor: U.surface, borderWidth: 1, borderColor: U.hairline,
        }}>
          <Search size={15} color={U.ink[400]} strokeWidth={1.6} />
          <TextInput
            style={{ flex: 1, fontSize: 14, color: U.ink[900], paddingVertical: 0 }}
            placeholder="Sipariş, hasta, hekim, klinik ara..."
            placeholderTextColor={U.ink[400]}
            value={search}
            onChangeText={onSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => onSearchChange('')} hitSlop={8} accessibilityLabel={autoT('Aramayı temizle')}>
              <X size={15} color={U.ink[400]} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setFilterOpen(true)}
          accessibilityLabel={autoT('Sıralama ve görünüm')}
          style={{
            width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
          }}
        >
          <SlidersHorizontal size={16} color={sheetDirty ? panelTheme.accent : U.ink[500]} strokeWidth={1.8} />
          {sheetDirty && <View style={[styles.filterDot, { backgroundColor: theme.primary }]} />}
        </Pressable>
      </View>

      {/* ════ İçerik ════ */}
      {viewMode === 'list' ? (
        <ListView orders={orders} onOpenOrder={onOpenOrder} laneOf={laneOf} rowActionsFor={rowActionsFor} />
      ) : LANES.every(lane => (grouped[lane.key]?.length ?? 0) === 0) ? (
        <View style={{ paddingHorizontal: 24, paddingVertical: 48, alignItems: 'center' }}>
          <Text style={{ fontSize: 13, color: T.ink3, fontFamily: MFONT.uiRegular, textAlign: 'center' }}>
            Üretim hattında aktif vaka yok.{'\n'}Liste görünümünde tüm kayıtları görebilirsin.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.lanesRow}
          style={{ marginTop: 16 }}
        >
          {LANES.filter(lane => (grouped[lane.key]?.length ?? 0) > 0).map((lane) => {
            const laneOrders = grouped[lane.key] ?? [];
            const dot = lane.dot === 'PRIMARY' ? theme.primary : lane.dot;
            return (
              <View key={lane.key} style={styles.lane}>
                <View style={styles.laneHead}>
                  <View style={styles.laneHeadLeft}>
                    <View style={[styles.laneDot, { backgroundColor: dot }]} />
                    <Text style={styles.laneTitle}>{lane.title}</Text>
                  </View>
                  <Text style={styles.laneCount}>{laneOrders.length}</Text>
                </View>
                <View style={{ gap: 8 }}>
                  {laneOrders.map(o => (
                    <LaneCard key={o.id} order={o} onPress={() => onOpenOrder(o)} />
                  ))}
                  {onAddInLane && (
                    <Pressable onPress={() => onAddInLane(lane.key)} style={styles.emptyAdd}>
                      <Text style={styles.emptyAddText}>+ Vaka ekle</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {loading && orders.length === 0 && (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      )}

      {/* ════ Sıralama + Görünüm penceresi ════
          Durum artık sekmelerde — burada yalnız ikincil kontroller. */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Sıralama</Text>
            <View style={{ gap: 6 }}>
              {sort.options.map(opt => {
                const active = sort.by === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => sort.setBy(opt.value)}
                    style={[styles.filterRow, active && { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
                  >
                    <Text style={[styles.filterLabel, active && { color: theme.primary, fontFamily: MFONT.uiSemibold }]}>
                      {opt.label}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {active && <Check size={16} color={theme.primary} strokeWidth={2} />}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {(['desc', 'asc'] as const).map(d => {
                const active = sort.dir === d;
                return (
                  <Pressable
                    key={d}
                    onPress={() => sort.setDir(d)}
                    style={[styles.filterRow, { flex: 1, justifyContent: 'center' }, active && { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
                  >
                    <Text style={[styles.filterLabel, active && { color: theme.primary, fontFamily: MFONT.uiSemibold }]}>
                      {d === 'desc' ? 'Azalan' : 'Artan'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.modalTitle, { marginTop: 18 }]}>Görünüm</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['list', 'kanban'] as const).map(m => {
                const active = viewMode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => { setViewMode(m); setFilterOpen(false); }}
                    style={[styles.filterRow, { flex: 1, justifyContent: 'center' }, active && { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
                  >
                    <Text style={[styles.filterLabel, active && { color: theme.primary, fontFamily: MFONT.uiSemibold }]}>
                      {m === 'list' ? 'Liste' : 'Kanban'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => { sort.setBy('created_at'); sort.setDir('desc'); setViewMode('list'); setFilterOpen(false); }}
              style={styles.clearBtn}
            >
              <Text style={[styles.clearBtnText, { color: T.ink3 }]}>Varsayılana dön</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Hızlı filtre kapsülü
// ═══════════════════════════════════════════════════════════════════
function FilterChip({ icon: Icon, label, count, tone, active, onPress }: {
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  count?: number;
  /** Aktifken alacağı ton (Acil/Geciken/Arşiv). Yoksa panel accent'i dolu kapsül (Manuel). */
  tone?: string;
  active?: boolean;
  onPress: () => void;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  const panelTheme = usePanelTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  // Pasif: beyaz kapsül + hairline (beyaz buton kuralı → koyuda plainBtn).
  // Aktif: tonlu yumuşak zemin + ton metin — masaüstü 2. satırla birebir.
  const toneFg = tone ? (isDark ? lighten(tone) : tone) : '#FFFFFF';
  const bg = !active ? U.plainBtn.bg : tone ? `${tone}${isDark ? '33' : '1F'}` : panelTheme.accent;
  const border = !active ? U.plainBtn.border : tone ? `${tone}${isDark ? '55' : '40'}` : 'transparent';
  const fg = active ? toneFg : T.ink2;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      hitSlop={{ top: 4, bottom: 4 }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: 8, paddingHorizontal: 12,
        borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: bg,
      }}
    >
      <Icon size={13} color={active ? toneFg : T.ink3} strokeWidth={1.8} />
      {/* Etiket ve sayı ayrı <Text> — sözlük etiketi birebir eşlesin */}
      <Text style={{ fontSize: 12.5, fontFamily: MFONT.uiSemibold, color: fg }}>{label}</Text>
      {count != null && count > 0 && (
        <Text style={{ fontSize: 11, fontFamily: MFONT.uiSemibold, color: active ? toneFg : T.ink3, opacity: active ? 0.75 : 1 }}>{count}</Text>
      )}
    </Pressable>
  );
}

/** Koyu zeminde ton metni okunur kalsın — durum renginin açık karşılığı. */
function lighten(hex: string): string {
  const map: Record<string, string> = { '#D97706': '#FBBF24', '#DC2626': '#F87171', '#92400E': '#FCD34D', '#9C5E0E': '#F0C078' };
  return map[hex.toUpperCase()] ?? hex;
}

// ═══════════════════════════════════════════════════════════════════
// Liste — düz, en yeni üstte (sıralama V2'den). Revizyonlar vaka altında.
// ═══════════════════════════════════════════════════════════════════
function ListView({
  orders,
  onOpenOrder,
  laneOf,
  rowActionsFor,
}: {
  orders: WorkOrder[];
  onOpenOrder: (o: WorkOrder) => void;
  laneOf: (o: WorkOrder) => LaneDef | undefined;
  rowActionsFor?: (o: WorkOrder) => RowAction[];
}) {
  const T = useMobileTokens();
  // Lab/Admin panelinde avatar = klinik logosu (hangi klinikten geldiği bir bakışta belli).
  // Klinik/Hekim panelinde kendi işleri → hasta baş harfleri.
  const segments = useSegments() as string[];
  const useClinicLogoAvatar = segments?.[0] === '(lab)' || segments?.[0] === '(admin)';

  // YALNIZ revizyon gruplanır: kulvara en güncel üye (anchor) girer, eskileri onun
  // altında girintili. Devam siparişi ayrı iştir — kendi kartı olur, asıl işin
  // numarası kartta gösterilir. buildRevisionCases girdi sırasını korur → V2'nin
  // sıralaması aynen kalır.
  const { anchors, revChildren, numById } = useMemo(() => {
    const { anchors, children } = buildRevisionCases(orders as any[], { linkBy: 'revision' });
    const numById = new Map<string, string>();
    (orders as any[]).forEach(o => numById.set(String(o.id), String(o.order_number ?? '')));
    return { anchors: anchors as WorkOrder[], revChildren: children, numById };
  }, [orders]);

  if (orders.length === 0) {
    return (
      <View style={{ paddingHorizontal: 24, paddingVertical: 48, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: T.ink3, fontFamily: MFONT.uiRegular }}>
          Bu filtreyle eşleşen vaka yok.
        </Text>
      </View>
    );
  }

  // Ekstre / finans mobil tablolarıyla aynı kalıp: panel accent şeridinde başlık + sayı
  // (eskiden sütun adları yazıyordu). Şerit rengi MobileTableX'te panelden çözülür.
  return (
    <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 16 }}>
      {/* Sayı sekmedeki "Tümü N" ile aynı: revizyonlar ana satırın altında ama sayılır */}
      <MobileTableX title="Siparişler" count={orders.length} countLabel="sipariş">
      {anchors.map(o => (
        <OrderCard
          key={o.id}
          order={o}
          laneOf={laneOf}
          onOpenOrder={onOpenOrder}
          history={revChildren.get(String(o.id)) as WorkOrder[] | undefined}
          parentNo={numById.get(String((o as any).continues_order_id ?? '')) ?? null}
          actions={rowActionsFor?.(o)}
          useClinicLogo={useClinicLogoAvatar}
        />
      ))}
      </MobileTableX>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sipariş kartı — avatar · hasta / no / iş / hekim · tarih + ••• + durum
// ═══════════════════════════════════════════════════════════════════
function OrderCard({ order: o, laneOf, onOpenOrder, history, parentNo, actions, useClinicLogo }: {
  order: WorkOrder;
  laneOf: (o: WorkOrder) => LaneDef | undefined;
  onOpenOrder: (o: WorkOrder) => void;
  history?: WorkOrder[];
  parentNo: string | null;
  actions?: RowAction[];
  useClinicLogo: boolean;
}) {
  const T = useMobileTokens();
  const theme = useMobileTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const styles = useMemo(() => makeStyles(T, isDark, theme.primary), [T, isDark, theme.primary]);

  const orderNo = String((o as any).order_number ?? o.id ?? '');
  const workType = (o as any).work_type ?? 'Sipariş';
  const patient = (o as any).patient_name ?? (o as any).doctor_name ?? '—';
  const doctorName: string | null = (o as any).doctor?.full_name ?? (o as any).doctor_name ?? null;
  // Unvan zaten adın içindeyse ("Dt. …") ikinci kez ekleme
  const drLabel = doctorName
    ? (/^(Dr|Dt|Prof|Doç|Uzm|Op)\.?\s/i.test(doctorName.trim()) ? doctorName : `Dt. ${doctorName}`)
    : null;
  const onHold = (o as any).hold_status === 'on_hold';
  const isDone = (o as any).status === 'teslim_edildi';
  const lane = laneOf(o);
  // 'alindi' iki anı kapsar: planlama BEKLEYEN (triaged_at boş) ve planlaması yapılmış
  // ama üretime başlamamış iş. Etiket tek yetkili kaynaktan (getOrderStageLabel).
  const triagePending = (o as any).status === 'alindi' && !(o as any).triaged_at;
  const planned = (o as any).status === 'alindi' && !triagePending;
  const laneColor = planned
    ? '#4A8FC9'
    : lane ? (lane.dot === 'PRIMARY' ? theme.primary : lane.dot) : (isDone ? '#2D9A6B' : theme.primary);
  // Teslim edilen iş referanstaki gibi YEŞİL rozet (kulvar grisi değil)
  const tone = onHold ? '#E89B2A' : (isDone ? '#2D9A6B' : laneColor);
  const badgeLabel = autoT(onHold ? holdBadgeText(o as any) : (getOrderStageLabel(o as any) || lane?.title || (isDone ? 'Teslim' : 'İşlemde')));

  const created = (o as any).created_at ? new Date((o as any).created_at) : null;
  const dateStr = created ? created.toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const timeStr = created ? created.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' }) : '';

  const initials = String(patient).trim().split(/\s+/).slice(0, 2)
    .map((p: string) => p[0]?.toUpperCase() ?? '').join('') || '?';
  const clinicLogo = useClinicLogo ? ((o as any)?.doctor?.clinic?.logo_url ?? null) : null;
  const isRevision = !!(o as any).revision_of_id;
  const isContinuation = !isRevision && !!(o as any).continues_order_id;

  const rtl = isRTL();
  // Tek tanım (orderDefs): beklemedeki/iptal/arşivdeki iş kırmızı yanmaz; gün lab gününde.
  const labToday = useLabToday();
  const overdue = isOverdueOrder(o as any, labToday);
  // Madde 13: beklemedeki işte teslim günü yerine kaç gündür beklediği (masaüstü listeyle aynı metin)
  const heldStart = (o as any).hold_started_at as string | null | undefined;
  const heldDays = heldAgeDays({
    hold_status: (o as any).hold_status, hold_category: (o as any).hold_category,
    startDay: heldStart ? labTodayOf(cachedLabTz(), new Date(heldStart)) : null,
  }, labToday);

  return (
    <View>
      <Pressable
        onPress={() => onOpenOrder(o)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 11,
          paddingHorizontal: 16, paddingVertical: 11,
          borderTopWidth: 1, borderTopColor: T.hairline,
          backgroundColor: overdue ? 'rgba(217,75,75,0.06)' : 'transparent',
        }}
      >
        {/* Avatar — klinik logosu ya da hasta baş harfleri */}
        <View style={{
          width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: clinicLogo ? (isDark ? T.cardSoft : '#FFFFFF') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)'),
          ...(clinicLogo ? { borderWidth: 1, borderColor: T.hairline } : {}),
        }}>
          {clinicLogo
            ? <Image source={{ uri: clinicLogo }} style={{ width: 36, height: 36 }} resizeMode="contain" />
            : <Text style={{ fontSize: 12, fontWeight: '700', color: T.ink2 }}>{initials}</Text>}
        </View>

        {/* Hasta → vaka → hekim → no + tarih (Son Siparişler satırıyla aynı hiyerarşi) */}
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: T.ink, flex: 1, minWidth: 0, letterSpacing: -0.1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
              {patient}
            </Text>
            <View style={{ maxWidth: '46%', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: `${tone}${isDark ? '33' : '1A'}`, flexShrink: 0 }}>
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: isDark ? T.ink : tone, textAlign: 'center' }} numberOfLines={2}>
                {badgeLabel}
              </Text>
            </View>
            {!!actions?.length && <RowActionsMenu actions={actions} size={22} />}
          </View>
          <Text style={{ fontSize: 12, color: T.ink2 }} numberOfLines={1}>{workType}</Text>
          {!!drLabel && (
            <Text style={{ fontSize: 11.5, color: T.ink3, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>{drLabel}</Text>
          )}
          {/* Prova / randevu riski rozeti (liste bağlamından; yoksa çizilmez) */}
          <ProvaListBadge orderId={(o as any).id} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Text style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.mono, flexShrink: 1, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>
              #{orderNo}
            </Text>
            {isRevision && (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(232,155,42,0.15)', flexShrink: 0 }}>
                <Text style={{ fontSize: 8.5, fontWeight: '800', color: isDark ? '#FCD34D' : '#9C5E0E', letterSpacing: 0.4 }}>{autoT('REVİZYON')}</Text>
              </View>
            )}
            {isContinuation && (
              <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(53,99,168,0.14)', flexShrink: 0 }}>
                <Text style={{ fontSize: 8.5, fontWeight: '800', color: isDark ? '#93C5FD' : '#3563A8', letterSpacing: 0.4 }}>{autoT('DEVAM')}</Text>
              </View>
            )}
            {isContinuation && !!parentNo && (
              <Text style={{ fontSize: 10.5, color: isDark ? '#93C5FD' : '#3563A8', flexShrink: 1 }} numberOfLines={1}>
                {`${autoT('asıl')} #${parentNo}`}
              </Text>
            )}
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 10.5, fontWeight: overdue ? '700' : '500', color: overdue ? (isDark ? '#F87171' : '#DC2626') : T.ink3, flexShrink: 0 }}>
              {heldDays != null
                ? `${autoT('Beklemede')} · ${heldDays} ${autoT('gün')}`
                : (o as any).delivery_date ? `${autoT('Teslim')} ${formatDue((o as any).delivery_date)}` : dateStr}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Vakanın eski revizyonları — girintili alt satırlar (Son Siparişler ile aynı) */}
      {(history ?? []).map(h => {
        const hNo = String((h as any).order_number ?? h.id ?? '');
        const hDone = (h as any).status === 'teslim_edildi';
        return (
          <Pressable
            key={h.id}
            onPress={() => onOpenOrder(h)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingStart: 34, paddingEnd: 16, paddingVertical: 9,
              borderTopWidth: 1, borderTopColor: T.hairline,
              backgroundColor: `${tone}0A`,
            }}
          >
            {rtl ? <CornerDownLeft size={13} color={T.ink3} strokeWidth={2} /> : <CornerDownRight size={13} color={T.ink3} strokeWidth={2} />}
            <Text style={{ flex: 1, fontSize: 11.5, color: T.ink2, fontFamily: T.mono, textAlign: rtl ? 'right' : undefined }} numberOfLines={1}>#{hNo}</Text>
            <Text style={{ fontSize: 10.5, fontWeight: '600', color: hDone ? '#2D9A6B' : T.ink3 }} numberOfLines={1}>
              {hDone ? 'Teslim edildi' : 'Önceki'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Kanban LaneCard
// ═══════════════════════════════════════════════════════════════════
function LaneCard({ order, onPress }: { order: WorkOrder; onPress: () => void }) {
  const T = useMobileTokens();
  const theme = useMobileTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const styles = useMemo(() => makeStyles(T, isDark, theme.primary), [T, isDark, theme.primary]);
  const orderNum = String((order as any).order_number ?? order.id ?? '').slice(-6);
  const workType = (order as any).work_type ?? 'Sipariş';
  const patient = (order as any).patient_name ?? (order as any).doctor_name ?? '—';
  const due = (order as any).delivery_date ? formatDue((order as any).delivery_date) : '—';

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, end: 0, width: 80, height: 80 }}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id={`lc-${orderNum}`} cx="100%" cy="0%" rx="100%" ry="100%" fx="100%" fy="0%">
              <Stop offset="0%" stopColor={theme.primary} stopOpacity={isDark ? '0.35' : '0.18'} />
              <Stop offset="60%" stopColor={theme.primary} stopOpacity="0.04" />
              <Stop offset="100%" stopColor={theme.primary} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#lc-${orderNum})`} />
        </Svg>
      </View>
      <View>
        <Text style={styles.cardId}>{orderNum}</Text>
        <Text style={styles.cardType} numberOfLines={2}>{workType}</Text>
        <Text style={styles.cardPatient} numberOfLines={1}>{patient}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.cardAvatar}>
            <Text style={styles.cardAvatarText}>{patient.slice(0, 2).toUpperCase()}</Text>
          </View>
          <Text style={styles.cardDue}>{due}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * Hekim adını kısaltır, KLİNİĞİ değil — laboratuvarlar kliniğe göre düşünür,
 * o yüzden satır sığmadığında doktor kısalsın, klinik tam kalsın.
 *   "Dr. Aylin Şahiner"       → "Dr. A. Şahiner"
 *   "Dt. Medet Roger Paydaş"  → "Dt. M. R. Paydaş"
 *   "Aylin Şahiner"           → "A. Şahiner"
 */
function abbrevDoctor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name;
  let title = '';
  let rest = parts;
  if (/^(Dr|Dt|Prof|Doç|Uzm|Op)\.?$/i.test(parts[0])) {
    title = parts[0].endsWith('.') ? parts[0] : `${parts[0]}.`;
    rest = parts.slice(1);
  }
  if (rest.length <= 1) return [title, ...rest].filter(Boolean).join(' ');
  const last = rest[rest.length - 1];
  const inits = rest.slice(0, -1).map(p => `${p[0]?.toLocaleUpperCase('tr')}.`).join(' ');
  return [title, inits, last].filter(Boolean).join(' ');
}

function formatDue(d: string): string {
  const date = new Date(d);
  if (isNaN(+date)) return d;
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}`;
}

const makeStyles = (T: any, isDark: boolean, accent: string) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
  },
  eyebrow: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: T.ink3,
    letterSpacing: 0.88,
  },
  h2: {
    fontFamily: MFONT.uiLight,
    fontWeight: '300',
    fontSize: 36,
    color: T.ink,
    letterSpacing: -1.62,
    lineHeight: 38,
    marginTop: 6,
  },
  hint: {
    fontFamily: MFONT.uiRegular,
    fontSize: 13,
    color: T.ink3,
    marginTop: 8,
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  iconBtn: {
    width: 38, height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)',
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconBtnActive: {
    borderColor: `${accent}80`,
    backgroundColor: `${accent}10`,
  },
  filterDot: {
    position: 'absolute',
    top: 7, end: 7,
    width: 6, height: 6, borderRadius: 3,
  },

  viewSwitcher: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.10)',
    backgroundColor: T.card,
    borderRadius: 12,
    padding: 3,
    gap: 2,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  viewBtnActive: {
    backgroundColor: `${accent}12`,
  },
  viewLabel: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: T.ink3,
  },

  // Search
  searchWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.cardSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
  },
  searchInput: {
    flex: 1,
    fontFamily: MFONT.uiRegular,
    fontSize: 14,
    color: T.ink,
  },

  // List view — Linear/Notion style: minimal rows, no card wrapper
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  sectionDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  sectionTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 11,
    color: T.ink2,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: T.ink3,
    marginStart: -2,
  },

  // ── Kart tarzı (teknisyen geçmiş sayfası ile aynı) ──
  histCard: {
    backgroundColor: T.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingStart: 18,
    paddingEnd: 14,
    gap: 11,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    position: 'relative',
    ...(isDark ? {} : {
      // Stroke zaten kartları ayırdığı için gölge ~%20 azaltıldı (daha premium)
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.056,
      shadowRadius: 11,
      elevation: 2,
    }),
  },
  histAccent: {
    position: 'absolute',
    start: 0, top: 0, bottom: 0,
    width: 4,
    borderTopStartRadius: 18,
    borderBottomStartRadius: 18,
  },
  histAvatar: {
    width: 40, height: 40, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  histAvatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
  },
  histTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 15,
    color: T.ink,
    letterSpacing: -0.2,
  },
  histSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 12.5,
    color: T.ink2,
    marginTop: 2,
  },
  histWho: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11.5,
    color: T.ink3,
    marginTop: 2,
  },
  histBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 999,
    maxWidth: 132,
  },
  histBadgeDot: {
    width: 4.5, height: 4.5, borderRadius: 3, flexShrink: 0,
  },
  histBadgeText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 9,
    letterSpacing: 0.4,
  },
  histMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.055)',
  },
  histMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  histMetaText: {
    fontFamily: MFONT.uiRegular,
    fontSize: 12,
    color: T.ink2,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 2,
  },
  listRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.07)',
  },
  rowDot: {
    width: 7, height: 7, borderRadius: 3.5,
    alignSelf: 'center',
  },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  rowTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14.5,
    color: T.ink,
    flex: 1,
    minWidth: 0,
    letterSpacing: -0.1,
  },
  rowSub: {
    fontFamily: MFONT.uiRegular,
    fontSize: 12.5,
    color: T.ink3,
    flex: 1,
    minWidth: 0,
    marginTop: 3,
  },
  rowDue: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: T.ink2,
    letterSpacing: -0.05,
    flexShrink: 0,
  },
  rowOrderNum: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: T.ink3,
    letterSpacing: 0.3,
    flexShrink: 0,
    marginTop: 3,
  },

  // Kanban lanes
  lanesRow: {
    paddingHorizontal: 24,
    paddingTop: 4,
    gap: 14,
  },
  lane: {
    width: 240,
    flexShrink: 0,
  },
  laneHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  laneHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  laneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  laneTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: T.ink,
    letterSpacing: -0.14,
  },
  laneCount: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: T.ink3,
  },

  // Kanban Card
  card: {
    padding: 14,
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    ...(isDark ? {} : {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    }),
  },
  cardId: {
    fontFamily: MFONT.uiMedium,
    fontSize: 10,
    color: T.ink3,
    letterSpacing: 0.4,
  },
  cardType: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    color: T.ink,
    letterSpacing: -0.14,
    marginTop: 4,
    lineHeight: 18,
  },
  cardPatient: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: T.ink3,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
    borderStyle: 'dashed',
  },
  cardAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 9,
    color: T.ink2,
  },
  cardDue: {
    fontFamily: MFONT.uiMedium,
    fontSize: 11,
    color: T.ink3,
  },

  emptyAdd: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  emptyAddText: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: T.ink3,
  },

  // Filter modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    gap: 14,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.18)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 16,
    color: T.ink,
    letterSpacing: -0.2,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)',
    backgroundColor: 'transparent',
  },
  filterLabel: {
    fontFamily: MFONT.uiMedium,
    fontSize: 14,
    color: T.ink,
  },
  checkDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  clearBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  clearBtnText: {
    fontFamily: MFONT.uiMedium,
    fontSize: 13,
  },
});
