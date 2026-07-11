/**
 * Kurye Teslimat Detayı — responsive.
 *
 * Mobile: header + harita üst yarı + bottom sheet (müşteri/adres/paket/timeline/CTA)
 * Desktop: split-view 40/60 (sol info paneli + sağ tam ekran harita)
 *
 * Aksiyonlar: status değişimi (atandı → teslim_alindi → yolda → teslim_edildi)
 * GPS: yolda iken otomatik tracking
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Platform, Linking, useWindowDimensions, ActivityIndicator, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, MapPin, Phone, Truck, Check, Play, Navigation, Package,
  Camera, PenTool, MessageCircle, Map as MapIcon, X, ExternalLink,
} from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { updateDeliveryStatus } from '../../../modules/orders/api';
import { useGpsTracker } from '../useGpsTracker';
import { CourierLiveMap } from '../CourierLiveMap';
import { DS } from '../../../core/theme/dsTokens';
import { localeTag } from '../../../core/i18n';

const TH = DS.tech;
const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif' as const,
  fontWeight: '300' as const,
};
const SUCCESS = '#2D9A6B';
const WARNING = '#E89B2A';
const DANGER  = '#D94B4B';

interface Delivery {
  id: string; work_order_id: string; status: string;
  destination_name: string | null; destination_address: string | null; destination_phone: string | null;
  notes: string | null;
  assigned_at: string; picked_up_at: string | null; delivered_at: string | null;
  order_number?: string | null; patient_name?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  beklemede: 'BEKLİYOR',  atandi: 'ATANDI',
  teslim_alindi: 'ALINDI', yolda: 'YOLDA',
  teslim_edildi: 'TESLİM EDİLDİ', iptal: 'İPTAL',
};
const STATUS_COLOR: Record<string, string> = {
  beklemede: DS.ink[500], atandi: TH.primary,
  teslim_alindi: TH.primary, yolda: WARNING,
  teslim_edildi: SUCCESS, iptal: DANGER,
};

const TIMELINE = [
  { key: 'atandi',        labelKey: 'courier.timeline.assigned'  },
  { key: 'teslim_alindi', labelKey: 'courier.timeline.pickedUp'  },
  { key: 'yolda',         labelKey: 'courier.timeline.inTransit' },
  { key: 'teslim_edildi', labelKey: 'courier.timeline.delivered' },
];

function statusIndex(s: string): number {
  const i = TIMELINE.findIndex(t => t.key === s);
  return i >= 0 ? i : 0;
}

const initials = (s?: string | null) => {
  if (!s) return '?';
  return s.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
};

/* ════════════════════════════════════════════════════════════════ */

