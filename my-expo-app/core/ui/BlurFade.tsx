import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleProp, ViewStyle } from 'react-native';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  delay?: number;
  yOffset?: number;
  blur?: number;
}

export function BlurFade({
  children,
  style,
  duration = 400,
  delay = 0,
  yOffset = 6,
  blur = 6,
}: Props) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration,
      delay: 40 + delay,
      useNativeDriver: false,
    }).start();
  }, [progress, duration, delay]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [yOffset, -yOffset],
  });

  const animatedStyle: any = {
    opacity: progress,
    transform: [{ translateY }],
  };

  if (Platform.OS === 'web') {
    const filter = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [`blur(${blur}px)`, 'blur(0px)'],
    });
    animatedStyle.filter = filter;
    animatedStyle.WebkitFilter = filter;
  }

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}
