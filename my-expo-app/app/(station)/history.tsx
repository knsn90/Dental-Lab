// app/(station)/history.tsx
// Teknisyenin geçmiş işleri — 2 bölüm:
//   1) Tamamladığım aşamalar (son 50 stage)
//   2) Dahil olduğum ve teslim edilen siparişler (kliniğe gönderilmiş, son 30)

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Platform, Pressable, useWindowDimensions, TextInput, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Calendar, Truck, ArrowUpRight, Search, X, SlidersHorizontal, Check } from 'lucide-react-native';
import { localeTag } from '../../core/i18n';
import { useAuthStore } from '../../core/store/authStore';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { supabase } from '../../core/api/supabase';
import { useStationTheme, hexA } from '../../core/theme/stationPalette';
import { mobileTopPad } from '../../core/ui/pageMetrics';

const DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';

interface CompletedStage {
  id: string;
  completed_at: string | null;
  started_at: string | null;
  assigned_at: string | null;
  status: string | null;
  station_name: string | null;
  order_number: string | null;
  patient_name: string | null;
  work_order_id: string | null;
  // ── Detay popup için zenginleştirilmiş alanlar ──
  doctor_name: string | null;
  clinic_name: string | null;
  doctor_notes: string | null;    // work_orders.notes (hekim talimatı)
  work_type: string | null;
}

// Süre formatla — minute → "2s 15dk" / "45dk" / "1g 3s"
function formatDuration(fromIso: string | null, toIso: string | null): string {
  if (!fromIso || !toIso) return '—';
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1dk';
  if (mins < 60) return `${mins}dk`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${h}s ${m}dk` : `${h}s`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}g ${rh}s` : `${d}g`;
}

// Statü TR etiket + renk
function statusBadge(status: string | null, completedAt: string | null): { label: string; fg: string; bg: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'tamamlandi':
    case 'onaylandi':
      return { label: 'Tamamlandı', fg: '#1F6B47', bg: 'rgba(34,197,94,0.14)' };
    case 'aktif':
      return { label: 'Devam Ediyor', fg: '#1D4ED8', bg: 'rgba(59,130,246,0.14)' };
    case 'bekliyor':
      return { label: 'Bekliyor', fg: '#92400E', bg: 'rgba(245,158,11,0.14)' };
    case 'reddedildi':
      return { label: 'Reddedildi', fg: '#991B1B', bg: 'rgba(220,38,38,0.14)' };
    case 'iptal':
    case 'iptal_edildi':
      return { label: 'İptal', fg: '#475569', bg: 'rgba(100,116,139,0.16)' };
    default:
      if (completedAt) return { label: 'Tamamlandı', fg: '#1F6B47', bg: 'rgba(34,197,94,0.14)' };
      return { label: status || '—', fg: '#475569', bg: 'rgba(100,116,139,0.16)' };
  }
}

// "Kuron, Kuron, Veneer, Kuron" → "Kuron × 3 · Veneer"
function formatWorkType(raw: string | null | undefined): string {
  if (!raw) return '—';
  const parts = raw.split(/,\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '—';
  const counts = new Map<string, number>();
  parts.forEach(p => counts.set(p, (counts.get(p) ?? 0) + 1));
  return Array.from(counts.entries())
    .map(([name, n]) => (n > 1 ? `${name} × ${n}` : name))
    .join(' · ');
}

function fmtDateShort(iso: string | null, locale: string = 'tr-TR'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString(locale)} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
}

interface DeliveredOrder {
  id: string;
  order_number: string | null;
  patient_name: string | null;
  delivered_at: string | null;
  doctor_name: string | null;
  clinic_name: string | null;
  my_stages_count: number;
}

