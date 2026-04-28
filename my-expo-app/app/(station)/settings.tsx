// app/(station)/settings.tsx
// Teknisyen ayarlar ekranı — basit profil + çıkış

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { supabase } from '../../lib/supabase';

const ACCENT = '#16A34A';

export default function StationSettingsScreen() {
  const { profile } = useAuthStore();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={s.title}>Ayarlar</Text>
      </View>

      {/* Profil kartı */}
      <View style={s.card}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {profile?.full_name?.charAt(0)?.toUpperCase() ?? 'T'}
          </Text>
        </View>
        <Text style={s.name}>{profile?.full_name ?? '—'}</Text>
        <Text style={s.role}>Teknisyen</Text>
      </View>

      {/* Çıkış */}
      <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
        <Text style={s.logoutText}>Çıkış Yap</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FDF4', padding: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, gap: 16 },
  backBtn: { padding: 8 },
  backText: { fontSize: 16, color: ACCENT, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: '#14532D' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { fontSize: 30, fontWeight: '700', color: '#fff' },
  name: { fontSize: 20, fontWeight: '700', color: '#14532D', marginBottom: 4 },
  role: { fontSize: 14, color: '#6B7280' },
  logoutBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#DC2626' },
});
