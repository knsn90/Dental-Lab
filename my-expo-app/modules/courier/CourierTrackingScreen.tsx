// modules/courier/CourierTrackingScreen.tsx
// Panel-bağımsız Kurye Takip ekranı. Her panel kendi accent + route prefix'iyle
// thin wrapper olarak çağırır.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Platform, useWindowDimensions, Modal, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search, MapPin, ArrowRight, MessageSquare, Phone, ChevronRight, Clock,
  QrCode, Bell, User as UserIcon, X, Package, Trash2,
} from 'lucide-react-native';
import { supabase } from '../../core/api/supabase';
import { CourierTrackingMap } from './CourierTrackingMap';
import { ActivityIndicator } from '../../core/ui/teethCompat';
import { useScanStore } from '../../core/store/scanStore';
import { useThemeModeStore } from '../../core/store/themeModeStore';

const INK_900 = '#0A0A0A';
const INK_500 = '#6B6B6B';
const INK_300 = '#CBD5E1';

function getInitials(name: string): string {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join('');
  return initials || 'K';
}

type DeliveryRow = {
  id:                   string;
  status:               'beklemede' | 'atandi' | 'teslim_alindi' | 'yolda' | 'teslim_edildi' | 'iptal';
  mode:                 'internal' | 'external';
  courier_id:           string | null;
  external_provider:    string | null;
  external_tracking_no: string | null;
  destination_name:     string | null;
  destination_address:  string | null;
  destination_phone:    string | null;
  picked_up_at:         string | null;
  delivered_at:         string | null;
  assigned_at:          string;
  work_order_id:        string;
  order_number?:        string | null;
  patient_name?:        string | null;
  courier_name?:        string | null;
};

interface Props {
  accent:     string;           // panel renk
  pageBg?:    string;           // panel page bg
  routePrefix: string;          // e.g. '/(admin)' veya '/(lab)'
}

