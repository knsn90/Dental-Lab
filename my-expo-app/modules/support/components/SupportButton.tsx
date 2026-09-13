/**
 * SupportButton — herhangi bir yerden destek talebi açma butonu.
 * Context'i prop olarak alır → openSupport() çağırır.
 *
 * Kullanım:
 *   <SupportButton context={{ source: 'order', order_id, order_number, ... }} />
 *   <SupportButton variant="icon" context={...} />
 *   <SupportButton variant="pill" label="Bu aşamada destek iste" context={...} />
 */
import React from 'react';
import { Pressable, Text, Platform } from 'react-native';
import { SupportIcon } from '../../../core/ui/SupportIcon';
import { webTitle } from '../../../core/util/webTitle';
import { openSupport } from '../../../core/store/supportStore';
import type { SupportContext, SupportCategory, SupportPriority } from '../types';

interface Props {
  context?: SupportContext;
  category?: SupportCategory;
  priority?: SupportPriority;
  subjectHint?: string;
  workOrderId?: string | null;
  stageKey?: string | null;
  errorCode?: string | null;
  variant?: 'icon' | 'pill' | 'button';
  label?: string;
  size?: 'sm' | 'md';
  color?: string;
  /** Renkli/koyu zemin (ör. yeşil hero) üzerinde: beyaz-alfa çip + beyaz ikon. */
  onDark?: boolean;
  accessibilityLabel?: string;
}

export function SupportButton({
  context, category, priority, subjectHint,
  workOrderId, stageKey, errorCode,
  variant = 'pill', label,
  size = 'md', color, onDark = false,
  accessibilityLabel = 'Destek talebi aç',
}: Props) {
  const onPress = () => {
    openSupport({ context, category, priority, subjectHint, workOrderId, stageKey, errorCode });
  };

  if (variant === 'icon') {
    const dim = size === 'sm' ? 28 : 34;
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        {...webTitle(accessibilityLabel)}
        style={({ hovered }: any) => ({
          width: dim, height: dim, borderRadius: 9,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: onDark
            ? (hovered ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.18)')
            : (hovered ? 'rgba(194,65,12,0.12)' : 'rgba(194,65,12,0.06)'),
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <SupportIcon size={size === 'sm' ? 13 : 15} color={color ?? (onDark ? '#FFFFFF' : '#C2410C')} strokeWidth={1.7} />
      </Pressable>
    );
  }

  if (variant === 'button') {
    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={accessibilityLabel}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 6,
          paddingHorizontal: size === 'sm' ? 12 : 14, paddingVertical: size === 'sm' ? 7 : 9,
          borderRadius: 10,
          borderWidth: 1, borderColor: 'rgba(15,23,42,0.10)',
          backgroundColor: hovered ? 'rgba(194,65,12,0.06)' : '#FFFFFF',
          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
        })}
      >
        <SupportIcon size={size === 'sm' ? 12 : 14} color={color ?? '#C2410C'} strokeWidth={1.8} />
        <Text style={{ fontSize: size === 'sm' ? 11 : 12.5, fontWeight: '700', color: color ?? '#0F172A' }}>
          {label ?? 'Destek Aç'}
        </Text>
      </Pressable>
    );
  }

  // pill (default)
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: size === 'sm' ? 9 : 11, paddingVertical: size === 'sm' ? 4 : 6,
        borderRadius: 9999,
        backgroundColor: hovered ? 'rgba(194,65,12,0.14)' : 'rgba(194,65,12,0.08)',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <SupportIcon size={size === 'sm' ? 10 : 12} color="#C2410C" strokeWidth={1.8} />
      <Text style={{ fontSize: size === 'sm' ? 10.5 : 11.5, fontWeight: '700', color: '#9A3412' }}>
        {label ?? 'Destek Aç'}
      </Text>
    </Pressable>
  );
}
