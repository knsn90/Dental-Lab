/**
 * NOFormPrimitives — Handoff Variation C form UI parçaları
 * ─────────────────────────────────────────────────────────
 * NOEyebrow, NOLabel, NOField, NOSegment, NOToggle, NOStepHeader
 * Tümü inline style — React Native + web uyumlu.
 */
import React from 'react';
import { View, Text, Pressable, TextInput, Platform, useWindowDimensions } from 'react-native';
import { useNOTokens, NOType, NORadius } from './NOTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { isRTL } from '../../../core/i18n';

// ── NOEyebrow ─────────────────────────────────────────────────────
export interface NOEyebrowProps {
  children: React.ReactNode;
  color?: string;
}

export function NOEyebrow({ children, color }: NOEyebrowProps) {
  const NO = useNOTokens();
  const resolved = color ?? NO.inkMute;
  return (
    <Text
      style={{
        ...NOType.eyebrow,
        color: resolved,
      }}
    >
      {children}
    </Text>
  );
}

// ── NOLabel ───────────────────────────────────────────────────────
export interface NOLabelProps {
  children: React.ReactNode;
  required?: boolean;
}

export function NOLabel({ children, required }: NOLabelProps) {
  const NO = useNOTokens();
  return (
    <Text
      style={{
        fontSize: 11,
        color: NO.inkSoft,
        fontWeight: '500',
        marginBottom: 6,
        paddingHorizontal: 4,
      }}
    >
      {required && (
        <Text style={{ color: NO.error, marginEnd: 3 }}>* </Text>
      )}
      {children}
    </Text>
  );
}

// ── NOField ───────────────────────────────────────────────────────
export interface NOFieldProps {
  value?: string;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  focused?: boolean;
  error?: boolean;
  editable?: boolean;
  multiline?: boolean;
  minHeight?: number;
  onPress?: () => void;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
}

export function NOField({
  value,
  placeholder,
  onChangeText,
  icon,
  suffix,
  focused,
  error,
  editable = true,
  multiline,
  minHeight,
  onPress,
  keyboardType,
}: NOFieldProps) {
  const NO = useNOTokens();
  const borderColor = focused
    ? NO.inkStrong
    : error
    ? NO.error
    : NO.borderSoft;

  const Container = onPress ? Pressable : View;

  return (
    <Container
      {...(onPress ? { onPress } : {})}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 14,
        backgroundColor: NO.bgInput,
        borderRadius: NORadius.md,
        flexDirection: multiline ? 'column' : 'row',
        alignItems: multiline ? 'stretch' : 'center',
        gap: 10,
        borderWidth: 1.5,
        borderColor,
        ...(minHeight ? { minHeight } : {}),
      }}
    >
      {icon && (
        <View style={{ opacity: 0.5 }}>
          {icon}
        </View>
      )}
      {onPress ? (
        <Text
          style={{
            flex: 1,
            fontSize: 13,
            color: value ? NO.inkStrong : NO.inkMute,
          }}
          numberOfLines={multiline ? undefined : 1}
        >
          {value || placeholder}
        </Text>
      ) : (
        <TextInput
          value={value}
          placeholder={placeholder}
          placeholderTextColor={NO.inkMute}
          onChangeText={onChangeText}
          editable={editable}
          multiline={multiline}
          keyboardType={keyboardType}
          style={{
            flex: 1,
            fontSize: 13,
            color: NO.inkStrong,
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
            ...(multiline ? { textAlignVertical: 'top' as const } : {}),
          }}
        />
      )}
      {suffix && (
        <View>
          {typeof suffix === 'string' ? (
            <Text style={{ color: NO.inkMute, fontSize: 12 }}>{suffix}</Text>
          ) : (
            suffix
          )}
        </View>
      )}
    </Container>
  );
}

// ── NOSegment ─────────────────────────────────────────────────────
export interface NOSegmentProps {
  options: string[];
  value: string;
  onChange?: (value: string) => void;
}

export function NOSegment({ options, value, onChange }: NOSegmentProps) {
  const NO = useNOTokens();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange?.(opt)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: NORadius.pill,
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderColor: active ? NO.inkStrong : NO.borderSoft,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: active ? '600' : '500',
                color: active ? NO.inkStrong : NO.inkMedium,
              }}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── NOToggle ──────────────────────────────────────────────────────
export interface NOToggleProps {
  on: boolean;
  onChange?: (value: boolean) => void;
  /** Panel-aware thumb accent. Default = lab saffron. */
  accentColor?: string;
}

export function NOToggle({ on, onChange, accentColor }: NOToggleProps) {
  const NO = useNOTokens();
  const trackAccent = accentColor ?? NO.saffron;
  // Kaydırmalı topuz yön duyarlı DEĞİL: RTL'de "açık" konum sola gitmeli.
  const rtl = isRTL();
  // iOS-tarzı toggle: ON → accent-colored solid track + white thumb,
  //                  OFF → translucent neutral track + white thumb
  return (
    <Pressable
      onPress={() => onChange?.(!on)}
      style={{
        width: 36,
        height: 22,
        borderRadius: NORadius.pill,
        backgroundColor: on ? trackAccent : NO.borderMedium,
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          position: 'absolute',
          top: 3,
          ...(rtl ? { right: on ? 17 : 3 } : { left: on ? 17 : 3 }),
        }}
      />
    </Pressable>
  );
}

// ── NOStepHeader ──────────────────────────────────────────────────
/** Step page header with eyebrow "Adım X / 4" + display title */
export interface NOStepHeaderProps {
  step: number;
  total?: number;
  /** Title with optional emphasized part. Pass React nodes. */
  children: React.ReactNode;
  sub?: string;
  /** Extra content aligned to the right of the title row */
  headerRight?: React.ReactNode;
}

export function NOStepHeader({ step, total = 4, children, sub, headerRight }: NOStepHeaderProps) {
  const NO = useNOTokens();
  // Responsive boyutlandırma — mobile dar ekranda 32 → 22, tablet 26, desktop 32
  const { width } = useWindowDimensions();
  const isPhone   = width < 520;
  const isTablet  = width >= 520 && width < 1024;
  const heroSize  = isPhone ? 22 : isTablet ? 26 : 32;
  const heroLh    = isPhone ? 26 : isTablet ? 30 : 35;
  return (
    <View style={{ marginBottom: 8 }}>
      <NOEyebrow>{`Adım ${step} / ${total}`}</NOEyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text
          style={{
            ...NOType.displayXl,
            fontSize: heroSize,
            lineHeight: heroLh,
            letterSpacing: -0.03 * heroSize,
            color: NO.inkStrong,
            flex: 1,
          }}
        >
          {children}
        </Text>
        {headerRight}
      </View>
      {sub && (
        <Text style={{ fontSize: 13, color: NO.inkSoft, marginTop: 4 }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

// ── NOEmText ──────────────────────────────────────────────────────
/** Inline emphasized text (gray, normal weight) used in step titles */
export function NOEmText({ children }: { children: React.ReactNode }) {
  const NO = useNOTokens();
  return (
    <Text style={{ fontWeight: '400', color: NO.inkMute }}>
      {children}
    </Text>
  );
}
