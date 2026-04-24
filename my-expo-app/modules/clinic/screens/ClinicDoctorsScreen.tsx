import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchMyClinicDoctors } from '../api';

const P  = '#0369A1';
const BG = '#F7F9FB';

interface ClinicDoctor {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  clinic_name: string | null;
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function ClinicDoctorsScreen() {
  const [doctors,  setDoctors]  = useState<ClinicDoctor[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await fetchMyClinicDoctors();
    if (!error && data) setDoctors(data as ClinicDoctor[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = () => { setRefreshing(true); load(); };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={handleRefresh} tintColor={P} />}
      >
        <Text style={s.title}>Hekimler</Text>
        <Text style={s.subtitle}>Kliniğinizdeki kayıtlı hekimler</Text>

        <View style={s.stats}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{doctors.length}</Text>
            <Text style={s.statLabel}>TOPLAM</Text>
          </View>
          <View style={s.statCard}>
            <Text style={[s.statValue, { color: '#16A34A' }]}>{doctors.filter(d => d.is_active).length}</Text>
            <Text style={s.statLabel}>AKTİF</Text>
          </View>
        </View>

        {doctors.length === 0 && !loading ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🩺</Text>
            <Text style={s.emptyTitle}>Henüz hekim bulunmuyor</Text>
            <Text style={s.emptySub}>
              Kliniğinize hekim eklemek için lab'ınızla iletişime geçin.
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {doctors.map(d => (
              <View key={d.id} style={s.row}>
                <View style={[s.avatar, { backgroundColor: d.is_active ? P : '#CBD5E1' }]}>
                  <Text style={s.avatarText}>{initials(d.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{d.full_name}</Text>
                  {d.phone && <Text style={s.phone} numberOfLines={1}>{d.phone}</Text>}
                </View>
                {!d.is_active && (
                  <View style={s.inactivePill}>
                    <Text style={s.inactiveText}>PASIF</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 80 },
  title:    { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.6 },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2, marginBottom: 20 },

  stats: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF',
    borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9',
    padding: 16, gap: 4,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: P, letterSpacing: -0.6 },
  statLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },

  list: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' },
  row:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  name:       { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  phone:      { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  inactivePill: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  inactiveText: { fontSize: 9, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8 },

  empty:      { alignItems: 'center', paddingVertical: 64, gap: 8 },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  emptySub:   { fontSize: 13, color: '#64748B', textAlign: 'center', maxWidth: 300 },
});
