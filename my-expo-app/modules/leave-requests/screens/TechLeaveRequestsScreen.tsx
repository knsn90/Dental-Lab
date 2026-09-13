import { localeTag } from '../../../core/i18n';
// modules/leave-requests/screens/TechLeaveRequestsScreen.tsx
// Teknisyen — kendi izin taleplerini görür ve yeni talep oluşturur.
// Mevcut employee_leaves tablosu + hr/api (fetchLeaves/createLeave/cancelLeave) yeniden kullanılır.
// Admin onayı mevcut İK ekranında yapılır.

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, Plus, X, Clock, CheckCircle2, XCircle, Ban } from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { resolveMyEmployeeId } from '../../../core/api/resolveEmployee';
import { useStationTheme, hexA } from '../../../core/theme/stationPalette';
import { DatePicker } from '../../../core/ui/DatePicker';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { toast } from '../../../core/ui/Toast';
import {
  fetchLeaves, createLeave, cancelLeave, calcBusinessDays,
  LEAVE_TYPE_LABELS, LEAVE_STATUS_CFG,
  type EmployeeLeave, type LeaveType, type LeaveStatus,
} from '../../hr/api';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + 'T00:00:00').toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_ICON: Record<LeaveStatus, any> = {
  bekliyor: Clock, onaylandi: CheckCircle2, reddedildi: XCircle, iptal: Ban,
};
const LEAVE_TYPES: LeaveType[] = ['yillik', 'mazeret', 'hastalik', 'ucretsiz', 'dogum', 'olum', 'evlilik'];

const DISPLAY = {
  fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light',
  fontWeight: '300' as const,
};

// İK ekranı ile aynı hesap: iş günü (hafta sonu hariç) — calcBusinessDays.
const daysBetween = (start: string, end: string) => {
  const a = new Date(start + 'T00:00:00').getTime();
  const b = new Date(end + 'T00:00:00').getTime();
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  return calcBusinessDays(start, end);
};

export function TechLeaveRequestsScreen() {
  const P = useStationTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore() as any;
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);

  const [items, setItems] = useState<EmployeeLeave[]>([]);
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
    const { data } = await fetchLeaves(employeeId);
    setItems((data as EmployeeLeave[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [employeeId]);

  useEffect(() => { if (employeeId) load(); }, [load, employeeId]);

  const pendingCount  = items.filter(i => i.status === 'bekliyor').length;
  const approvedCount = items.filter(i => i.status === 'onaylandi').length;
  const approvedDays  = items.filter(i => i.status === 'onaylandi').reduce((s, i) => s + Number(i.days_count ?? 0), 0);

  const onCancel = async (id: string) => {
    const { error } = await cancelLeave(id);
    if (error) { toast.error('İptal edilemedi'); return; }
    toast.success('Talep iptal edildi');
    load();
  };

  if (!resolving && !employeeId) {
    return (
      <View style={{ flex: 1, backgroundColor: P.pageBg, paddingTop: insets.top + 24, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(P.accent, 0.12) }}>
          <CalendarDays size={26} color={P.accent} strokeWidth={1.6} />
        </View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: P.ink900 }}>Personel kaydı bulunamadı</Text>
        <Text style={{ fontSize: 12.5, color: P.ink500, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>
          İzin talebi oluşturmak için hesabınızın bir personel kaydına bağlı olması gerekir. Lütfen yöneticinize başvurun.
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
          <View pointerEvents="none" style={{ position: 'absolute', top: -46, end: -42, width: 168, height: 168, borderRadius: 84, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: -54, start: -24, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(0,0,0,0.07)' }} />
          {Platform.OS === 'web' && (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: `radial-gradient(120% 80% at 85% 0%, ${hexA(P.accentDeep, 0.55)}, transparent 60%)` } as any} />
          )}

          <View style={{ zIndex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <CalendarDays size={13} color="rgba(255,255,255,0.85)" strokeWidth={2} />
              <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                İzin Talebi
              </Text>
            </View>
            <Text style={{ ...DISPLAY, fontSize: 36, color: '#FFFFFF', letterSpacing: -1.2, lineHeight: 40 }} numberOfLines={1}>
              {approvedDays} gün
            </Text>
            <Text style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.74)', marginTop: 4 }}>
              Onaylanan izin{pendingCount > 0 ? ` · ${pendingCount} bekleyen talep` : ''}
            </Text>
          </View>

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

        {/* Yeni talep — koyu denim CTA */}
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
          <Text style={{ fontSize: 14, fontWeight: '700', color: P.ctaInk, letterSpacing: -0.1 }}>Yeni İzin Talebi</Text>
        </Pressable>

        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={P.accent} /></View>
        ) : items.length === 0 ? (
          <View style={{ paddingVertical: 44, paddingHorizontal: 24, alignItems: 'center', gap: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(P.accent, 0.10), borderWidth: 1, borderColor: hexA(P.accent, 0.18) }}>
              <CalendarDays size={28} color={P.accent} strokeWidth={1.6} />
            </View>
            <Text style={{ ...DISPLAY, fontSize: 19, color: P.ink900, letterSpacing: -0.3 }}>Henüz talebin yok</Text>
            <Text style={{ fontSize: 12.5, color: P.ink500, textAlign: 'center', lineHeight: 18, maxWidth: 260 }}>
              İlk izin talebini oluştur; durumunu buradan takip edersin.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {items.map(it => {
              const cfg = LEAVE_STATUS_CFG[it.status];
              const SIcon = STATUS_ICON[it.status];
              return (
                <View key={it.id} style={{ backgroundColor: P.surface, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: P.ink100 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14.5, fontWeight: '700', color: P.ink900 }}>{LEAVE_TYPE_LABELS[it.leave_type]}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: cfg.bg }}>
                      <SIcon size={12} color={cfg.fg} strokeWidth={2} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: cfg.fg }}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12.5, color: P.ink700, marginTop: 6 }}>
                    {fmtDate(it.start_date)} → {fmtDate(it.end_date)} · {it.days_count} gün
                  </Text>
                  {!!it.reason && <Text style={{ fontSize: 12, color: P.ink500, marginTop: 4 }} numberOfLines={2}>{it.reason}</Text>}
                  {it.status === 'reddedildi' && !!it.reject_reason && (
                    <Text style={{ fontSize: 11.5, color: P.danger, marginTop: 4 }} numberOfLines={2}>Red sebebi: {it.reject_reason}</Text>
                  )}
                  {it.status === 'bekliyor' && (
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                      <Pressable onPress={() => onCancel(it.id)} style={({ pressed }: any) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: pressed ? hexA(P.danger, 0.18) : hexA(P.danger, 0.10), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) })}>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: P.danger }}>İptal et</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <NewLeaveModal
        visible={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={async (lt, start, end, reason) => {
          if (!employeeId) return;
          const days = daysBetween(start, end);
          const { error } = await createLeave({ employee_id: employeeId, leave_type: lt, start_date: start, end_date: end, days_count: days, reason });
          if (error) { toast.error('Talep oluşturulamadı'); return; }
          toast.success('İzin talebin alındı');
          setModalOpen(false);
          load();
        }}
      />
    </View>
  );
}