export function CourierDeliveryDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const [d, setD]         = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]   = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('deliveries')
      .select(`
        id, work_order_id, status, assigned_at, picked_up_at, delivered_at,
        destination_name, destination_address, destination_phone, notes,
        work_order:work_orders!work_order_id(order_number, patient_name)
      `)
      .eq('id', id)
      .maybeSingle();
    if (data) {
      setD({
        ...(data as any),
        order_number: (data as any).work_order?.order_number ?? null,
        patient_name: (data as any).work_order?.patient_name ?? null,
      });
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`courier-delivery-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries', filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  // GPS — yolda iken aktif
  useGpsTracker(d?.id ?? null, d?.status === 'yolda');

  const changeStatus = async (next: 'teslim_alindi' | 'yolda' | 'teslim_edildi') => {
    if (!d || busy) return;
    setBusy(true);
    const r = await updateDeliveryStatus(d.id, next);
    setBusy(false);
    if (!r.ok) { alert(`Hata: ${r.error}`); return; }
    load();
  };

  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const openMap = () => {
    if (!d?.destination_address) return;
    // Web: doğrudan Google Maps yeni sekme. Mobile: app picker modal.
    if (Platform.OS === 'web') {
      const q = encodeURIComponent(d.destination_address);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${q}`, '_blank');
      return;
    }
    setMapPickerOpen(true);
  };

  /** Modal'dan seçilen app'i aç. Yüklü değilse otomatik fallback'e düşer. */
  const launchMapApp = async (scheme: string, webFallback: string) => {
    setMapPickerOpen(false);
    try {
      const can = await Linking.canOpenURL(scheme);
      if (can) await Linking.openURL(scheme);
      else await Linking.openURL(webFallback);
    } catch {
      Linking.openURL(webFallback);
    }
  };

  const callCustomer = () => {
    if (!d?.destination_phone) return;
    Linking.openURL(`tel:${d.destination_phone}`);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: TH.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={TH.primary} />
      </View>
    );
  }
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: TH.bg, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
        <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900] }}>{t('courier.delivery.notFound')}</Text>
        <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: DS.ink[900] }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{t('courier.delivery.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const props = { d, busy, onChangeStatus: changeStatus, onOpenMap: openMap, onCall: callCustomer, onBack: () => router.back() };
  return (
    <>
      {isDesktop ? <DesktopView {...props} /> : <MobileView {...props} />}
      <MapPickerModal
        visible={mapPickerOpen}
        address={d.destination_address ?? ''}
        onClose={() => setMapPickerOpen(false)}
        onSelect={launchMapApp}
      />
    </>
  );
}

/* ════════════════════ Map Picker Modal (mobile) ════════════════════ */
/**
 * Cihazda yüklü harita uygulamalarını listeler, kullanıcı seçtiğinde
 * yol tarifi açılır. `canOpenURL` ile mevcudiyet kontrol edilir; yoksa
 * web fallback'e düşer.
 */
function MapPickerModal({
  visible, address, onClose, onSelect,
}: {
  visible: boolean;
  address: string;
  onClose: () => void;
  onSelect: (scheme: string, webFallback: string) => void;
}) {
  const { t } = useTranslation();
  const q = encodeURIComponent(address);
  const apps = [
    { key: 'apple',  name: 'Apple Maps',  scheme: `maps://?daddr=${q}`,                         web: `https://maps.apple.com/?daddr=${q}`,           ios: true,  android: false, color: '#0EA5E9' },
    { key: 'google', name: 'Google Maps', scheme: `comgooglemaps://?daddr=${q}&directionsmode=driving`, web: `https://www.google.com/maps/dir/?api=1&destination=${q}`, ios: true,  android: true,  color: '#34A853' },
    { key: 'waze',   name: 'Waze',        scheme: `waze://?q=${q}&navigate=yes`,                web: `https://waze.com/ul?q=${q}&navigate=yes`,      ios: true,  android: true,  color: '#33CCFF' },
    { key: 'yandex', name: 'Yandex Maps', scheme: `yandexnavi://build_route_on_map?lat_to=&lon_to=&address=${q}`, web: `https://yandex.com/maps/?text=${q}`, ios: true,  android: true,  color: '#FFCC00' },
    { key: 'osmand', name: 'OsmAnd',      scheme: `osmand.geo:0,0?q=${q}`,                       web: `https://osmand.net/map?pin=${q}`,              ios: false, android: true,  color: '#EE6900' },
  ];
  const filtered = apps.filter(a => Platform.OS === 'ios' ? a.ios : a.android);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', alignItems: 'center', justifyContent: 'flex-end', padding: 16, ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%', maxWidth: 440,
            backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 24px 60px rgba(0,0,0,0.30)' } as any : { elevation: 24 }),
          }}
        >
          <View style={{
            paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
            borderBottomWidth: 1, borderBottomColor: DS.ink[100],
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{t('courier.modal.directions')}</Text>
              <Text style={{ ...DISPLAY, fontSize: 20, color: DS.ink[900], letterSpacing: -0.4, marginTop: 4 }}>{t('courier.modal.chooseMapApp')}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 4 }} numberOfLines={2}>{address}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 4 }}>
              <X size={20} color={DS.ink[500]} />
            </Pressable>
          </View>

          <View style={{ padding: 14, gap: 8 }}>
            {filtered.map(app => (
              <Pressable
                key={app.key}
                onPress={() => onSelect(app.scheme, app.web)}
                style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  padding: 14, borderRadius: 14,
                  backgroundColor: pressed ? DS.ink[50] : '#FFF',
                  borderWidth: 1, borderColor: DS.ink[200],
                })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: app.color + '14', alignItems: 'center', justifyContent: 'center' }}>
                  <MapIcon size={18} color={app.color} strokeWidth={2} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{app.name}</Text>
                <ExternalLink size={14} color={DS.ink[400]} />
              </Pressable>
            ))}

            {/* Tarayıcı fallback */}
            <Pressable
              onPress={() => onSelect(`https://www.google.com/maps/dir/?api=1&destination=${q}`, `https://www.google.com/maps/dir/?api=1&destination=${q}`)}
              style={({ pressed }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                padding: 14, borderRadius: 14, marginTop: 4,
                backgroundColor: pressed ? DS.ink[100] : DS.ink[50],
                borderWidth: 1, borderColor: DS.ink[200],
              })}
            >
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: DS.ink[200], alignItems: 'center', justifyContent: 'center' }}>
                <ExternalLink size={18} color={DS.ink[700]} />
              </View>
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: DS.ink[700] }}>{t('courier.modal.openInBrowser')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ════════════════════════ MOBILE ════════════════════════ */

function MobileView({ d, busy, onChangeStatus, onOpenMap, onCall, onBack }: any) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const curIdx = statusIndex(d.status);
  return (
    <View style={{ flex: 1, backgroundColor: '#FFF' }}>
      {/* Sticky header */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#FFF', zIndex: 2,
      }}>
        <Pressable onPress={onBack} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: DS.ink[100], alignItems: 'center', justifyContent: 'center' }}>
          <ArrowLeft size={16} color={DS.ink[800]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
            {d.destination_name ?? d.order_number ?? t('courier.delivery.defaultTitle')}
          </Text>
          <Text style={{ fontSize: 10, color: DS.ink[500], marginTop: 2 }}>{STATUS_LABEL[d.status] ?? d.status}</Text>
        </View>
      </View>

      {/* Harita üst yarı */}
      <View style={{ height: 320, backgroundColor: TH.bgSoft, position: 'relative', overflow: 'hidden' }}>
        <CourierLiveMap deliveryId={d.id} />
        <View style={{ position: 'absolute', top: 16, left: 16, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#FFF', flexDirection: 'row', gap: 6, alignItems: 'center',
          ...(Platform.OS === 'web' ? { boxShadow: '0 6px 18px rgba(0,0,0,0.12)' } as any : {})
        }}>
          <Navigation size={11} color={TH.primary} strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: DS.ink[900] }}>{t('courier.delivery.gpsStatus', { status: d.status === 'yolda' ? 'aktif' : 'pasif' })}</Text>
        </View>
      </View>

      {/* Bottom sheet (overlap) */}
      <ScrollView
        style={{ flex: 1, marginTop: -28 }}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        <View style={{
          backgroundColor: '#FFF',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 16, gap: 16,
        }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: DS.ink[200] }} />

          {/* Müşteri kartı */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary }}>{initials(d.destination_name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>{d.destination_name ?? '—'}</Text>
              <Text style={{ fontSize: 11, color: DS.ink[500] }}>{d.destination_phone ?? t('courier.delivery.noPhone')}</Text>
            </View>
            {d.destination_phone && (
              <Pressable onPress={onCall} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: SUCCESS }}>
                <Phone size={13} color="#FFF" strokeWidth={2.2} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>{t('courier.delivery.call')}</Text>
              </Pressable>
            )}
          </View>

          {/* Adres */}
          {d.destination_address && (
            <Pressable onPress={onOpenMap} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: DS.ink[50], borderWidth: 1, borderColor: DS.ink[100] }}>
              <MapPin size={16} color={TH.primary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: DS.ink[800], lineHeight: 17 }}>{d.destination_address}</Text>
                <Text style={{ fontSize: 11, fontWeight: '600', color: TH.primary, marginTop: 6 }}>{t('courier.delivery.openOnMap')}</Text>
              </View>
            </Pressable>
          )}

          {/* Paket bilgisi */}
          <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: DS.ink[100] }}>
            <Package size={16} color={DS.ink[700]} strokeWidth={2} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[900] }}>
                {d.order_number ? `Sipariş #${d.order_number}` : t('courier.delivery.contents')}
              </Text>
              {d.patient_name && <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>{d.patient_name}</Text>}
            </View>
          </View>

          {/* Notlar */}
          {d.notes && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: 'rgba(232,155,42,0.10)', borderWidth: 1, borderColor: 'rgba(232,155,42,0.25)' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9C5E0E' }}>{t('courier.delivery.noteLabel')}</Text>
              <Text style={{ fontSize: 12, color: DS.ink[800], marginTop: 4, lineHeight: 18 }}>{d.notes}</Text>
            </View>
          )}

          {/* Timeline */}
          <View>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>{t('courier.delivery.progress')}</Text>
            <Timeline current={curIdx} />
          </View>

          {/* Aksiyon CTA'ları — status'a göre */}
          <ActionBar status={d.status} busy={busy} onChangeStatus={onChangeStatus} mobile />
        </View>
      </ScrollView>
    </View>
  );
}

