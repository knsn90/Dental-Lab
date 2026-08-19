import { localeTag } from '../../../core/i18n';
// modules/advance-requests/screens/TechAdvanceRequestsScreen.tsx
// Teknisyen — kendi avans taleplerini görür ve yeni talep oluşturur.
// employee_id, profile.employee_id'den çözülür. Bağ yoksa nazik boş durum.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Wallet, Plus, X, Clock, CheckCircle2, XCircle, Ban } from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { resolveMyEmployeeId } from '../../../core/api/resolveEmployee';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import {
  fetchMyAdvanceRequests, createAdvanceRequest, cancelAdvanceRequest,
  ADVANCE_STATUS_CFG, type AdvanceRequest, type AdvanceStatus,
} from '../api';

const fmtTL = (n: number) => `₺${(n ?? 0).toLocaleString('tr-TR')}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_ICON: Record<AdvanceStatus, any> = {
  bekliyor: Clock, onaylandi: CheckCircle2, reddedildi: XCircle, iptal: Ban,
};

const DISPLAY = {
  fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light',
  fontWeight: '300' as const,
};

export function TechAdvanceRequestsScreen() {
  const P = useStationTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore() as any;
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  const [items, setItems] = useState<AdvanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Çalışan kaydını çöz (profiles.employee_id yok → e-posta/isim eşleşmesi)
  useEffect(() => {
    let alive = true;
    setResolving(true);
    resolveMyEmployeeId(profile).then(id => { if (alive) { setEmployeeId(id); setResolving(false); } });
    return () => { alive = false; };
  }, [profile?.id]);

  const load = useCallback(async () => {
    if (!employeeId) { setLoading(false); return; }
    const { data } = await fetchMyAdvanceRequests(employeeId);
    setItems((data as AdvanceRequest[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [employeeId]);

  useEffect(() => { if (employeeId) load(); }, [load, employeeId]);

  const pendingCount  = items.filter(i => i.status === 'bekliyor').length;
  const approvedCount = items.filter(i => i.status === 'onaylandi').length;
  const approvedSum   = items.filter(i => i.status === 'onaylandi').reduce((s, i) => s + Number(i.amount), 0);

  const onCancel = async (id: string) => {
    const { error } = await cancelAdvanceRequest(id);
    if (error) { toast.error('İptal edilemedi'); return; }
    toast.success('Talep iptal edildi');
    load();
  };

  // ── Personel kaydı yoksa (çözüm tamamlandıktan sonra) ──
  if (!resolving && !employeeId) {
    return (
      <View style={{ flex: 1, backgroundColor: P.pageBg, paddingTop: insets.top + 24, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(P.accent, 0.12) }}>
          <Wallet size={26} color={P.accent} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900 }}>Personel kaydı bulunamadı</Text>
        <Text style={{ fontSize: 12.5, color: P.ink500, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
          Avans talebi oluşturmak için hesabınızın bir personel kaydına bağlı olması gerekir. Lütfen yöneticinize başvurun.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: P.pageBg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={P.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ Hero — F1c HeroCompact (full-bleed accent + dekor + mini-stat) ═══ */}
        <View style={{
          borderRadius: 22, backgroundColor: P.accent, padding: 20, marginBottom: 14,
          position: 'relative', overflow: 'hidden',
          ...(Platform.OS === 'web' ? { boxShadow: `0 10px 28px ${hexA(P.accent, 0.32)}` } as any : {}),
        }}>
          {/* Dekoratif daireler + ince gradient yıkama (katmanlı derinlik) */}
          <View pointerEvents="none" style={{ position: 'absolute', top: -46, end: -42, width: 168, height: 168, borderRadius: 84, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -54, start: -24, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.07)' }} />
          {Platform.OS === 'web' && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: `radial-gradient(120% 80% at 85% 0%, ${hexA(P.accentDeep, 0.55)}, transparent 60%)` } as any} />
          )}

          {/* Üst satır — kicker + büyük değer (sağ-üst yüzen aksiyon barıyla çakışmasın diye ikon yok) */}
          <View style={{ zIndex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <Wallet size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                Avans Talebi
              </Text>
            </View>
            <Text style={{ ...DISPLAY, fontSize: 36, color: '#FFFFFF', letterSpacing: -1.2, lineHeight: 40 }} numberOfLines={1}>
              {fmtTL(approvedSum)}
            </Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.74)', marginTop: 4 }}>
              Onaylanan toplam{pendingCount > 0 ? ` · ${pendingCount} bekleyen talep` : ''}
            </Text>
          </View>

          {/* Mini-stat şeridi */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, zIndex: 1 }}>
            {[
              { label: 'Bekleyen',  value: String(pendingCount) },
              { label: 'Onaylanan', value: String(approvedCount) },
              { label: 'Toplam',    value: String(items.length) },
            ].map(s => (
              <View key={s.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)', marginBottom: 4 }}>{s.label}</Text>
                <Text style={{ ...DISPLAY, fontSize: 18, color: '#FFFFFF', letterSpacing: -0.4, lineHeight: 22 }}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Yeni talep — koyu denim CTA (F2 dark CTA), accent hero ile kontrast */}
        <Pressable
          onPress={() => setModalOpen(true)}
          style={({ pressed }: any) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            backgroundColor: P.ctaBg, borderRadius: 999, paddingVertical: 14, marginBottom: 16,
            opacity: pressed ? 0.9 : 1,
            ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: `0 6px 18px ${hexA(P.ctaBg, 0.28)}` } as any : {}),
          })}
        >
          <Plus size={17} color={P.ctaInk} strokeWidth={2.6} />
          <Text style={{ fontSize: 14, fontWeight: '700', color: P.ctaInk, letterSpacing: -0.1 }}>Yeni Avans Talebi</Text>
        </Pressable>

        {/* Liste */}
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={P.accent} /></View>
        ) : items.length === 0 ? (
          <View style={{ paddingVertical: 44, paddingHorizontal: 24, alignItems: 'center', gap: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(P.accent, 0.10), borderWidth: 1, borderColor: hexA(P.accent, 0.18) }}>
              <Wallet size={28} color={P.accent} strokeWidth={1.6} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 19, color: P.ink900, letterSpacing: -0.3 }}>Henüz talebin yok</Text>
            <Text style={{ fontSize: 12.5, color: P.ink500, textAlign: 'center', lineHeight: 18, maxWidth: 260 }}>
              İlk avans talebini oluştur; durumunu buradan takip edersin.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map(it => {
              const cfg = ADVANCE_STATUS_CFG[it.status];
              const SIcon = STATUS_ICON[it.status];
              return (
                <View key={it.id} style={{ backgroundColor: P.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: P.ink100 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: P.ink900, letterSpacing: -0.3 }}>{fmtTL(Number(it.amount))}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: cfg.bg }}>
                      <SIcon size={12} color={cfg.fg} strokeWidth={2} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.fg }}>{cfg.label}</Text>
                    </View>
                  </View>
                  {!!it.reason && <Text style={{ fontSize: 12.5, color: P.ink700, marginTop: 6 }} numberOfLines={2}>{it.reason}</Text>}
                  {it.status === 'reddedildi' && !!it.reject_reason && (
                    <Text style={{ fontSize: 11.5, color: P.danger, marginTop: 4 }} numberOfLines={2}>Red sebebi: {it.reject_reason}</Text>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <Text style={{ fontSize: 10.5, color: P.ink400 }}>{fmtDate(it.created_at)}</Text>
                    {it.status === 'bekliyor' && (
                      <Pressable onPress={() => onCancel(it.id)} style={({ pressed }: any) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: pressed ? hexA(P.danger, 0.18) : hexA(P.danger, 0.10), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: P.danger }}>İptal et</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <NewAdvanceModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={async (amount, reason) => {
          if (!employeeId) return;
          const { error } = await createAdvanceRequest({ employee_id: employeeId, amount, reason });
          if (error) { toast.error('Talep oluşturulamadı'); return; }
          toast.success('Avans talebin alındı');
          setModalOpen(false);
          load();
        }}
      />
    </View>
  );
}

function NewAdvanceModal({ visible, onClose, onSubmit }: {
  visible: boolean; onClose: () => void; onSubmit: (amount: number, reason: string) => void;
}) {
  const P = useStationTheme();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setAmount(''); setReason(''); setBusy(false); } }, [visible]);

  const num = Number(amount.replace(',', '.'));
  const valid = num > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()} style={{ width: '100%', maxWidth: 380, backgroundColor: P.surface, borderRadius: 20, padding: 20, gap: 14, ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any : {}) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink900 }}>Yeni Avans Talebi</Text>
            <Pressable onPress={onClose} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><X size={20} color={P.ink400} /></Pressable>
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>Tutar (₺)</Text>
            <TextInput
              value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="Örn. 5000" placeholderTextColor={P.ink400}
              style={{ borderWidth: 1, borderColor: P.ink100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, fontWeight: '700', color: P.ink900, backgroundColor: P.surfaceAlt }}
            />
          </View>
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>Açıklama (opsiyonel)</Text>
            <TextInput
              value={reason} onChangeText={setReason} multiline placeholder="Talep nedeni…" placeholderTextColor={P.ink400}
              style={{ borderWidth: 1, borderColor: P.ink100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: P.ink900, backgroundColor: P.surfaceAlt, minHeight: 70, textAlignVertical: 'top' }}
            />
          </View>
          <Pressable
            disabled={!valid || busy}
            onPress={async () => { setBusy(true); await onSubmit(num, reason.trim()); setBusy(false); }}
            style={({ pressed }: any) => ({ paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: valid && !busy ? P.accent : P.ink100, opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' && valid ? { cursor: 'pointer' } as any : {}) })}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: valid && !busy ? '#FFF' : P.ink400 }}>{busy ? 'Gönderiliyor…' : 'Talep Gönder'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
