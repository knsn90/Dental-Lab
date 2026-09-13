/**
 * CenteredLoader — Sayfanın ortasında konumlu, ekrana uygun boyutta yükleme göstergesi.
 *
 * Kullanım:
 *   {loading ? <CenteredLoader /> : <Content />}
 *   {loading ? <CenteredLoader color="#EA7A4C" label="Yükleniyor…" /> : ...}
 *
 * Spec:
 *  - flex: 1 (kalan tüm alanı kaplar)
 *  - alignItems + justifyContent: center
 *  - Spinner size='large'
 *  - Opsiyonel açıklayıcı yazı
 */
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { ActivityIndicator } from './teethCompat';
import { useThemeModeStore } from '../store/themeModeStore';

interface Props {
  color?: string;
  label?: string;
  /** Sayfanın tamamına genişlemesin, sadece içerik kadar yer kaplasın */
  inline?: boolean;
  /** Üst/alt minimum boşluk (inline modunda) */
  minHeight?: number;
}

export function CenteredLoader({ color, label, inline, minHeight = 280 }: Props) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const spinnerColor = color ?? (isDark ? '#F7F2E9' : '#0A0A0A');
  return (
    <View
      style={{
        ...(inline ? { minHeight, width: '100%' } : { flex: 1 }),
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 24,
      }}
    >
      {/* Web'de 56px (large native spinner ile aynı oran), native'de 'large' */}
      <ActivityIndicator size={Platform.OS === 'web' ? 56 : 'large'} color={spinnerColor} />
      {label ? (
        <Text style={{ marginTop: 18, fontSize: 14, color: isDark ? 'rgba(247,242,233,0.45)' : '#6B6B6B', fontWeight: '500' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export default CenteredLoader;
