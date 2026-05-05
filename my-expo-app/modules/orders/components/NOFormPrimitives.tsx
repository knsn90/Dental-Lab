/**
 * NOFormPrimitives — Handoff Variation C form UI parçaları
 * ─────────────────────────────────────────────────────────
 * NOEyebrow, NOLabel, NOField, NOSegment, NOToggle, NOStepHeader
 * Tümü inline style — React Native + web uyumlu.
 */
import React from 'react';
import { View, Text, Pressable, TextInput, Platform } from 'react-native';
import { NO, NOType, NORadius } from './NOTokens';

// ── NOEyebrow ─────────────────────────────────────────────────────
export interface NOEyebrowProps {
  children: React.ReactNode;
  color?: string;
}

export function NOEyebrow({ children, color = NO.inkMute }: NOEyebrowProps) {
  return (
    <Text
      style={{
        ...NOType.eyebrow,
        color,
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
        <Text style={{ color: NO.error, marginRight: 3 }}>* </Text>
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
  const borderColor = focused
    ? NO.inkStrong
    : error
    ? NO.error
    : 'transparent';

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
            ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
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
              backgroundColor: active ? NO.inkStrong : NO.bgInput,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '500',
                color: active ? '#FFFFFF' : NO.inkMedium,
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
}

export function NOToggle({ on, onChange }: NOToggleProps) {
  return (
    <Pressable
      onPress={() => onChange?.(!on)}
      style={{
        width: 36,
        height: 22,
        borderRadius: NORadius.pill,
        backgroundColor: on ? NO.inkStrong : 'rgba(0,0,0,0.12)',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: on ? NO.saffron : '#FFFFFF',
          position: 'absolute',
          top: 3,
          left: on ? 17 : 3,
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
  return (
    <View style={{ marginBottom: 14 }}>
      <NOEyebrow>{`Adım ${step} / ${total}`}</NOEyebrow>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
        <Text
          style={{
            ...NOType.displayXl,
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
  return (
    <Text style={{ fontWeight: '400', color: NO.inkMute }}>
      {children}
    </Text>
  );
}
