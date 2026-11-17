// modules/orders/components/FaceScanQuickAction.tsx
//
// Dashboard'a (lab / doctor / clinic) yerleştirilen kompakt "3D Yüz Tarama" pill'i.
//
// Akış:
//   1. iOS + TrueDepth check — değilse hiç render olmaz
//   2. Buton tıklanır → sipariş picker modal
//   3. Kullanıcı sipariş seçer → modal kapanır → native AR ekran açılır
//   4. Capture → dosyalar seçilen iş emrine yüklenir → toast
//
// Sipariş listesi user_type'a göre filtrelenir (doctor: kendi orderları,
// lab/clinic: hepsi RLS sayesinde). Sadece teslim edilmemiş & aktif siparişler.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, Text, View, ActivityIndicator, Platform,
  Modal, TextInput, ScrollView, Image,
} from 'react-native';
import { ScanFace, X, Search } from '../../../core/ui/icons';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { isSupported as arSupported, startScanMode, isFrontScanSupported, isHeadScanSupported, isUnifiedScanSupported, type ScanMode } from 'ar-scanner';
import i18n from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { uploadFaceScanResult } from '../utils/uploadFaceScanResult';
import { useOrders } from '../hooks/useOrders';
import type { WorkOrder } from '../types';

/**
 * Cihazda 3D yüz tarama kullanılabilir mi? (iOS + TrueDepth/native modul)
 * Dashboard'lar bununla ¼ kartı koşullu render eder — desteklenmeyen
 * cihazda boş alan kalmaz.
 */
export function useFaceScanAvailable(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    try { setOk(arSupported()); } catch { setOk(true); }
  }, []);
  return ok;
}

interface Props {
  accentColor: string;
  /** Opsiyonel kompakt mod — sadece icon + minimal text (pill variant) */
  compact?: boolean;
  /** 'pill' = floating buton · 'card' = dashboard ¼ kart · 'headless' = buton YOK,
   *  yalnız sipariş seçici modal (navbar gibi dış bir tetikleyiciden açılır) */
  variant?: 'pill' | 'card' | 'headless';
  /** headless modda modalı dışarıdan aç/kapat */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function FaceScanQuickAction({ accentColor, compact = false, variant = 'pill', open, onOpenChange }: Props) {
  const profile = useAuthStore(s => s.profile);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') { setSupported(false); return; }
    try {
      const ok = arSupported();
      setSupported(ok);
    } catch {
      // Native modul JS'e expose olmamış — yine de butonu göster (Pressable handler
      // hatayı yakalar). Böylece kullanıcı 'native modul yok' mesajını görebilir.
      setSupported(true);
    }
  }, []);

  // iOS dışı veya profile yoksa render etme
  if (Platform.OS !== 'ios') return null;
  if (supported === null) return null; // ilk useEffect cycle bekleniyor
  if (!profile) return null;
  return <FaceScanQuickActionInner accentColor={accentColor} compact={compact} variant={variant} open={open} onOpenChange={onOpenChange} profile={profile} />;
}

interface InnerProps extends Props {
  profile: NonNullable<ReturnType<typeof useAuthStore.getState>['profile']>;
}

