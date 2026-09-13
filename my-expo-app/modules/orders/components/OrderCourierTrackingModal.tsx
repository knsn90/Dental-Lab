// modules/orders/components/OrderCourierTrackingModal.tsx
//
// Sipariş detayındaki lojistik haritasına tıklayınca AÇILAN modal: sayfadan
// ayrılmadan o teslimatın canlı haritası + Kurye Takip sayfasıyla AYNI detay
// paneli (kurye, tahmini varış, zaman çizelgesi, gönderen, alıcı adres, kargo takip).
//
// Self-contained: leg (deliveries satırı) + labAddress/clinicAddress yeter.
// Canlı konum useExternalCourier + (kendi kuryemiz) gps_pings CourierTrackingMap içinde.

import React, { useState } from 'react';
import { View, Text, Pressable, Modal, Platform, ScrollView, useWindowDimensions, Image, Linking } from 'react-native';
import { X, Phone, MapPin, Navigation, Package, Clock, ArrowRight } from '../../../core/ui/icons';
import { CourierTrackingMap } from '../../courier/CourierTrackingMap';
import { legRouteAddresses } from './StaticRouteMap';
import { useExternalCourier } from '../../courier/useExternalCourier';
import { formatAddress } from '../../../core/util/formatAddress';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL, localeTag } from '../../../core/i18n';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Koyu modda durum rozeti ön-plan renkleri (koyu lacivert/yeşil/kırmızı okunmaz). */
const DARK_STATUS_FG: Record<string, string> = {
  '#4B4B4B': 'rgba(247,242,233,0.78)',
  '#1E5A8A': '#93C5FD',
  '#1E3A8A': '#93C5FD',
  '#0F6E50': '#6EE7B7',
  '#9C2E2E': '#FCA5A5',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  leg: any | null;
  labAddress?: string | null;
  clinicAddress?: string | null;
  accent: string;
}

function formatPhone(raw: string): string {
  const d = String(raw).replace(/\D/g, '');
  const local = d.startsWith('90') && d.length === 12 ? '0' + d.slice(2) : d;
  return local.length === 11
    ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7, 9)} ${local.slice(9)}`
    : raw;
}
function fmtDuration(sec?: number | null): string | null {
  if (sec == null) return null;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} ${autoT('dk')}`;
  return `${Math.floor(m / 60)} ${autoT('sa')} ${m % 60} ${autoT('dk')}`;
}
function fmtDist(m?: number | null): string | null {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
function fmtDT(s?: string | null): string | null {
  if (!s) return null;
  try {
    const d = new Date(s);
    return d.toLocaleString(localeTag(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return null; }
}

const STATUS_CFG: Record<string, { label: string; bg: string; fg: string }> = {
  beklemede:     { label: 'Beklemede', bg: 'rgba(107,107,107,0.14)', fg: '#4B4B4B' },
  atandi:        { label: 'Atandı',    bg: 'rgba(74,143,201,0.16)',  fg: '#1E5A8A' },
  teslim_alindi: { label: 'Aldı',      bg: 'rgba(37,99,235,0.14)',   fg: '#1E3A8A' },
  yolda:         { label: 'Yolda',     bg: 'rgba(37,99,235,0.20)',   fg: '#1E3A8A' },
  teslim_edildi: { label: 'Teslim edildi', bg: 'rgba(16,185,129,0.14)', fg: '#0F6E50' },
  iptal:         { label: 'İptal',     bg: 'rgba(220,38,38,0.12)',   fg: '#9C2E2E' },
};

const SHADOW = Platform.OS === 'web'
  ? { boxShadow: '0 12px 32px rgba(15,23,42,0.20)' } as any
  : { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 };

function initialsOf(name?: string | null): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || 'K';
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const T = useMobileTokens();
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: isDark ? T.ink3 : '#9A9A9A', marginBottom: 8 }}>{label}</Text>
      {children}
    </View>
  );
}

