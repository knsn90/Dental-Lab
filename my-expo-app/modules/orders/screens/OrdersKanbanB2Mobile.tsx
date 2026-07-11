import { localeTag } from '../../../core/i18n';
/**
 * OrdersKanbanB2Mobile — Mobile orders view.
 * Görünüm modu: List (default) veya Kanban swimlanes.
 * Header üstünde: Arama · Filtre · Görünüm seçici (List/Kanban).
 */
import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  RefreshControl, StyleSheet, Modal,
} from 'react-native';
import { Search, X, SlidersHorizontal, Hash, CalendarDays, Clock } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { MFONT, useMobileTheme } from '../../../core/theme/mobileTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import Svg, { Defs, Rect, RadialGradient, Stop } from 'react-native-svg';
import type { WorkOrder } from '../types';
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
  { key: 'planlama', title: 'Planlama', dot: '#C97A2A', match: ['alindi'],            triageState: 'pending' },
  { key: 'yeni',     title: 'Yeni',     dot: '#E89B2A', match: ['alindi'],            triageState: 'done' },
  { key: 'uretimde', title: 'Üretimde', dot: 'PRIMARY', match: ['uretimde'] },
  { key: 'qa',       title: 'Kontrol',  dot: '#4A8FC9', match: ['kalite_kontrol'] },
  { key: 'teslimat', title: 'Yolda',    dot: '#2D9A6B', match: ['teslimata_hazir'] },
];