export default function StationHistoryScreen() {
  const { t, i18n } = useTranslation();
  const P = useStationTheme();
  const { profile } = useAuthStore();
  const { setTitle, clear } = usePageTitleStore();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [stages, setStages] = useState<CompletedStage[]>([]);
  const [orders, setOrders] = useState<DeliveredOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'stages' | 'orders'>('stages');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'active' | 'waiting' | 'rejected'>('all');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0);
  const [selectedStage, setSelectedStage] = useState<CompletedStage | null>(null);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // ── Arama + durum filtresi (client-side) ──
  const filteredStages = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stages.filter(s => {
      // Durum
      if (statusFilter !== 'all') {
        const st = (s.status ?? '').toLowerCase();
        const isDone = st === 'tamamlandi' || st === 'onaylandi' || (!!s.completed_at && !st);
        if (statusFilter === 'done'     && !isDone)              return false;
        if (statusFilter === 'active'   && st !== 'aktif')       return false;
        if (statusFilter === 'waiting'  && st !== 'bekliyor')    return false;
        if (statusFilter === 'rejected' && st !== 'reddedildi')  return false;
      }
      if (!q) return true;
      return (
        (s.station_name ?? '').toLowerCase().includes(q) ||
        (s.order_number ?? '').toLowerCase().includes(q) ||
        (s.patient_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [stages, search, statusFilter]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o =>
      (o.order_number ?? '').toLowerCase().includes(q) ||
      (o.patient_name ?? '').toLowerCase().includes(q) ||
      (o.doctor_name  ?? '').toLowerCase().includes(q) ||
      (o.clinic_name  ?? '').toLowerCase().includes(q)
    );
  }, [orders, search]);

  useEffect(() => {
    setTitle(t('nav.items.history'), t('station.history.subtitle'));
    return clear;
  }, []);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    // ── 1) Tamamladığım aşamalar ──
    // İki kaynak:
    //   a) order_stages — teknisyene atanmış + completed_at dolu (her statüde)
    //   b) stage_log    — her stage transition kaydı (owner_id = bu kullanıcı)
    // İki sonucu birleştir, work_order_id + stage adına göre tekrar engelle.

    // Sadece bu teknisyene atanmış order_stages — TEK kaynak.
    // Tüm statüler dahil. Tarih önceliği: completed_at > started_at > assigned_at.
    // İlk günden itibaren TÜM aşamalar — basit join, riskli FK hint yok.
    // Klinik / hekim / not detaylarını popup açıldığında ayrıca çekiyoruz.
    const stagesRes = await supabase
      .from('order_stages')
      .select(`
        id, completed_at, started_at, assigned_at, work_order_id, status, technician_id, station_id,
        station:lab_stations(name),
        work_order:work_orders!work_order_id(order_number, patient_name, work_type, notes, doctor_id)
      `)
      .eq('technician_id', profile.id)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .range(0, 9999);

    if (typeof console !== 'undefined') {
      console.log('[history] profile.id =', profile.id);
      console.log('[history] order_stages rows:', stagesRes.error || `${stagesRes.data?.length ?? 0} rows`);
      if (stagesRes.error) console.warn('[history] order_stages error:', stagesRes.error);
    }

    const merged: CompletedStage[] = ((stagesRes.data ?? []) as any[])
      .map(r => ({
        id: r.id,
        completed_at: r.completed_at ?? null,
        started_at: r.started_at ?? null,
        assigned_at: r.assigned_at ?? null,
        status: r.status ?? null,
        work_order_id: r.work_order_id,
        station_name: r.station?.name ?? null,
        order_number: r.work_order?.order_number ?? null,
        patient_name: r.work_order?.patient_name ?? null,
        work_type: r.work_order?.work_type ?? null,
        doctor_notes: r.work_order?.notes ?? null,
        // Hekim/klinik popup açılırken polymorphic resolve ile gelir
        doctor_name: null,
        clinic_name: null,
        _doctor_id: r.work_order?.doctor_id ?? null,
      }) as any)
      .sort((a, b) => {
        const ka = a.completed_at ?? a.started_at ?? a.assigned_at ?? '';
        const kb = b.completed_at ?? b.started_at ?? b.assigned_at ?? '';
        return kb.localeCompare(ka);
      });

    setStages(merged);

    // ── 2) Dahil olduğum + teslim edilen siparişler ──
    // Önce bana atanmış unique work_order_id'leri al
    const woIdsRes = await supabase
      .from('order_stages')
      .select('work_order_id')
      .eq('technician_id', profile.id)
      .not('work_order_id', 'is', null);
    const myWoIds = Array.from(new Set(((woIdsRes.data ?? []) as any[]).map(r => r.work_order_id).filter(Boolean))) as string[];

    if (myWoIds.length === 0) {
      setOrders([]);
      setLoading(false);
      return;
    }

    const deliveredRes = await supabase
      .from('work_orders')
      .select(`
        id, order_number, patient_name, status, delivered_at, doctor_id,
        doctor:doctors(full_name, clinic:clinics(name))
      `)
      .in('id', myWoIds)
      .eq('status', 'teslim_edildi')
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .limit(30);

    // Her sipariş için benim stage sayım
    const myStageCounts = new Map<string, number>();
    (woIdsRes.data ?? []).forEach((r: any) => {
      if (r.work_order_id) {
        myStageCounts.set(r.work_order_id, (myStageCounts.get(r.work_order_id) ?? 0) + 1);
      }
    });

    const ordersList: DeliveredOrder[] = ((deliveredRes.data ?? []) as any[]).map(r => ({
      id: r.id,
      order_number: r.order_number,
      patient_name: r.patient_name,
      delivered_at: r.delivered_at ?? null,
      doctor_name: r.doctor?.full_name ?? null,
      clinic_name: r.doctor?.clinic?.name ?? null,
      my_stages_count: myStageCounts.get(r.id) ?? 0,
    }));
    setOrders(ordersList);
    setLoading(false);
  }, [profile?.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: P.pageBg }}
      contentContainerStyle={{ padding: 16, paddingTop: mobileTopPad(insets.top), paddingBottom: 80 }}
    >
      {/* Mobil başlık — PatternsShell desktop'ta zaten üstte başlığı gösteriyor */}
      {isMobile && (
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: P.ink400, letterSpacing: 1.2, textTransform: 'uppercase' }}>
            {t('station.history.breadcrumb')}
          </Text>
          <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: 32, color: P.ink900, letterSpacing: -0.8, marginTop: 4 }}>
            {t('station.history.pageTitle')}
          </Text>
          <Text style={{ fontSize: 12.5, color: P.ink500, marginTop: 4 }}>
            {t('station.history.pageSubtitle')}
          </Text>
        </View>
      )}

      {/* Tab pills + arama/filtre buton ikonları */}
      <View style={{ marginBottom: 14, gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Tab pills */}
          <View style={{
            flexDirection: 'row', gap: 6, padding: 4,
            backgroundColor: P.ink100, borderRadius: 999, alignSelf: 'flex-start',
          }}>
            {([
              { key: 'stages', label: t('station.history.myStages'), count: filteredStages.length },
              { key: 'orders', label: t('station.history.delivered'), count: filteredOrders.length },
            ] as const).map(t => {
              const active = tab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: active ? P.ink900 : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: active ? P.surface : P.ink500 }}>{t.label}</Text>
                  <View style={{
                    paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999,
                    backgroundColor: active ? hexA(P.surface, 0.18) : P.ink100,
                  }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: active ? P.surface : P.ink500 }}>{t.count}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flex: 1 }} />

          {/* Arama butonu */}
          <Pressable
            onPress={() => setSearchOpen(v => !v)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 7,
              paddingHorizontal: 12, height: 38, borderRadius: 999,
              backgroundColor: searchOpen || search.length > 0 ? P.ink900 : P.surface,
              borderWidth: 1, borderColor: searchOpen || search.length > 0 ? P.ink900 : P.ink100,
              ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.12s' } as any : {}),
            }}
          >
            <Search size={14} color={searchOpen || search.length > 0 ? P.surface : P.ink500} strokeWidth={1.9} />
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: searchOpen || search.length > 0 ? P.surface : P.ink500 }}>{t('nav.items.search')}</Text>
            {search.length > 0 && (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: hexA(P.surface, 0.2) }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: P.surface }}>1</Text>
              </View>
            )}
          </Pressable>

          {/* Filtre butonu — sadece Aşamalarım sekmesinde */}
          {tab === 'stages' && (
            <Pressable
              onPress={() => setFilterOpen(v => !v)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 12, height: 38, borderRadius: 999,
                backgroundColor: filterOpen || activeFilterCount > 0 ? P.ink900 : P.surface,
                borderWidth: 1, borderColor: filterOpen || activeFilterCount > 0 ? P.ink900 : P.ink100,
                ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'all 0.12s' } as any : {}),
              }}
            >
              <SlidersHorizontal size={14} color={filterOpen || activeFilterCount > 0 ? P.surface : P.ink500} strokeWidth={1.9} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: filterOpen || activeFilterCount > 0 ? P.surface : P.ink500 }}>{t('station.history.filter')}</Text>
              {activeFilterCount > 0 && (
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: hexA(P.surface, 0.2) }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: P.surface }}>{activeFilterCount}</Text>
                </View>
              )}
            </Pressable>
          )}
        </View>

        {/* Açılır arama kutusu */}
        {searchOpen && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            paddingHorizontal: 14, height: 42,
            backgroundColor: P.surface, borderRadius: 12,
            borderWidth: 1, borderColor: P.ink100,
          }}>
            <Search size={15} color={P.ink400} strokeWidth={1.8} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={tab === 'stages' ? t('station.history.searchPlaceholderStages') : t('station.history.searchPlaceholderOrders')}
              placeholderTextColor={P.ink400}
              autoFocus
              style={{
                flex: 1, fontSize: 13.5, color: P.ink900,
                ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
              }}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8} style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}>
                <X size={14} color={P.ink400} strokeWidth={1.8} />
              </Pressable>
            )}
          </View>
        )}

        {/* Açılır filtre paneli */}
        {filterOpen && tab === 'stages' && (
          <View style={{
            padding: 12, gap: 10,
            backgroundColor: P.surface, borderRadius: 12,
            borderWidth: 1, borderColor: P.ink100,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink500, letterSpacing: 1, textTransform: 'uppercase' }}>
                {t('common.status')}
              </Text>
              {activeFilterCount > 0 && (
                <Pressable
                  onPress={() => setStatusFilter('all')}
                  style={Platform.OS === 'web' ? { cursor: 'pointer' } as any : undefined}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: P.ink900 }}>{t('common.reset')}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {([
                { key: 'all',      label: t('common.all') },
                { key: 'done',     label: t('common.completed') },
                { key: 'active',   label: t('common.inProgress') },
                { key: 'waiting',  label: t('common.waiting') },
                { key: 'rejected', label: t('common.rejected') },
              ] as const).map(f => {
                const active = statusFilter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setStatusFilter(f.key)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 5,
                      paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999,
                      backgroundColor: active ? P.ink900 : P.surfaceAlt,
                      borderWidth: 1, borderColor: active ? P.ink900 : P.ink100,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                    }}
                  >
                    {active && <Check size={12} color={P.surface} strokeWidth={2.4} />}
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: active ? P.surface : P.ink500 }}>{f.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, color: P.ink400 }}>{t('common.loading')}</Text>
        </View>
      ) : tab === 'stages' ? (
        <SectionStages items={filteredStages} isMobile={isMobile} onSelectStage={(s) => setSelectedStage(s)} />
      ) : (
        <SectionDeliveredOrders items={filteredOrders} onOpenOrder={(woId) => router.push(`/(station)/order/${woId}` as any)} />
      )}

      {/* Aşama detay popup */}
      <StageDetailModal
        stage={selectedStage}
        onClose={() => setSelectedStage(null)}
        onGoToOrder={(woId) => { setSelectedStage(null); router.push(`/(station)/order/${woId}` as any); }}
      />
    </ScrollView>
  );
}

