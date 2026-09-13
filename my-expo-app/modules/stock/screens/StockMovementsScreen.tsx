import { localeTag } from '../../../core/i18n';
/**
 * StockMovementsScreen — Hareketler (Patterns Design Language)
 *
 * Layout:
 *   • KPI bar (4 metrik: Toplam, Bugün, 7 Gün Giriş, 7 Gün Çıkış+Fire)
 *   • Toolbar (arama + tip filtre pills)
 *   • Tarih gruplu liste (Bugün · Dün · Bu hafta · Daha önce)
 *   • Desktop: tablo görünümü · Mobile: kart görünümü
 *
 * Notlar:
 *   • Lucide ikonlar (proje standardı)
 *   • Panel accent rengi (StockScreen tab → #6366F1 indigo)
 *   • Empty / loading / table-missing state'leri
 *   • Real-time subscribe (insert/update/delete)
 */
import React, { useState, useCallback, useEffect, useMemo, useContext } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Pressable,
  RefreshControl, useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowDownCircle, ArrowUpCircle, AlertCircle, SlidersHorizontal,
  Search, X, ArrowLeftRight, Database, Package,
  TrendingUp, TrendingDown, Activity, Clock, Plus,
} from '../../../core/ui/icons';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { DS } from '../../../core/theme/dsTokens';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { formatQty as fmtQty, formatQtyDual as fmtQtyDual } from '../../../core/util/formatQty';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { HubContext } from '../../../core/ui/HubContext';
import { HeroGlow, useHeroSurface } from '../../../core/ui/HeroGlow';

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Types ────────────────────────────────────────────────────────
type MoveType = 'IN' | 'OUT' | 'WASTE' | 'ADJUST';

interface Movement {
  id:           string;
  item_name:    string;
  type:         MoveType;
  quantity:     number;
  unit?:        string;
  note?:        string;
  source?:      string | null;
  stage?:       string | null;
  is_reversed?: boolean;
  user?:        { full_name: string } | null;
  created_at:   string;
  /** Paketli kalemde çift gösterim için (1 Adet = pack_size × content_unit) */
  stock_items?: { pack_size: number | null; content_unit: string | null } | null;
}

const TYPE_CFG: Record<MoveType, { label: string; color: string; bg: string; Icon: any; sign: string }> = {
  IN:     { label: 'Giriş',  color: '#059669', bg: 'rgba(5,150,105,0.10)', Icon: ArrowDownCircle, sign: '+' },
  OUT:    { label: 'Çıkış',  color: '#2563EB', bg: 'rgba(37,99,235,0.10)', Icon: ArrowUpCircle,   sign: '−' },
  WASTE:  { label: 'Fire',   color: '#DC2626', bg: 'rgba(220,38,38,0.10)', Icon: AlertCircle,     sign: '−' },
  ADJUST: { label: 'Düzelt', color: '#7C3AED', bg: 'rgba(124,58,237,0.10)', Icon: SlidersHorizontal, sign: '±' },
};

// ── Helpers ──────────────────────────────────────────────────────
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' });
}

const DAY_MS = 86400000;
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function dateBucket(iso: string): 'today' | 'yesterday' | 'thisWeek' | 'older' {
  const now = startOfDay(new Date()).getTime();
  const day = startOfDay(new Date(iso)).getTime();
  const diff = (now - day) / DAY_MS;
  if (diff <= 0)  return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 7)  return 'thisWeek';
  return 'older';
}

const BUCKET_LABEL: Record<string, string> = {
  today:     'Bugün',
  yesterday: 'Dün',
  thisWeek:  'Bu hafta',
  older:     'Daha önce',
};

/**
 * Sayfa kenarı (§1b). Tek sabit: `PAGE_PADDING` (16).
 * Ekran Stok hub'ının içinde render ediliyor ve hub kabı zaten 16 veriyor —
 * bir 16 daha eklenirse kartlar 32'de kalır ve başlıkla hizalanmaz. Bu yüzden
 * hub içinde yatay dolgu SIFIR; kenarı hub verir.
 */
function usePageEdge(): number {
  const isEmbedded = useContext(HubContext);
  return isEmbedded ? 0 : PAGE_PADDING;
}

