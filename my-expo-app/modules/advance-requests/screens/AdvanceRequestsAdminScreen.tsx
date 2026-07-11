import { localeTag } from '../../../core/i18n';
// modules/advance-requests/screens/AdvanceRequestsAdminScreen.tsx
// Admin — avans taleplerini listeler, onaylar/reddeder.
// Onaylanınca employee_advances defterine kayıt düşer (api.approveAdvanceRequest).

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, Check, X, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import {
  fetchPendingAdvanceRequests, fetchAllAdvanceRequests,
  approveAdvanceRequest, rejectAdvanceRequest,
  ADVANCE_STATUS_CFG, type AdvanceRequestWithEmployee, type AdvanceStatus,
} from '../api';

const fmtTL = (n: number) => `₺${(n ?? 0).toLocaleString('tr-TR')}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const STATUS_ICON: Record<AdvanceStatus, any> = { bekliyor: Clock, onaylandi: CheckCircle2, reddedildi: XCircle, iptal: Ban };

export function AdvanceRequestsAdminScreen() {
  const insets = useSafeAreaInsets();
  const theme = usePanelTheme();
  const T = useMobileTokens() as any;
  const A = theme.primary;
  const { profile } = useAuthStore() as any;
  const PAGE = T.bg ?? '#F5F1EB';

  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [items, setItems] = useState<AdvanceRequestWithEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectFor, setRejectFor] = useState<AdvanceRequestWithEmployee | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = tab === 'pending' ? await fetchPendingAdvanceRequests() : await fetchAllAdvanceRequests();
    setItems((data as AdvanceRequestWithEmployee[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [tab]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const onApprove = async (req: AdvanceRequestWithEmployee) => {
    if (!profile?.id) return;
    setBusyId(req.id);
    const { error } = await approveAdvanceRequest(req, profile.id);
    setBusyId(null);
    if (error) { toast.error('Onaylanamadı: ' + ((error as any)?.message ?? '')); return; }
    toast.success('Avans onaylandı ve deftere işlendi');
    load();
  };

  const onReject = async (reason: string) => {
    if (!rejectFor || !profile?.id) return;
    const { error } = await rejectAdvanceRequest(rejectFor.id, reason, profile.id);
    if (error) { toast.error('Reddedilemedi'); return; }
    toast.success('Talep reddedildi');
    setRejectFor(null);
    load();
  };

  const Tab = ({ k, label }: { k: 'pending' | 'all'; label: string }) => {
    const on = tab === k;
    return (
      <Pressable onPress={() => setTab(k)} style={({ pressed }: any) => ({
        paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
        backgroundColor: on ? A : 'transparent', borderWidth: 1, borderColor: on ? A : T.hairline,
        opacity: pressed ? 0.8 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}>
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#FFF' : T.ink2 }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: PAGE }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, maxWidth: 880, width: '100%', alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={A} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: `${A}1F` }}>
            <Wallet size={19} color={A} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '700', color: T.ink, letterSpacing: -0.3 }}>Avans Talepleri</Text>
            <Text style={{ fontSize: 11.5, color: T.ink3 }}>Personel avans taleplerini onayla / reddet</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <Tab k="pending" label="Bekleyenler" />
          <Tab k="all" label="Tümü" />
        </View>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={A} /></View>
        ) : items.length === 0 ? (
          <View style={{ paddingVertical: 36, alignItems: 'center', gap: 8 }}>
            <Wallet size={28} color={T.ink3} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{tab === 'pending' ? 'Bekleyen talep yok' : 'Talep yok'}</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map(it => {
              const cfg = ADVANCE_STATUS_CFG[it.status];
              const SIcon = STATUS_ICON[it.status];
              return (
                <View key={it.id} style={{ backgroundColor: T.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.hairline }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: T.ink }} numberOfLines={1}>{it.employees?.full_name ?? 'Personel'}</Text>
                      <Text style={{ fontSize: 11, color: T.ink3 }}>{it.employees?.role ?? ''} · {fmtDate(it.created_at)}</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: T.ink, letterSpacing: -0.3 }}>{fmtTL(Number(it.amount))}</Text>
                  </View>
                  {!!it.reason && <Text style={{ fontSize: 12.5, color: T.ink2, marginTop: 6 }} numberOfLines={3}>{it.reason}</Text>}

                  {it.status === 'bekliyor' ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <Pressable disabled={busyId === it.id} onPress={() => setRejectFor(it)} style={({ pressed }: any) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11, backgroundColor: 'rgba(217,75,75,0.10)', opacity: pressed ? 0.8 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                        <X size={15} color="#D94B4B" strokeWidth={2.4} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#D94B4B' }}>Reddet</Text>
                      </Pressable>
                      <Pressable disabled={busyId === it.id} onPress={() => onApprove(it)} style={({ pressed }: any) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 11, backgroundColor: '#2D9A6B', opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                        <Check size={15} color="#FFF" strokeWidth={2.6} />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{busyId === it.id ? '…' : 'Onayla'}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: cfg.bg }}>
                        <SIcon size={12} color={cfg.fg} strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.fg }}>{cfg.label}</Text>
                      </View>
                      {it.status === 'reddedildi' && !!it.reject_reason && (
                        <Text style={{ fontSize: 11.5, color: '#D94B4B', flex: 1 }} numberOfLines={1}>{it.reject_reason}</Text>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Red modalı */}
      <RejectModal visible={!!rejectFor} onClose={() => setRejectFor(null)} onSubmit={onReject} accent={A} T={T} />
    </View>
  );
}

function RejectModal({ visible, onClose, onSubmit, accent, T }: {
  visible: boolean; onClose: () => void; onSubmit: (reason: string) => void; accent: string; T: any;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (visible) setReason(''); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()} style={{ width: '100%', maxWidth: 360, backgroundColor: T.card, borderRadius: 20, padding: 20, gap: 14, ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any : {}) }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: T.ink }}>Talebi reddet</Text>
          <TextInput
            value={reason} onChangeText={setReason} multiline placeholder="Red sebebi (opsiyonel)…" placeholderTextColor={T.ink3}
            style={{ borderWidth: 1, borderColor: T.hairline, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: T.ink, backgroundColor: T.cardSoft, minHeight: 70, textAlignVertical: 'top' }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} style={({ pressed }: any) => ({ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, opacity: pressed ? 0.7 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }}>Vazgeç</Text>
            </Pressable>
            <Pressable onPress={() => onSubmit(reason.trim())} style={({ pressed }: any) => ({ flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: '#D94B4B', opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>Reddet</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
