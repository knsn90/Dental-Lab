import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Colors from '../../constants/colors';

/**
 * On web: centers content in a 480px card with a colored background.
 * On native: renders children directly (full screen).
 */
export function WebWrapper({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;

  return (
    <View style={styles.outer}>
      <View style={styles.phone}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#1A56DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: {
    width: 480,
    // @ts-ignore
    height: '100vh',
    maxHeight: 900,
    backgroundColor: Colors.background,
    overflow: 'hidden',
    // @ts-ignore
    boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
    borderRadius: 0,
  },
});
