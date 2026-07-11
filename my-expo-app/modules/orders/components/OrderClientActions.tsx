/**
 * OrderClientActions — Hekim/Klinik sipariş detayı aksiyonları: Düzenle + İptal et.
 *
 * Kural (planlama kapısı = work_orders.triaged_at):
 *   • Planlama ÖNCESİ (triaged_at IS NULL): "Düzenle" (tüm form) + "İptal et" (direkt).
 *   • Planlama SONRASI: iptal yok; düzenleme → "Değişiklik iste" (lab onaylı talep).
 *   • Sipariş 'iptal' ise → "İptal edildi" rozeti.
 *
 * Stil: sipariş detayındaki PillBtn dilini izler (nötr rounded-full pill; koyu=primary,
 * beyaz=surface). Yalnızca klinik/hekim panelinde ('(clinic)' | '(doctor)') görünür.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, Alert } from 'react-native';
import { Ban, Pencil, Clock, Check } from 'lucide-react-native';
import { toast } from '../../../core/ui/Toast';
import { cancelOrderClient, isOrderPrePlanning } from '../api';
import { fetchChangeRequestForOrder, type ChangeRequest } from '../changeRequests';
import { OrderEditSheet } from './OrderEditSheet';
import type { WorkOrder } from '../types';

const INK = '#0A0A0A';
const INK_200 = '#EAEAEA';
const DANGER = '#D94B4B';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

function confirmCancel(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' ? window.confirm('Bu siparişi iptal etmek istediğine emin misin?') : true);
  }
  return new Promise((resolve) => {
    Alert.alert('Siparişi iptal et', 'Bu siparişi iptal etmek istediğine emin misin?', [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: 'İptal et', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

// ── PillBtn (OrderDetailScreenV2) ile aynı görünüm ──
function Pill({
  onPress, icon: Icon, label, tone, compact, busy, onDark = false,
}: {
  onPress: () => void; icon: any; label: string;
  tone: 'primary' | 'surface' | 'danger'; compact?: boolean; busy?: boolean; onDark?: boolean;
}) {
  const padV = compact ? 6 : 9;
  const padH = compact ? 12 : 16;
  const textSize = compact ? 12 : 13.5;
  const iconSize = compact ? 14 : 16;
  // onDark (yeşil hero): primary → beyaz pill + yeşil metin, surface → şeffaf-beyaz outline, danger → beyaz + kırmızı
  const bg = onDark
    ? (tone === 'surface' ? 'rgba(255,255,255,0.15)' : '#FFFFFF')
    : (tone === 'primary' ? INK : '#FFFFFF');
  const border = onDark
    ? (tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? hexA(DANGER, 0.5) : 'rgba(255,255,255,0.45)')
    : (tone === 'primary' ? INK : tone === 'danger' ? hexA(DANGER, 0.35) : INK_200);
  const fg = onDark
    ? (tone === 'primary' ? '#0C8F56' : tone === 'danger' ? DANGER : '#FFFFFF')
    : (tone === 'primary' ? '#FFFFFF' : tone === 'danger' ? DANGER : INK);
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingVertical: padV, paddingHorizontal: padH, borderRadius: 999, borderWidth: 1,
        backgroundColor: bg, borderColor: border, opacity: busy ? 0.6 : hovered ? 0.88 : 1,
        ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer', transition: 'opacity 0.15s ease' } as any) : {}),
      })}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Icon size={iconSize} color={fg} strokeWidth={1.8} />}
      <Text style={{ fontSize: textSize, fontWeight: '500', color: fg }}>{label}</Text>
    </Pressable>
  );
}

// ── Durum rozeti (satırdaki mevcut tinted chip'lerle aynı dil) ──
function StatusChip({ color, icon: Icon, label, compact, onDark = false }: { color: string; icon: any; label: string; compact?: boolean; onDark?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: compact ? 5 : 7, paddingHorizontal: compact ? 11 : 12, borderRadius: 999, backgroundColor: onDark ? 'rgba(255,255,255,0.9)' : hexA(color, 0.12), alignSelf: 'flex-start' }}>
      <Icon size={compact ? 12 : 14} color={color} strokeWidth={2.2} />
      <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '600', color }}>{label}</Text>
    </View>
  );
}

export function OrderClientActions({
  order, panelGroup, compact, onChanged, onDark = false,
}: {
  order: WorkOrder | null;
  panelGroup?: string;
  compact?: boolean;
  onChanged?: () => void;
  /** Renkli/koyu zemin (yeşil hero) üstünde buton/rozet renklerini beyaza uyarlar. */
  onDark?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [changeReq, setChangeReq] = useState<ChangeRequest | null>(null);

  const isClinicOrDoctor = panelGroup === '(clinic)' || panelGroup === '(doctor)';
  const status = String(order?.status ?? '');
  const cancelled = status === 'iptal';
  const prePlanning = isOrderPrePlanning(order);

  const loadChangeReq = useCallback(async () => {
    if (!order?.id || !isClinicOrDoctor || prePlanning) { setChangeReq(null); return; }
    setChangeReq(await fetchChangeRequestForOrder(order.id));
  }, [order?.id, isClinicOrDoctor, prePlanning]);
  useEffect(() => { loadChangeReq(); }, [loadChangeReq]);

  if (!order || !isClinicOrDoctor) return null;

  if (cancelled) {
    return <StatusChip color={DANGER} icon={Ban} label="İptal edildi" compact={compact} onDark={onDark} />;
  }

  const doCancel = async () => {
    if (busy) return;
    if (!(await confirmCancel())) return;
    setBusy(true);
    const { error } = await cancelOrderClient(order.id);
    setBusy(false);
    if (error) { toast.error(`İptal edilemedi: ${error.message ?? 'hata'}`); return; }
    toast.success('Sipariş iptal edildi.');
    onChanged?.();
  };

  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {prePlanning ? (
          <>
            <Pill onPress={() => setEditOpen(true)} icon={Pencil} label="Düzenle" tone="primary" compact={compact} onDark={onDark} />
            <Pill onPress={doCancel} icon={Ban} label="İptal et" tone="danger" compact={compact} busy={busy} onDark={onDark} />
          </>
        ) : changeReq?.status === 'pending' ? (
          <StatusChip color="#B7791F" icon={Clock} label="Değişiklik talebi · onay bekliyor" compact={compact} onDark={onDark} />
        ) : (
          <>
            {changeReq?.status === 'approved' && (
              <StatusChip color="#2D9A6B" icon={Check} label="Değişiklik onaylandı" compact={compact} onDark={onDark} />
            )}
            <Pill onPress={() => setEditOpen(true)} icon={Pencil} label="Değişiklik iste" tone="surface" compact={compact} onDark={onDark} />
          </>
        )}
      </View>

      <OrderEditSheet visible={editOpen} onClose={() => setEditOpen(false)} order={order} onSaved={() => { onChanged?.(); loadChangeReq(); }} />
    </>
  );
}
