// app/dev/nav-glass.tsx — GEÇİCİ native doğrulama sayfası (yalnız __DEV__).
// Girişe gerek kalmadan floating navbar + Tüm Menü popover + kurye sheet'ini
// iOS simulator'da görmek için. Deep link: dental-lab://dev/nav-glass
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import {
  Home, ClipboardList, CheckCircle, MoreHorizontal, Plus, Search,
  Building2, Truck, Landmark, Users, Package, Settings, Map as MapIcon,
} from '../../core/ui/icons';
import { useLocalSearchParams } from 'expo-router';
import { PillTabBar, type PillTabItem } from '../../core/ui/mobile/PillTabBar';
import { MoreMenuSheet, type MoreItem } from '../../core/ui/mobile/MoreMenuSheet';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { CourierTrackingScreen } from '../../modules/courier/CourierTrackingScreen';
import { DS } from '../../core/theme/dsTokens';

export default function NavGlassDev() {
  // Deep link ile durum aç: dental-lab://dev/nav-glass?menu=1 · ?map=1 · ?dark=1
  const q = useLocalSearchParams<{ menu?: string; map?: string; dark?: string; demo?: string }>();
  const dark = useThemeModeStore(s => s.resolvedDark);
  const setMode = useThemeModeStore(s => s.setMode);
  const [moreOpen, setMoreOpen] = useState(q?.menu === '1');
  const [showMap, setShowMap] = useState(q?.map === '1');
  React.useEffect(() => {
    if (q?.dark === '1') setMode('dark');
    else if (q?.dark === '0') setMode('light');
  }, [q?.dark, setMode]);
  // ?demo=1 → durumları kendi kendine geçer (simulator'da her deep link iOS
  // onay diyaloğu açtığı için TEK açılışla üç durum yakalanabilsin):
  //   0-8 sn navbar · 8-16 sn Tüm Menü açık · 16 sn+ kurye sheet'i
  React.useEffect(() => {
    if (q?.demo !== '1') return;
    const a = setTimeout(() => setMoreOpen(true), 8000);
    const b = setTimeout(() => { setMoreOpen(false); setShowMap(true); }, 16000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [q?.demo]);

  const TABS: PillTabItem[] = [
    { routeName: 'index', label: 'Özet', icon: Home },
    { routeName: 'orders', label: 'Siparişler', icon: ClipboardList, badgeCount: 3 },
    { routeName: 'approvals', label: 'Onaylar', icon: CheckCircle },
    { routeName: 'search', label: 'Ara', icon: Search },
    { routeName: 'more', label: 'Daha', icon: MoreHorizontal, onPress: () => setMoreOpen(true) },
  ];
  const MORE: MoreItem[] = [
    { key: 'clinics', label: 'Sağlık Kurumları', icon: Building2, onPress: () => {} },
    { key: 'courier', label: 'Kurye Takip', icon: Truck, onPress: () => {} },
    { key: 'finance', label: 'Finans', icon: Landmark, onPress: () => {} },
    { key: 'team', label: 'Ekip', icon: Users, badge: 2, onPress: () => {} },
    { key: 'stock', label: 'Stok ve Depo', icon: Package, onPress: () => {} },
    { key: 'settings', label: 'Ayarlar', icon: Settings, onPress: () => {} },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: dark ? '#0E0E0E' : '#F7F9FC' }}>
      {showMap ? (
        <CourierTrackingScreen accent={DS.tech.primary} pageBg={DS.tech.bg} routePrefix="/(courier)" />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 220, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable onPress={() => setMode(dark ? 'light' : 'dark')}
              style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#4771AB' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{dark ? 'Açık tema' : 'Koyu tema'}</Text>
            </Pressable>
            <Pressable onPress={() => setShowMap(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: '#0F172A' }}>
              <MapIcon size={15} color="#fff" strokeWidth={2} />
              <Text style={{ color: '#fff', fontWeight: '700' }}>Kurye sheet'i</Text>
            </Pressable>
          </View>
          {Array.from({ length: 22 }).map((_, i) => (
            <View key={i} style={{ padding: 14, borderRadius: 16, backgroundColor: dark ? '#1B1916' : '#FFFFFF' }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: dark ? '#F7F2E9' : '#0A0A0A' }}>
                Muharrem Tütüncü {i + 1}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#9C2E2E', marginTop: 2 }}>
                REVİZYON · Ziraat Kron
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
      <PillTabBar
        items={TABS}
        baseRoute="/dev/nav-glass"
        accentColor="#4771AB"
        fabItem={{ routeName: 'new', label: 'Yeni', icon: Plus, onPress: () => setShowMap(m => !m) }}
      />
      <MoreMenuSheet
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Tüm Menü"
        subtitle="Sık kullanılmayan ekranlar"
        items={MORE}
        accentColor="#4771AB"
      />
    </View>
  );
}
