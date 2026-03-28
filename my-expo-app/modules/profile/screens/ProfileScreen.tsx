import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../../core/store/authStore';
import { Button } from '../../../core/ui/Button';
import { Card } from '../../../core/ui/Card';
import { C } from '../../../core/theme/colors';

export function ProfileScreen() {
  const { profile, signOut } = useAuthStore();

  const handleSignOut = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinizden emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Çıkış Yap', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.full_name}</Text>
        <Text style={styles.badge}>🩺 Hekim</Text>

        <Card style={styles.infoCard}>
          {(profile as any)?.clinic_name && (
            <InfoRow label="Klinik" value={(profile as any).clinic_name} />
          )}
          {(profile as any)?.phone && (
            <InfoRow label="Telefon" value={(profile as any).phone} />
          )}
        </Card>

        <Button
          onPress={handleSignOut}
          label="Çıkış Yap"
          variant="danger"
          fullWidth
          style={styles.signOutBtn}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 14, color: C.textSecondary },
  value: { fontSize: 14, color: C.textPrimary, fontWeight: '600' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 26, fontWeight: '800', color: C.textPrimary },
  content: { padding: 20, alignItems: 'center' },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  name: { fontSize: 22, fontWeight: '700', color: C.textPrimary, marginBottom: 4 },
  badge: { fontSize: 14, color: C.textSecondary, marginBottom: 24 },
  infoCard: { width: '100%', marginBottom: 32 },
  signOutBtn: {},
});
