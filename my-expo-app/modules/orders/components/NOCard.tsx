/**
 * NOCard + NOCardHead — Variation C kart bileşenleri
 * ──────────────────────────────────────────────────
 * Beyaz kart (22px radius, 24px padding, shadow yok).
 * Krem (#F5F2EA) zemin üzerinde düz beyaz olarak ayrılır.
 */
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { Check } from '../../../core/ui/icons';
import { useNOTokens, NOType, NORadius } from './NOTokens';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

// ── NOCard ─────────────────────────────────────────────────────────
export interface NOCardProps {
  children: React.ReactNode;
  padded?: boolean;
  style?: any;
}

export function NOCard({ children, padded = true, style }: NOCardProps) {
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  return (
    <View
      style={[
        {
          // Beyaz kart yüzeyi — sayfa cream bg'sinden ayrışsın
          backgroundColor: isDark ? T.card : '#FFFFFF',
          borderRadius: NORadius.xl,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          padding: padded ? 16 : 0,
          flexDirection: 'column' as const,
          // Hafif gölge — yüzey hissi
          ...(Platform.OS === 'web'
            ? { boxShadow: isDark ? 'none' : '0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.04)' }
            : {
                shadowColor: '#0F172A',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0 : 0.05,
                shadowRadius: 8,
                elevation: 1,
              }),
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
  /** 'done' ise badge siyah bg + accent check */
  state?: 'active' | 'done';
  /** Sağ üst köşede küçük pill badge (ör: "Yeni", "3 eklendi") */
  badge?: string;
  /** Başlık sağ tarafına ek içerik */
  headerRight?: React.ReactNode;
  /** Panel-özgü accent rengi — numara rozeti & yeni/badge zemin için. Verilmezse saffron (lab) kullanılır. */
  accent?: string;
}

// Hex'e %15 alpha ekleyerek soft tone üret (#RRGGBB → #RRGGBB26)
function softTone(hex: string, fallback: string) {
  if (!hex) return fallback;
  if (hex.length === 7) return hex + '26';
  return hex;
}

export function NOCardHead({ num, title, sub, state, badge, headerRight, accent }: NOCardHeadProps) {
  const NO = useNOTokens();
  const isDone = state === 'done';
  const accentColor = accent ?? NO.saffron;
  const accentSoft  = accent ? softTone(accent, NO.saffronSoft) : NO.saffronSoft;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
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
            backgroundColor: isDone ? NO.inkStrong : accentColor,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isDone ? (
            <Check size={12} color={accentColor} strokeWidth={2.5} />
          ) : (
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: '#FFFFFF',
                fontFamily: 'monospace',
              }}
            >
              {num}
            </Text>
          )}
        </View>
      )}

      {/* Title + subtitle — minWidth garantili, dar ekranda headerRight bir alt satıra sarar */}
      <View style={{ flex: 1, minWidth: 180 }}>
        <Text style={{ ...NOType.headingSm, color: NO.inkStrong }} numberOfLines={1}>
          {title}
        </Text>
        {sub && (
          <Text style={{ fontSize: 11, color: NO.inkMute, marginTop: 2 }} numberOfLines={1}>
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
            backgroundColor: accentSoft,
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
