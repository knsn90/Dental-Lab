import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Colors from '../../constants/colors';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: number;
}

export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    // @ts-ignore — boxShadow is valid on web via react-native-web
    boxShadow: '0px 1px 6px rgba(15,23,42,0.06)',
    elevation: 2,
  },
});
