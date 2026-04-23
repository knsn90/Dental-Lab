import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';

interface Props {
  active: boolean;
  label: string;
  count?: number;
  onPress: () => void;
  accentColor: string;
}

export function TabButton({ active, label, count, onPress, accentColor }: Props) {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const hover = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [active, progress]);

  const color = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['#64748B', '#FFFFFF'],
  });
  const hoverOpacity = Animated.multiply(hover, Animated.subtract(1, progress));

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() =>
        Animated.timing(hover, { toValue: 1, duration: 140, useNativeDriver: false }).start()
      }
      onHoverOut={() =>
        Animated.timing(hover, { toValue: 0, duration: 140, useNativeDriver: false }).start()
      }
      style={styles.pill}
    >
      <Animated.View style={[styles.pillHoverBg, { opacity: hoverOpacity }]} pointerEvents="none" />
      <Animated.View
        style={[styles.pillBg, { backgroundColor: accentColor, opacity: progress }]}
        pointerEvents="none"
      />
      <Animated.Text style={[styles.pillText, { color }]}>
        {label}
        {typeof count === 'number' && count > 0 ? `  ${count}` : ''}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 22, paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'transparent',
    position: 'relative',
  },
  pillBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  pillHoverBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    backgroundColor: '#EEF2F6',
  },
  pillText: { fontSize: 12, fontWeight: '600', color: '#64748B', letterSpacing: 0.2 },
});