export function OrderCourierTrackingModal({ visible, onClose, leg, labAddress, clinicAddress, accent }: Props) {
  const [eta, setEta] = useState<{ durationSec: number | null; distanceM: number | null; live: boolean } | null>(null);
  const { courier: extCourier } = useExternalCourier(leg ?? undefined);
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const T = useMobileTokens();
  const insets = useSafeAreaInsets();
  // Tam ekran (mobil) modda harita çentiğin/durum çubuğunun ALTINA taşar; üst
  // rozet + kapat düğmesi ve alt panel güvenli alanı hesaba katmalı.
  const safeTop = isNarrow ? insets.top : 0;
  const safeBottom = isNarrow ? insets.bottom : 0;

  if (!leg) return null;

  const { originText, destText } = legRouteAddresses(leg, labAddress ?? null, clinicAddress ?? null);
  const courierName = extCourier?.name ?? leg.ext_courier_name ?? leg.courier?.full_name ?? leg.external_provider ?? autoT('Kurye');
  const courierPhoto = extCourier?.photoUrl ?? leg.ext_courier_photo ?? null;
  const phone = extCourier?.phone ?? leg.ext_courier_phone ?? leg.destination_phone ?? null;
  const stRaw = STATUS_CFG[String(leg.status)] ?? STATUS_CFG.beklemede;
  const st = isDark ? { ...stRaw, fg: DARK_STATUS_FG[stRaw.fg] ?? T.ink2 } : stRaw;
  const durationStr = fmtDuration(eta?.durationSec);
  const distStr = fmtDist(eta?.distanceM);
  const incoming = leg.direction === 'clinic_to_lab';
  const senderLabel = incoming ? (formatAddress(clinicAddress) || autoT('Klinik')) : autoT('Laboratuvar');
  const recipientName = leg.destination_name || (incoming ? autoT('Laboratuvar') : null);
  const recipientAddr = formatAddress(leg.destination_address) || destText || '';
  const trackingNo = leg.external_tracking_no || leg.external_tracking_code || null;
  const provider = leg.external_provider || null;

  const call = () => {
    if (!phone) return;
    const tel = String(phone).replace(/[^\d+]/g, '');
    if (Platform.OS === 'web') { try { window.open(`tel:${tel}`); } catch { /* */ } }
    else { try { Linking.openURL(`tel:${tel}`); } catch { /* */ } }
  };

  // Zaman çizelgesi adımları — teslimatın gerçek zaman damgaları.
  const steps = [
    { label: autoT('Oluşturuldu'), at: leg.created_at, done: !!leg.created_at },
    { label: autoT('Kurye aldı'),  at: leg.picked_up_at, done: !!leg.picked_up_at },
    { label: autoT('Teslim edildi'), at: leg.delivered_at, done: !!leg.delivered_at },
  ];

  const DetailPanel = (
    <View style={{
      // Kurye Takip sayfasındaki detay kartıyla AYNI liquid glass: 0.08 translucent
      // beyaz + blur + parlak kenar + inset highlight. Native'de blur yok → opak beyaz.
      borderRadius: 22, overflow: 'hidden', borderWidth: 1,
      ...(Platform.OS === 'web'
        ? (isDark
            ? {
                // Koyu liquid glass — koyu harita üstünde okunur; içerik açık ink.
                backgroundColor: 'rgba(20,19,18,0.72)', borderColor: 'rgba(255,255,255,0.14)',
                backdropFilter: 'blur(12px) saturate(120%)', WebkitBackdropFilter: 'blur(12px) saturate(120%)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)',
              } as any
            : {
                backgroundColor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.55)',
                backdropFilter: 'blur(3px) saturate(120%)', WebkitBackdropFilter: 'blur(3px) saturate(120%)',
                boxShadow: '0 12px 32px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.6)',
              } as any)
        : { backgroundColor: isDark ? T.card : '#FFFFFF', borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.7)', ...SHADOW }),
    }}>
      <ScrollView style={{ maxHeight: isNarrow ? 320 : undefined }} showsVerticalScrollIndicator={false}>
        {/* Kurye */}
        <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: `${accent}1A`, borderWidth: 1, borderColor: `${accent}33`, alignItems: 'center', justifyContent: 'center' }}>
            {courierPhoto ? (
              <Image source={{ uri: courierPhoto }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '800', color: accent }}>{initialsOf(courierName)}</Text>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>{courierName}</Text>
            <Text style={{ fontSize: 12, color: isDark ? T.ink2 : "#6B6B6B", marginTop: 1 }} numberOfLines={1}>
              {provider ? provider : autoT('Kurye')}{phone ? `  ·  ${formatPhone(String(phone))}` : ''}
            </Text>
          </View>
          {phone ? (
            <Pressable
              onPress={call}
              style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              accessibilityLabel={autoT('Kuryeyi ara')}
            >
              <Phone size={17} color="#FFFFFF" strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>

        {/* Durum + tahmini varış */}
        <View style={{ paddingHorizontal: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: st.bg }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: st.fg }}>{autoT(st.label)}</Text>
          </View>
          {(durationStr || distStr) && leg.status !== 'teslim_edildi' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Clock size={13} color={isDark ? (T.ink2 as string) : "#6B6B6B"} strokeWidth={2} />
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDark ? T.ink2 : "#3C3C3C" }}>
                {eta?.live ? `${autoT('Tahmini varış')} · ` : ''}{[durationStr, distStr].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Zaman çizelgesi */}
        <Section label={autoT('Zaman Çizelgesi')}>
          <View style={{ gap: 10 }}>
            {steps.map((step, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: step.done ? accent : 'transparent', borderWidth: step.done ? 0 : 1.5, borderColor: isDark ? "rgba(255,255,255,0.25)" : "#CBD5E1" }} />
                <Text style={{ fontSize: 12.5, fontWeight: step.done ? '600' : '400', color: step.done ? (isDark ? T.ink : "#0A0A0A") : (isDark ? T.ink3 : "#9A9A9A"), flex: 1 }}>{step.label}</Text>
                {fmtDT(step.at) ? <Text style={{ fontSize: 11, color: isDark ? T.ink3 : "#9A9A9A" }}>{fmtDT(step.at)}</Text> : null}
              </View>
            ))}
          </View>
        </Section>

        {/* Gönderen → Alıcı */}
        <Section label={autoT('Güzergâh')}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? "rgba(255,255,255,0.40)" : "#94A3B8", marginTop: 4, flexShrink: 0 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? T.ink3 : "#9A9A9A", textTransform: 'uppercase', letterSpacing: 0.6 }}>{autoT('Gönderen')}</Text>
                <Text style={{ fontSize: 12.5, color: isDark ? T.ink2 : "#3C3C3C" }} numberOfLines={2}>{senderLabel}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <MapPin size={12} color={accent} strokeWidth={2.2} style={{ marginTop: 2, flexShrink: 0 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? T.ink3 : "#9A9A9A", textTransform: 'uppercase', letterSpacing: 0.6 }}>{autoT('Alıcı adres')}</Text>
                {recipientName ? <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>{recipientName}</Text> : null}
                {recipientAddr ? <Text style={{ fontSize: 12, color: isDark ? T.ink2 : "#6B6B6B" }} numberOfLines={3}>{recipientAddr}</Text> : null}
              </View>
            </View>
          </View>
        </Section>

        {/* Kargo takip */}
        {(provider || trackingNo) ? (
          <Section label={autoT('Kargo takip')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Package size={14} color={isDark ? (T.ink2 as string) : "#6B6B6B"} strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? T.ink : "#0A0A0A" }} numberOfLines={1}>
                {[provider, trackingNo].filter(Boolean).join('  ·  ')}
              </Text>
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1, backgroundColor: 'rgba(10,10,10,0.55)',
          ...(Platform.OS === 'web' ? { backdropFilter: 'blur(2px)' } as any : {}),
          alignItems: 'center', justifyContent: 'center', padding: isNarrow ? 0 : 24,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{
            width: '100%', maxWidth: 1240, height: isNarrow ? '100%' : '93%',
            borderRadius: isNarrow ? 0 : 24, overflow: 'hidden',
            backgroundColor: '#0A0A0A', position: 'relative', ...SHADOW,
          }}
        >
          <CourierTrackingMap
            deliveryId={leg.id}
            destinationLabel={(destText || leg.destination_name || leg.destination_address) || undefined}
            originLabel={originText || undefined}
            externalPosition={extCourier?.lat != null && extCourier?.lng != null ? { lat: extCourier.lat, lng: extCourier.lng } : null}
            accent={accent}
            height="100%"
            onRouteInfo={setEta}
          />

          {/* Başlık */}
          <View style={{
            position: 'absolute', top: safeTop + 14, ...(isRTL() ? { end: 14 } : { start: 14 }), zIndex: 20,
            flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7,
            borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.94)',
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } as any : {}), ...SHADOW,
          }}>
            <Navigation size={13} color={accent} strokeWidth={2.2} />
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0F172A' }}>{autoT('Kurye Takip')}</Text>
            {leg.order_number ? <Text style={{ fontSize: 12, color: '#6B6B6B' }}>· #{leg.order_number}</Text> : null}
          </View>

          {/* Kapat */}
          <Pressable
            onPress={onClose}
            style={{
              position: 'absolute', top: safeTop + 12, ...(isRTL() ? { start: 12 } : { end: 12 }), zIndex: 30,
              width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF',
              alignItems: 'center', justifyContent: 'center',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}), ...SHADOW,
            }}
            accessibilityLabel={autoT('Kapat')}
          >
            <X size={18} color="#0F172A" strokeWidth={2} />
          </Pressable>

          {/* Detay paneli — desktop: SOL; mobil: alt */}
          <View style={{
            position: 'absolute', zIndex: 20,
            ...(isNarrow
              ? { left: 10, right: 10, bottom: safeBottom + 10 }
              : { start: 16, top: 62, width: 300 }),
          }}>
            {DetailPanel}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