/* ════════════════════════ DESKTOP ════════════════════════ */

function DesktopView({ d, busy, onChangeStatus, onOpenMap, onCall, onBack }: any) {
  const { t, i18n } = useTranslation();
  const curIdx = statusIndex(d.status);
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* SOL — info paneli */}
      <ScrollView style={{ flex: 4 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Breadcrumb + back */}
        <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} color={DS.ink[500]} />
          <Text style={{ fontSize: 11, color: DS.ink[500] }}>Teslimatlar / {d.destination_name ?? '—'}</Text>
        </Pressable>

        {/* Page title */}
        <View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>
            {t('courier.detail.breadcrumb', { id: d.order_number ?? '—' })}
          </Text>
          <Text style={{ ...DISPLAY, fontSize: 28, color: DS.ink[900], letterSpacing: -0.8, lineHeight: 32, marginTop: 4 }}>
            {t('courier.detail.pageTitle')}
          </Text>
        </View>

        {/* Status card */}
        <Card padding={18}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <Chip label={STATUS_LABEL[d.status] ?? d.status} color={STATUS_COLOR[d.status] ?? DS.ink[500]} solid />
            {d.order_number && <Chip label={`#${d.order_number}`} color={DS.ink[700]} />}
          </View>
          <Text style={{ ...DISPLAY, fontSize: 24, color: DS.ink[900], letterSpacing: -0.6 }} numberOfLines={2}>{d.destination_name ?? '—'}</Text>
          {d.destination_address && (
            <Pressable onPress={onOpenMap}>
              <Text style={{ fontSize: 12, color: DS.ink[500], marginTop: 6 }}>
                {d.destination_address} · <Text style={{ color: TH.primary, fontWeight: '600' }}>Haritada Aç →</Text>
              </Text>
            </Pressable>
          )}
        </Card>

        {/* Timeline */}
        <View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 12 }}>{t('courier.delivery.progress')}</Text>
          <Timeline current={curIdx} />
        </View>

        {/* 2-col Müşteri / Paket */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card padding={16} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>{t('courier.detail.customer')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: TH.bgSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ ...DISPLAY, fontSize: 18, color: TH.primary }}>{initials(d.destination_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }}>{d.destination_name ?? '—'}</Text>
                <Text style={{ fontSize: 11, color: DS.ink[500] }}>{t('courier.delivery.clinic')}</Text>
              </View>
            </View>
            {d.destination_phone && (
              <Text style={{ fontSize: 12, color: DS.ink[700] }}>📞 {d.destination_phone}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {d.destination_phone && (
                <Pressable onPress={onCall} style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: SUCCESS, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                  <Phone size={13} color="#FFF" strokeWidth={2.2} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>{t('courier.delivery.call')}</Text>
                </Pressable>
              )}
              <Pressable style={{ flex: 1, paddingVertical: 9, borderRadius: 999, backgroundColor: DS.ink[100], alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
                <MessageCircle size={13} color={DS.ink[800]} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: DS.ink[800] }}>{t('courier.delivery.message')}</Text>
              </Pressable>
            </View>
          </Card>

          <Card padding={16} style={{ flex: 1 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: DS.ink[500], marginBottom: 10 }}>{t('courier.delivery.package')}</Text>
            <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5 }}>{d.order_number ? `#${d.order_number}` : '—'}</Text>
            {d.patient_name && <Text style={{ fontSize: 12, color: DS.ink[700], marginTop: 8 }}>Hasta: {d.patient_name}</Text>}
            <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 8 }}>
              Atandı: {new Date(d.assigned_at).toLocaleString(localeTag(i18n.language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Text>
            {d.picked_up_at && (
              <Text style={{ fontSize: 11, color: DS.ink[500], marginTop: 2 }}>
                Alındı: {new Date(d.picked_up_at).toLocaleString(localeTag(i18n.language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </Card>
        </View>

        {/* Notlar */}
        {d.notes && (
          <View style={{ padding: 14, borderRadius: 14, backgroundColor: 'rgba(232,155,42,0.10)', borderWidth: 1, borderColor: 'rgba(232,155,42,0.25)' }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9C5E0E' }}>{t('courier.delivery.noteLabelDesktop')}</Text>
            <Text style={{ fontSize: 12, color: DS.ink[800], marginTop: 6, lineHeight: 18 }}>{d.notes}</Text>
          </View>
        )}

        {/* Aksiyon CTA */}
        <View style={{ paddingTop: 4 }}>
          <ActionBar status={d.status} busy={busy} onChangeStatus={onChangeStatus} />
        </View>
      </ScrollView>

      {/* SAĞ — harita */}
      <View style={{ flex: 6, padding: 16, gap: 12 }}>
        <View>
          <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: DS.ink[500] }}>{t('courier.section.location2')}</Text>
          <Text style={{ ...DISPLAY, fontSize: 22, color: DS.ink[900], letterSpacing: -0.5, marginTop: 2 }}>{t('courier.map.liveMapDesktop')}</Text>
        </View>
        <Card padding={0} style={{ flex: 1, overflow: 'hidden' }}>
          <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: DS.ink[100] }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: d.status === 'yolda' ? SUCCESS : DS.ink[300] }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>
              {d.status === 'yolda' ? t('courier.map.gpsStatusLabel', { status: 'aktif' }) : t('courier.map.gpsInactive')}
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onOpenMap} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: DS.ink[100] }}>
              <MapIcon size={11} color={DS.ink[700]} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: DS.ink[700] }}>{t('courier.map.fullScreen2')}</Text>
            </Pressable>
          </View>
          <View style={{ flex: 1, backgroundColor: TH.bgSoft }}>
            <CourierLiveMap deliveryId={d.id} />
          </View>
        </Card>
      </View>
    </View>
  );
}

