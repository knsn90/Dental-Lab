import { localeTag } from '../../core/i18n';
/**
 * CancelRequestsPanel — admin + mesul müdür için bekleyen sipariş iptal talepleri.
 * Onayla → yumuşak iptal (work_orders.status='iptal'); Reddet → talep reddedilir.
 * AdminApprovalsScreen içinde bir sekme/bölüm olarak kullanılır.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Ban, Check, X, Clock, User } from 'lucide-react-native';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { useAuthStore } from '../../core/store/authStore';
import { toast } from '../../core/ui/Toast';
import {
  fetchPendingCancelRequests, approveCancelRequest, rejectCancelRequest,
  cancelReasonLabel, type CancelRequest,
} from '../orders/cancellation';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function CancelRequestsPanel() {
  const theme = usePanelTheme();
  const profile = useAuthStore((s) => s.profile);
  const [items, setItems] = useState<CancelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchPendingCancelRequests()); }
    catch (e: any) { toast.error('Talepler yüklenemedi: ' + (e?.message ?? '')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (req: CancelRequest, approve: boolean) => {
    if (!profile?.id) return;
    setBusyId(req.id);
    const { error } = approve
      ? await approveCancelRequest(req, profile.id)
      : await rejectCancelRequest(req, profile.id);
    setBusyId(null);
    if (error) { toast.error('İşlem başarısız: ' + ((error as any).message ?? '')); return; }
    toast.success(approve ? 'Sipariş iptal edildi.' : 'Talep reddedildi.');
    setItems((prev) => prev.filter((r) => r.id !== req.id));
  };

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={theme.primary} /></View>;
  }

  if (items.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(theme.accent, 0.06) }}>
          <Ban size={24} color={hexA(theme.accent, 0.4)} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: hexA(theme.accent, 0.6) }}>Bekleyen iptal talebi yok</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {items.map((req) => {
        const ono = req.work_order?.order_number;
        const busy = busyId === req.id;
        return (
          <View key={req.id} style={{ borderRadius: 18, borderWidth: 1, borderColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA('#D94B4B', 0.12) }}>
                <Ban size={17} color="#D94B4B" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.accent }}>
                  Sipariş #{ono ?? '—'} · İptal talebi
                </Text>
                <Text style={{ fontSize: 12, color: hexA(theme.accent, 0.55), flexDirection: 'row' }}>
                  {req.requester_name ?? 'Klinik/Hekim'} · {new Date(req.created_at).toLocaleDateString(localeTag())}
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 11, gap: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: hexA(theme.accent, 0.5), textTransform: 'uppercase', letterSpacing: 0.4 }}>Sebep</Text>
              <Text style={{ fontSize: 13.5, fontWeight: '600', color: theme.accent }}>{cancelReasonLabel(req.reason_code)}</Text>
              {!!req.reason_detail && (
                <Text style={{ fontSize: 13, color: hexA(theme.accent, 0.7), lineHeight: 18, marginTop: 2 }}>{req.reason_detail}</Text>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Pressable
                onPress={() => decide(req, false)}
                disabled={busy}
                style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: hexA(theme.accent, 0.18), ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}) }}
              >
                <X size={15} color={hexA(theme.accent, 0.7)} strokeWidth={2.2} />
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: hexA(theme.accent, 0.7) }}>Reddet</Text>
              </Pressable>
              <Pressable
                onPress={() => decide(req, true)}
                disabled={busy}
                style={{ flex: 1.3, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: busy ? hexA('#D94B4B', 0.5) : '#D94B4B', ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}) }}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Check size={15} color="#fff" strokeWidth={2.4} />}
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Onayla & İptal Et</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