function FaceScanQuickActionInner({ accentColor, compact, profile, variant = 'pill', open, onOpenChange }: InnerProps) {
  const [pickerOpenLocal, setPickerOpenLocal] = useState(false);
  // headless modda açık/kapalı durumu dışarıdan (navbar) yönetilir
  const controlled = variant === 'headless';
  const pickerOpen = controlled ? !!open : pickerOpenLocal;
  const setPickerOpen = (v: boolean) => {
    if (controlled) onOpenChange?.(v);
    else setPickerOpenLocal(v);
  };
  const [pendingOrder, setPendingOrder] = useState<WorkOrder | null>(null);
  const [busy, setBusy] = useState(false);
  // Tarama bitti, dosyalar yükleniyor → düğme "Taranıyor" demeye devam etmesin
  const [uploading, setUploading] = useState(false);
  // Varsayılan: arka kamerayla yüz + kafa (birleşik). LiDAR'sız telefonda o mod yoktur →
  // eski arka kamera yüz taraması onun yerine geçer.
  const [mode, setMode] = useState<ScanMode>(() => {
    try { return isUnifiedScanSupported() ? 'unified' : 'rearGuided'; } catch { return 'rearGuided'; }
  });
  const frontAvailable = useMemo(() => { try { return isFrontScanSupported(); } catch { return false; } }, []);
  const headAvailable = useMemo(() => { try { return isHeadScanSupported(); } catch { return false; } }, []);
  const unifiedAvailable = useMemo(() => { try { return isUnifiedScanSupported(); } catch { return false; } }, []);

  // user_type → useOrders scope
  // doctor: kendi siparişleri; lab/clinic_admin/clinic_secretary: tüm (RLS filtreler)
  const userScope: 'doctor' | 'lab' =
    profile.user_type === 'doctor' ? 'doctor' : 'lab';
  const doctorId = userScope === 'doctor' ? profile.id : undefined;
  const { orders, loading } = useOrders(userScope, doctorId);

  // Sipariş seçildi → picker'ı kapat. Asıl tarama, modal TAM kapandıktan sonra
  // (onDismiss) başlar. Aksi halde iOS, kapanmakta olan RN modal'ın üstüne
  // native AR VC present edemez → present sessizce fail → sonsuz "Taranıyor".
  function handleSelect(order: WorkOrder) {
    if (busy) return;
    setPendingOrder(order);
    setPickerOpen(false);
  }

  // Modal tamamen kapandığında çağrılır (iOS onDismiss).
  async function runPendingScan() {
    const order = pendingOrder;
    setPendingOrder(null);
    if (!order) return;

    setBusy(true);
    try {
      const result = await startScanMode(mode, i18n.language, accentColor);   // rearGuided · front · head (360°)
      if (!result) return;

      setUploading(true);
      // Düğmesiz (navbar) kullanımda ekranda başka gösterge yok → kullanıcı yüklemenin sürdüğünü görsün
      toast.info(autoT('Tarama yükleniyor…'));
      const { uploadedCount, errors } = await uploadFaceScanResult({
        result, workOrderId: order.id, profile,
      });

      if (uploadedCount > 0) {
        toast.success(`${order.order_number}: ${uploadedCount} ${autoT('dosya yüklendi')}`);
      } else {
        toast.error(autoT('Yükleme başarısız') + (errors[0] ? `: ${errors[0]}` : ''));
      }
    } catch (err: any) {
      toast.error(err?.message ?? autoT('Tarama başarısız'));
    } finally {
      setBusy(false);
      setUploading(false);
    }
  }

  return (
    <>
      {variant === 'headless'
        ? null
        : variant === 'card'
          ? <ScanCard accentColor={accentColor} busy={busy} uploading={uploading} onPress={() => setPickerOpen(true)} />
          : <ScanPill accentColor={accentColor} busy={busy} uploading={uploading} compact={compact} onPress={() => setPickerOpen(true)} />}

      <OrderPickerModal
        visible={pickerOpen}
        orders={orders}
        loading={loading}
        accentColor={accentColor}
        mode={mode}
        setMode={setMode}
        frontAvailable={frontAvailable}
        headAvailable={headAvailable}
        unifiedAvailable={unifiedAvailable}
        onSelect={handleSelect}
        onClose={() => setPickerOpen(false)}
        onDismiss={runPendingScan}
      />
    </>
  );
}

// ─── Pill variant (floating) ────────────────────────────────────────────────
function ScanPill({ accentColor, busy, uploading, compact, onPress }: {
  accentColor: string; busy: boolean; uploading: boolean; compact?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8,
        paddingHorizontal: compact ? 10 : 14, paddingVertical: compact ? 8 : 10,
        borderRadius: 999,
        backgroundColor: busy ? '#94A3B8' : accentColor,
        opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {busy
        ? <ActivityIndicator size="small" color="#FFFFFF" />
        : <ScanFace size={compact ? 14 : 16} color="#FFFFFF" strokeWidth={1.8} />}
      <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '600', color: '#FFFFFF' }}>
        {busy ? (uploading ? 'Tarama yükleniyor…' : 'Taranıyor…') : '3D Yüz Tarama'}
      </Text>
    </Pressable>
  );
}

// 3D yüz tarama ikonları (assets) — kartın accent'ine göre seçilir
const FACE_SCAN_ICON_GREEN = require('../../../assets/images/icon-3d-face-scan-green.png');
const FACE_SCAN_ICON_NAVY  = require('../../../assets/images/icon-3d-face-scan-navy.png');
function isGreenish(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || '');
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(v => parseInt(v, 16));
  return g > r && g > b;
}

