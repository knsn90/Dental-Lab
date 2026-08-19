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
  Modal, TextInput, ScrollView,
} from 'react-native';
import { ScanFace, X, Search } from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { isSupported as arSupported, startScanMode, isFrontScanSupported, type ScanMode } from 'ar-scanner';
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
  const [mode, setMode] = useState<ScanMode>('rearGuided');
  const frontAvailable = useMemo(() => { try { return isFrontScanSupported(); } catch { return false; } }, []);

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
      const result = await startScanMode(mode);   // rear=Object Capture, front=ön kamera rehberli
      if (!result) return;

      const { uploadedCount, errors } = await uploadFaceScanResult({
        result, workOrderId: order.id, profile,
      });

      if (uploadedCount > 0) {
        toast.success(`${order.order_number}: ${uploadedCount} dosya yüklendi`);
      } else {
        toast.error('Yükleme başarısız' + (errors[0] ? `: ${errors[0]}` : ''));
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Tarama başarısız');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === 'headless'
        ? null
        : variant === 'card'
          ? <ScanCard accentColor={accentColor} busy={busy} onPress={() => setPickerOpen(true)} />
          : <ScanPill accentColor={accentColor} busy={busy} compact={compact} onPress={() => setPickerOpen(true)} />}

      <OrderPickerModal
        visible={pickerOpen}
        orders={orders}
        loading={loading}
        accentColor={accentColor}
        mode={mode}
        setMode={setMode}
        frontAvailable={frontAvailable}
        onSelect={handleSelect}
        onClose={() => setPickerOpen(false)}
        onDismiss={runPendingScan}
      />
    </>
  );
}

// ─── Pill variant (floating) ────────────────────────────────────────────────
function ScanPill({ accentColor, busy, compact, onPress }: {
  accentColor: string; busy: boolean; compact?: boolean; onPress: () => void;
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
        {busy ? 'Taranıyor…' : '3D Yüz Tarama'}
      </Text>
    </Pressable>
  );
}

// ─── Card variant (dashboard ¼ kart) ────────────────────────────────────────
// "Yeni vaka oluştur" hero kartının yanında ¼ genişlikte dikey kart.
// NewOrderCTACard ile aynı tasarım dili: accent zemin, beyaz ikon dairesi,
// kicker + başlık, eşleşen gölge/radius.
function ScanCard({ accentColor, busy, onPress }: {
  accentColor: string; busy: boolean; onPress: () => void;
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

      {/* CTA'daki beyaz daire — artı yerine yüz tarama ikonu */}
      <View
        style={{
          width: 44, height: 44, borderRadius: 22,
          backgroundColor: '#FFFFFF',
          alignItems: 'center', justifyContent: 'center',
          ...(Platform.OS === 'web'
            ? ({ boxShadow: '0 4px 10px rgba(0,0,0,0.14)' } as any)
            : {
                shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 7,
                shadowOffset: { width: 0, height: 3 }, elevation: 4,
              }),
        }}
      >
        {busy
          ? <ActivityIndicator size="small" color={accentColor} />
          : <ScanFace size={22} color={accentColor} strokeWidth={2.4} />}
      </View>

      <Text
        numberOfLines={1}
        style={{
          fontSize: 12, fontWeight: '600', color: '#FFFFFF',
          textAlign: 'center', letterSpacing: -0.2,
        }}
      >
        {busy ? 'Taranıyor…' : 'Yüz Tara'}
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
  onSelect:    (order: WorkOrder) => void;
  onClose:     () => void;
  /** Modal TAM kapandığında (iOS) — bekleyen taramayı başlatmak için */
  onDismiss?:  () => void;
}

function OrderPickerModal({ visible, orders, loading, accentColor, mode, setMode, frontAvailable, onSelect, onClose, onDismiss }: PickerProps) {
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} onDismiss={onDismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: '#FFFFFF',
          borderTopStartRadius: 24, borderTopEndRadius: 24,
          paddingTop: 16, paddingBottom: 24, paddingHorizontal: 16,
          maxHeight: '85%',
        }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A', flex: 1 }}>
              3D Tarama için sipariş seç
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <X size={20} color="#6B6B6B" strokeWidth={1.8} />
            </Pressable>
          </View>

          {/* Mod seçimi — Rehberli (arka, yüksek kalite) / Ön (hızlı) */}
          {frontAvailable && (
            <View style={{
              flexDirection: 'row', gap: 6, padding: 4, marginBottom: 12,
              backgroundColor: '#F1F1F1', borderRadius: 12,
            }}>
              {([
                { key: 'rearGuided' as ScanMode, label: 'Rehberli', hint: 'Yüksek kalite' },
                { key: 'front' as ScanMode,      label: 'Ön',       hint: 'Hızlı' },
              ]).map(opt => {
                const active = mode === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setMode(opt.key)}
                    style={{
                      flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 9,
                      backgroundColor: active ? '#FFFFFF' : 'transparent',
                      ...(active && Platform.OS === 'web' ? { boxShadow: '0 1px 3px rgba(0,0,0,0.08)' } as any : {}),
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: active ? '#0A0A0A' : '#6B6B6B' }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 10, color: active ? accentColor : '#9A9A9A', marginTop: 1 }}>
                      {opt.hint}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Search */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#F5F5F5', borderRadius: 12,
            paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12,
          }}>
            <Search size={14} color="#9A9A9A" strokeWidth={1.8} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Sipariş no, hasta adı, hekim…"
              placeholderTextColor="#9A9A9A"
              style={{ flex: 1, fontSize: 14, color: '#0A0A0A', padding: 0 }}
            />
          </View>

          {/* List */}
          {loading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={accentColor} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: '#9A9A9A' }}>
                {query ? 'Eşleşen sipariş bulunamadı' : 'Aktif sipariş yok'}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 400 }}>
              {filtered.map(order => (
                <Pressable
                  key={order.id}
                  onPress={() => onSelect(order)}
                  style={({ pressed }) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingVertical: 12, paddingHorizontal: 8,
                    borderRadius: 10,
                    backgroundColor: pressed ? '#F5F5F5' : 'transparent',
                  })}
                >
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: statusColor(order.status),
                  }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>
                        {order.order_number}
                      </Text>
                      {order.patient_name && (
                        <Text style={{ fontSize: 12, color: '#6B6B6B' }} numberOfLines={1}>
                          · {order.patient_name}
                        </Text>
                      )}
                    </View>
                    <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 2 }} numberOfLines={1}>
                      {order.doctor?.full_name ?? '—'} · {statusLabel(order.status)}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )}
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