/* ════════════════════ Atoms ════════════════════ */

function Timeline({ current }: { current: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {TIMELINE.map((s, i, arr) => (
        <React.Fragment key={s.key}>
          <View style={{ alignItems: 'center', flex: 1 }}>
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: i < current ? TH.primary : i === current ? TH.primary : '#FFF',
              borderWidth: i === current ? 3 : i < current ? 0 : 1,
              borderColor: i === current ? TH.primary + '40' : DS.ink[300],
              alignItems: 'center', justifyContent: 'center',
            }}>
              {i < current ? <Check size={12} color="#FFF" strokeWidth={3} /> : i === current ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' }} /> : null}
            </View>
            <Text style={{ fontSize: 9, fontWeight: '600', color: i <= current ? DS.ink[900] : DS.ink[400], marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' }} numberOfLines={1}>{t(s.labelKey)}</Text>
          </View>
          {i < arr.length - 1 && <View style={{ flex: 0.3, height: 1, backgroundColor: i < current ? TH.primary : DS.ink[200], marginBottom: 18 }} />}
        </React.Fragment>
      ))}
    </View>
  );
}

function ActionBar({ status, busy, onChangeStatus, mobile }: any) {
  const { t } = useTranslation();
  // Status'a göre aktif aksiyon
  if (status === 'atandi' || status === 'beklemede') {
    return (
      <Pressable
        onPress={() => onChangeStatus('teslim_alindi')}
        disabled={busy}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: mobile ? 14 : 999, backgroundColor: TH.primary, opacity: busy ? 0.6 : 1 }}
      >
        <Truck size={15} color="#FFF" strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('courier.action.packagePickedUp')}</Text>
      </Pressable>
    );
  }
  if (status === 'teslim_alindi') {
    return (
      <Pressable
        onPress={() => onChangeStatus('yolda')}
        disabled={busy}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: mobile ? 14 : 999, backgroundColor: WARNING, opacity: busy ? 0.6 : 1 }}
      >
        <Play size={15} color="#FFF" strokeWidth={2.2} />
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{t('courier.action.onTheWay')}</Text>
      </Pressable>
    );
  }
  if (status === 'yolda') {
    return (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pressable disabled={busy} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: mobile ? 14 : 999, backgroundColor: DS.ink[900], opacity: busy ? 0.6 : 1 }}>
          <Camera size={15} color="#FFF" />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>{t('courier.action.takePhoto')}</Text>
        </Pressable>
        {!mobile && (
          <Pressable disabled={busy} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 999, backgroundColor: '#FFF', borderWidth: 1, borderColor: DS.ink[200], opacity: busy ? 0.6 : 1 }}>
            <PenTool size={15} color={DS.ink[800]} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: DS.ink[800] }}>{t('courier.action.getSignature')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onChangeStatus('teslim_edildi')}
          disabled={busy}
          style={{ flex: mobile ? 1 : 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: mobile ? 14 : 999, backgroundColor: SUCCESS, opacity: busy ? 0.6 : 1 }}
        >
          <Check size={15} color="#FFF" strokeWidth={2.4} />
          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{t('courier.action.deliver')}</Text>
        </Pressable>
      </View>
    );
  }
  // teslim_edildi veya iptal
  return (
    <View style={{ padding: 16, borderRadius: 14, backgroundColor: status === 'teslim_edildi' ? 'rgba(45,154,107,0.10)' : DS.ink[100], alignItems: 'center', gap: 4 }}>
      <Check size={20} color={status === 'teslim_edildi' ? SUCCESS : DS.ink[500]} strokeWidth={2.4} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: status === 'teslim_edildi' ? SUCCESS : DS.ink[700] }}>
        {STATUS_LABEL[status] ?? status}
      </Text>
    </View>
  );
}

function Chip({ label, color, solid }: { label: string; color: string; solid?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: solid ? color + '20' : color + '14', alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color }}>{label}</Text>
    </View>
  );
}

function Card({ children, padding = 16, style }: any) {
  return <View style={[{ backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1, borderColor: DS.ink[200], padding }, style]}>{children}</View>;
}
