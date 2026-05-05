/**
 * NOTopBar — Sticky üst bar (56px yükseklik)
 * ────────────────────────────────────────────
 * Sol: "Yeni Sipariş" monospace badge + "›" + "Taslak"
 * Sağ: Hekim · Hasta · diş badge + İptal butonu
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { NO, NORadius } from './NOTokens';

export interface NOTopBarProps {
  hekim?: string;
  hasta?: string;
  toothCount?: number;
  onCancel?: () => void;
}

export function NOTopBar({ hekim, hasta, toothCount, onCancel }: NOTopBarProps) {
  return (
    <View
      style={{
        height: 56,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderBottomWidth: 1,
        borderBottomColor: NO.borderSoft,
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Left: breadcrumb */}
      <View
        style={{
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 6,
          backgroundColor: 'rgba(0,0,0,0.05)',
        }}
      >
        <Text style={{ fontSize: 11, fontFamily: 'monospace' }}>
          Yeni Sipariş
        </Text>
      </View>
      <Text style={{ fontSize: 13, color: NO.inkSoft }}>›</Text>
      <Text style={{ fontSize: 13, fontWeight: '500', color: NO.inkStrong }}>
        Taslak
      </Text>

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Right: context badges */}
      {hekim && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Text style={{ fontSize: 12 }}>
            <Text style={{ color: NO.inkMute }}>Hekim </Text>
            <Text style={{ color: NO.inkStrong, fontWeight: '500' }}>{hekim}</Text>
          </Text>
          {hasta && (
            <Text style={{ fontSize: 12 }}>
              <Text style={{ color: NO.inkMute }}>Hasta </Text>
              <Text style={{ color: NO.inkStrong, fontWeight: '500' }}>{hasta}</Text>
            </Text>
          )}
          {toothCount != null && toothCount > 0 && (
            <View
              style={{
                paddingVertical: 2,
                paddingHorizontal: 8,
                borderRadius: NORadius.pill,
                backgroundColor: NO.saffronTint,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: NO.inkMedium,
                }}
              >
                {toothCount} diş
              </Text>
            </View>
          )}
        </View>
      )}

      {/* İptal */}
      <Pressable onPress={onCancel}>
        <Text style={{ fontSize: 12, color: NO.inkSoft }}>İptal</Text>
      </Pressable>
    </View>
  );
}
