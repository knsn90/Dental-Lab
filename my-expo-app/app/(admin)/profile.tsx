import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Colors from '../../constants/colors';

export default function AdminProfileScreen() {
  const { profile, signOut } = useAuthStore();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Yönetici Profili</Text>

        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile?.full_name?.charAt(0).toUpperCase() ?? 'A'}
            </Text>
          </View>
          <Text style={styles.name}>{profile?.full_name}</Text>
          <View style={styles.adminBadge}>
            <Text style={styles.adminBadgeText}>🛡️ Sistem Yöneticisi</Text>
          </View>
        </View>

        <Card style={styles.card}>
          {profile?.phone ? (
            <InfoRow label="Telefon" value={profile.phone} />
          ) : null}
          <InfoRow label="Hesap Tipi" value="Admin" />
          <InfoRow
            label="Kayıt Tarihi"
            value={
              profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('tr-TR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '—'
            }
          />
        </Card>

        <View style={styles.infoBox}>
          <Text style={styles.infoBoxText}>
            ℹ️ Admin hesabı yalnızca Supabase Dashboard üzerinden oluşturulabilir ve yönetilebilir.
          </Text>
        </View>

        <Button
          onPress={signOut}
          label="Çıkış Yap"
          variant="danger"
          fullWidth
        />
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: 14, color: Colors.textSecondary },
  value: { fontSize: 14, color: Colors.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: 24 },

  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: Colors.white },
  name: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginBottom: 8 },
  adminBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  adminBadgeText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  card: { marginBottom: 20 },

  infoBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoBoxText: { fontSize: 13, color: '#374151', lineHeight: 18 },
});