export function CourierTrackingScreen({ accent, pageBg = '#F5F1EB', routePrefix }: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const insets = useSafeAreaInsets();
  const emptyBg   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.4)';
  const emptyText = isDark ? 'rgba(247,242,233,0.65)' : INK_500;
  // Glass panel (search + tabs container) — dark'ta koyu translucent
  const glassBg     = isDark ? 'rgba(20,16,12,0.55)'     : 'rgba(255,255,255,0.08)';
  const pillBg      = isDark ? 'rgba(255,255,255,0.10)'  : 'rgba(255,255,255,0.55)';
  const pillBorder  = isDark ? 'rgba(255,255,255,0.12)'  : 'rgba(255,255,255,0.6)';
  const tabsBg      = isDark ? 'rgba(255,255,255,0.06)'  : 'rgba(255,255,255,0.45)';
  const inkPrimary  = isDark ? '#F7F2E9'                  : INK_900;
  const inkMutedDark = isDark ? 'rgba(247,242,233,0.45)' : INK_500;
  const placeholder = isDark ? 'rgba(247,242,233,0.45)' : '#7A7A7A';
  const { width: _vw } = useWindowDimensions();
  const isNarrow = _vw < 768;
  const router = useRouter();

  // localStorage cache — 2. ziyarette anında render
  const LS_KEY = `courier_tracking_v1:${routePrefix}`;
  const loadCached = (): DeliveryRow[] | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (rows: DeliveryRow[]) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(rows)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [tab, setTab]       = useState<'active' | 'done'>('active');
  const [search, setSearch] = useState('');
  const [list, setList]     = useState<DeliveryRow[]>(cached ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false); // mobil teslimat detay sheet
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STATUS_CFG: Record<DeliveryRow['status'], { label: string; bg: string; fg: string }> = useMemo(() => ({
    beklemede:     { label: 'Beklemede', bg: `${accent}22`, fg: accent },
    atandi:        { label: 'Atandı',    bg: `${accent}22`, fg: accent },
    teslim_alindi: { label: 'Aldı',      bg: 'rgba(37,99,235,0.14)',  fg: '#1E3A8A' },
    yolda:         { label: 'Yolda',     bg: 'rgba(37,99,235,0.22)',  fg: '#1E3A8A' },
    teslim_edildi: { label: 'Teslim',    bg: 'rgba(16,185,129,0.14)', fg: '#0F6E50' },
    iptal:         { label: 'İptal',     bg: 'rgba(220,38,38,0.14)',  fg: '#9C2E2E' },
  }), [accent]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await supabase
      .from('deliveries')
      .select(`
        id, status, mode, courier_id, external_provider, external_tracking_no,
        destination_name, destination_address, destination_phone,
        picked_up_at, delivered_at, assigned_at, work_order_id,
        work_order:work_orders!work_order_id(order_number, patient_name),
        courier:profiles!deliveries_courier_profiles_fkey(id, full_name)
      `)
      .order('assigned_at', { ascending: false })
      .limit(100);
    const rows = (data ?? []).map((r: any) => ({
      ...r,
      order_number: r.work_order?.order_number ?? null,
      patient_name: r.work_order?.patient_name ?? null,
      courier_name: r.courier?.full_name ?? null,
    })) as DeliveryRow[];
    setList(rows);
    saveCached(rows);
    if (!silent) setLoading(false);
    if (rows.length && !selectedId) {
      const firstActive = rows.find(r => r.status !== 'teslim_edildi' && r.status !== 'iptal');
      setSelectedId((firstActive ?? rows[0]).id);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime burst'lerini debounce et — birden fazla update tek refetch'e düşer
  const scheduleRefetch = useCallback(() => {
    if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
    refetchTimerRef.current = setTimeout(() => { load(true); }, 400);
  }, [load]);

  useEffect(() => {
    // Cache varsa silent yükle — spinner gösterme, eski veriyi anında render
    load(cached !== null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel(`tracking-${routePrefix}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => scheduleRefetch())
      .subscribe();
    return () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      supabase.removeChannel(ch);
    };
  }, [scheduleRefetch, routePrefix]);

  const filtered = useMemo(() => {
    const isActive = (s: DeliveryRow['status']) => s !== 'teslim_edildi' && s !== 'iptal';
    return list
      .filter(r => tab === 'active' ? isActive(r.status) : r.status === 'teslim_edildi')
      .filter(r => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return [r.order_number, r.patient_name, r.destination_name, r.destination_address, r.courier_name, r.external_tracking_no]
          .some(v => v?.toLowerCase().includes(q));
      });
  }, [list, tab, search]);

  const selected = useMemo(() => list.find(r => r.id === selectedId) ?? null, [list, selectedId]);
  const goOrder = (id: string) => router.push(`${routePrefix}/order/${id}` as any);

  const cancelDelivery = useCallback((d: DeliveryRow) => {
    const confirm = () => {
      supabase
        .from('deliveries')
        .update({ status: 'iptal' })
        .eq('id', d.id)
        .then(() => load(true));
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`"#${d.order_number ?? d.id.slice(0, 8)}" teslimatını iptal etmek istediğinizden emin misiniz?`)) confirm();
    } else {
      Alert.alert(
        'Teslimatı İptal Et',
        `"#${d.order_number ?? d.id.slice(0, 8)}" teslimatını iptal etmek istediğinizden emin misiniz?`,
        [{ text: 'Vazgeç', style: 'cancel' }, { text: 'İptal Et', style: 'destructive', onPress: confirm }],
      );
    }
  }, [load]);

  const glassStrong = Platform.OS === 'web' ? {
    backdropFilter: 'blur(3px) saturate(120%)',
    WebkitBackdropFilter: 'blur(3px) saturate(120%)',
    boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
  } as any : {};

  return (
    <View style={{ flex: 1, position: 'relative' as any, backgroundColor: pageBg }}>
      {/* Map — desktop ve mobile'da tüm ekran (sayfa zemini) */}
      <View style={{
        position: 'absolute' as any,
        top: isNarrow ? 0 : 16,
        left: 16,
        right: 16,
        bottom: isNarrow ? 0 : 16,
      }}>
        <View style={{
          flex: 1,
          borderRadius: isNarrow ? 0 : 22,
          overflow: 'hidden',
          backgroundColor: '#E2E8F0',
        }}>
          <CourierTrackingMap
            deliveryId={selected?.id}
            destinationLabel={selected?.destination_address ?? selected?.destination_name ?? undefined}
            accent={accent}
            height="100%"
          />
        </View>
      </View>


      {/* LEFT — floating glass panel (search + tabs + list)
          Mobile: full-width alt overlay · Desktop: left 360px overlay */}
      <View style={{
        position: 'absolute' as any,
        left: isNarrow ? 16 : 24,
        right: isNarrow ? 16 : undefined,
        top: isNarrow ? undefined : 24,
        bottom: isNarrow ? 110 : 24,
        width: isNarrow ? undefined : 360,
        height: isNarrow ? '45%' as any : undefined,
        // @ts-ignore
        zIndex: 1000,
      }}>
        <View style={{
          flex: 1,
          backgroundColor: glassBg,
          borderRadius: 22,
          overflow: 'hidden',
          ...glassStrong,
        }}>
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999, backgroundColor: pillBg, borderWidth: 1, borderColor: pillBorder }}>
              <Search size={14} color={inkMutedDark} strokeWidth={1.8} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Sipariş, hasta, kurye, tracking no..."
                placeholderTextColor={placeholder}
                style={{ flex: 1, fontSize: 13, color: inkPrimary, ...(Platform.OS === 'web' ? { outlineWidth: 0 } as any : {}) }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: tabsBg, borderWidth: 1, borderColor: pillBorder }}>
              <TabButton active={tab === 'active'} onPress={() => setTab('active')} label="Yolda" accent={accent} />
              <TabButton active={tab === 'done'}   onPress={() => setTab('done')}   label="Teslim Edildi" accent={accent} />
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, paddingTop: insets.top + 8, gap: 10, paddingBottom: 120 }}>
            {loading ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={accent} />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 20, alignItems: 'center', backgroundColor: emptyBg, borderRadius: 14 }}>
                <Text style={{ fontSize: 12, color: emptyText }}>Bu durumda teslimat yok</Text>
              </View>
            ) : (
              filtered.map(d => (
                <DeliveryListCard
                  key={d.id}
                  d={d}
                  accent={accent}
                  statusCfg={STATUS_CFG}
                  selected={selectedId === d.id}
                  onSelect={() => { setSelectedId(d.id); if (isNarrow) setDetailOpen(true); }}
                  onOpenOrder={() => goOrder(d.work_order_id)}
                  onCancel={d.status === 'beklemede' ? () => cancelDelivery(d) : undefined}
                />
              ))
            )}
          </ScrollView>
        </View>
      </View>

      {/* RIGHT — selected delivery cards (mobile: gizli, desktop: glass overlay) */}
      <View style={{ flex: 1, position: 'relative' as any, ...(Platform.OS === 'web' ? { pointerEvents: 'none' } as any : {}) }}>
        {selected && !isNarrow && (
          <View style={{
            position: 'absolute', right: 24, top: 24, bottom: 24,
            width: 320, gap: 14,
            // @ts-ignore
            zIndex: 1000,
            ...(Platform.OS === 'web' ? { pointerEvents: 'auto' } as any : {}),
          }}>
            {/* ─── Kurye Kartı (glass) ─── */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 14,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
              ...(Platform.OS === 'web' ? {
                backdropFilter: 'blur(3px) saturate(120%)',
                WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any : {}),
            }}>
              <View style={{
                width: 44, height: 44, borderRadius: 22,
                backgroundColor: `${accent}22`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: accent }}>
                  {getInitials(selected.courier_name ?? selected.external_provider ?? 'K')}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: INK_900 }} numberOfLines={1}>
                  {selected.courier_name ?? selected.external_provider ?? 'Kurye'}
                </Text>
                <Text style={{ fontSize: 11, color: INK_500 }}>
                  {selected.mode === 'internal' ? 'Bizim kurye' : 'Dış kargo'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: INK_900,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <MessageSquare size={14} color="#FFF" strokeWidth={2} />
                </Pressable>
                <Pressable
                  style={{
                    width: 36, height: 36, borderRadius: 18,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: accent,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Phone size={14} color="#FFF" strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            {/* ─── Rota (Gönderen → Alıcı) ─── */}
            <View style={{
              backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 14, gap: 10,
              borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
              ...(Platform.OS === 'web' ? {
                backdropFilter: 'blur(3px) saturate(120%)',
                WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any : {}),
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ width: 14, alignItems: 'center', paddingTop: 4, gap: 3 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: accent }} />
                  <View style={{ width: 1, height: 26, backgroundColor: `${accent}66` }} />
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                </View>
                <View style={{ flex: 1, gap: 14 }}>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Gönderen</Text>
                    <Text style={{ fontSize: 12, color: INK_900, fontWeight: '500' }} numberOfLines={2}>Laboratuvar</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Alıcı Adres</Text>
                    <Text style={{ fontSize: 12, color: INK_900, fontWeight: '500', lineHeight: 16 }} numberOfLines={3}>{selected.destination_address ?? '—'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ─── External tracking varsa göster ─── */}
            {selected.mode === 'external' && selected.external_tracking_no && (
              <View style={{
                backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 18, padding: 12, gap: 4,
                borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
                ...(Platform.OS === 'web' ? {
                  backdropFilter: 'blur(3px) saturate(120%)',
                  WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                  boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
                } as any : {}),
              }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: INK_500, letterSpacing: 0.4, textTransform: 'uppercase' }}>Kargo Takip</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: INK_900 }}>
                  {selected.external_provider} · #{selected.external_tracking_no}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* MOBİL — teslimat detay bottom sheet (karta tıklayınca açılır) */}
      <Modal visible={isNarrow && detailOpen && !!selected} transparent animationType="slide" onRequestClose={() => setDetailOpen(false)}>
        <Pressable onPress={() => setDetailOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingBottom: insets.bottom + 20, paddingHorizontal: 16, gap: 14 }}>
            {/* Grabber + başlık */}
            <View style={{ alignItems: 'center', marginBottom: 2 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(15,23,42,0.15)' }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: INK_900 }} numberOfLines={1}>
                  Teslimat · #{selected?.order_number ?? '—'}
                </Text>
                {selected?.patient_name ? (
                  <Text style={{ fontSize: 12, color: INK_500, marginTop: 1 }} numberOfLines={1}>{selected.patient_name}</Text>
                ) : null}
              </View>
              {selected ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: STATUS_CFG[selected.status]?.bg }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: STATUS_CFG[selected.status]?.fg }}>{STATUS_CFG[selected.status]?.label}</Text>
                </View>
              ) : null}
              <Pressable onPress={() => setDetailOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.06)' }}>
                <X size={16} color={INK_500} strokeWidth={2} />
              </Pressable>
            </View>

            {selected ? (
              <>
                {/* Kurye */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: accent }}>{getInitials(selected.courier_name ?? selected.external_provider ?? 'K')}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: INK_900 }} numberOfLines={1}>{selected.courier_name ?? selected.external_provider ?? 'Kurye'}</Text>
                    <Text style={{ fontSize: 11, color: INK_500 }}>{selected.mode === 'internal' ? 'Bizim kurye' : 'Dış kargo'}</Text>
                  </View>
                </View>

                {/* Rota */}
                <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ width: 14, alignItems: 'center', paddingTop: 4, gap: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: accent }} />
                      <View style={{ width: 1, height: 26, backgroundColor: `${accent}66` }} />
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: accent }} />
                    </View>
                    <View style={{ flex: 1, gap: 14 }}>
                      <View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Gönderen</Text>
                        <Text style={{ fontSize: 13, color: INK_900, fontWeight: '500' }}>Laboratuvar</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: accent, letterSpacing: 0.4, textTransform: 'uppercase' }}>Alıcı Adres</Text>
                        <Text style={{ fontSize: 13, color: INK_900, fontWeight: '500', lineHeight: 18 }}>{selected.destination_name ? `${selected.destination_name}\n` : ''}{selected.destination_address ?? '—'}</Text>
                        {selected.destination_phone ? (
                          <Text style={{ fontSize: 12, color: INK_500, marginTop: 2 }}>{selected.destination_phone}</Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </View>

                {/* Kargo takip (external) */}
                {selected.mode === 'external' && selected.external_tracking_no ? (
                  <View style={{ padding: 14, borderRadius: 16, backgroundColor: '#FAFAF7', borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)', gap: 3 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: INK_500, letterSpacing: 0.4, textTransform: 'uppercase' }}>Kargo Takip</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: INK_900 }}>{selected.external_provider} · #{selected.external_tracking_no}</Text>
                  </View>
                ) : null}

                {/* Aksiyonlar */}
                <View style={{ gap: 8 }}>
                  <Pressable
                    onPress={() => { setDetailOpen(false); goOrder(selected.work_order_id); }}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: accent }}
                  >
                    <Package size={15} color="#FFF" strokeWidth={2} />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>İş Emrini Aç</Text>
                  </Pressable>
                  {selected.status === 'beklemede' && (
                    <Pressable
                      onPress={() => { setDetailOpen(false); cancelDelivery(selected); }}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderRadius: 14, backgroundColor: 'rgba(220,38,38,0.08)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.20)' }}
                    >
                      <Trash2 size={15} color="#DC2626" strokeWidth={2} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#DC2626' }}>Teslimatı İptal Et</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function TabButton({ active, onPress, label, accent }: { active: boolean; onPress: () => void; label: string; accent: string }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const inactiveColor = isDark ? 'rgba(247,242,233,0.62)' : INK_500;
  return (
    <Pressable
      onPress={onPress}
      style={{ flex: 1, paddingVertical: 9, borderRadius: 999, alignItems: 'center', backgroundColor: active ? accent : 'transparent', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : inactiveColor }}>{label}</Text>
    </Pressable>
  );
}

function InfoCol({ label, value, flex }: { label: string; value: string; flex?: number }) {
  return (
    <View style={{ flex: flex ?? 1, gap: 2, minWidth: 0 }}>
      <Text style={{ fontSize: 9, fontWeight: '700', color: INK_300, letterSpacing: 0.6, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 12, color: INK_900, fontWeight: '500' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function DeliveryListCard({ d, selected, onSelect, onOpenOrder, onCancel, accent, statusCfg }: {
  d: DeliveryRow; selected: boolean; onSelect: () => void; onOpenOrder: () => void;
  onCancel?: () => void;
  accent: string; statusCfg: Record<DeliveryRow['status'], { label: string; bg: string; fg: string }>;
}) {
  const cfg = statusCfg[d.status];
  const origin = 'Lab';
  const dest = d.destination_name ?? d.patient_name ?? 'Alıcı';

  return (
    <Pressable
      onPress={onSelect}
      style={{
        backgroundColor: selected ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)',
        borderRadius: 16,
        padding: 14, gap: 10,
        ...(Platform.OS === 'web' ? {
          cursor: 'pointer',
          backdropFilter: 'blur(8px) saturate(140%)',
          WebkitBackdropFilter: 'blur(8px) saturate(140%)',
        } as any : {}),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: INK_900 }}>{origin}</Text>
          <ArrowRight size={11} color={INK_300} strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: INK_900 }} numberOfLines={1}>{dest}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: cfg.bg }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.fg, textTransform: 'uppercase' }}>{cfg.label}</Text>
          </View>
          {onCancel && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); onCancel(); }}
              hitSlop={8}
              style={{
                width: 26, height: 26, borderRadius: 13,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(220,38,38,0.10)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <Trash2 size={12} color="#DC2626" strokeWidth={2} />
            </Pressable>
          )}
        </View>
      </View>

      <Text style={{ fontSize: 11, color: INK_500 }}>Sipariş #{d.order_number ?? '—'}</Text>
    </Pressable>
  );
}

// ─── Floating top-action button (mobile) ──────────────────────────────
function TopIconBtn({ icon: Icon, onPress }: { icon: any; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      {({ pressed }: any) => (
        <View style={{
          width: 38, height: 38, borderRadius: 14,
          backgroundColor: "#FFFFFF",
          borderWidth: 1, borderColor: "rgba(20,16,12,0.08)",
          alignItems: "center", justifyContent: "center",
          opacity: pressed ? 0.7 : 1,
          ...(Platform.OS === "web" ? {
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
          } as any : {}),
        }}>
          <Icon size={16} color={INK_900} strokeWidth={1.8} />
        </View>
      )}
    </Pressable>
  );
}