// ═════════════════════════════════════════════════════════════════
// Screen
// ═════════════════════════════════════════════════════════════════
export function StockMovementsScreen({
  accentColor = '#6366F1',
  onNewMovement,
  newMovementLabel = 'Yeni Hareket',
}: {
  accentColor?: string;
  /** Verilirse hero kartın sağ üstünde birincil eylem olarak görünür (mobil). */
  onNewMovement?: () => void;
  newMovementLabel?: string;
}) {
  const { profile: authProfile } = useAuthStore();
  const labId = (authProfile as any)?.lab_id ?? authProfile?.id ?? null;
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const heroBg = useHeroSurface(accentColor);
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);

  const [items, setItems]             = useState<Movement[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [tableExists, setTableExists] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<MoveType | 'ALL'>('ALL');

  // ── Data load ──
  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      let q = supabase
        .from('stock_movements')
        .select('id, item_name, type, quantity, unit, note, source, stage, is_reversed, created_at, stock_items(pack_size, content_unit)');
      if (labId) q = q.eq('lab_id', labId);   // RLS'e ek savunma
      const { data, error } = await q
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setTableExists(false);
        }
        setItems([]);
      } else {
        setTableExists(true);
        // PostgREST gömülü ilişkiyi dizi olarak döndürüyor; tek kalem olduğu için düzleştiriyoruz
        setItems(((data ?? []) as any[]).map(r => ({
          ...r,
          stock_items: Array.isArray(r.stock_items) ? (r.stock_items[0] ?? null) : r.stock_items,
        })) as Movement[]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [labId]);

  useEffect(() => {
    load();
    const ch = supabase
      .channel('stock_movements_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movements' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  // ── KPI calculations ──
  const kpi = useMemo(() => {
    const todayMs = startOfDay(new Date()).getTime();
    const sevenDaysAgo = todayMs - 6 * DAY_MS;
    let todayCount = 0;
    let weekIn = 0;
    let weekOutWaste = 0;
    items.forEach(m => {
      if (m.is_reversed) return;
      const ts = new Date(m.created_at).getTime();
      if (ts >= todayMs) todayCount++;
      if (ts >= sevenDaysAgo) {
        if (m.type === 'IN')                              weekIn += m.quantity;
        else if (m.type === 'OUT' || m.type === 'WASTE')  weekOutWaste += m.quantity;
      }
    });
    return { total: items.length, today: todayCount, weekIn, weekOutWaste };
  }, [items]);

  // ── Filter ──
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(m => {
      if (typeFilter !== 'ALL' && m.type !== typeFilter) return false;
      if (q && !m.item_name.toLowerCase().includes(q) && !(m.note?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, typeFilter, search]);

  // ── Group by date bucket ──
  type Section = { kind: 'header'; label: string } | { kind: 'item'; m: Movement };
  const sections = useMemo<Section[]>(() => {
    const groups: Record<string, Movement[]> = { today: [], yesterday: [], thisWeek: [], older: [] };
    filtered.forEach(m => groups[dateBucket(m.created_at)].push(m));
    const out: Section[] = [];
    (['today', 'yesterday', 'thisWeek', 'older'] as const).forEach(k => {
      if (groups[k].length === 0) return;
      out.push({ kind: 'header', label: BUCKET_LABEL[k] });
      groups[k].forEach(m => out.push({ kind: 'item', m }));
    });
    return out;
  }, [filtered]);

  // ── Filter counts for pills ──
  const typeCounts = useMemo(() => {
    const c = { ALL: items.length, IN: 0, OUT: 0, WASTE: 0, ADJUST: 0 };
    items.forEach(m => { c[m.type]++; });
    return c;
  }, [items]);

  // ═════════════════════════════════════════════════════════════
  // Render
  // ═════════════════════════════════════════════════════════════

  if (loading) {
    return <CenteredLoader color={accentColor} />;
  }

  if (!tableExists) {
    return (
      <View style={s.center}>
        <View style={[s.emptyIcon, { backgroundColor: 'rgba(220,38,38,0.10)' }]}>
          <Database size={32} color="#DC2626" strokeWidth={1.6} />
        </View>
        <Text style={s.emptyTitle}>Tablo bulunamadı</Text>
        <Text style={s.emptySub}>
          Supabase'de "stock_movements" tablosu oluşturulduğunda hareketler burada görünür.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <FlatList
        data={sections}
        keyExtractor={(it, i) => it.kind === 'header' ? `h-${it.label}-${i}` : it.m.id}
        contentContainerStyle={{ paddingBottom: 60 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListHeaderComponent={
          <View>
            {/* ── F1 HeroCard — Hareket özeti ──
                Zemin `useHeroSurface` ile kurulur: açık temada panel accent'i
                (birebir eskisi), koyu temada accent'in DERİN tonu/gradyanı —
                düz safran koyu ekranda soluk bir leke gibi duruyordu.
                Dekoratif daireler `<HeroGlow>`: koyu temada blur ile yayılır. */}
            <View style={{
              borderRadius: 20, overflow: 'hidden',
              ...heroBg, padding: 18,
              position: 'relative',
              marginHorizontal: edge, marginTop: 4,
            }}>
              <HeroGlow size={160} opacity={0.18} delay={0} style={{ top: -40, end: -40 }} />
              <HeroGlow size={140} opacity={0.12} delay={1400} style={{ bottom: -50, start: -20 }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                    Toplam Hareket
                  </Text>
                  <Text style={{ ...DISPLAY, fontSize: 36, color: '#FFFFFF', letterSpacing: -1, lineHeight: 40 }}>
                    {kpi.total}
                  </Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 4 }}>
                    Bugün {kpi.today} işlem
                  </Text>
                </View>
                {/* Birincil eylem hero'nun içinde (Ürünler hero'suyla aynı kalıp):
                    accent zeminde beyaz pill, üstte ayrı satır harcanmaz. */}
                {onNewMovement ? (
                  <Pressable
                    onPress={onNewMovement}
                    accessibilityRole="button"
                    accessibilityLabel={newMovementLabel}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0,
                      paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
                      backgroundColor: '#FFFFFF',
                      ...(Platform.OS === 'web'
                        ? ({ cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.16)' } as any)
                        : { shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 }),
                    }}
                  >
                    <Plus size={14} color={accentColor} strokeWidth={2.4} />
                    <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: accentColor }}>{newMovementLabel}</Text>
                  </Pressable>
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
                    <Activity size={20} color="#FFFFFF" strokeWidth={1.6} />
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {([
                  { label: 'Bugün',       value: kpi.today,        icon: Clock         },
                  { label: '7G Giriş',    value: kpi.weekIn,       icon: TrendingUp    },
                  { label: '7G Çıkış',    value: kpi.weekOutWaste, icon: TrendingDown  },
                ] as const).map(stat => {
                  const Icon = stat.icon;
                  return (
                    <View key={stat.label} style={{ flex: 1, minWidth: 110, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                        <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                        <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                          {stat.label}
                        </Text>
                      </View>
                      <Text style={{ ...DISPLAY, fontSize: 20, color: '#FFFFFF', letterSpacing: -0.5, lineHeight: 22 }}>
                        {fmtQty(stat.value)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* ── Toolbar (arama + tip filtreleri) ───────────────── */}
            <View style={s.toolbar}>
              {/* Filter pills */}
              <View style={s.pillRow}>
                <FilterPill
                  active={typeFilter === 'ALL'}
                  label="Tümü"
                  count={typeCounts.ALL}
                  onPress={() => setTypeFilter('ALL')}
                  accent={accentColor}
                />
                {(['IN', 'OUT', 'WASTE', 'ADJUST'] as MoveType[]).map(t => {
                  const cfg = TYPE_CFG[t];
                  return (
                    <FilterPill
                      key={t}
                      active={typeFilter === t}
                      label={cfg.label}
                      count={typeCounts[t]}
                      icon={cfg.Icon}
                      iconColor={cfg.color}
                      onPress={() => setTypeFilter(t)}
                      accent={cfg.color}
                    />
                  );
                })}
              </View>

              {/* Search toggle */}
              <Pressable
                onPress={() => setSearchOpen(v => !v)}
                style={[
                  s.searchToggle,
                  (searchOpen || search.length > 0) && { backgroundColor: accentColor + '14' },
                ]}
              >
                <Search size={16} color={(searchOpen || search.length > 0) ? accentColor : T.ink3} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* ── Search input (expandable) ──────────────────────── */}
            {(searchOpen || search.length > 0) && (
              <View style={s.searchBox}>
                <Search size={16} color="#94A3B8" strokeWidth={1.8} />
                <TextInput
                  style={s.searchInput as any}
                  placeholder="Ürün adı veya not ara..."
                  placeholderTextColor="#AEAEB2"
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                />
                {search.length > 0 && (
                  <Pressable onPress={() => { setSearch(''); }}>
                    <X size={14} color="#94A3B8" strokeWidth={2} />
                  </Pressable>
                )}
              </View>
            )}

            {/* ── Desktop tablo başlığı ──────────────────────────── */}
            {isDesktop && filtered.length > 0 && (
              <View style={s.tableHead}>
                <Text style={[s.th, { flex: 0.5 }]}></Text>
                <Text style={[s.th, { flex: 3 }]}>ÜRÜN</Text>
                <Text style={[s.th, { flex: 1.2 }]}>İŞLEM</Text>
                <Text style={[s.th, { flex: 1, textAlign: 'end' as any }]}>MİKTAR</Text>
                <Text style={[s.th, { flex: 1.5, textAlign: 'end' as any }]}>SAAT</Text>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          search || typeFilter !== 'ALL' ? (
            <View style={s.center}>
              <View style={[s.emptyIcon, { backgroundColor: T.cardSoft }]}>
                <Search size={28} color={T.ink3} strokeWidth={1.6} />
              </View>
              <Text style={s.emptyTitle}>Sonuç bulunamadı</Text>
              <Text style={s.emptySub}>Arama/filtre kriterlerine uygun hareket yok.</Text>
            </View>
          ) : (
            <View style={s.center}>
              <View style={[s.emptyIcon, { backgroundColor: accentColor + '14' }]}>
                <ArrowLeftRight size={28} color={accentColor} strokeWidth={1.6} />
              </View>
              <Text style={s.emptyTitle}>Henüz hareket yok</Text>
              <Text style={s.emptySub}>Stok girişi, çıkışı veya fire kaydı eklendiğinde burada görünür.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          if (item.kind === 'header') {
            return (
              <View style={s.sectionHeader}>
                <Text style={s.sectionLabel}>{item.label}</Text>
                <View style={s.sectionDivider} />
              </View>
            );
          }
          return isDesktop
            ? <DesktopRow m={item.m} />
            : <MobileCard m={item.m} />;
        }}
      />
    </SafeAreaView>
  );
}

// ═════════════════════════════════════════════════════════════════
// KPI Card
// ═════════════════════════════════════════════════════════════════
function KPI({ icon: Icon, label, value, accent }: {
  icon: any; label: string; value: string; accent: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);
  return (
    <View style={s.kpiCard}>
      <View style={[s.kpiIcon, { backgroundColor: accent + '14' }]}>
        <Icon size={16} color={accent} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.kpiLabel}>{label}</Text>
        <Text style={[s.kpiValue, { color: accent }]} numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
// Filter pill
// ═════════════════════════════════════════════════════════════════
function FilterPill({ active, label, count, icon: Icon, iconColor, onPress, accent }: {
  active: boolean; label: string; count: number;
  icon?: any; iconColor?: string; onPress: () => void; accent: string;
}) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.pill,
        active && { backgroundColor: accent + '14', borderColor: accent + '40' },
      ]}
    >
      {Icon && <Icon size={13} color={active ? accent : (iconColor ?? '#64748B')} strokeWidth={1.8} />}
      <Text style={[s.pillText, active && { color: accent, fontWeight: '700' as const }]}>
        {label}
      </Text>
      {count > 0 && (
        <View style={[s.pillCount, active && { backgroundColor: accent + '20' }]}>
          <Text style={[s.pillCountText, active && { color: accent }]}>{count}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ═════════════════════════════════════════════════════════════════
// Desktop row
// ═════════════════════════════════════════════════════════════════
function DesktopRow({ m }: { m: Movement }) {
  const cfg = TYPE_CFG[m.type] ?? TYPE_CFG.OUT;
  const Icon = cfg.Icon;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);

  return (
    <View style={[s.row, m.is_reversed && { opacity: 0.5 }]}>
      {/* Type icon circle */}
      <View style={{ flex: 0.5, alignItems: 'center' }}>
        <View style={[s.iconCircle, { backgroundColor: cfg.bg }]}>
          <Icon size={16} color={cfg.color} strokeWidth={1.8} />
        </View>
      </View>

      {/* Item name + tags + note */}
      <View style={{ flex: 3, minWidth: 0 }}>
        <View style={s.itemNameRow}>
          <Text style={[s.rowName, m.is_reversed && { textDecorationLine: 'line-through' as const }]} numberOfLines={1}>
            {m.item_name}
          </Text>
          {m.stage && <Tag label={m.stage} />}
          {m.is_reversed && <Tag label="İADE EDİLDİ" tone="muted" />}
          {m.source === 'rework_return' && <Tag label="↺ İADE" tone="success" />}
        </View>
        {m.note && (
          <Text style={s.rowNote} numberOfLines={1}>{m.note}</Text>
        )}
      </View>

      {/* Type pill */}
      <View style={{ flex: 1.2 }}>
        <View style={[s.typePill, { backgroundColor: cfg.bg }]}>
          <Text style={[s.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Quantity */}
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={[s.rowQty, { color: cfg.color }]}>
          {cfg.sign}{fmtQtyDual(m.quantity, m.unit, m.stock_items?.pack_size, m.stock_items?.content_unit)}
        </Text>
      </View>

      {/* Time */}
      <Text style={[s.rowDate, { flex: 1.5, textAlign: 'end' as any }]}>
        {fmtTime(m.created_at)}
      </Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
// Mobile card
// ═════════════════════════════════════════════════════════════════
function MobileCard({ m }: { m: Movement }) {
  const cfg = TYPE_CFG[m.type] ?? TYPE_CFG.OUT;
  const Icon = cfg.Icon;
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);

  return (
    <View style={[s.card, m.is_reversed && { opacity: 0.5 }]}>
      <View style={s.cardTop}>
        <View style={[s.iconCircle, { backgroundColor: cfg.bg }]}>
          <Icon size={18} color={cfg.color} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.rowName, m.is_reversed && { textDecorationLine: 'line-through' as const }]} numberOfLines={1}>
            {m.item_name}
          </Text>
          <View style={s.cardTagRow}>
            <View style={[s.typePill, { backgroundColor: cfg.bg }]}>
              <Text style={[s.typePillText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {m.stage && <Tag label={m.stage} />}
            {m.is_reversed && <Tag label="İADE EDİLDİ" tone="muted" />}
            {m.source === 'rework_return' && <Tag label="↺ İADE" tone="success" />}
          </View>
          {m.note && <Text style={s.rowNote}>{m.note}</Text>}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.cardQty, { color: cfg.color }]}>
            {cfg.sign}{fmtQty(m.quantity)}
          </Text>
          <Text style={s.rowUnit}>
            {m.stock_items?.pack_size && m.stock_items?.content_unit
              ? `${m.unit ?? ''} · ${fmtQty(m.quantity * m.stock_items.pack_size)} ${m.stock_items.content_unit}`
              : (m.unit ?? '')}
          </Text>
        </View>
      </View>
      <Text style={s.cardTime}>{fmtTime(m.created_at)}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
// Tag
// ═════════════════════════════════════════════════════════════════
function Tag({ label, tone = 'default' }: { label: string; tone?: 'default' | 'muted' | 'success' }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(st => st.resolvedDark);
  const edge = usePageEdge();
  const s = useMemo(() => makeStyles(T, isDark, edge), [T, isDark, edge]);
  const colors = {
    default: { bg: T.cardSoft, text: T.ink2 },
    muted:   { bg: T.cardSoft, text: T.ink3 },
    // Açık pastel yeşil koyu zeminde beyaz leke gibi patlıyordu (§ avatar/rozet kuralı)
    success: { bg: isDark ? 'rgba(5,150,105,0.24)' : '#ECFDF5', text: isDark ? '#6EE7B7' : '#047857' },
  }[tone];
  return (
    <View style={[s.tag, { backgroundColor: colors.bg }]}>
      <Text style={[s.tagText, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

// ═════════════════════════════════════════════════════════════════
// Styles
// ═════════════════════════════════════════════════════════════════
// Hub içinde krem zemin üzerinde duruyor — ince border + minimal shadow yeter
const cardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 1px 3px rgba(0,0,0,0.04)' } as any
  : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 };

const makeStyles = (T: ReturnType<typeof useMobileTokens>, isDark: boolean, edge: number) => StyleSheet.create({
  // Hub içinde embedded olarak renderlandığı için kendi arka planı yok — parent'ın krem/beyaz zemininden yararlanır
  safe:   { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },

  // KPI bar
  kpiRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: edge, paddingTop: 16,
    flexWrap: 'wrap',
  },
  kpiCard: {
    flex: 1, minWidth: 140,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: T.card, borderRadius: 14,
    borderWidth: 1, borderColor: T.hairline2,
    ...cardShadow,
  },
  kpiIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiLabel: { fontSize: 10, fontWeight: '600', color: T.ink3, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  kpiValue: { ...DISPLAY, fontSize: 20, letterSpacing: -0.4, marginTop: 2 },

  // Toolbar
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: edge, paddingTop: 16, paddingBottom: 4,
  },
  pillRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: T.hairline,
    backgroundColor: T.card,
  },
  pillText: { fontSize: 12, fontWeight: '500', color: T.ink2 },
  pillCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999,
    backgroundColor: T.cardSoft,
  },
  pillCountText: { fontSize: 10, fontWeight: '700', color: T.ink3 },
  searchToggle: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.hairline,
    backgroundColor: T.card,
  },

  // Search box
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 42, paddingHorizontal: 14,
    marginHorizontal: edge, marginTop: 8,
    borderRadius: 14,
    borderWidth: 1, borderColor: T.hairline,
    backgroundColor: T.card,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: T.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: edge, paddingTop: 18, paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: T.ink3,
    letterSpacing: 0.7, textTransform: 'uppercase' as const,
  },
  sectionDivider: { flex: 1, height: 1, backgroundColor: T.hairline },

  // Desktop table head
  tableHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 16,
    marginHorizontal: edge, marginTop: 16,
    backgroundColor: T.cardSoft, borderRadius: 12,
  },
  th: { fontSize: 10, fontWeight: '700', color: T.ink3, letterSpacing: 0.7, textTransform: 'uppercase' as const },

  // Desktop row
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 14,
    marginHorizontal: edge, marginBottom: 6,
    backgroundColor: T.card, borderRadius: 14,
    borderWidth: 1, borderColor: T.hairline2,
    ...cardShadow,
  },
  iconCircle: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  rowName: { fontSize: 14, fontWeight: '600', color: T.ink },
  rowNote: { fontSize: 11, color: T.ink3, marginTop: 3 },
  rowQty: { fontSize: 14, fontWeight: '700' },
  rowUnit: { fontSize: 10, color: T.ink3, marginTop: 2 },
  rowDate: { fontSize: 12, fontWeight: '500', color: T.ink3 },

  // Mobile card
  card: {
    marginHorizontal: edge, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: T.card, borderRadius: 14,
    borderWidth: 1, borderColor: T.hairline2,
    ...cardShadow,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  cardQty: { fontSize: 17, fontWeight: '700' },
  cardTime: { fontSize: 11, color: T.ink3, marginTop: 8, textAlign: 'end' as any },

  // Type pill
  typePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999,
  },
  typePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  // Tag
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },

  // Empty
  emptyIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { ...DISPLAY, fontSize: 20, color: T.ink, textAlign: 'center', letterSpacing: -0.3 },
  emptySub: { fontSize: 13, color: T.ink3, textAlign: 'center', lineHeight: 20, maxWidth: 360 },
});
