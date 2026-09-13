import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut } from '../../core/ui/icons';
import { useTranslation } from 'react-i18next';
const SetupWizardScreen = lazyRoute(() => import('../../modules/onboarding/screens/SetupWizardScreen'), 'SetupWizardScreen');
import { supabase } from '../../core/api/supabase';
import { lazyRoute } from '../../core/_lazyRoute';

export default function AdminSetupWizardRoute() {
  const { t } = useTranslation();
  const router = useRouter();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/(auth)/login' as any);
  };

  return (
    <View style={{ flex: 1 }}>
      <SetupWizardScreen onComplete={() => router.replace('/(admin)')} />

      {/* Çıkış butonu — sıkışan kullanıcılar için kaçış kapısı */}
      <Pressable
        onPress={handleLogout}
        style={{
          position: 'absolute',
          top: 24, end: 24,
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
        <Text style={{ fontSize: 12, fontWeight: '600', color: '#6B6B6B' }}>{t('common.signOut')}</Text>
      </Pressable>
    </View>
  );
}
