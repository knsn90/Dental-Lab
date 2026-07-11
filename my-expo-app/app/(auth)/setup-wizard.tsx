import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
const SetupWizardScreen = lazyRoute(() => import('../../modules/onboarding/screens/SetupWizardScreen'), 'SetupWizardScreen');
import { useAuthStore } from '../../core/store/authStore';
import { supabase } from '../../core/api/supabase';
import { lazyRoute } from '../../core/_lazyRoute';

export default function SetupWizardRoute() {
  const router = useRouter();
  const { profile, fetchProfile } = useAuthStore();
  const session = useAuthStore(s => s.session);

  const handleComplete = async () => {
    // Re-fetch profile to get updated lab_id
    if (session?.user?.id) {
      await fetchProfile(session.user.id);
    }

    // Navigate to appropriate panel
    const userType = profile?.user_type;
    if (userType === 'admin') {
      router.replace('/(admin)');
    } else {
      router.replace('/(lab)');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  };

  return (
    <View style={{ flex: 1 }}>
      <SetupWizardScreen onComplete={handleComplete} />

      {/* Çıkış butonu — sağ üst köşe — wizard'a yanlışlıkla düşen kullanıcılar için */}
      <Pressable
        onPress={handleLogout}
        style={{
          position: 'absolute',
          top: 24, right: 24,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: 14, paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)',
          backgroundColor: 'rgba(255,255,255,0.85)',
          // @ts-ignore web
          cursor: 'pointer',
          zIndex: 100,
        }}
      >
        <LogOut size={13} color="#6B6B6B" strokeWidth={1.8} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B6B6B' }}>Çıkış Yap</Text>
      </Pressable>
    </View>
  );
}
