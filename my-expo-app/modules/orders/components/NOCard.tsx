/**
 * NOCard + NOCardHead — Variation C kart bileşenleri
 * ──────────────────────────────────────────────────
 * Beyaz kart (22px radius, 24px padding, shadow yok).
 * Krem (#F5F2EA) zemin üzerinde düz beyaz olarak ayrılır.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { Check } from 'lucide-react-native';
import { NO, NOType, NORadius } from './NOTokens';

// ── NOCard ─────────────────────────────────────────────────────────
export interface NOCardProps {
  children: React.ReactNode;
  padded?: boolean;
  style?: any;
}

export function NOCard({ children, padded = true, style }: NOCardProps) {
  return (
    <View
      style={[
        {
          backgroundColor: '#FFFFFF',
          borderRadius: NORadius.xl,
          padding: padded ? 16 : 0,
          flexDirection: 'column' as const,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── NOCardHead ─────────────────────────────────────────────────────
export interface NOCardHeadProps {
  /** Numara badge'inde gösterilecek rakam */
  num?: number | string;
  /** Kart başlığı */
  title: string;
  /** Alt açıklama */
  sub?: string;
  /** 'done' ise badge siyah bg + saffron check */
  state?: 'active' | 'done';
  /** Sağ üst köşede küçük pill badge (ör: "Yeni", "3 eklendi") */
  badge?: string;
  /** Başlık sağ tarafına ek içerik */
  headerRight?: React.ReactNode;
}

export function NOCardHead({ num, title, sub, state, badge, headerRight }: NOCardHeadProps) {
  const isDone = state === 'done';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 12,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: NO.borderSoft,
      }}
    >
      {/* Number badge */}
      {num != null && (
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: NORadius.sm,
            backgroundColor: isDone ? NO.inkStrong : NO.saffron,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isDone ? (
            <Check size={12} color={NO.saffron} strokeWidth={2.5} />
          ) : (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: isDone ? NO.saffron : NO.inkStrong,
                fontFamily: 'monospace',
              }}
            >
              {num}
            </Text>
          )}
        </View>
      )}

      {/* Title + subtitle */}
      <View style={{ flex: 1 }}>
        <Text style={{ ...NOType.headingSm, color: NO.inkStrong }}>
          {title}
        </Text>
        {sub && (
          <Text style={{ fontSize: 11, color: NO.inkMute, marginTop: 2 }}>
            {sub}
          </Text>
        )}
      </View>

      {/* Badge pill */}
      {badge && (
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: NORadius.pill,
            backgroundColor: NO.saffronSoft,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: '600',
              color: NO.inkMedium,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            {badge}
          </Text>
        </View>
      )}

      {/* Extra header right content */}
      {headerRight}
    </View>
  );
}
