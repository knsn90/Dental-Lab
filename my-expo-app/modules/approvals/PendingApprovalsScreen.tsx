import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { C } from '../../core/theme/colors';
import { F } from '../../core/theme/typography';

interface PendingDoctor extends Profile {
  email?: string | null;
}

export function PendingApprovalsScreen() {
  const [doctors, setDoctors] = useState<PendingDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_type', 'doctor')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });
    setDoctors((data ?? []) as PendingDoctor[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();

    const channel = supabase
      .channel('pending_approvals_screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const handleApprove = async (profile: PendingDoctor) => {
    setActioningId(profile.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: true, approval_status: 'approved' })
      .eq('id', profile.id);
    if (error) {
      Alert.alert('Hata', 'Onaylama işlemi başarısız oldu.');
    } else {
      setDoctors(prev => prev.filter(d => d.id !== profile.id));
    }
    setActioningId(null);
  };

  const handleReject = async (profile: PendingDoctor) => {
    Alert.alert(
      'Reddet',
      `${profile.full_name} adlı hekimin kaydını reddetmek istediğinize emin misiniz?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Reddet', style: 'destructive',
          onPress: async () => {
            setActioningId(profile.id);
            const { error } = await supabase
              .from('profiles')
              .update({ is_active: false, approval_status: 'rejected' })
              .eq('id', profile.id);
            if (error) {
              Alert.alert('Hata', 'Reddetme işlemi başarısız oldu.');
            } else {
              setDoctors(prev => prev.filter(d => d.id !== profile.id));
            }
            setActioningId(null);
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <MaterialCommunityIcons name="account-clock-outline" size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Onay Bekleyen Hekimler</Text>
            <Text style={styles.headerSub}>
              {doctors.length > 0
                ? `${doctors.length} hekim onay bekliyor`
                : 'Bekleyen kayıt yok'}
            </Text>
          </View>
        </View>
      </View>

      {doctors.length === 0 ? (
        <View style={styles.emptyWrap}>
          <MaterialCommunityIcons name="check-circle-outline" size={56} color={C.success} />
          <Text style={styles.emptyTitle}>Bekleyen kayıt yok</Text>
          <Text style={styles.emptySub}>Yeni hekim kaydı geldiğinde burada görünecek</Text>
        </View>
      ) : (
        <FlatList
          data={doctors}
          keyExtractor={d => d.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {/* Doctor info */}
              <View style={styles.cardTop}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.full_name?.charAt(0)?.toUpperCase() ?? 'H'}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.full_name}</Text>
                  {item.clinic_name ? (
                    <View style={styles.row}>
                      <MaterialCommunityIcons name="office-building-outline" size={13} color={C.textMuted} />
                      <Text style={styles.meta}>{item.clinic_name}</Text>
                    </View>
                  ) : null}
                  {item.phone ? (
                    <View style={styles.row}>
                      <MaterialCommunityIcons name="phone-outline" size={13} color={C.textMuted} />
                      <Text style={styles.meta}>{item.phone}</Text>
                    </View>
                  ) : null}
                  <View style={styles.row}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color={C.textMuted} />
                    <Text style={styles.meta}>
                      {new Date(item.created_at).toLocaleDateString('tr-TR', {
                        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Pending badge */}
              <View style={styles.pendingBadge}>
                <MaterialCommunityIcons name="clock-outline" size={12} color="#D97706" />
                <Text style={styles.pendingText}>Onay bekliyor</Text>
              </View>

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.rejectBtn, actioningId === item.id && styles.btnDisabled]}
                  onPress={() => handleReject(item)}
                  disabled={actioningId === item.id}
                >
                  {actioningId === item.id ? (
                    <ActivityIndicator size="small" color={C.danger} />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="close" size={16} color={C.danger} />
                      <Text style={styles.rejectText}>Reddet</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.approveBtn, actioningId === item.id && styles.btnDisabled]}
                  onPress={() => handleApprove(item)}
                  disabled={actioningId === item.id}
                >
                  {actioningId === item.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                      <Text style={styles.approveText}>Onayla</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#D97706',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  headerSub: { fontSize: 12, fontFamily: F.regular, color: C.textMuted, marginTop: 1 },

  list: { padding: 16, gap: 12 },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  emptySub: { fontSize: 14, fontFamily: F.regular, color: C.textMuted, textAlign: 'center', paddingHorizontal: 40 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTop: { flexDirection: 'row', gap: 12, marginBottom: 12 },

  avatar: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700', fontFamily: F.bold, color: C.primary },

  info: { flex: 1, gap: 4 },
  name: { fontSize: 15, fontWeight: '700', fontFamily: F.bold, color: '#0F172A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 12, fontFamily: F.regular, color: C.textMuted },

  pendingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: '#FFFBEB',
    borderWidth: 1, borderColor: '#FDE68A',
    marginBottom: 12,
  },
  pendingText: { fontSize: 11, fontWeight: '600', fontFamily: F.semibold, color: '#D97706' },

  actions: { flexDirection: 'row', gap: 10 },

  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1, borderColor: '#FECACA',
  },
  rejectText: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: C.danger },

  approveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10,
    backgroundColor: C.success,
  },
  approveText: { fontSize: 14, fontWeight: '600', fontFamily: F.semibold, color: '#FFFFFF' },

  btnDisabled: { opacity: 0.6 },
});
