import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export default function LabStockScreen() {
  return (
    <SafeAreaView style={s.safe} edges={['bottom']}>
      <View style={s.center}>
        <View style={s.iconWrap}>
          <MaterialCommunityIcons name="package-variant-closed" size={48} color="#2563EB" />
        </View>
        <Text style={s.title}>Stok Modülü</Text>
        <Text style={s.sub}>Bu alan yakında aktif olacak.</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: '#FFFFFF' },
  center:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  iconWrap: { width: 88, height: 88, borderRadius: 24, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:    { fontSize: 20, fontWeight: '700', color: '#0F172A' },
  sub:      { fontSize: 14, color: '#94A3B8' },
});
