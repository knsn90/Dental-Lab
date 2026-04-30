// modules/orders/screens/DoctorApprovalScreen.tsx
// Public — login gerektirmez. Token ile pending design approval'ı gösterir.
// APPROVE → CAM'e geçer. REQUEST CHANGE → DESIGN'a geri.
// Cards design dilinde sade beyaz kart, tek aksiyon.

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { AppIcon } from '../../../core/ui/AppIcon';

interface PendingApproval {
  work_order_id: string;
  order_number:  string;
  patient_name:  string | null;
  doctor_name:   string | null;
  work_type:     string | null;
  shade:         string | null;
  delivery_date: string | null;
  tooth_numbers: number[] | null;
  status:        string;
  expires_at:    string;
}

export function DoctorApprovalScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<PendingApproval | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]       = useState<'approved' | 'rejected' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [note, setNote]       = useState('');

  useEffect(() => {
    if (!token) { setError('Geçersiz link'); setLoading(false); return; }
    (async () => {
      const { data: rows, error: rpcErr } = await supabase.rpc('get_pending_approval', { p_token: token });
      if (rpcErr) { setError(rpcErr.message); setLoading(false); return; }
      const row = (rows as PendingApproval[] | null)?.[0] ?? null;
      if (!row) { setError('Link süresi dolmuş veya zaten cevaplanmış'); setLoading(false); return; }
      setData(row);
      setLoading(false);
    })();
  }, [token]);

  async function decide(approved: boolean) {
    if (!token || !data) return;
    setSubmitting(true);
    const { data: result, error: rpcErr } = await supabase.rpc('doctor_approve', {
      p_token:    token,
      p_approved: approved,
      p_note:     note || null,
    });
    setSubmitting(false);
    if (rpcErr) { setError(rpcErr.message); return; }
    const r = result as any;
    if (!r?.ok) { setError(r?.error ?? 'Hata'); return; }
    setDone(approved ? 'approved' : 'rejected');
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#7C3AED" />
      </View>
    );
  }
  if (error) {
    return (
      <View style={s.center}>
        <View style={s.card}>
          <View style={[s.iconWrap, { backgroundColor: '#FEE2E2' }]}>
            <AppIcon name="x" size={24} color="#DC2626" />
          </View>
          <Text style={s.title}>Erişim sağlanamadı</Text>
          <Text style={s.errorText}>{error}</Text>
        </View>
      </View>
    );
  }
  if (done) {
    const ok = done === 'approved';
    return (
      <View style={s.center}>
        <View style={s.card}>
          <View style={[s.iconWrap, { backgroundColor: ok ? '#D1FAE5' : '#FEE2E2' }]}>
            <AppIcon name={ok ? 'check' : 'x'} size={28} color={ok ? '#059669' : '#DC2626'} strokeWidth={3} />
          </View>
          <Text style={s.title}>
            {ok ? 'Tasarım onaylandı' : 'Değişiklik talep edildi'}
          </Text>
          <Text style={s.subtitle}>
            {ok
              ? 'İş bir sonraki aşamaya (CAM) geçirildi.'
              : 'Tasarım ekibi yorumunuzla bilgilendirildi.'}
          </Text>
        </View>
      </View>
    );
  }

  if (!data) return null;
  const expires = new Date(data.expires_at);
  const hoursLeft = Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 3_600_000));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F1F5F9' }} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
      <View style={[s.card, { width: '100%', maxWidth: 560 }]}>
        {/* Header */}
        <View style={s.header}>
          <View style={[s.iconWrap, { backgroundColor: '#EDE9FE' }]}>
            <AppIcon name="shield-check-outline" size={22} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Tasarım Onayı</Text>
            <Text style={s.subtitle}>#{data.order_number}</Text>
          </View>
          <View style={s.timerPill}>
            <AppIcon name="clock-outline" size={11} color="#92400E" />
            <Text style={s.timerText}>{hoursLeft}s kaldı</Text>
          </View>
        </View>

        {/* Detaylar */}
        <View style={s.metaGrid}>
          <Meta label="Hasta" value={data.patient_name ?? '—'} />
          <Meta label="İş Tipi" value={data.work_type ?? '—'} />
          <Meta label="Renk" value={data.shade ?? '—'} />
          <Meta label="Teslim" value={data.delivery_date ?? '—'} />
          <Meta label="Diş No" value={(data.tooth_numbers ?? []).join(', ') || '—'} multiline />
        </View>

        {/* Reject note */}
        {rejectMode && (
          <View style={{ marginTop: 14 }}>
            <Text style={s.fieldLabel}>Değişiklik Notu (zorunlu)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={4}
              placeholder="Tasarım ekibine iletmek istediğiniz değişiklikler..."
              placeholderTextColor="#94A3B8"
              style={s.input}
            />
          </View>
        )}

        {/* Aksiyonlar */}
        {!rejectMode ? (
          <View style={s.actions}>
            <TouchableOpacity
              onPress={() => setRejectMode(true)}
              style={s.rejectBtn}
              activeOpacity={0.85}
              disabled={submitting}
            >
              <AppIcon name="x" size={16} color="#DC2626" />
              <Text style={s.rejectText}>Değişiklik İste</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => decide(true)}
              style={s.approveBtn}
              activeOpacity={0.85}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <>
                    <AppIcon name="check" size={16} color="#FFFFFF" strokeWidth={3} />
                    <Text style={s.approveText}>Onayla</Text>
                  </>}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.actions}>
            <TouchableOpacity
              onPress={() => { setRejectMode(false); setNote(''); }}
              style={s.cancelBtn}
              activeOpacity={0.7}
              disabled={submitting}
            >
              <Text style={s.cancelText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => decide(false)}
              style={[s.approveBtn, { backgroundColor: '#DC2626' }]}
              activeOpacity={0.85}
              disabled={submitting || !note.trim()}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={s.approveText}>Geri Gönder</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function Meta({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View style={[s.meta, multiline && { width: '100%' }]}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={multiline ? 0 : 1}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: '#F1F5F9' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
    width: '100%',
    maxWidth: 480,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', marginBottom: 16 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 18, fontWeight: '800', color: '#0F172A', letterSpacing: -0.4 },
  subtitle: { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 2 },
  errorText:{ fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center' },

  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#FEF3C7' },
  timerText: { fontSize: 11, fontWeight: '700', color: '#92400E' },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', gap: 12, marginTop: 12 },
  meta: { flexBasis: '47%', flexGrow: 1, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  metaLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 4 },
  metaValue: { fontSize: 13, fontWeight: '600', color: '#0F172A' },

  fieldLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' as const, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0',
    borderRadius: 10, padding: 12, fontSize: 13,
    color: '#0F172A',
    minHeight: 90,
    textAlignVertical: 'top',
  },

  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 18 },
  rejectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  rejectText:{ fontSize: 14, fontWeight: '700', color: '#DC2626' },
  approveBtn:{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#7C3AED' },
  approveText:{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  cancelText:{ fontSize: 13, fontWeight: '600', color: '#475569' },
});

export default DoctorApprovalScreen;
