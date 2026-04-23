import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../core/store/authStore';
import { useDoctorScope } from '../../modules/clinics/hooks/useDoctorScope';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';
import { C } from '../../core/theme/colors';

export default function DoctorNewOrderRoute() {
  const router = useRouter();
  const { profile, loading } = useAuthStore();
  const { clinicId, doctorId, loading: scopeLoading, clinic, doctor } = useDoctorScope();

  if (loading || !profile || scopeLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.primary} />
      </View>
    );
  }

  if (profile.user_type !== 'doctor') {
    router.replace('/(lab)/new-order' as any);
    return null;
  }

  // Klinik / hekim kaydı bulunamadıysa uyar
  if (!clinicId || !doctorId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
        <Text style={{ fontSize: 40 }}>⚠️</Text>
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.textPrimary }}>
          Klinik kaydınız eşleşmedi
        </Text>
        <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 320 }}>
          Yeni iş emri açabilmek için hesabınızın bir klinik + hekim kaydıyla
          ilişkilendirilmesi gerekir. Lütfen laboratuvar yönetimi ile iletişime
          geçin. (clinic: {String(!!clinic)}, doctor: {String(!!doctor)})
        </Text>
      </View>
    );
  }

  return (
    <NewOrderScreen
      lockedClinicId={clinicId}
      lockedDoctorId={doctorId}
      successRedirect="/(doctor)"
    />
  );
}
