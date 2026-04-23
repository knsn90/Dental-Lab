import { useState } from 'react';
import { Modal, Text } from 'react-native';
import { Slot, Tabs } from 'expo-router';
import { C as Colors } from '../../core/theme/colors';
import { DesktopShell, useIsDesktop } from '../../core/layout/DesktopShell';
import { useAuthStore } from '../../core/store/authStore';
import { useDoctorScope } from '../../modules/clinics/hooks/useDoctorScope';
import { NewOrderScreen } from '../../modules/orders/screens/NewOrderScreen';

// NOT: Desktop'ta "Yeni İş Emri" → route navigate eder (/(doctor)/new-order),
// sidebar kaybolmaz. Modal SADECE mobil için.

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: focused ? 24 : 22, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>;
}

export default function DoctorLayout() {
  const { profile, loading } = useAuthStore();
  const isDesktop = useIsDesktop();
  const { clinicId, doctorId } = useDoctorScope();
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const DOCTOR_NAV = [
    // ── Ana ekran ──────────────────────────────────────────────────────────
    { label: 'Özet',          emoji: '🏠', href: '/(doctor)',            iconName: 'home',          iconSet: 'mdi' as const },

    // ── İş Emirleri ────────────────────────────────────────────────────────
    { label: 'İşlerim',       emoji: '📋', href: '/(doctor)/orders',     iconName: 'clipboard',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'İş Emirleri' },
    { label: 'Yeni İş Emri',  emoji: '➕', href: '/(doctor)/new-order',  iconName: 'plus-circle',   iconSet: 'mdi' as const, subtitle: 'Formu adım adım doldurun' },

    // ── Finans ─────────────────────────────────────────────────────────────
    { label: 'Faturalarım',   emoji: '🧾', href: '/(doctor)/invoices',   iconName: 'file-text',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Finans' },
    { label: 'Cari Hesap',    emoji: '💰', href: '/(doctor)/balance',    iconName: 'dollar-sign',   iconSet: 'mdi' as const },

    // ── Hesap ──────────────────────────────────────────────────────────────
    { label: 'Kliniğim',      emoji: '🏥', href: '/(doctor)/clinic',     iconName: 'briefcase',     iconSet: 'mdi' as const, matchPrefix: true, sectionLabel: 'Hesap' },
    { label: 'Profil',        emoji: '👤', href: '/(doctor)/profile',    iconName: 'user',          iconSet: 'mdi' as const },
  ];

  // Hekim olmayan kullanıcı bu layout'a düştüyse sidebar gösterme
  if (loading || !profile || profile.user_type !== 'doctor') {
    return <Slot />;
  }

  if (isDesktop) {
    // Desktop: DesktopShell içinde route render edilir, sidebar hiç kaybolmaz.
    return <DesktopShell navItems={DOCTOR_NAV} accentColor={Colors.primary} />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textSecondary,
          tabBarStyle: {
            backgroundColor: Colors.surface,
            borderTopColor: Colors.border,
            paddingBottom: 6,
            height: 60,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Özet',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            title: 'İşler',
            tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="new-order"
          options={{
            title: 'Yeni',
            tabBarIcon: ({ focused }) => <TabIcon emoji="➕" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="invoices"
          options={{
            title: 'Fatura',
            tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profil',
            tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
          }}
        />

        {/* Mobile tab bar'da gizli tutulan detay/alt ekranlar */}
        <Tabs.Screen name="order/[id]"     options={{ href: null } as any} />
        <Tabs.Screen name="invoice/[id]"   options={{ href: null } as any} />
        <Tabs.Screen name="balance"        options={{ href: null } as any} />
        <Tabs.Screen name="clinic"         options={{ href: null } as any} />
      </Tabs>

      {/* Yeni İş Emri — SADECE mobilde modal olarak açılır */}
      <Modal
        visible={newOrderOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setNewOrderOpen(false)}
      >
        <NewOrderScreen
          lockedClinicId={clinicId}
          lockedDoctorId={doctorId}
          successRedirect="/(doctor)"
          onClose={() => setNewOrderOpen(false)}
        />
      </Modal>
    </>
  );
}
