import React, { useEffect, useRef } from 'react';
import { Animated, TouchableWithoutFeedback, StyleSheet, Platform } from 'react-native';

interface Props {
  value: boolean;
  onValueChange: (v: boolean) => void;
  accentColor?: string;
  style?: any;
  disabled?: boolean;
}

const TRACK_W    = 50;
const TRACK_H    = 28;
const THUMB_SIZE = 24;
const MARGIN     = 2;
const TRAVEL     = TRACK_W - THUMB_SIZE - MARGIN * 2;

/**
 * iOS-style custom toggle.
 * ON  → colored track (accentColor) + white thumb, slid right
 * OFF → grey track  + white thumb, slid left
 */
export function AppSwitch({
  value,
  onValueChange,
  accentColor = '#0F172A',
  style,
  disabled = false,
}: Props) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      overshootClamping: true,
      restSpeedThreshold: 0.001,
      restDisplacementThreshold: 0.001,
    }).start();
  }, [value]);

  const translateX = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [MARGIN, MARGIN + TRAVEL],
  });

  const bgColor = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['#D1D5DB', accentColor],
  });

  return (
    <TouchableWithoutFeedback
      onPress={() => { if (!disabled) onValueChange(!value); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View
        style={[
          styles.track,
          { backgroundColor: bgColor, opacity: disabled ? 0.4 : 1 },
          style,
        ]}
      >
        <Animated.View
          style={[styles.thumb, { transform: [{ translateX }] }]}
        />
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
});