// ─── Card variant (dashboard ¼ kart) ────────────────────────────────────────
// "Yeni vaka oluştur" hero kartının yanında ¼ genişlikte dikey kart.
// NewOrderCTACard ile aynı tasarım dili: accent zemin, beyaz ikon dairesi,
// kicker + başlık, eşleşen gölge/radius.
function ScanCard({ accentColor, busy, uploading, onPress }: {
  accentColor: string; busy: boolean; uploading: boolean; onPress: () => void;
}) {
  // NewOrderCTACard'ın BİREBİR görsel dili: dolu accent zemin, radius 20,
  // accent-tonlu gölge, sağ üstte yumuşak beyaz blob, beyaz ikon dairesi (44).
  // Tek fark içerik — artı yerine yüz tarama ikonu.
  //
  // Yükseklik: içerik kısa tutuldu (daire + tek satır). Satır
  // alignItems:'stretch' olduğu için yüksekliği CTA belirler ve bu kart ona
  // uzar. Eskiden 2 satırlık yazı bu kartı uzatıp CTA'yı da şişiriyordu.
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => ({
        flex: 1, alignSelf: 'stretch',
        borderRadius: 20,
        backgroundColor: accentColor,
        overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
        paddingVertical: 12, paddingHorizontal: 8, gap: 8,
        opacity: busy ? 0.7 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(Platform.OS === 'web'
          ? ({ cursor: 'pointer', boxShadow: `0 8px 22px ${accentColor}40` } as any)
          : {
              shadowColor: accentColor, shadowOpacity: 0.28, shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 }, elevation: 6,
            }),
      })}
    >
      {/* CTA'daki gibi yumuşak arka plan blob'u */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -34, end: -34,
          width: 110, height: 110, borderRadius: 55,
          backgroundColor: 'rgba(255,255,255,0.12)',
        }}
      />

      {/* 3D yüz tarama ikonu — yeşil panelde yeşil, diğerlerinde lacivert.
          (CTA'nın yanındaki kartta yeni-vaka 3D ikonuyla eşleşir.) */}
      <View style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }}>
        {busy
          ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <Image
              source={isGreenish(accentColor) ? FACE_SCAN_ICON_GREEN : FACE_SCAN_ICON_NAVY}
              resizeMode="contain"
              style={{ width: '100%', height: '100%' }}
            />}
      </View>

      <Text
        numberOfLines={1}
        style={{
          fontSize: 12, fontWeight: '600', color: '#FFFFFF',
          textAlign: 'center', letterSpacing: -0.2,
        }}
      >
        {busy ? (uploading ? 'Tarama yükleniyor…' : 'Taranıyor…') : 'Yüz Tara'}
      </Text>
    </Pressable>
  );
}

// ─── Order picker modal ─────────────────────────────────────────────────────

interface PickerProps {
  visible:     boolean;
  orders:      WorkOrder[];
  loading:     boolean;
  accentColor: string;
  mode:        ScanMode;
  setMode:     (m: ScanMode) => void;
  frontAvailable: boolean;
  /** Tam kafa 360° (LiDAR + iOS 17) — yalnız destekleyen cihazda seçenek görünür */
  headAvailable: boolean;
  /** Birleşik tarama (yüz + kafa tek akışta) — yeni native derleme + LiDAR */
  unifiedAvailable: boolean;
  onSelect:    (order: WorkOrder) => void;
  onClose:     () => void;
  /** Modal TAM kapandığında (iOS) — bekleyen taramayı başlatmak için */
  onDismiss?:  () => void;
}

