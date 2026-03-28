import React from 'react';
import { View, StyleSheet } from 'react-native';
import { C } from '../theme/colors';

interface DividerProps {
  vertical?: boolean;
  margin?: number;
}

export function Divider({ vertical = false, margin = 8 }: DividerProps) {
  if (vertical) {
    return (
      <View
        style={[
          styles.vertical,
          { marginHorizontal: margin },
        ]}
      />
    );
  }
  return (
    <View
      style={[
        styles.horizontal,
        { marginVertical: margin },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: {
    height: 1,
    backgroundColor: C.border,
  },
  vertical: {
    width: 1,
    backgroundColor: C.border,
    alignSelf: 'stretch',
  },
});
