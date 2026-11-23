// modules/kiosk/screens/TabletAccessSection.tsx
// Ayarlar → "Tablet Girişi" (eski "Giriş Kodum" + "Tabletler" birleşik).
//
//   Kodum              → herkes (lab ekibi, teknisyen, kurye)
//   Personel kodları   → yalnız yönetici
//   Tabletler          → yalnız yönetici; paylaşılan tablet (kiosk) oturumunda gizli
//
// Yönetici kuralı sunucuyla birebir (kiosk_can_manage): user_type='admin' veya
// user_type='lab' + role manager/admin. Başlığı hub verir; burada tekrar yazılmaz.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { KeyRound, Users, Tablet } from '../../../core/ui/icons';
import { MyAccessCodeSection } from './MyAccessCodeSection';
import { StaffCodesCard } from './StaffCodesCard';
import { DevicesCard } from './LabDevicesSection';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useAuthStore } from '../../../core/store/authStore';
import { useKioskMode } from '../../../core/kiosk/kioskModeStore';
import { PAGE_PADDING, CARD_GAP } from '../../../core/ui/pageMetrics';

function Card({ icon, title, sub, right, children }: {
  icon: React.ReactNode; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  const T = useMobileTokens();
  return (
    <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ marginTop: 1 }}>{icon}</View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: T.ink }}>{title}</Text>
          {!!sub && <Text style={{ fontSize: 12.5, color: T.ink2, lineHeight: 18 }}>{sub}</Text>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function TabletAccessSection({ accentColor = '#3563A8' }: { accentColor?: string }) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const profile = useAuthStore(s => s.profile) as any;
  const isKiosk = useKioskMode(s => s.isKiosk);
  const { width } = useWindowDimensions();
  const wide = width >= 1100;

  const labId: string | null = profile?.lab_id ?? null;
  const canManage = !isKiosk && !!labId && (
    profile?.user_type === 'admin'
    || (profile?.user_type === 'lab' && ['manager', 'admin'].includes(profile?.role ?? ''))
  );

  const [summary, setSummary] = useState<{ withCode: number; total: number } | null>(null);
  const onSummary = useCallback((withCode: number, total: number) => setSummary({ withCode, total }), []);

  const ic = isDark ? '#9BC6EC' : accentColor;
  const iconProps = { size: 18, color: ic, strokeWidth: 1.8 } as const;

  const myCode = (
    <Card icon={<KeyRound {...iconProps} />} title="Giriş kodum">
      <MyAccessCodeSection accentColor={accentColor} embedded />
    </Card>
  );

  if (!canManage) {
    return (
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 120, maxWidth: 560 + PAGE_PADDING * 2, width: '100%' }}>
        {myCode}
      </ScrollView>
    );
  }

  const staff = (
    <Card
      icon={<Users {...iconProps} />}
      title="Personel kodları"
      sub="Her kişi kodunu kendi hesabında bu sayfadan belirler. Kodu olmayan kişi tablette listelenmez; kodu unutan kişinin kodunu buradan sıfırlayabilirsiniz."
      right={summary ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: T.ink2, fontVariant: ['tabular-nums'] }}>{`${summary.withCode} / ${summary.total}`}</Text>
        </View>
      ) : null}
    >
      <StaffCodesCard labId={labId!} accentColor={accentColor} onSummary={onSummary} />
    </Card>
  );

  const devices = (
    <Card
      icon={<Tablet {...iconProps} />}
      title="Tabletler"
      sub="Kodla giriş yalnız eşleştirilmiş tabletlerde çalışır. Tablet ekleyin, verilen kodu 15 dakika içinde tablette siman.app/kiosk adresine girin."
    >
      <DevicesCard accentColor={accentColor} />
    </Card>
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingTop: 8, paddingBottom: 120, gap: CARD_GAP }}>
      {wide ? (
        <View style={{ flexDirection: 'row', gap: CARD_GAP, alignItems: 'flex-start' }}>
          <View style={{ flex: 1, gap: CARD_GAP }}>{devices}{staff}</View>
          <View style={{ width: 380 }}>{myCode}</View>
        </View>
      ) : (
        <>
          {devices}
          {staff}
          {myCode}
        </>
      )}
    </ScrollView>
  );
}
