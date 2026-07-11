// core/ui/mobile/AppBar.tsx
// Aydın Lab Mobile handoff — top app bar.
// Pattern: 56 safe-area + 20 horizontal padding · optional kicker (caps) · title big (36/300) or std (22/600).

import React from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { MOBILE_TOKENS } from '../../theme/mobileDesignTokens';

export function AppBar({
  kicker,
  title,
  big = false,
  leading,
  trailing,
  showBack = false,
}: {
  kicker?: string;
  title?: string;
  /** big = display 36/300 (hero); else 22/600 (std) */
  big?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  showBack?: boolean;
}) {
  const router = useRouter();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: big ? 8 : 6, backgroundColor: 'transparent' }}>
      {/* Top row — back / leading + trailing */}
      {(showBack || leading || trailing) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, marginBottom: kicker ? 6 : 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {showBack && (
              <Pressable
                onPress={() => router.canGoBack() && router.back()}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.05)' }}
              >
                <ChevronLeft size={20} color={MOBILE_TOKENS.ink} strokeWidth={2} />
              </Pressable>
            )}
            {leading}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {trailing}
          </View>
        </View>
      )}

      {/* Kicker (caps label) */}
      {kicker && (
        <Text style={{
          fontSize: 11, fontWeight: '600', color: MOBILE_TOKENS.ink3,
          letterSpacing: 1.2, textTransform: 'uppercase',
          ...(Platform.OS === 'web' ? { fontFamily: MOBILE_TOKENS.ui } as any : {}),
          marginBottom: 4,
        }}>
          {kicker}
        </Text>
      )}

      {/* Title */}
      {title && (
        <Text
          numberOfLines={2}
          style={{
            fontSize: big ? 32 : 22,
            fontWeight: big ? '300' : '600',
            color: MOBILE_TOKENS.ink,
            letterSpacing: big ? -0.7 : -0.3,
            lineHeight: big ? 36 : 26,
            ...(Platform.OS === 'web'
              ? { fontFamily: big ? MOBILE_TOKENS.display : MOBILE_TOKENS.ui } as any
              : {}),
          }}
        >
          {title}
        </Text>
      )}
    </View>
  );
}
