/**
 * NOActionBar — Alt action bar (60px)
 * ────────────────────────────────────
 * Sol: yeşil dot + "Taslak kaydedildi · {time}"
 * Sağ: "← Geri" outline + "İleri →" / "✓ Hekime gönder" primary
 */
import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ArrowRight, Check } from 'lucide-react-native';
import { NO, NORadius } from './NOTokens';

export interface NOActionBarProps {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  /** 'dark' (default) | 'success' (green, step 4) | 'saffron' */
  primary?: 'dark' | 'success' | 'saffron';
  showSaved?: boolean;
  savedTime?: string;
  loading?: boolean;
}

export function NOActionBar({
  onBack,
  onNext,
  nextLabel = 'İleri',
  primary = 'dark',
  showSaved = true,
  savedTime,
  loading,
}: NOActionBarProps) {
  const primaryBg =
    primary === 'success'
      ? NO.success
      : primary === 'saffron'
      ? NO.saffron
      : NO.inkStrong;

  const primaryTextColor =
    primary === 'saffron' ? NO.inkStrong : '#FFFFFF';

  return (
    <View
      style={{
        height: 60,
        paddingHorizontal: 24,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: NO.borderSoft,
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Draft status */}
      {showSaved && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: NO.success,
            }}
          />
          <Text style={{ fontSize: 11, color: NO.inkSoft }}>
            Taslak kaydedildi{savedTime ? ` · ${savedTime}` : ''}
          </Text>
        </View>
      )}

      {/* Spacer */}
      <View style={{ flex: 1 }} />

      {/* Geri */}
      {onBack && (
        <Pressable
          onPress={onBack}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 18,
            borderRadius: NORadius.md,
            borderWidth: 1,
            borderColor: NO.borderMedium,
            backgroundColor: '#FFFFFF',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <ArrowRight
            size={12}
            color={NO.inkStrong}
            strokeWidth={1.8}
            style={{ transform: [{ rotate: '180deg' }] }}
          />
          <Text style={{ fontSize: 13, fontWeight: '500', color: NO.inkStrong }}>
            Geri
          </Text>
        </Pressable>
      )}

      {/* İleri / Submit */}
      <Pressable
        onPress={loading ? undefined : onNext}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 22,
          borderRadius: NORadius.md,
          backgroundColor: primaryBg,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={primaryTextColor} />
        ) : (
          <>
            {primary === 'success' && (
              <Check size={13} color={primaryTextColor} strokeWidth={2} />
            )}
            <Text
              style={{
                fontSize: 13,
                fontWeight: '500',
                color: primaryTextColor,
              }}
            >
              {nextLabel}
            </Text>
            {primary !== 'success' && (
              <ArrowRight
                size={13}
                color={primaryTextColor}
                strokeWidth={1.8}
              />
            )}
          </>
        )}
      </Pressable>
    </View>
  );
}