function OrderPickerModal({ visible, orders, loading, accentColor, mode, setMode, frontAvailable, headAvailable, unifiedAvailable, onSelect, onClose, onDismiss }: PickerProps) {
  const U = useInkUI();
  const [query, setQuery] = useState('');

  // Aktif siparişler — teslim edilmemiş ve arşivlenmemiş
  const activeOrders = useMemo(() =>
    orders.filter(o => o.status !== 'teslim_edildi' && !o.is_archived),
    [orders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeOrders.slice(0, 50);
    return activeOrders.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      (o.patient_name ?? '').toLowerCase().includes(q) ||
      (o.doctor?.full_name ?? '').toLowerCase().includes(q)
    ).slice(0, 50);
  }, [activeOrders, query]);

  // İki seçenek: arka kamerayla yüz + kafa (birleşik) ve ön kamerayla hızlı yüz.
  // Eski "Detaylı yüz" ve "Tam kafa" seçenekleri birleşik moda devredildi. Birleşik mod LiDAR
  // ister; LiDAR'sız telefonda arka kamera seçeneği eski yüz taramasına düşer (yoksa o
  // telefonlarda arka kamerayla tarama hiç kalmazdı).
  const modes = ([
    unifiedAvailable
      ? { key: 'unified' as ScanMode,  label: 'Yüz + kafa', hint: 'Arka kamera', show: true }
      : { key: 'rearGuided' as ScanMode, label: 'Detaylı yüz', hint: 'Arka kamera', show: true },
    { key: 'front' as ScanMode, label: 'Hızlı yüz', hint: 'Ön kamera', show: frontAvailable },
  ]).filter(opt => opt.show);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={U.modalOverlay}>
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>3D Tarama için sipariş seç</Text>
            <Pressable onPress={onClose} hitSlop={10} style={U.modalCloseBtn} accessibilityLabel={autoT('Kapat')}>
              <X size={16} color={U.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
            {/* Mod seçimi — seçili olan daha geniş (pill ölçü kuralı) */}
            {modes.length > 1 && (
              <View style={{
                flexDirection: 'row', gap: 6, padding: 4, marginBottom: 12,
                backgroundColor: U.chipNeutral, borderRadius: 14,
              }}>
                {modes.map(opt => {
                  const active = mode === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setMode(opt.key)}
                      style={{
                        flex: active ? 1.55 : 1, alignItems: 'center',
                        paddingVertical: 8, paddingHorizontal: active ? 12 : 8, borderRadius: 10,
                        backgroundColor: active ? U.segActive : 'transparent',
                      }}
                    >
                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: active ? U.ink[900] : U.ink[500] }}>
                        {opt.label}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 10, color: active ? (U.isDark ? U.ink[700] : accentColor) : U.ink[400], marginTop: 1 }}>
                        {opt.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Arama */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: U.chipNeutral, borderRadius: 9999,
              paddingHorizontal: 14, height: 40, marginBottom: 10,
            }}>
              <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Sipariş no, hasta adı, hekim…"
                placeholderTextColor={U.ink[400]}
                style={{ flex: 1, fontSize: 14, color: U.ink[900], padding: 0 }}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                  <X size={14} color={U.ink[400]} strokeWidth={1.8} />
                </Pressable>
              )}
            </View>

            {/* Liste */}
            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: U.ink[400] }}>
                  {query ? 'Eşleşen sipariş bulunamadı' : 'Aktif sipariş yok'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                {filtered.map(order => (
                  <Pressable
                    key={order.id}
                    onPress={() => onSelect(order)}
                    style={({ pressed }) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingVertical: 12, paddingHorizontal: 8,
                      borderRadius: 10,
                      backgroundColor: pressed ? U.rowHover : 'transparent',
                    })}
                  >
                    <View style={{
                      width: 8, height: 8, borderRadius: 4,
                      backgroundColor: statusColor(order.status),
                    }} />
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>
                          {order.order_number}
                        </Text>
                        {order.patient_name && (
                          <Text style={{ fontSize: 12, color: U.ink[500], flexShrink: 1 }} numberOfLines={1}>
                            · {order.patient_name}
                          </Text>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 2 }} numberOfLines={1}>
                        {order.doctor?.full_name ?? '—'} · {statusLabel(order.status)}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function statusColor(s: WorkOrder['status']): string {
  switch (s) {
    case 'alindi':           return '#3B82F6';
    case 'uretimde':         return '#F59E0B';
    case 'kalite_kontrol':   return '#8B5CF6';
    case 'teslimata_hazir':  return '#10B981';
    case 'teslim_edildi':    return '#94A3B8';
    default:                 return '#9A9A9A';
  }
}

function statusLabel(s: WorkOrder['status']): string {
  switch (s) {
    case 'alindi':           return 'Alındı';
    case 'uretimde':         return 'Üretimde';
    case 'kalite_kontrol':   return 'Kalite Kontrol';
    case 'teslimata_hazir':  return 'Teslime Hazır';
    case 'teslim_edildi':    return 'Teslim Edildi';
    default:                 return s;
  }
}



