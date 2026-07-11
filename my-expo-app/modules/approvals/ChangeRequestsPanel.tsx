/**
 * ChangeRequestsPanel — admin + mesul müdür için bekleyen sipariş DEĞİŞİKLİK talepleri.
 * Onayla → önerilen değişiklikler siparişe uygulanır; Reddet → talep reddedilir.
 * AdminApprovalsScreen içinde bir sekme olarak kullanılır.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Pencil, Check, X } from 'lucide-react-native';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { toast } from '../../core/ui/Toast';
import {
  fetchPendingChangeRequests, approveChangeRequest, rejectChangeRequest,
  summarizeChangeFields, summarizeChangeItems, type ChangeRequest,
} from '../orders/changeRequests';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function ChangeRequestsPanel() {
  const theme = usePanelTheme();
  const [items, setItems] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await fetchPendingChangeRequests()); }
    catch (e: any) { toast.error('Talepler yüklenemedi: ' + (e?.message ?? '')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (req: ChangeRequest, approve: boolean) => {
    setBusyId(req.id);
    const { error } = approve
      ? await approveChangeRequest(req.id)
      : await rejectChangeRequest(req.id);
    setBusyId(null);
    if (error) { toast.error('İşlem başarısız: ' + ((error as any).message ?? '')); return; }
    toast.success(approve ? 'Değişiklikler uygulandı.' : 'Talep reddedildi.');
    setItems((prev) => prev.filter((r) => r.id !== req.id));
  };

  if (loading) {
    return <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator color={theme.primary} /></View>;
  }

  if (items.length === 0) {
    return (
      <View style={{ padding: 40, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(theme.accent, 0.06) }}>
          <Pencil size={22} color={hexA(theme.accent, 0.4)} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 14, fontWeight: '600', color: hexA(theme.accent, 0.6) }}>Bekleyen değişiklik talebi yok</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {items.map((req) => {
        const ono = req.work_order?.order_number;
        const busy = busyId === req.id;
        const fieldRows = summarizeChangeFields(req.proposed_fields);
        const itemLines = summarizeChangeItems(req.proposed_items);
        return (
          <View key={req.id} style={{ borderRadius: 18, borderWidth: 1, borderColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface, padding: 14, gap: 10, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(theme.primary, 0.12) }}>
                <Pencil size={16} color={theme.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '800', color: theme.accent }}>
                  Sipariş #{ono ?? '—'} · Değişiklik talebi
                </Text>
                <Text style={{ fontSize: 12, color: hexA(theme.accent, 0.55) }}>
                  {req.requester_name ?? 'Klinik/Hekim'} · {new Date(req.created_at).toLocaleDateString('tr-TR')}
                </Text>
              </View>
            </View>

            <View style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 11, gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: hexA(theme.accent, 0.5), textTransform: 'uppercase', letterSpacing: 0.4 }}>Önerilen değişiklikler</Text>
              {fieldRows.map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: hexA(theme.accent, 0.5), width: 96 }}>{r.label}</Text>
                  <Text style={{ fontSize: 12.5, color: theme.accent, flex: 1 }}>{r.value}</Text>
                </View>
              ))}
              {itemLines.length > 0 && (
                <View style={{ gap: 3, marginTop: 2 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: hexA(theme.accent, 0.5) }}>İş kalemleri</Text>
                  {itemLines.map((l, i) => (
                    <Text key={i} style={{ fontSize: 12.5, color: theme.accent }}>• {l}</Text>
                  ))}
                </View>
              )}
              {!!req.note && (
                <Text style={{ fontSize: 12.5, color: hexA(theme.accent, 0.7), lineHeight: 17, marginTop: 2 }}>“{req.note}”</Text>
              )}
              {fieldRows.length === 0 && itemLines.length === 0 && (
                <Text style={{ fontSize: 12.5, color: hexA(theme.accent, 0.5) }}>Ayrıntı yok.</Text>
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
                style={{ flex: 1.3, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, backgroundColor: busy ? hexA(theme.primary, 0.5) : theme.primary, ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}) }}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Check size={15} color="#fff" strokeWidth={2.4} />}
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#fff' }}>Onayla & Uygula</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