// ─── Aşama Detay Modal ───────────────────────────────────────────────────────
function StageDetailModal({
  stage, onClose, onGoToOrder,
}: {
  stage: CompletedStage | null;
  onClose: () => void;
  onGoToOrder: (workOrderId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const P = useStationTheme();
  const [resolved, setResolved] = useState<{ doctor: string | null; clinic: string | null }>({ doctor: null, clinic: null });

  useEffect(() => {
    if (!stage) { setResolved({ doctor: null, clinic: null }); return; }
    // Stage objesinde zaten varsa kullan
    if (stage.doctor_name || stage.clinic_name) {
      setResolved({ doctor: stage.doctor_name, clinic: stage.clinic_name });
      return;
    }
    // Yoksa polymorphic resolve — work_orders.doctor_id profiles.id veya doctors.id
    const docId = (stage as any)._doctor_id as string | null;
    if (!docId) { setResolved({ doctor: '—', clinic: '—' }); return; }
    let alive = true;
    (async () => {
      // 1) profiles
      const pRes = await supabase
        .from('profiles')
        .select('full_name, clinic_name, clinic:clinics(name)')
        .eq('id', docId)
        .maybeSingle();
      if (!alive) return;
      if (pRes.data) {
        setResolved({
          doctor: (pRes.data as any).full_name ?? null,
          clinic: ((pRes.data as any).clinic_name ?? (pRes.data as any).clinic?.name) ?? null,
        });
        return;
      }
      // 2) doctors table
      const dRes = await supabase
        .from('doctors')
        .select('full_name, clinic:clinics(name)')
        .eq('id', docId)
        .maybeSingle();
      if (!alive) return;
      setResolved({
        doctor: (dRes.data as any)?.full_name ?? '—',
        clinic: (dRes.data as any)?.clinic?.name ?? '—',
      });
    })();
    return () => { alive = false; };
  }, [stage?.id]);

  if (!stage) return null;
  const b = statusBadge(stage.status, stage.completed_at);
  const dur = formatDuration(stage.started_at, stage.completed_at);
  const waitDur = formatDuration(stage.assigned_at, stage.started_at);
  const doctorDisplay = resolved.doctor ?? '…';
  const clinicDisplay = resolved.clinic ?? '…';

  return (
    <Modal visible={true} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: '100%', maxWidth: 560, maxHeight: '92%',
            backgroundColor: P.surface, borderRadius: 20, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 64px rgba(0,0,0,0.25)' } as any : {}),
          }}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: 18, borderBottomWidth: 1, borderBottomColor: P.ink100, gap: 12,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: P.ink400, letterSpacing: 1, textTransform: 'uppercase' }}>
                {t('station.history.stageDetail')}
              </Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: P.ink900, marginTop: 4, letterSpacing: -0.3 }} numberOfLines={2}>
                {stage.station_name ?? '—'}
              </Text>
              <View style={{ alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: b.bg }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: b.fg, letterSpacing: 0.4 }}>{b.label.toUpperCase()}</Text>
              </View>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: P.surfaceAlt, alignItems: 'center', justifyContent: 'center',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={16} color={P.ink500} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, gap: 16 }}>
            {/* Sipariş bilgisi */}
            <DetailGroup label={t('common.order')}>
              <DetailRow label={t('station.history.orderNo')}   value={stage.order_number ? `#${stage.order_number}` : '—'} mono bold />
              <DetailRow label={t('common.patient')}        value={stage.patient_name ?? '—'} />
              {stage.work_type && <DetailRow label={t('station.history.workType')} value={formatWorkType(stage.work_type)} />}
            </DetailGroup>

            {/* Klinik & Hekim — popup açılırken polymorphic resolve ile yüklenir */}
            <DetailGroup label={t('station.history.clinicDoctor')}>
              <DetailRow label={t('common.clinic')}  value={clinicDisplay} />
              <DetailRow label={t('common.doctor')}   value={doctorDisplay} bold />
            </DetailGroup>

            {/* Hekim notu (varsa) */}
            {stage.doctor_notes && stage.doctor_notes.trim() && (
              <DetailGroup label={t('station.history.doctorNotes')}>
                <View style={{ padding: 12 }}>
                  <Text style={{ fontSize: 12.5, color: P.ink900, lineHeight: 18 }} selectable>
                    {stage.doctor_notes.trim()}
                  </Text>
                </View>
              </DetailGroup>
            )}

            {/* Zaman çizelgesi */}
            <DetailGroup label={t('station.history.timeline')}>
              <DetailRow label={t('station.history.assigned')}       value={fmtDateShort(stage.assigned_at, localeTag(i18n.language))} />
              <DetailRow label={t('station.history.started')}      value={fmtDateShort(stage.started_at, localeTag(i18n.language))} />
              <DetailRow label={t('common.completed')}   value={fmtDateShort(stage.completed_at, localeTag(i18n.language))} />
            </DetailGroup>

            {/* Süreler */}
            <DetailGroup label={t('station.history.durations')}>
              <DetailRow label={t('station.history.waitingDuration')}       value={waitDur} sub={t('station.history.betweenAssignmentAndStart')} />
              <DetailRow label={t('station.history.workingDuration')}       value={dur}     sub={t('station.history.betweenStartAndCompletion')} bold />
            </DetailGroup>

            {/* Sistem bilgisi */}
            <DetailGroup label={t('common.system')}>
              <DetailRow label={t('station.history.stageId')}     value={stage.id.startsWith('log-') ? stage.id.slice(4) : stage.id} mono small />
              <DetailRow label={t('station.history.workOrderId')}   value={stage.work_order_id ?? '—'} mono small />
              <DetailRow label={t('station.history.rawStatus')}  value={stage.status ?? '—'} mono small />
            </DetailGroup>
          </ScrollView>

          {/* Footer aksiyon */}
          {stage.work_order_id && (
            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: P.ink100, flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={onClose}
                style={({ hovered }: any) => ({
                  flex: 1, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hovered ? P.ink100 : P.surfaceAlt,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink500 }}>{t('common.close')}</Text>
              </Pressable>
              <Pressable
                onPress={() => onGoToOrder(stage.work_order_id!)}
                style={({ hovered }: any) => ({
                  flex: 1.4, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 6,
                  backgroundColor: hovered ? P.ink700 : P.ink900,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: '600', color: P.surface }}>{t('station.history.goToOrder')}</Text>
                <ArrowUpRight size={14} color={P.surface} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const P = useStationTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink400, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </Text>
      <View style={{ backgroundColor: P.surfaceAlt, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: P.ink100 }}>
        {children}
      </View>
    </View>
  );
}

function DetailRow({ label, value, sub, mono = false, bold = false, small = false }: { label: string; value: string; sub?: string; mono?: boolean; bold?: boolean; small?: boolean }) {
  const P = useStationTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, paddingHorizontal: 10, gap: 12 }}>
      <View style={{ width: 110 }}>
        <Text style={{ fontSize: 11, fontWeight: '500', color: P.ink400 }}>{label}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{
          fontSize: small ? 11 : 13, fontWeight: bold ? '700' : '500', color: P.ink900,
          fontFamily: mono && Platform.OS === 'web' ? 'monospace' : undefined,
        }} selectable>
          {value}
        </Text>
        {sub && <Text style={{ fontSize: 10.5, color: P.ink400, marginTop: 2 }}>{sub}</Text>}
      </View>
    </View>
  );
}

