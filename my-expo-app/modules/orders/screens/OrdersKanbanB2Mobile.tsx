import { localeTag } from '../../../core/i18n';
/**
 * OrdersKanbanB2Mobile — Mobile orders view.
 * Görünüm modu: List (default) veya Kanban swimlanes.
 * Header üstünde: Arama · Filtre · Görünüm seçici (List/Kanban).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet, Modal, Image, Platform,
} from 'react-native';
import { Search, X, SlidersHorizontal, Hash, CalendarDays, Clock, CornerDownRight, CornerDownLeft } from '../../../core/ui/icons';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import type { WorkOrder } from '../types';
import { buildRevisionCases } from '../revisionGroups';
import { getOrderStageLabel } from '../utils/currentStage';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
void DS;

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
type StatusFilter = 'all' | 'planlama' | 'uretim' | 'kk' | 'hazir' | 'teslim';

interface Props {
  orders: WorkOrder[];
  loading?: boolean;
  refetch?: () => void;
  onOpenOrder: (order: WorkOrder) => void;
  onAddInLane?: (laneKey: string) => void;
}

export function OrdersKanbanB2Mobile({ orders, loading, refetch, onOpenOrder, onAddInLane }: Props) {
  const theme = useMobileTheme();
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const styles = useMemo(() => makeStyles(T, isDark, theme.primary), [T, isDark, theme.primary]);

  const [viewMode, setViewMode]       = useState<ViewMode>('list');
  const [search, setSearch]           = useState('');
  const [searchOpen, setSearchOpen]   = useState(false);
  const [filterOpen, setFilterOpen]   = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  /** Lane assignment for an order */
  const laneOf = (o: WorkOrder): LaneDef | undefined =>
    LANES.find(l => l.match.includes(o.status));

  // Apply search + status filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      // status filter
      if (statusFilter !== 'all') {
        const lane = laneOf(o);
        if (!lane || lane.key !== statusFilter) return false;
      }
      // search
      if (q) {
        const num  = String((o as any).order_number ?? o.id ?? '').toLowerCase();
        const type = String((o as any).work_type ?? '').toLowerCase();
        const doc  = String((o as any).doctor_name ?? '').toLowerCase();
        const pat  = String((o as any).patient_name ?? '').toLowerCase();
        if (!num.includes(q) && !type.includes(q) && !doc.includes(q) && !pat.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, statusFilter]);

  // Grouped for kanban view
  const grouped = useMemo(() => {
    const m: Record<string, WorkOrder[]> = {};
    LANES.forEach(l => { m[l.key] = []; });
    filtered.forEach(o => {
      const lane = laneOf(o);
      if (lane) m[lane.key].push(o);
    });
    return m;
  }, [filtered]);

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: T.bg }}
      contentContainerStyle={{ paddingBottom: 140 }}
      refreshControl={refetch
        ? <RefreshControl refreshing={!!loading} onRefresh={refetch} tintColor={theme.accent} />
        : undefined}
      showsVerticalScrollIndicator={false}
    >
      {/* ════ Header — başlık + sağda arama/filtre ════ */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 8) + 72 }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>ÜRETİM PANOSU</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'nowrap' }}>
            <Text style={styles.h2} numberOfLines={1}>Siparişler</Text>
            <Text style={[styles.hint, { marginTop: 0 }]} numberOfLines={1}>
              {filtered.length} sipariş{statusFilter !== 'all' ? ` · ${LANES.find(l => l.key === statusFilter)?.title}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Pressable
            onPress={() => setSearchOpen(s => !s)}
            style={[styles.iconBtn, searchOpen && styles.iconBtnActive]}
            hitSlop={6}
          >
            <Search size={17} color={searchOpen ? theme.primary : T.ink2} strokeWidth={1.8} />
          </Pressable>
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={[styles.iconBtn, activeFilterCount > 0 && styles.iconBtnActive]}
            hitSlop={6}
          >
            <SlidersHorizontal size={17} color={activeFilterCount > 0 ? theme.primary : T.ink2} strokeWidth={1.8} />
            {activeFilterCount > 0 && (
              <View style={[styles.filterDot, { backgroundColor: theme.primary }]} />
            )}
          </Pressable>
        </View>
      </View>

      {/* ════ Inline search bar (toggled) ════ */}
      {searchOpen && (
        <View style={styles.searchWrap}>
          <View style={styles.searchPill}>
            <Search size={16} color={T.ink3} strokeWidth={1.8} />
            <TextInput
              style={styles.searchInput}
              placeholder="Sipariş, hasta, hekim ara"
              placeholderTextColor={T.ink3}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoFocus
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <X size={15} color={T.ink3} strokeWidth={2} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* ════ Content ════ */}
      {viewMode === 'list' ? (
        <ListView orders={filtered} onOpenOrder={onOpenOrder} laneOf={laneOf} />
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

      {loading && filtered.length === 0 && (
        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      )}

      {/* ════ Filter Sheet ════ */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Durum</Text>
            <View style={{ gap: 6 }}>
              {([
                { key: 'all',      label: 'Tümü',     dot: T.ink3 },
                ...LANES.map(l => ({ key: l.key, label: l.title, dot: l.dot === 'PRIMARY' ? theme.primary : l.dot })),
              ] as { key: StatusFilter; label: string; dot: string }[]).map(opt => {
                const active = statusFilter === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => { setStatusFilter(opt.key); setFilterOpen(false); }}
                    style={[styles.filterRow, active && { borderColor: theme.primary, backgroundColor: `${theme.primary}10` }]}
                  >
                    <View style={[styles.laneDot, { backgroundColor: opt.dot }]} />
                    <Text style={[styles.filterLabel, active && { color: theme.primary, fontFamily: MFONT.uiSemibold }]}>
                      {opt.label}
                    </Text>
                    <View style={{ flex: 1 }} />
                    {active && <View style={[styles.checkDot, { backgroundColor: theme.primary }]} />}
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              onPress={() => { setStatusFilter('all'); setFilterOpen(false); }}
              style={styles.clearBtn}
            >
              <Text style={[styles.clearBtnText, { color: T.ink3 }]}>Filtreyi Temizle</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// List View — vertical list of orders with status pill
// ═══════════════════════════════════════════════════════════════════
function ListView({
  orders,
  onOpenOrder,
  laneOf,
}: {
  orders: WorkOrder[];
  onOpenOrder: (o: WorkOrder) => void;
  laneOf: (o: WorkOrder) => LaneDef | undefined;
}) {
  const T = useMobileTokens();
  const theme = useMobileTheme();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const styles = useMemo(() => makeStyles(T, isDark, theme.primary), [T, isDark, theme.primary]);
  // Lab/Admin panelinde avatar = klinik logosu (hangi klinikten geldiği bir bakışta belli).
  // Klinik/Hekim panelinde kendi işleri → hasta baş harfleri.
  const segments = useSegments() as string[];
  const useClinicLogoAvatar = segments?.[0] === '(lab)' || segments?.[0] === '(admin)';
  // Teslim Edilen İşler (tarihçe) çok uzayabilir → ilk N kayıt + "hepsini gör".
  const [showAllDelivered, setShowAllDelivered] = useState(false);
  const DELIVERED_PREVIEW = 5;

  // Group orders by lane — TÜM hook'lar early return'den ÖNCE (Rules of Hooks)
  //
  // Revizyonlar: aynı vakanın üyeleri ayrı kulvarlara dağılmasın diye önce vaka
  // gruplarına ayrılır. Kulvara YALNIZ en güncel üye (anchor) girer; eski
  // revizyonlar onun kartının altında girintili alt-liste olur. Böylece devam
  // eden revizyon "Tamamlandı" kulvarına gömülmez.
  const { groups, revChildren, numById } = useMemo(() => {
    // YALNIZ revizyon gruplanır. Devam siparişi asıl işin yerine geçmez —
    // ayrı (ama bağlantılı) bir iştir; masaüstündeki gibi kendi kartı olmalı.
    // Eskiden 'all' bağıyla gruplanıyordu: devam siparişi asıl işin altına
    // "geçmiş" olarak katlanıyor ve yeni kayıt listede hiç görünmüyordu.
    const { anchors, children: revChildren } = buildRevisionCases(orders as any[], { linkBy: 'revision' });
    // Devam siparişi kartında asıl işin numarası (masaüstü: "Devam siparişi · no")
    const numById = new Map<string, string>();
    (orders as any[]).forEach(o => numById.set(String(o.id), String(o.order_number ?? '')));
    const recent = (o: WorkOrder) => {
      const t = (o as any).created_at ? Date.parse((o as any).created_at) : NaN;
      return Number.isNaN(t) ? String((o as any).order_number ?? '') : t;
    };
    const byNewest = (a: WorkOrder, b: WorkOrder) => {
      const ra = recent(a), rb = recent(b);
      if (typeof ra === 'number' && typeof rb === 'number') return rb - ra;
      return String(rb).localeCompare(String(ra));
    };
    // 4 kategori (sıralı bölümler):
    //   1) Planlama Bekliyor — alındı + triage yapılmamış
    //   2) Bekletilen İşler  — duraklatılmış (hold_status = on_hold), teslim edilmemiş
    //   3) Üretim            — planlaması yapılmış + üretim aşamalarında (geri kalan aktif)
    //   4) Teslim Edilen İşler — teslim_edildi (en sonda)
    // Öncelik: teslim > bekletilen > planlama > üretim.
    const isDone    = (o: WorkOrder) => (o as any).status === 'teslim_edildi';
    const isHold    = (o: WorkOrder) => (o as any).hold_status === 'on_hold';
    const needsTri  = (o: WorkOrder) => (o as any).status === 'alindi' && !(o as any).triaged_at;
    const bucketOf = (o: WorkOrder): string =>
      isDone(o) ? 'teslim' : isHold(o) ? 'bekletilen' : needsTri(o) ? 'planlama' : 'uretim';
    const defs = [
      { key: 'planlama',   title: 'Planlama Bekliyor',    dot: '#C97A2A' },
      { key: 'bekletilen', title: 'Bekletilen İşler',     dot: '#E89B2A' },
      { key: 'uretim',     title: 'Üretim',               dot: theme.primary },
      { key: 'teslim',     title: 'Teslim Edilen İşler',  dot: '#64748B' },
    ];
    const byKey: Record<string, WorkOrder[]> = { planlama: [], bekletilen: [], uretim: [], teslim: [] };
    (anchors as WorkOrder[]).forEach(o => { byKey[bucketOf(o)].push(o); });
    Object.values(byKey).forEach(arr => arr.sort(byNewest));
    const groups = defs.filter(d => byKey[d.key].length > 0).map(d => ({ ...d, items: byKey[d.key] }));
    return { groups, revChildren, numById };
  }, [orders, theme.primary]);

  if (orders.length === 0) {
    return (
      <View style={{ paddingHorizontal: 24, paddingVertical: 48, alignItems: 'center' }}>
        <Text style={{ fontSize: 13, color: T.ink3, fontFamily: MFONT.uiRegular }}>
          Bu filtreyle eşleşen vaka yok.
        </Text>
      </View>
    );
  }

  // Tek kart render — hem "Planlama bekliyor" bloğunda hem düz listede kullanılır.
  const renderCard = (o: WorkOrder) => {
    const orderNum = String((o as any).order_number ?? o.id ?? '').slice(-6);
    const workType = (o as any).work_type ?? 'Sipariş';
    const patient = (o as any).patient_name ?? (o as any).doctor_name ?? '—';
    const doctorName = (o as any).doctor?.full_name ?? (o as any).doctor_name ?? null;
    const clinicName = (o as any).doctor?.clinic?.name ?? (o as any).doctor?.clinic_name ?? (o as any).clinic_name ?? null;
    // Doktoru kısalt, kliniği tam bırak (lab kliniğe göre düşünür)
    const who = [doctorName ? abbrevDoctor(doctorName) : null, clinicName].filter(Boolean).join(' · ');
    const onHold = (o as any).hold_status === 'on_hold';
    const isDone = (o as any).status === 'teslim_edildi';
    // Bölüm kalktı → durum rengi + etiketi karttan (order'dan) türetilir.
    const lane = laneOf(o);
    // 'alindi' İKİ farklı anı kapsar: planlama BEKLEYEN (triaged_at boş) ve
    // planlaması yapılmış ama üretime başlamamış iş. Şerit başlığı ikisine de
    // "Planlama" diyordu → planlaması bitmiş işler mobilde hâlâ "PLANLAMA"
    // görünüyordu (masaüstü/liste rozeti "Alındı" diyor). Etiket artık tek
    // yetkili kaynaktan gelir (getOrderStageLabel: triage-farkında + üretimde
    // aktif istasyon adı), renk de buna göre.
    const triagePending = (o as any).status === 'alindi' && !(o as any).triaged_at;
    const planned = (o as any).status === 'alindi' && !triagePending;
    const laneColor = planned
      ? '#4A8FC9'                                    // alındı (planlaması yapıldı) → bilgi mavisi
      : lane ? (lane.dot === 'PRIMARY' ? theme.primary : lane.dot) : (isDone ? '#64748B' : theme.primary);
    const dot = onHold ? '#E89B2A' : laneColor;
    // autoT ile aktif dile çevir, SONRA aktif dilin locale'inde büyüt (uppercase,
    // autoT sözlük eşleşmesini bozduğu için önce çeviri şart).
    const badgeLabel = autoT(onHold ? 'Duraklatıldı' : (getOrderStageLabel(o as any) || lane?.title || (isDone ? 'Teslim' : 'İşlemde'))).toLocaleUpperCase(localeTag());
    const dd = (o as any).delivery_date;
    const dleft = dd ? Math.ceil((new Date(dd + 'T00:00:00').getTime() - Date.now()) / 86_400_000) : null;
    const due = onHold ? 'Beklemede' : (dd ? formatDue(dd) : '—');
    const dueColor = onHold ? '#E89B2A'
      : isDone || dleft == null ? T.ink2
      : dleft < 0 ? '#D94B4B' : dleft <= 1 ? '#E89B2A' : T.ink2;
    const createdTime = (o as any).created_at
      ? new Date((o as any).created_at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
      : null;
    const initials = String(patient).trim().split(/\s+/).slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? '').join('') || '?';
    const toothCount = Array.isArray((o as any).tooth_numbers) ? (o as any).tooth_numbers.length : 0;
    const history = revChildren.get(String(o.id)) as WorkOrder[] | undefined;
    const clinicLogo = useClinicLogoAvatar ? ((o as any)?.doctor?.clinic?.logo_url ?? null) : null;
    return (
      <View key={o.id}>
        <Pressable
          onPress={() => onOpenOrder(o)}
          style={[styles.histCard, { borderColor: `${dot}40` }, isDone && { opacity: 0.74 }]}
        >
          {/* Üst satır — avatar + hasta/iş türü + durum çipi */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
            {clinicLogo ? (
              <View style={[styles.histAvatar, { backgroundColor: T.card, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }]}>
                <Image source={{ uri: clinicLogo }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
            ) : (
              <View style={[styles.histAvatar, { backgroundColor: `${dot}1A` }]}>
                <Text style={[styles.histAvatarText, { color: dot }]}>{initials}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <Text style={[styles.histTitle, { flexShrink: 1 }]} numberOfLines={1}>{patient}</Text>
                {!!(o as any).revision_of_id && (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(232,155,42,0.15)', flexShrink: 0 }}>
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#9C5E0E', letterSpacing: 0.4 }}>REVİZYON</Text>
                  </View>
                )}
                {/* Devam siparişi — masaüstü listesiyle aynı mavi kimlik */}
                {!(o as any).revision_of_id && !!(o as any).continues_order_id && (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6, backgroundColor: 'rgba(53,99,168,0.14)', flexShrink: 0 }}>
                    <Text style={{ fontSize: 8.5, fontWeight: '800', color: '#3563A8', letterSpacing: 0.4 }}>{autoT('DEVAM')}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.histSub} numberOfLines={1}>{workType}</Text>
              {!!who && (<Text style={styles.histWho} numberOfLines={1}>{who}</Text>)}
            </View>
            <View style={[styles.histBadge, { backgroundColor: `${dot}1A` }]}>
              <View style={[styles.histBadgeDot, { backgroundColor: dot }]} />
              <Text style={[styles.histBadgeText, { color: dot }]} numberOfLines={1}>{badgeLabel}</Text>
            </View>
          </View>

          {/* Alt satır — ikonlu meta: no · teslim · saat · diş */}
          <View style={styles.histMetaRow}>
            <View style={styles.histMeta}>
              <Hash size={12.5} color={T.ink3} strokeWidth={1.8} />
              <Text style={styles.histMetaText} numberOfLines={1}>{orderNum}</Text>
            </View>
            {/* Üretim panosunda asıl soru "ne zaman teslim etmeliyim?" →
                aktif işlerde TERMİN, teslim edilenlerde TESLİM olarak etiketle. */}
            <View style={styles.histMeta}>
              <CalendarDays size={13} color={dueColor} strokeWidth={1.8} />
              <Text style={[styles.histMetaText, { color: dueColor, fontFamily: MFONT.uiSemibold }]} numberOfLines={1}>
                {onHold ? due : `${isDone ? autoT('Teslim') : autoT('Termin')} ${due}`}
              </Text>
            </View>
            {/* Oluşturma saati yalnız teslim edilenlerde (tarihçe); aktif işte termin öne çıksın. */}
            {isDone && createdTime && (
              <View style={styles.histMeta}>
                <Clock size={12.5} color={T.ink3} strokeWidth={1.8} />
                <Text style={styles.histMetaText} numberOfLines={1}>{createdTime}</Text>
              </View>
            )}
            {toothCount > 0 && (
              <View style={styles.histMeta}>
                <Text style={styles.histMetaText} numberOfLines={1}>{`${toothCount} diş`}</Text>
              </View>
            )}
            {/* Devam siparişinde asıl işin numarası (masaüstü paritesi) */}
            {!(o as any).revision_of_id && !!(o as any).continues_order_id && !!numById.get(String((o as any).continues_order_id)) && (
              <View style={styles.histMeta}>
                {isRTL()
                  ? <CornerDownLeft size={12.5} color="#3563A8" strokeWidth={1.8} />
                  : <CornerDownRight size={12.5} color="#3563A8" strokeWidth={1.8} />}
                <Text style={[styles.histMetaText, { color: '#3563A8' }]} numberOfLines={1}>
                  {numById.get(String((o as any).continues_order_id))}
                </Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Vakanın eski revizyonları — girintili alt-liste */}
        {(history ?? []).map(h => {
          const hNo = String((h as any).order_number ?? h.id ?? '').slice(-6);
          const hDone = (h as any).status === 'teslim_edildi';
          return (
            <Pressable
              key={h.id}
              onPress={() => onOpenOrder(h)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 8,
                marginStart: 22, marginTop: 6,
                paddingHorizontal: 12, paddingVertical: 9,
                borderRadius: 12,
                backgroundColor: `${dot}0D`,
                borderWidth: 1, borderColor: `${dot}1F`,
              }}
            >
              {isRTL() ? <CornerDownLeft size={13} color={T.ink3} strokeWidth={2} /> : <CornerDownRight size={13} color={T.ink3} strokeWidth={2} />}
              <Text style={[styles.histMetaText, { flex: 1 }]} numberOfLines={1}>#{hNo}</Text>
              <Text style={[styles.histMetaText, { color: hDone ? '#2D9A6B' : T.ink2 }]} numberOfLines={1}>
                {hDone ? 'Teslim edildi' : 'Önceki'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
      {groups.map((g, gi) => {
        // Teslim Edilen İşler (tarihçe) → aktif operasyon ekranını boğmasın: ilk N + "gör".
        const isDelivered = g.key === 'teslim';
        const collapsed = isDelivered && !showAllDelivered && g.items.length > DELIVERED_PREVIEW;
        const shown = collapsed ? g.items.slice(0, DELIVERED_PREVIEW) : g.items;
        const hiddenCount = g.items.length - shown.length;
        return (
        <View key={g.key} style={{ marginTop: gi === 0 ? 4 : 22 }}>
          <View style={styles.sectionHead}>
            <View style={[styles.sectionDot, { backgroundColor: g.dot }]} />
            <Text style={[styles.sectionTitle, (g.key === 'planlama' || g.key === 'bekletilen') && { color: '#9C5E0E' }]}>
              {autoT(g.title).toLocaleUpperCase(localeTag())}
            </Text>
            <Text style={styles.sectionCount}>{`(${g.items.length})`}</Text>
          </View>
          <View style={{ gap: 20 }}>{shown.map(renderCard)}</View>
          {isDelivered && g.items.length > DELIVERED_PREVIEW && (
            <Pressable
              onPress={() => setShowAllDelivered(v => !v)}
              style={{ paddingVertical: 12, alignItems: 'center', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: theme.primary }}>
                {showAllDelivered
                  ? autoT('Daha az göster')
                  : `${hiddenCount} ${autoT('teslim edilen işi gör')} →`}
              </Text>
            </Pressable>
          )}
        </View>
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
