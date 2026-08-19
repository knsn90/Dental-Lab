/**
 * MoreMenuSheet — Bottom Sheet list (Apple Action Sheet stili).
 *
 *  • Alttan kayan beyaz sheet (translateY animation)
 *  • Drag handle + title üstte
 *  • Items: full-width rows, icon (circle) + label + sub + chevron
 *  • Backdrop: native BlurView (iOS/Android) + koyu overlay
 *  • Modal route değil — geçici overlay
 */
import React, { useEffect, useRef } from 'react';
import { isRTL } from '../../i18n';
import {
  Modal, View, Text, Pressable, Animated, Easing, Platform,
  useWindowDimensions, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ChevronRight, ChevronLeft, X } from 'lucide-react-native';
import { autoT } from '../../i18n/autoTranslate';
import type { LucideIcon } from 'lucide-react-native';
import { useMobileTokens } from '../../theme/mobileDesignTokens';
import { useThemeModeStore } from '../../store/themeModeStore';
import { SimanWordmark } from '../SimanWordmark';

export interface MoreItem {
  key: string;
  label: string;
  sub?: string;
  icon: LucideIcon;
  accent?: string;
  badge?: number;
  onPress: () => void;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: MoreItem[];
  accentColor?: string;
}

export function MoreMenuSheet({ visible, onClose, items, accentColor = '#0F172A', title, subtitle }: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Animasyon değerleri
  const backdrop  = useRef(new Animated.Value(0)).current;
  const sheetY    = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.spring(sheetY, {
          toValue: 0, damping: 22, stiffness: 240, mass: 1, useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: height, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdrop, sheetY, height]);

  // Sheet maksimum yüksekliği — ekranın %75'i (item çoksa scroll)
  const maxSheetHeight = Math.floor(height * 0.92);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* iOS/Android: Native BlurView arkaplan blur */}
      {(Platform.OS === 'ios' || Platform.OS === 'android') && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            opacity: backdrop,
          }}
        >
          <BlurView intensity={25} tint="dark" style={{ flex: 1 }} />
        </Animated.View>
      )}

      {/* Koyu overlay — backdrop yarı şeffaf */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15,23,42,0.40)',
          opacity: backdrop,
          ...(Platform.OS === 'web' ? {
            backdropFilter: 'blur(10px) saturate(140%)',
            WebkitBackdropFilter: 'blur(10px) saturate(140%)',
          } as any : {}),
        }}
      >
        {/* Tap-to-close */}
        <Pressable
          onPress={onClose}
          style={{ flex: 1 }}
          accessibilityLabel={autoT('Menüyü kapat')}
        />

        {/* Sheet — alttan kayar */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            transform: [{ translateY: sheetY }],
            backgroundColor: T.card,
            borderTopStartRadius: 24,
            borderTopEndRadius: 24,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            maxHeight: maxSheetHeight,
            ...(Platform.OS === 'ios' ? {
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.6 : 0.20,
              shadowRadius: 24,
              shadowOffset: { width: 0, height: -8 },
            } : Platform.OS === 'web' ? {
              boxShadow: '0 -12px 36px rgba(0,0,0,0.18)',
            } as any : {
              elevation: 20,
            }),
          }}
        >
          {/* Drag handle — minimal iOS native */}
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <View style={{
              width: 36, height: 5, borderRadius: 3,
              backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.16)',
            }} />
          </View>

          {/* Header — sadece title (X yok, drag handle yeterli; tap-outside ile kapanır) */}
          <View style={{
            paddingHorizontal: 22,
            paddingTop: 12,
            paddingBottom: 8,
          }}>
            <Text style={{
              fontSize: 24, fontWeight: '800', color: T.ink,
              letterSpacing: -0.5, lineHeight: 28,
            }}>
              {title ?? autoT('Daha')}
            </Text>
            {subtitle ? (
              <Text style={{
                fontSize: 13.5, color: T.ink3,
                marginTop: 3, letterSpacing: -0.1,
              }}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {/* List — modern iOS Settings-style grouped card */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8 }}
          >
            <View style={{
              backgroundColor: T.cardSoft, // iOS grouped list bg
              borderRadius: 18,
              overflow: 'hidden',
            }}>
              {items.map((item, idx) => (
                <React.Fragment key={item.key}>
                  <ListRow
                    item={item}
                    accentColor={accentColor}
                    isLast={idx === items.length - 1}
                    onPress={() => { onClose(); setTimeout(item.onPress, 80); }}
                    inkColor={T.ink}
                    chevronColor={T.ink3}
                    badgeBorderColor={T.card}
                    isDark={isDark}
                  />
                  {idx < items.length - 1 && (
                    <View style={{
                      height: 1, marginStart: 70,
                      backgroundColor: T.hairline,
                    }} />
                  )}
                </React.Fragment>
              ))}
            </View>
          </ScrollView>

          {/* Powered by Siman — platform kimliği (white-label) */}
          <View style={{
            // Marka kilidi — RTL'de sıra ters dönmesin (bkz. PatternsShell)
            flexDirection: isRTL() ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            paddingTop: 12, marginTop: 4, marginHorizontal: 16,
            borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
          }}>
            <Text style={{ fontSize: 10, color: T.ink3 }} numberOfLines={1}>Powered by</Text>
            <SimanWordmark height={9} color="#9A9A9A" />
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── List Row ──────────────────────────────────────────────────────────
function ListRow({
  item, accentColor, isLast, onPress, inkColor, chevronColor, badgeBorderColor, isDark,
}: {
  item: MoreItem;
  accentColor: string;
  isLast: boolean;
  onPress: () => void;
  inkColor: string;
  chevronColor: string;
  badgeBorderColor: string;
  isDark: boolean;
}) {
  const Icon = item.icon;
  const itemAccent = item.accent ?? accentColor;
  const rtl = isRTL();
  // Satır sonu chevron'u yön bildirir → RTL'de aynalanır
  const Chevron = rtl ? ChevronLeft : ChevronRight;

  // STATIC style — RN 0.83 + new arch iOS'ta Pressable style callback fn
  // bazen uygulanmıyor (flexDirection: 'row' atılıyor, default column kalıyor).
  // Static array hep çalışır.
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer' as any,
      transition: 'background-color 120ms' as any,
    } : {}),
  };
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)' }}
      style={rowStyle}
    >
      {/* Icon squircle — solid accent tint, no border (modern iOS) */}
      <View style={{
        width: 36, height: 36, borderRadius: 10,
        backgroundColor: itemAccent,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={19} color="#FFFFFF" strokeWidth={2} />
        {item.badge ? (
          <View style={{
            position: 'absolute', top: -3, ...(rtl ? { left: -3 } : { right: -3 }),
            minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 5,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#DC2626',
            borderWidth: 2, borderColor: badgeBorderColor,
          }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFFFFF' }}>
              {item.badge > 99 ? '99+' : item.badge}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Label — tek satır, icon ile mükemmel hizalı */}
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 16, fontWeight: '600', color: inkColor,
          letterSpacing: -0.2,
        }}
      >
        {item.label}
      </Text>

      {/* Chevron — iOS native ince */}
      <Chevron size={18} color={chevronColor} strokeWidth={2.2} />
    </Pressable>
  );
}
