/**
 * NavyBackButtonX — Finans bölümünün geri düğmesi.
 *
 * Kullanıcı: "back butonu bütün finans bölümünde navy olsun, daha fazla kontrast için".
 * Fatura detayındaki lacivert düğme ortak bileşene çıkarıldı: HERO_NAVY dolgu + beyaz ok;
 * koyu temada bir ton açık lacivert + ince beyaz-alfa kenar (koyu kart zemininde kaybolmasın).
 * `label` verilirse kapsül ("← Tedarikçiler"), verilmezse 30px kare.
 */
import React from 'react';
import { Pressable, Text, Platform } from 'react-native';
import { ArrowLeft, ArrowRight } from './icons';
import { HERO_NAVY } from './HeroGlow';
import { GlassTooltip } from './GlassTooltip';
import { useInkUI } from '../theme/inkScale';
import { isRTL } from '../i18n';
import { autoT } from '../i18n/autoTranslate';

export function NavyBackButtonX({ onPress, label, tooltip = 'Önceki sayfaya döner' }: {
  onPress: () => void;
  /** Kapsül metni (ör. "Tedarikçiler") — verilmezse yalnız ok */
  label?: string;
  /** İpucu açıklaması (düz Türkçe; autoT ile çevrilir) */
  tooltip?: string;
}) {
  const U = useInkUI();
  const bg = U.isDark ? HERO_NAVY.light : HERO_NAVY.to;
  const Arrow = isRTL() ? ArrowRight : ArrowLeft;
  return (
    <GlassTooltip title={autoT('Geri')} text={autoT(tooltip)} placement="bottom">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label ?? autoT('Geri')}
        hitSlop={8}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
          ...(label
            ? { height: 32, paddingHorizontal: 12, borderRadius: 999, alignSelf: 'flex-start' as const }
            : { width: 30, height: 30, borderRadius: 9 }),
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: U.isDark ? 'rgba(255,255,255,0.14)' : HERO_NAVY.to,
          ...(Platform.OS === 'web'
            ? { cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,42,92,0.28)' } as any
            : { shadowColor: HERO_NAVY.to, shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }),
        }}
      >
        <Arrow size={15} strokeWidth={2.2} color="#FFFFFF" />
        {label ? <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }}>{label}</Text> : null}
      </Pressable>
    </GlassTooltip>
  );
}
