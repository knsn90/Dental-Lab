// core/ui/SlideTabBar.tsx
// Tek kayan cursor'lı pill tab bar.
// Aktif tab değişince / hover olunca cursor yumuşakça kayar.
// Dış çerçeve / border YOK — yalnızca pill'leri barındırır.
//
// Kullanım:
//   <SlideTabBar
//     accentColor="#0F172A"
//     items={[{ key: 'a', label: 'A', count: 3 }, { key: 'b', label: 'B' }]}
//     activeKey={tab}
//     onChange={setTab}
//   />

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, View, Text, Platform } from 'react-native';

export interface SlideTabItem<K extends string = string> {
  key: K;
  label: string;
  /** Opsiyonel sayaç (ör. pending count) */
  count?: number;
}

interface Props<K extends string = string> {
  items: ReadonlyArray<SlideTabItem<K>>;
  activeKey: K;
  onChange: (key: K) => void;
  /** Cursor + aktif yazı için vurgu rengi (admin: #0F172A, lab: #2563EB) */
  accentColor: string;
  /** Ekstra stil */
  style?: any;
}

interface Rect { x: number; width: number; }

export function SlideTabBar<K extends string>({
  items,
  activeKey,
  onChange,
  accentColor,
  style,
}: Props<K>) {
  // Her tab'ın ölçümleri — key'e göre Map
  const layoutsRef = useRef<Record<string, Rect>>({});
  // Şu an cursor hangi tab üzerinde? (hover'da değişir, ama aktif farklı olabilir)
  const [hoveredKey, setHoveredKey] = useState<K | null>(null);

  // Cursor animasyon değerleri
  const left    = useRef(new Animated.Value(0)).current;
  const width   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // Hangi tab gösteriliyorsa (hover varsa o, yoksa aktif) oraya kaydır
  const moveCursorTo = useCallback((key: K | null) => {
    const target = key ?? activeKey;
    const rect = layoutsRef.current[target as string];
    if (!rect) return;
    Animated.parallel([
      Animated.spring(left,    { toValue: rect.x,     useNativeDriver: false, speed: 20, bounciness: 6 }),
      Animated.spring(width,   { toValue: rect.width, useNativeDriver: false, speed: 20, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  }, [activeKey, left, width, opacity]);

  // Aktif tab değişince cursor oraya kaysın
  useEffect(() => {
    moveCursorTo(hoveredKey);
  }, [activeKey, hoveredKey, moveCursorTo]);

  const handleLayout = (key: K) => (e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    layoutsRef.current[key as string] = { x, width: w };
    // İlk ölçümde cursor'ı hemen yerleştir
    if (key === (hoveredKey ?? activeKey)) {
      left.setValue(x);
      width.setValue(w);
      Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: false }).start();
    }
  };

  return (
    <View
      style={[styles.bar, style]}
      // Mouse çıkınca aktife dön
      {...(Platform.OS === 'web' ? {
        onMouseLeave: () => setHoveredKey(null),
      } as any : {})}
    >
      {/* Kayan cursor (absolute) */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.cursor,
          { backgroundColor: accentColor, left, width, opacity },
        ]}
      />

      {/* Tab pill'leri */}
      {items.map((item) => {
        // Yalnızca hover edilen (cursor'un geçici olarak kaydığı) tab beyaz.
        // Aktif tab dahil diğerleri gri — ayrım cursor'un kendisiyle sağlanır.
        const isHovered = item.key === hoveredKey;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            onLayout={handleLayout(item.key)}
            {...(Platform.OS === 'web' ? {
              onHoverIn: () => setHoveredKey(item.key),
            } as any : {})}
            style={styles.pill}
          >
            <Text
              style={[
                styles.pillText,
                { color: isHovered ? '#FFFFFF' : '#64748B' },
              ]}
            >
              {item.label}
              {typeof item.count === 'number' && item.count > 0 ? `  ${item.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    padding: 4,
    position: 'relative',
    // Dış çerçeve / stroke YOK — kullanıcı isteği.
    backgroundColor: 'transparent',
  },
  cursor: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    borderRadius: 999,
    zIndex: 0,
    // Hafif yumuşak gölge — iOS/Android ayrı, web boxShadow
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 6px rgba(15,23,42,0.12)' } as any)
      : {
          shadowColor: '#0F172A',
          shadowOpacity: 0.12,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
        }),
  },
  pill: {
    // position: relative zorunlu, yoksa zIndex yok sayılır ve cursor yazının üstüne biner
    position: 'relative',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 999,
    zIndex: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
