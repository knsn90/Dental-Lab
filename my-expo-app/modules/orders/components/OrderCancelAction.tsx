/**
 * OrderCancelAction — klinik/hekim için "İptal Talebi" aksiyonu (buton + durum rozeti).
 * Kendi içinde çalışır: mevcut talebi sorgular, modalı açar, durumu gösterir.
 *
 * Görünürlük:
 *   - Yalnızca klinik/hekim panelinde (panelGroup '(clinic)' | '(doctor)')
 *   - Bekleyen talep varsa → "Onay bekliyor" rozeti
 *   - Yoksa ve sipariş 'alindi' (üretime girmemiş) ise → "İptal Talebi" butonu
 *   - Sipariş 'iptal' ise → "İptal edildi" rozeti
 *   - Diğer durumlarda → hiçbir şey (uygun değil)
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Ban, Clock, CheckCircle2 } from 'lucide-react-native';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { fetchCancelRequestForOrder, cancelReasonLabel, type CancelRequest } from '../cancellation';
import { CancelRequestModal } from './CancelRequestModal';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function OrderCancelAction({
  order, panelGroup, compact,
}: {
  order: { id: string; order_number?: number | string | null; lab_id?: string | null; status?: string | null } | null;
  panelGroup?: string;
  compact?: boolean; // liste kartı için küçük varyant
}) {
  const theme = usePanelTheme();
  const A = theme.primary;
  const [req, setReq] = useState<CancelRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const isClinicOrDoctor = panelGroup === '(clinic)' || panelGroup === '(doctor)';

  const load = useCallback(async () => {
    if (!order?.id || !isClinicOrDoctor) { setLoaded(true); return; }
    const r = await fetchCancelRequestForOrder(order.id);
    setReq(r);
    setLoaded(true);
  }, [order?.id, isClinicOrDoctor]);

  useEffect(() => { load(); }, [load]);

  if (!order || !isClinicOrDoctor) return null;

  const status = String(order.status ?? '');
  const pending = req?.status === 'pending';
  const cancelled = status === 'iptal' || req?.status === 'approved';

  // İptal edilmiş
  if (cancelled) {
    return (
      <Badge color="#D94B4B" icon={Ban} text="İptal edildi" compact={compact} />
    );
  }
  // Onay bekleyen talep
  if (pending) {
    return (
      <Badge color="#E89B2A" icon={Clock} text="İptal talebi: Onay bekliyor" sub={req?.reason_code ? cancelReasonLabel(req.reason_code) : undefined} compact={compact} />
    );
  }
  // Reddedilmiş → tekrar talep edilebilir (uygunsa)
  const eligible = status === 'alindi';
  if (!eligible && req?.status !== 'rejected') return null;
  if (!eligible) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
          paddingVertical: compact ? 8 : 12, paddingHorizontal: 14, borderRadius: compact ? 12 : 14,
          borderWidth: 1, borderColor: hexA('#D94B4B', hovered ? 0.5 : 0.3),
          backgroundColor: hexA('#D94B4B', hovered ? 0.1 : 0.06),
          ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'background-color 0.15s ease' } as any) : {}),
        })}
      >
        <Ban size={compact ? 14 : 16} color="#D94B4B" strokeWidth={2} />
        <Text style={{ fontSize: compact ? 12.5 : 14, fontWeight: '700', color: '#D94B4B' }}>İptal Talebi</Text>
      </Pressable>

      <CancelRequestModal
        visible={open}
        onClose={() => setOpen(false)}
        order={order}
        onDone={load}
      />
    </>
  );
}

function Badge({ color, icon: Icon, text, sub, compact }: { color: string; icon: any; text: string; sub?: string; compact?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: compact ? 6 : 9, paddingHorizontal: 12, borderRadius: compact ? 10 : 12, backgroundColor: hexA(color, 0.1), alignSelf: 'flex-start' }}>
      <Icon size={compact ? 13 : 15} color={color} strokeWidth={2} />
      <Text style={{ fontSize: compact ? 12 : 13, fontWeight: '700', color }}>{text}</Text>
      {!!sub && <Text style={{ fontSize: compact ? 11 : 12, color: hexA(color, 0.8) }}>· {sub}</Text>}
    </View>
  );
}