type ViewMode = 'list' | 'kanban';
type StatusFilter = 'all' | 'planlama' | 'yeni' | 'uretimde' | 'qa' | 'teslimat';

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
  const laneOf = (o: WorkOrder): LaneDef | undefined => {
    const triaged = !!(o as any).triaged_at;
    return LANES.find(l => {
      if (!l.match.includes(o.status)) return false;
      if (l.triageState === 'pending') return !triaged;
      if (l.triageState === 'done')    return triaged;
      return true;
    });
  };

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
          <Text style={styles.h2}>Vakalar</Text>
          <Text style={styles.hint}>
            {filtered.length} kayıt{statusFilter !== 'all' ? ` · ${LANES.find(l => l.key === statusFilter)?.title}` : ''}
          </Text>
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

  // Group orders by lane — TÜM hook'lar early return'den ÖNCE (Rules of Hooks)
  const sections = useMemo(() => {
    const buckets: Record<string, WorkOrder[]> = {};
    LANES.forEach(l => { buckets[l.key] = []; });
    const other: WorkOrder[] = []; // hiçbir lane'e uymayanlar (teslim edildi / tamamlandı vb.)
    orders.forEach(o => {
      const lane = laneOf(o);
      if (lane) buckets[lane.key].push(o);
      else other.push(o);
    });
    // Yeniden eskiye sırala (en yeni üstte) — created_at, yoksa order_number
    const recent = (o: WorkOrder) => {
      const t = (o as any).created_at ? Date.parse((o as any).created_at) : NaN;
      return Number.isNaN(t) ? String((o as any).order_number ?? '') : t;
    };
    const byNewest = (a: WorkOrder, b: WorkOrder) => {
      const ra = recent(a), rb = recent(b);
      if (typeof ra === 'number' && typeof rb === 'number') return rb - ra;
      return String(rb).localeCompare(String(ra));
    };
    Object.values(buckets).forEach(arr => arr.sort(byNewest));
    other.sort(byNewest);
    const result = LANES.filter(l => (buckets[l.key]?.length ?? 0) > 0).map(l => ({
      lane: l,
      items: buckets[l.key],
    }));
    // Lane'lere uymayanları "Devam Eden" (aktif) ve "Tamamlandı" (teslim edildi) olarak ayır
    const finished = other.filter(o => (o as any).status === 'teslim_edildi');
    const ongoing  = other.filter(o => (o as any).status !== 'teslim_edildi');
    if (ongoing.length > 0) {
      result.push({
        lane: { key: 'devam', title: 'Devam Eden', dot: 'PRIMARY', match: [] } as LaneDef,
        items: ongoing,
      });
    }
    if (finished.length > 0) {
      result.push({
        lane: { key: 'tamam', title: 'Tamamlandı', dot: '#2D9A6B', match: [] } as LaneDef,
        items: finished,
      });
    }
    return result;
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

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
      {sections.map((section, sIdx) => {
        const dot = section.lane.dot === 'PRIMARY' ? theme.primary : section.lane.dot;
        return (
          <View key={section.lane.key} style={{ marginTop: sIdx === 0 ? 4 : 22 }}>
            {/* Section başlığı — küçük uppercase + sayı */}
            <View style={styles.sectionHead}>
              <View style={[styles.sectionDot, { backgroundColor: dot }]} />
              <Text style={styles.sectionTitle}>{section.lane.title}</Text>
              <Text style={styles.sectionCount}>{section.items.length}</Text>
            </View>

            {/* Kartlar — teknisyen geçmiş tasarımı (beyaz kart + gölge) */}
            <View style={{ gap: 10 }}>
              {section.items.map((o) => {
                const orderNum = String((o as any).order_number ?? o.id ?? '').slice(-6);
                const workType = (o as any).work_type ?? 'Sipariş';
                const patient = (o as any).patient_name ?? (o as any).doctor_name ?? '—';
                // Hekim + klinik — attachDoctors o.doctor'a yapıştırır; flat alanlara da düş
                const doctorName = (o as any).doctor?.full_name ?? (o as any).doctor_name ?? null;
                const clinicName = (o as any).doctor?.clinic?.name ?? (o as any).doctor?.clinic_name ?? (o as any).clinic_name ?? null;
                const who = [doctorName, clinicName].filter(Boolean).join(' · ');
                const due = (o as any).delivery_date ? formatDue((o as any).delivery_date) : '—';
                // Sipariş oluşturma saati (created_at → HH:MM)
                const createdTime = (o as any).created_at
                  ? new Date((o as any).created_at).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })
                  : null;
                const initials = String(patient).trim().split(/\s+/).slice(0, 2)
                  .map((p: string) => p[0]?.toUpperCase() ?? '').join('') || '?';
                // Teslim rengi — gecikmiş kırmızı, yakın amber, "diğer"(teslim) nötr
                const dd = (o as any).delivery_date;
                const dleft = dd ? Math.ceil((new Date(dd + 'T00:00:00').getTime() - Date.now()) / 86_400_000) : null;
                const isDone = (o as any).status === 'teslim_edildi' || section.lane.key === 'tamam';
                const dueColor = isDone || dleft == null ? T.ink2
                  : dleft < 0 ? '#D94B4B' : dleft <= 1 ? '#E89B2A' : T.ink2;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => onOpenOrder(o)}
                    style={[styles.histCard, section.lane.key === 'tamam' && { opacity: 0.74 }]}
                  >
                    {/* Sol renk-accent şeridi */}
                    <View style={[styles.histAccent, { backgroundColor: dot }]} />

                    {/* Üst satır — avatar + hasta/iş türü + durum çipi */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                      <View style={[styles.histAvatar, { backgroundColor: `${dot}1A` }]}>
                        <Text style={[styles.histAvatarText, { color: dot }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.histTitle} numberOfLines={1}>{patient}</Text>
                        <Text style={styles.histSub} numberOfLines={1}>{workType}</Text>
                        {!!who && (
                          <Text style={styles.histWho}>{who}</Text>
                        )}
                      </View>
                      <View style={[styles.histBadge, { backgroundColor: `${dot}1A` }]}>
                        <View style={[styles.histBadgeDot, { backgroundColor: dot }]} />
                        <Text style={[styles.histBadgeText, { color: dot }]} numberOfLines={1}>
                          {section.lane.title.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    {/* Alt satır — ikonlu meta: no · teslim */}
                    <View style={styles.histMetaRow}>
                      <View style={styles.histMeta}>
                        <Hash size={12.5} color={T.ink3} strokeWidth={1.8} />
                        <Text style={styles.histMetaText} numberOfLines={1}>{orderNum}</Text>
                      </View>
                      <View style={styles.histMeta}>
                        <CalendarDays size={13} color={dueColor} strokeWidth={1.8} />
                        <Text style={[styles.histMetaText, { color: dueColor, fontFamily: MFONT.uiSemibold }]} numberOfLines={1}>{due}</Text>
                      </View>
                      {createdTime && (
                        <View style={styles.histMeta}>
                          <Clock size={12.5} color={T.ink3} strokeWidth={1.8} />
                          <Text style={styles.histMetaText} numberOfLines={1}>{createdTime}</Text>
                        </View>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
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
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80 }}>
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
    top: 7, right: 7,
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
    marginLeft: 'auto',
  },

  // ── Kart tarzı (teknisyen geçmiş sayfası ile aynı) ──
  histCard: {
    backgroundColor: T.card,
    borderRadius: 18,
    paddingVertical: 14,
    paddingLeft: 18,
    paddingRight: 14,
    gap: 11,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    overflow: 'hidden',
    position: 'relative',
    ...(isDark ? {} : {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.07,
      shadowRadius: 14,
      elevation: 3,
    }),
  },
  histAccent: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
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
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: 132,
  },
  histBadgeDot: {
    width: 5, height: 5, borderRadius: 3, flexShrink: 0,
  },
  histBadgeText: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 9.5,
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
