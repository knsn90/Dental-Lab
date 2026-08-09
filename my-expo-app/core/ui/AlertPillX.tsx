// AlertPillX — pano hero'sundaki metrik satırının "dikkat gerektiren" üyesi.
//
// NEDEN VAR: hekim/klinik panosunda geciken sipariş ve değerlendirme bekleyen iş
// için iki ayrı, tam genişlikte, ~68px yüksekliğinde gradient banner vardı. Tek
// bir geciken sipariş için ekranın en değerli alanını harcıyorlardı.
//
// BİÇİM: panonun `StatPill`'iyle BİREBİR aynı ölçüler (11px etiket + px10/py3
// rozet + radius 999). Böylece ÜRETİM · AKTİF · BUGÜN · GECİKEN tek satırda,
// eşit boyutlu rozetlerle dizilir.
//
// DİKKAT ÇEKME (`pulse`): rozetin arkasından tek atımlı bir halka açılıp söner
// (radar pingi), sonra dinlenir. Sürekli salınım DEĞİL — Apple'ın 0.2 Hz
// civarındaki kesintisiz döngü uyarısı ve "aşırı geri bildirim hepsini
// görünmez yapar" kuralı gereği: 1.4 sn atım + 1.1 sn sessizlik. Rozetin kendisi
// yerinde durur, yalnız halka ölçeklenir → düzen oynamaz, yalnız transform ve
// opacity animasyonu yapılır. `prefers-reduced-motion` açıksa hiç çalışmaz.
//
// Basınca geri bildirim parmağın *inişinde* verilir (pressed), bırakışında değil.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, Animated, Easing, AccessibilityInfo } from 'react-native';
import { DS } from '../theme/dsTokens';

/** Kullanıcı hareketi azaltmayı seçtiyse true. Web'de matchMedia, native'de A11y API. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    if (Platform.OS === 'web') {
      const mq = typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
      if (!mq) return;
      setReduced(mq.matches);
      const onChange = (e: any) => alive && setReduced(!!e.matches);
      mq.addEventListener?.('change', onChange);
      return () => { alive = false; mq.removeEventListener?.('change', onChange); };
    }
    AccessibilityInfo.isReduceMotionEnabled?.().then(v => { if (alive) setReduced(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => alive && setReduced(!!v));
    return () => { alive = false; (sub as any)?.remove?.(); };
  }, []);
  return reduced;
}

export function AlertPillX({
  icon: Icon,
  count,
  label,
  color,
  labelColor,
  onPress,
  pulse = false,
}: {
  icon: React.ComponentType<any>;
  count: number | string;
  label: string;
  /** Dolgu rengi — panel accent'inden ya da status paletinden gelir. */
  color: string;
  /**
   * Etiket rengi. Varsayılan nötr ink-500; aciliyeti öne çıkarmak için KOYU ton
   * verilir (#9C2E2E gibi). Rozetin dolgu rengini (#D94B4B) 11px metinde
   * kullanmak kontrastı ~3.4:1'e düşürüyordu — koyu ton ~6:1 veriyor.
   */
  labelColor?: string;
  onPress?: () => void;
  /** Aksiyon bekleyen durumlar (geciken iş, yeni gelen iş) için ping halkası. */
  pulse?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const ping = useRef(new Animated.Value(0)).current;
  const active = pulse && !reducedMotion;

  useEffect(() => {
    if (!active) { ping.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ping, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(ping, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(1100),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, ping]);

  const ringScale   = ping.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ping.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.4, 0] });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        opacity: pressed ? 0.6 : 1,
        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null),
      })}
    >
      {/* Etiket StatPill ile aynı ölçüde: 11px uppercase, +%6 tracking.
          Aciliyet varsa ağırlık da bir kademe artar (renk + weight birlikte). */}
      <Text style={{
        fontSize: 11,
        color: labelColor ?? DS.ink[500],
        fontWeight: labelColor ? '600' : '400',
        textTransform: 'uppercase',
        letterSpacing: 0.06 * 11,
      }}>
        {label}
      </Text>

      <View style={{ position: 'relative' }}>
        {active && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              borderRadius: 999, backgroundColor: color,
              opacity: ringOpacity, transform: [{ scale: ringScale }],
            }}
          />
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 999,
            backgroundColor: color,
          }}
        >
          <Icon size={11} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={{ fontSize: 11, fontWeight: '500', color: '#FFFFFF' }}>{count}</Text>
        </View>
      </View>
    </Pressable>
  );
}
