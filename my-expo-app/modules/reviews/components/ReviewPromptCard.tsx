// ReviewPromptCard — mobil sipariş ekranında teslim edilen iş için değerlendirme kartı.
// Masaüstündeki değerlendirme kartının (OrderDetailScreenV2) mobil karşılığı:
// panel accent gradyanı + yıldız dairesi + kicker + ok çipi. Koyu temada hero yüzeyi.
import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { Star, ArrowUpRight, ArrowUpLeft } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useHeroSurface, deepenForDark } from '../../../core/ui/HeroGlow';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { isRTL } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { OrderReview } from '../types';

export function ReviewPromptCard({ review, accent, onPress }: {
  review: OrderReview | null;
  accent: string;
  onPress: () => void;
}) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const hero = useHeroSurface(accent);
  const surface = isDark ? hero : {
    backgroundColor: accent,
    ...(Platform.OS === 'web'
      ? { backgroundImage: `linear-gradient(135deg, ${deepenForDark(accent, 0.78)} 0%, ${accent} 100%)` }
      : {}),
  };
  const Arrow = isRTL() ? ArrowUpLeft : ArrowUpRight;

  return (
    <GlassTooltip title={autoT('İşi değerlendir')} text={autoT('Uyum, estetik, oklüzyon ve daha fazlasını puanla')}>
      <Pressable onPress={onPress} accessibilityRole="button" style={{ cursor: 'pointer' as any }}>
        <View style={{ borderRadius: 22, overflow: 'hidden', position: 'relative', ...surface }}>
          <View pointerEvents="none" style={{ position: 'absolute', top: -30, end: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: '#FFFFFF', opacity: isDark ? 0.06 : 0.12 }} />

          <View style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Star size={18} color="#FFFFFF" strokeWidth={1.8} fill={review ? '#FFFFFF' : 'transparent'} />
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.9)' }} />
                <Text style={{ fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.5, textTransform: 'uppercase' }}>Değerlendir</Text>
              </View>
              <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginTop: 3 }}>
                {review ? 'Değerlendirmeyi gör / düzenle' : 'Bu işi değerlendir'}
              </Text>
              {review ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} size={13} color="#FFFFFF" strokeWidth={1.6} fill={review.overall >= n ? '#FFFFFF' : 'transparent'} />
                  ))}
                </View>
              ) : (
                <Text numberOfLines={2} style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>Uyum, estetik, oklüzyon ve daha fazlasını puanla</Text>
              )}
            </View>

            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Arrow size={14} color="#FFFFFF" strokeWidth={1.8} />
            </View>
          </View>
        </View>
      </Pressable>
    </GlassTooltip>
  );
}
