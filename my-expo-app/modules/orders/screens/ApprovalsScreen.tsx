// modules/orders/screens/ApprovalsScreen.tsx
// Bekleyen tasarım onayları listesi.
// Hekim: kendi siparişlerindeki pending onaylar.
// Klinik müdürü: kliniğindeki hekimlerin pending onayları.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, Platform, RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../../core/api/supabase';
import { useAuthStore } from '../../../core/store/authStore';
import { AppIcon } from '../../../core/ui/AppIcon';
import { toast } from '../../../core/ui/Toast';

interface PendingApproval {
  id: string;
  order_number: string;
  patient_name: string | null;
  work_type: string | null;
  doctor_approval_token: string;
  doctor_approval_expires_at: string;
}

interface Props {
  accentColor?: string;
}

export function ApprovalsScreen({ accentColor = '#7C3AED' }: Props) {
  const { profile } = useAuthStore();
  const router = useRouter();
  const [approvals, setApprovals]   = useState<PendingApproval[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.id) return;

    let doctorIds: string[] | null = null;

    if (profile.user_type === 'doctor') {
      doctorIds = [profile.id];
    } else if (profile.user_type === 'clinic_admin') {
      // Kliniği bul → klinikteki hekimleri bul
      const { data: clinic } = await supabase
        .from('clinics')
        .select('id')
        .eq('profile_id', profile.id)
        .maybeSingle();

      if (clinic?.id) {
        const { data: doctors } = await supabase
          .from('doctors')
          .select('id')
          .eq('clinic_id', clinic.id);
        doctorIds = (doctors ?? []).map((d: any) => d.id);
      }
    }

    if (doctorIds !== null && doctorIds.length === 0) {
      setApprovals([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let query = supabase
      .from('work_orders')
      .select('id, order_number, patient_name, work_type, doctor_approval_token, doctor_approval_expires_at')
      .eq('doctor_approval_status', 'pending')
      .not('doctor_approval_token', 'is', null)
      .order('doctor_approval_expires_at', { ascending: true });

    if (doctorIds !== null) {
      query = query.in('doctor_id', doctorIds);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Onaylar yüklenemedi');
    } else {
      setApprovals((data ?? []) as PendingApproval[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id, profile?.user_type]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const hoursLeft = (expiresAt: string) =>
    Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 3_600_000));

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />}
    >
      <View style={s.headRow}>
        <Text style={s.heading}>Tasarım Onayları</Text>
        {approvals.length > 0 && (
          <View style={[s.countBadge, { backgroundColor: accentColor }]}>
            <Text style={s.countText}>{approvals.length}</Text>
          </View>
        )}
      </View>

      {approvals.length === 0 ? (
        <View style={s.empty}>
          <AppIcon name="check-circle" size={48} color="#CBD5E1" strokeWidth={1.2} />
          <Text style={s.emptyTitle}>Bekleyen onay yok</Text>
          <Text style={s.emptySub}>Yeni tasarım onayı geldiğinde burada görünür</Text>
        </View>
      ) : (
        approvals.map(a => {
          const h = hoursLeft(a.doctor_approval_expires_at);
          const urgent = h <= 12;
          return (
            <Pressable
              key={a.id}
              style={[s.card, Platform.OS === 'web' && ({ boxShadow: '0 8px 24px rgba(0,0,0,0.10)' } as any)]}
              onPress={() => router.push(`/doctor-approval/${a.doctor_approval_token}` as any)}
            >
              <View style={s.cardTop}>
                <View style={[s.iconWrap, { backgroundColor: accentColor + '18' }]}>
                  <AppIcon name="shield-check" size={22} color={accentColor} strokeWidth={1.6} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.orderNo}>#{a.order_number}</Text>
                  <Text style={s.patientName}>{a.patient_name ?? '—'}</Text>
                  {a.work_type ? <Text style={s.workType}>{a.work_type}</Text> : null}
                </View>
                <View style={[s.timer, { backgroundColor: urgent ? '#FEF2F2' : '#FEF3C7' }]}>
                  <AppIcon name="clock" size={11} color={urgent ? '#DC2626' : '#92400E'} />
                  <Text style={[s.timerText, { color: urgent ? '#DC2626' : '#92400E' }]}>{h}s kaldı</Text>
                </View>
              </View>
              <View style={s.cardBottom}>
                <Text style={[s.reviewBtn, { color: accentColor }]}>İncele ve Onayla</Text>
                <AppIcon name="arrow-right" size={14} color={accentColor} strokeWidth={2} />
              </View>
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: '#F1F5F9' },
  content:  { padding: 16, paddingBottom: 40, gap: 12 },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  heading:  { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  countText:  { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  empty:    { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748B' },
  emptySub:   { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.95)',
  },
  cardTop:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconWrap:   { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  orderNo:    { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  patientName:{ fontSize: 15, fontWeight: '700', color: '#0F172A' },
  workType:   { fontSize: 12, color: '#64748B' },
  timer:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  timerText:  { fontSize: 11, fontWeight: '700' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  reviewBtn:  { fontSize: 13, fontWeight: '700', flex: 1 },
});
