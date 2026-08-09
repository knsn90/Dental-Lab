import React, { useContext } from 'react';
import { View, Text, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../theme/dsTokens';
import { HubContext } from '../HubContext';
import { PAGE_PADDING } from '../pageMetrics';

const DisplayFont = Platform.OS === 'web'
  ? 'Inter Tight, Inter, system-ui, sans-serif'
  : 'InterTight_300Light';

/**
 * MobilePageTitle — tutarlı mobil sayfa başlığı.
 * Sadece mobil standalone'da görünür; desktop (>=900) ve hub-embedded'de null döner
 * (oralarda shell/hub kendi başlığını sağlar). paddingTop global lab logosunu net geçer.
 */
export function MobilePageTitle({
  title,
  subtitle,
  topInset = true,
}: {
  title: string;
  subtitle?: string;
  /** false → parent SafeAreaView zaten status-bar inset'i ekliyor (çift saymayı önler) */
  topInset?: boolean;
}) {
  const { width } = useWindowDimensions();
  const isEmbedded = useContext(HubContext);
  const insets = useSafeAreaInsets();

  if (width >= 900 || isEmbedded) return null;

  const pad = (topInset ? Math.max(insets.top, 8) : 0) + 72;

  return (
    <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: pad, paddingBottom: 8 }}>
      <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 26, letterSpacing: -0.6, color: DS.ink[900] }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: 13, color: DS.ink[400], marginTop: 2 }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