function NewLeaveModal({ visible, onClose, onSubmit }: {
  visible: boolean; onClose: () => void;
  onSubmit: (lt: LeaveType, start: string, end: string, reason: string) => void;
}) {
  const P = useStationTheme();
  const [lt, setLt] = useState<LeaveType>('yillik');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setLt('yillik'); setStart(''); setEnd(''); setReason(''); setBusy(false); } }, [visible]);

  const days = start && end ? daysBetween(start, end) : 0;
  const valid = !!start && !!end && days > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={(e: any) => e.stopPropagation?.()} style={{ width: '100%', maxWidth: 400, backgroundColor: P.surface, borderRadius: 20, padding: 20, gap: 14, ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.25)' } as any : {}) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: P.ink900 }}>Yeni İzin Talebi</Text>
            <Pressable onPress={onClose} style={{ ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}><X size={20} color={P.ink400} /></Pressable>
          </View>

          {/* İzin türü */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>İzin türü</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {LEAVE_TYPES.map(t => {
                const on = lt === t;
                return (
                  <Pressable key={t} onPress={() => setLt(t)} style={({ pressed }: any) => ({
                    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999,
                    backgroundColor: on ? P.accent : P.surfaceAlt,
                    borderWidth: 1, borderColor: on ? P.accent : P.ink100,
                    opacity: pressed ? 0.8 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  })}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: on ? '#FFF' : P.ink700 }}>{LEAVE_TYPE_LABELS[t]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Tarihler */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>Başlangıç</Text>
              <DatePicker value={start} onChange={setStart} accent={P.accent} placeholder="Tarih seç" compact />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>Bitiş</Text>
              <DatePicker value={end} onChange={setEnd} accent={P.accent} minDate={start || undefined} placeholder="Tarih seç" compact />
            </View>
          </View>
          {valid && <Text style={{ fontSize: 12, color: P.accentDeep, fontWeight: '600' }}>{days} gün</Text>}

          {/* Açıklama */}
          <View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: P.ink500, marginBottom: 6 }}>Açıklama (opsiyonel)</Text>
            <TextInput
              value={reason} onChangeText={setReason} multiline placeholder="İzin nedeni…" placeholderTextColor={P.ink400}
              style={{ borderWidth: 1, borderColor: P.ink100, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13.5, color: P.ink900, backgroundColor: P.surfaceAlt, minHeight: 60, textAlignVertical: 'top' }}
            />
          </View>

          <Pressable
            disabled={!valid || busy}
            onPress={async () => { setBusy(true); await onSubmit(lt, start, end, reason.trim()); setBusy(false); }}
            style={({ pressed }: any) => ({ paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: valid && !busy ? P.accent : P.ink100, opacity: pressed ? 0.85 : 1, ...(Platform.OS === 'web' && valid ? { cursor: 'pointer' } as any : {}) })}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: valid && !busy ? '#FFF' : P.ink400 }}>{busy ? 'Gönderiliyor…' : 'Talep Gönder'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