// ─── Bölüm 1: Aşama Tablosu — atandı / başladı / bitti / süre / durum ─────────
function SectionStages({ items, onSelectStage, isMobile }: { items: CompletedStage[]; onSelectStage: (s: CompletedStage) => void; isMobile: boolean }) {
  const { t, i18n } = useTranslation();
  const P = useStationTheme();
  if (items.length === 0) {
    return (
      <EmptyCard icon={ClipboardList} text={t('station.history.noAssignedStagesYet')} />
    );
  }

  // ── Mobile: kart liste (tablo dar ekrana sığmaz) ──
  if (isMobile) {
    return (
      <View>
        <Text style={{ fontSize: 11, fontWeight: '600', color: P.ink500, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 2 }}>
          {t('common.total')} {items.length} {t('common.stages')}
        </Text>
        <View style={{ gap: 8 }}>
          {items.map(it => {
            const b = statusBadge(it.status, it.completed_at);
            const dur = formatDuration(it.started_at, it.completed_at);
            return (
              <Pressable
                key={it.id}
                onPress={() => onSelectStage(it)}
                style={{
                  backgroundColor: P.surface, borderRadius: 18, padding: 16, gap: 10,
                  borderWidth: 1, borderColor: P.ink100,
                  // iOS native gölge — kartlar zeminden ayrışsın (img1 tasarımı)
                  ...(Platform.OS === 'web'
                    ? { cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' } as any
                    : {
                        shadowColor: '#0F172A',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.08,
                        shadowRadius: 12,
                        elevation: 3,
                      }),
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900, letterSpacing: -0.2 }} numberOfLines={1}>
                      {it.station_name ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: P.ink500, marginTop: 3 }} numberOfLines={1}>
                      #{it.order_number ?? '—'} · {it.patient_name ?? '—'}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: b.bg, flexShrink: 0 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: b.fg, letterSpacing: 0.3 }}>{b.label.toUpperCase()}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: P.ink100 }}>
                  <Cell label={t('station.history.started')} value={fmtDateShort(it.started_at, localeTag(i18n.language))} />
                  <Cell label={t('station.history.finished')}   value={fmtDateShort(it.completed_at, localeTag(i18n.language))} />
                  <Cell label={t('common.duration')}    value={dur} bold />
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  // ── Desktop: gerçek tablo ──
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: P.ink500, letterSpacing: 1, textTransform: 'uppercase' }}>
          {t('common.total')} {items.length} {t('common.stages')}
        </Text>
      </View>
      <View style={{ backgroundColor: P.surface, borderRadius: 14, borderWidth: 1, borderColor: P.ink100, overflow: 'hidden' }}>
        {/* Tablo başlığı */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: P.surfaceAlt, borderBottomWidth: 1, borderBottomColor: P.ink100 }}>
          <HeaderCell flex={2.2} label={t('common.stage')} />
          <HeaderCell flex={2.4} label={t('station.history.orderPatient')} />
          <HeaderCell flex={1.5} label={t('station.history.assigned')} />
          <HeaderCell flex={1.5} label={t('station.history.started')} />
          <HeaderCell flex={1.5} label={t('station.history.finished')} />
          <HeaderCell flex={1} label={t('common.duration')} align="right" />
          <HeaderCell flex={1.2} label={t('common.status')} align="right" />
        </View>
        {/* Satırlar */}
        {items.map((it, idx) => {
          const b = statusBadge(it.status, it.completed_at);
          const dur = formatDuration(it.started_at, it.completed_at);
          return (
            <Pressable
              key={it.id}
              onPress={() => onSelectStage(it)}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 14, paddingVertical: 11,
                borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                borderBottomColor: P.ink100,
                backgroundColor: hovered ? P.surfaceAlt : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: 'background-color 0.12s' } as any : {}),
              })}
            >
              <RowCell flex={2.2}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: hexA(P.accent, 0.10), alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={13} color={P.accent} strokeWidth={1.8} />
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: P.ink900 }} numberOfLines={1}>{it.station_name ?? '—'}</Text>
                </View>
              </RowCell>
              <RowCell flex={2.4}>
                <Text style={{ fontSize: 12, color: P.ink900 }} numberOfLines={1}>
                  <Text style={{ fontWeight: '700' }}>#{it.order_number ?? '—'}</Text>
                  {it.patient_name ? `  · ${it.patient_name}` : ''}
                </Text>
              </RowCell>
              <RowCell flex={1.5}><Text style={{ fontSize: 11.5, color: P.ink500 }} numberOfLines={1}>{fmtDateShort(it.assigned_at, localeTag(i18n.language))}</Text></RowCell>
              <RowCell flex={1.5}><Text style={{ fontSize: 11.5, color: P.ink500 }} numberOfLines={1}>{fmtDateShort(it.started_at, localeTag(i18n.language))}</Text></RowCell>
              <RowCell flex={1.5}><Text style={{ fontSize: 11.5, color: P.ink500 }} numberOfLines={1}>{fmtDateShort(it.completed_at, localeTag(i18n.language))}</Text></RowCell>
              <RowCell flex={1} align="right">
                <Text style={{ fontSize: 12, fontWeight: '700', color: P.ink900, textAlign: 'right', fontVariant: ['tabular-nums'] as any }}>{dur}</Text>
              </RowCell>
              <RowCell flex={1.2} align="right">
                <View style={{ alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: b.bg }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: b.fg, letterSpacing: 0.3 }}>{b.label.toUpperCase()}</Text>
                </View>
              </RowCell>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function HeaderCell({ flex, label, align = 'left' }: { flex: number; label: string; align?: 'left' | 'right' }) {
  const P = useStationTheme();
  return (
    <View style={{ flex, paddingHorizontal: 6 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: P.ink500, letterSpacing: 0.6, textTransform: 'uppercase', textAlign: align }}>{label}</Text>
    </View>
  );
}
function RowCell({ flex, children, align = 'left' }: { flex: number; children: React.ReactNode; align?: 'left' | 'right' }) {
  return <View style={{ flex, paddingHorizontal: 6, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>{children}</View>;
}
function Cell({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  const P = useStationTheme();
  return (
    <View>
      <Text style={{ fontSize: 9, fontWeight: '700', color: P.ink400, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: bold ? '700' : '500', color: P.ink900, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

// ─── Bölüm 2: Teslim edilen siparişler ───────────────────────────────────────
function SectionDeliveredOrders({ items, onOpenOrder }: { items: DeliveredOrder[]; onOpenOrder: (woId: string) => void }) {
  const { t, i18n } = useTranslation();
  const P = useStationTheme();
  if (items.length === 0) {
    return (
      <EmptyCard icon={Truck} text={t('station.history.noDeliveredOrdersYet')} />
    );
  }
  return (
    <View>
      <Text style={{ fontSize: 11, fontWeight: '600', color: P.ink500, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 2 }}>
        {t('station.history.last30DeliveredOrders')}
      </Text>
      <View style={{ gap: 8 }}>
        {items.map(o => (
          <Pressable
            key={o.id}
            onPress={() => onOpenOrder(o.id)}
            style={{
              backgroundColor: P.surface,
              borderRadius: 18,
              padding: 16,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              borderWidth: 1, borderColor: P.ink100,
              ...(Platform.OS === 'web'
                ? { cursor: 'pointer', boxShadow: '0 4px 16px rgba(15,23,42,0.06)' } as any
                : {
                    shadowColor: '#0F172A',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    elevation: 3,
                  }),
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(34,197,94,0.10)', alignItems: 'center', justifyContent: 'center' }}>
              <Truck size={16} color="#15803D" strokeWidth={1.7} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: P.ink900 }} numberOfLines={1}>
                  #{o.order_number ?? '—'}
                </Text>
                <Text style={{ fontSize: 13, color: P.ink900 }} numberOfLines={1}>{o.patient_name ?? '—'}</Text>
                {o.my_stages_count > 0 && (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 1.5, borderRadius: 999, backgroundColor: 'rgba(45,154,107,0.14)' }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#1F6B47' }}>
                      {o.my_stages_count} {t('common.stages')}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11.5, color: P.ink500, marginTop: 3 }} numberOfLines={1}>
                {[o.doctor_name, o.clinic_name].filter(Boolean).join(' · ') || '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontSize: 11, color: P.ink400 }}>
                {o.delivered_at ? new Date(o.delivered_at).toLocaleDateString(localeTag(i18n.language)) : '—'}
              </Text>
              <ArrowUpRight size={13} color={P.ink400} strokeWidth={1.7} />
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function EmptyCard({ icon: Icon, text }: { icon: any; text: string }) {
  const P = useStationTheme();
  return (
    <View style={{
      padding: 40, alignItems: 'center', gap: 8,
      backgroundColor: P.surface, borderRadius: 16,
      borderWidth: 1, borderColor: P.ink100,
    }}>
      <Icon size={28} color={P.ink300} strokeWidth={1.5} />
      <Text style={{ fontSize: 13, color: P.ink500 }}>{text}</Text>
    </View>
  );
}
