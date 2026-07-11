/**
 * NOPageChrome — Full page shell composition
 * ────────────────────────────────────────────
 * Content area + NOActionBar. Krem (#F5F2EA) background.
 */
import React from 'react';
import { View, Text, Pressable, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';

const LIQUID_GLASS = Platform.OS === 'ios' && !!isLiquidGlassSupported;
// Web'de portal kullanılır — kartı doğrudan document.body altına yerleştirir
// böylece hiçbir parent'ın transform/filter'ı `position: fixed` davranışını bozmaz.
let createPortal: ((children: React.ReactNode, container: Element) => React.ReactNode) | null = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}
import { ArrowLeft, ArrowRight, Check, Loader, X, CloudUpload, MessageCircle, Printer } from 'lucide-react-native';
import { useNOTokens } from './NOTokens';
import { NOActionBar, NOActionBarProps } from './NOActionBar';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';

export interface NOPageChromeProps {
  /** Current step (1-4) */
  step: number;
  /** Top bar context */
  hekim?: string;
  hasta?: string;
  toothCount?: number;
  onCancel?: () => void;
  /** Stepper navigation */
  onStepPress?: (step: number) => void;
  /** Action bar */
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  actionPrimary?: NOActionBarProps['primary'];
  loading?: boolean;
  savedTime?: string;
  /** Step 4 right panel */
  rightPanel?: React.ReactNode;
  /** Page title shown above step content */
  title?: string;
  /** Main step content */
  children: React.ReactNode;
  /** Sticky upload button (top-right, X butonunun yanı) — varsa render edilir */
  onUpload?: () => void;
  /** Yüklü dosya sayısı (badge) */
  uploadCount?: number;
  /** Sticky mesaj butonu — varsa upload'ın solunda render edilir */
  onChat?: () => void;
  /** Okunmamış mesaj sayısı (badge) */
  chatUnreadCount?: number;
  /** Sticky çıktı al butonu — varsa chat'in solunda render edilir (web-only önerilir) */
  onPrint?: () => void;
  /** Sticky kartta "Önizleme" butonu — sipariş özetini açar (varsa) */
  onPreview?: () => void;
  /** Panel accent rengi — upload/mesaj ikonu için */
  accent?: string;
  /** Sayfa zemini — panel-aware bg (varsayılan NO.bgStage cream) */
  bgColor?: string;
}

const PANEL_BREAKPOINT = 768;

export function NOPageChrome({
  step,
  onBack,
  onNext,
  nextLabel,
  actionPrimary,
  loading,
  savedTime,
  rightPanel,
  title,
  children,
  onCancel,
  onUpload,
  uploadCount = 0,
  onChat,
  onPreview,
  chatUnreadCount = 0,
  onPrint,
  accent,
  bgColor,
}: NOPageChromeProps) {
  const { width } = useWindowDimensions();
  const showPanel = width >= PANEL_BREAKPOINT;
  const insets = useSafeAreaInsets();
  const NO = useNOTokens();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Mobile'da form alanı bir beyaz tabaka — cream "şerit"ler (top/bottom)
  // görünmesin. Form kartları zaten beyaz, bg ile birleşip continuous form
  // sheet hissi verir. Desktop'ta cream stage bg.
  const isMobile = width < PANEL_BREAKPOINT;
  const outerBg = isMobile ? T.card : (bgColor ?? NO.bgStage);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: outerBg,
        flexDirection: 'column',
        ...(Platform.OS === 'web' ? { overflow: 'hidden' as any } : {}),
      }}
    >
      {/* ── Safe-zone header — sticky action buttons (liquid glass) ─────
          NOT: page sheet modal'da insets.top device dynamic island için
          ~60px döndürüyor ama sheet zaten o alanın altında başlıyor — bu
          yüzden insets.top eklemiyoruz. Küçük sabit margin yeterli. */}
      <View style={{
        position: 'absolute',
        top: 8,
        right: 12,
        zIndex: 50,
        flexDirection: 'row',
        gap: 6,
      }}>
        {!!onPrint && (
          <GlassActionBtn onPress={onPrint} label="Çıktı al" iconColor={accent ?? NO.inkStrong}>
            <Printer size={20} color={accent ?? NO.inkStrong} strokeWidth={2} />
          </GlassActionBtn>
        )}
        {!!onChat && (
          <GlassActionBtn onPress={onChat} label="Mesaj" iconColor={accent ?? NO.inkStrong}
            badge={chatUnreadCount > 0 ? { value: chatUnreadCount, color: '#C25450' } : undefined}>
            <MessageCircle size={20} color={accent ?? NO.inkStrong} strokeWidth={2} />
          </GlassActionBtn>
        )}
        {!!onUpload && (
          <GlassActionBtn onPress={onUpload} label="Dosya yükle" iconColor={accent ?? NO.inkStrong}
            badge={uploadCount > 0 ? { value: uploadCount, color: accent ?? NO.inkStrong } : undefined}>
            <CloudUpload size={20} color={accent ?? NO.inkStrong} strokeWidth={2} />
          </GlassActionBtn>
        )}
        {onCancel && (
          <GlassActionBtn onPress={onCancel} label="Kapat" iconColor={NO.inkStrong}>
            <X size={20} color={NO.inkStrong} strokeWidth={2} />
          </GlassActionBtn>
        )}
      </View>

      {/* Main area: content + optional right panel */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          ...(Platform.OS === 'web' ? { overflow: 'hidden' as any } : {}),
        }}
      >
        {/* Step content */}
        <View
          style={{
            flex: 1,
            ...(Platform.OS === 'web'
              ? { overflow: 'auto' as any }
              : {}),
          }}
        >
          <View style={{
            flex: 1,
            paddingHorizontal: 16,
            // Buttons row at top:8, height 44 → reserve ~60px so title clears.
            paddingTop: 60,
            // Mobile: footer inline render edildiği için extra paddingBottom YOK.
            // Desktop: floating button için 96px safe-zone.
            paddingBottom: width < PANEL_BREAKPOINT
              ? 0
              : insets.bottom + 96,
          }}>
            {children}
          </View>
        </View>

        {/* Right panel (Step 4 live summary) */}
        {rightPanel && showPanel && (
          <View
            style={{
              width: 360,
              borderLeftWidth: 1,
              borderLeftColor: NO.borderSoft,
              backgroundColor: NO.bgStage,
              ...(Platform.OS === 'web'
                ? { overflow: 'auto' as any }
                : {}),
            }}
          >
            {rightPanel}
          </View>
        )}
      </View>

      {/* Native fallback — mobile'da Inner padded View içinde absolute
          (form area'nın sağ alt köşesine yapışık, ekran değil). Desktop'ta
          sağ alt sticky. Bu sayede mobile'da cream "şerit" görünmüyor —
          button form area'nın doğal parçası. */}
      {Platform.OS !== 'web' && (
      <View
        style={
          (Platform.OS as string) === 'web'
            ? ({ display: 'none' } as any)
            : width < PANEL_BREAKPOINT
            ? {
                position: 'absolute' as any,
                bottom: Math.max(insets.bottom, 8),
                right: 16,
                zIndex: 100,
                pointerEvents: 'box-none',
              }
            : {
                position: 'absolute' as any,
                bottom: insets.bottom + 14,
                right: 16,
                zIndex: 100,
                pointerEvents: 'box-none',
              }
        }
      >
        {(onBack || onNext) && (
          <View
            style={
              // Mobile (< PANEL_BREAKPOINT): outer beyaz wrap YOK — sadece
              // İleri butonu kendi koyu adası olarak floating dursun.
              width < PANEL_BREAKPOINT
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }
                : {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 9999,
                    backgroundColor: (Platform.OS as string) === 'web' ? 'rgba(255,255,255,0.72)' : '#FFFFFF',
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.55)',
                    ...((Platform.OS as string) === 'web'
                      ? {
                          backdropFilter: 'blur(14px) saturate(160%)',
                          WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                          boxShadow: '0 12px 32px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.7)',
                        } as any
                      : {
                          shadowColor: '#0F172A',
                          shadowOpacity: 0.18,
                          shadowRadius: 16,
                          shadowOffset: { width: 0, height: 8 },
                          elevation: 6,
                        }),
                  }
            }
          >
            {savedTime && width >= PANEL_BREAKPOINT && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NO.success }} />
                <Text style={{ fontSize: 11, color: NO.inkSoft }}>
                  Taslak · {savedTime}
                </Text>
                <View style={{ width: 1, height: 18, backgroundColor: 'rgba(0,0,0,0.10)', marginLeft: 4 }} />
              </View>
            )}
            {/* Önizleme — sadece desktop (mobile'da sadece İleri butonu kalsın) */}
            {onPreview && width >= PANEL_BREAKPOINT && (
              <Pressable
                onPress={onPreview}
                style={{
                  paddingVertical: 9,
                  paddingHorizontal: 16,
                  borderRadius: 9999,
                  backgroundColor: 'rgba(255,255,255,0.85)',
                  borderWidth: 1,
                  borderColor: NO.borderMedium,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Printer size={14} color={NO.inkStrong} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: NO.inkStrong }}>Önizleme</Text>
              </Pressable>
            )}
            {/* Geri — hem mobile hem desktop'ta İleri'nin solunda */}
            {onBack && (
              <Pressable
                onPress={onBack}
                style={{
                  paddingVertical: width < PANEL_BREAKPOINT ? 11 : 9,
                  paddingHorizontal: width < PANEL_BREAKPOINT ? 18 : 16,
                  borderRadius: 9999,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : T.card,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.14)' : NO.borderMedium,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  ...(width < PANEL_BREAKPOINT && (Platform.OS as string) !== 'web'
                    ? {
                        shadowColor: '#0F172A',
                        shadowOpacity: isDark ? 0.4 : 0.18,
                        shadowRadius: 14,
                        shadowOffset: { width: 0, height: 8 },
                        elevation: 6,
                      }
                    : {}),
                }}
              >
                <ArrowLeft size={14} color={NO.inkStrong} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '500', color: NO.inkStrong }}>Geri</Text>
              </Pressable>
            )}
            {onNext && (() => {
              // Light mode: solid dark/success/saffron bg + readable text.
              // Dark mode "dark" variant: navbar-style translucent liquid glass
              // (clear effect + low-alpha tint) — buton kart üstünde cam disc gibi durur.
              const isDarkVariant = actionPrimary === 'dark';
              const primaryColor =
                actionPrimary === 'success' ? NO.success
                : actionPrimary === 'saffron' ? NO.saffron
                : isDark
                  ? 'rgba(247,242,233,0.22)'  // dark mode: translucent ivory glass tint
                  : '#0A0A0A';
              const textColor =
                actionPrimary === 'saffron' ? '#0A0A0A'
                : (isDarkVariant && isDark) ? '#F7F2E9'  // dark mode glass: ivory text
                : '#FFFFFF';
              const glassEffect: 'clear' | 'regular' =
                (isDarkVariant && isDark) ? 'clear' : 'regular';
              const iconNode = loading
                ? <Loader size={14} color={textColor} strokeWidth={2} />
                : (actionPrimary === 'success'
                    ? <Check size={14} color={textColor} strokeWidth={2.5} />
                    : <ArrowRight size={14} color={textColor} strokeWidth={2} />);
              const floatShadow = width < PANEL_BREAKPOINT && (Platform.OS as string) !== 'web'
                ? {
                    shadowColor: '#0F172A',
                    shadowOpacity: 0.28,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 6,
                  }
                : {};

              if (LIQUID_GLASS) {
                return (
                  <Pressable
                    onPress={loading ? undefined : onNext}
                    style={{
                      borderRadius: 9999,
                      overflow: 'hidden',
                      opacity: loading ? 0.7 : 1,
                      ...floatShadow,
                    }}
                  >
                    <View
                      style={{
                        paddingVertical: 11,
                        paddingHorizontal: 22,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        position: 'relative',
                      }}
                    >
                      <LiquidGlassView
                        effect={glassEffect}
                        colorScheme={isDark ? 'dark' : 'light'}
                        interactive
                        tintColor={primaryColor}
                        style={[StyleSheet.absoluteFillObject, { borderRadius: 9999 }]}
                      />
                      {/* Dark mode glass variant: hairline ivory ring for definition */}
                      {isDarkVariant && isDark && (
                        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, {
                          borderRadius: 9999,
                          borderWidth: 1,
                          borderColor: 'rgba(247,242,233,0.18)',
                        }]} />
                      )}
                      {loading && iconNode}
                      <Text style={{ fontSize: 13, fontWeight: '500', color: textColor }}>
                        {nextLabel ?? 'İleri'}
                      </Text>
                      {!loading && iconNode}
                    </View>
                  </Pressable>
                );
              }

              return (
                <Pressable
                  onPress={loading ? undefined : onNext}
                  style={{
                    paddingVertical: 11,
                    paddingHorizontal: 22,
                    borderRadius: 9999,
                    backgroundColor: primaryColor,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    opacity: loading ? 0.7 : 1,
                    ...floatShadow,
                  }}
                >
                  {loading ? iconNode : null}
                  <Text style={{ fontSize: 13, fontWeight: '500', color: textColor }}>
                    {nextLabel ?? 'İleri'}
                  </Text>
                  {!loading && iconNode}
                </Pressable>
              );
            })()}
          </View>
        )}
      </View>
      )}

      {/* Web: portal ile document.body'de render — hiçbir parent transform'u etkilemez */}
      {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && (onBack || onNext) &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              // PWA standalone'da home indicator alanını geç
              bottom: 'max(14px, calc(env(safe-area-inset-bottom, 0px) + 14px))' as any,
              right: 'max(16px, calc(env(safe-area-inset-right, 0px) + 16px))' as any,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 9999,
                backgroundColor: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(255,255,255,0.55)',
                boxShadow: '0 12px 32px rgba(15,23,42,0.16), inset 0 1px 0 rgba(255,255,255,0.7)',
                backdropFilter: 'blur(14px) saturate(160%)',
                WebkitBackdropFilter: 'blur(14px) saturate(160%)',
                pointerEvents: 'auto',
              } as any}
            >
              {savedTime && width >= PANEL_BREAKPOINT && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 10, paddingRight: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: NO.success }} />
                  <span style={{ fontSize: 11, color: NO.inkSoft }}>
                    Taslak · {savedTime}
                  </span>
                  <div style={{ width: 1, height: 18, backgroundColor: 'rgba(0,0,0,0.10)', marginLeft: 4 }} />
                </div>
              )}
              {onPreview && (
                <button
                  onClick={onPreview}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    border: `1px solid ${NO.borderMedium}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: NO.inkStrong,
                    fontFamily: 'inherit',
                  }}
                  title="Sipariş özetini önizle"
                >
                  <Printer size={14} color={NO.inkStrong} strokeWidth={2} />
                  Önizleme
                </button>
              )}
              {onBack && (
                <button
                  onClick={onBack}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 9999,
                    backgroundColor: 'rgba(255,255,255,0.85)',
                    border: `1px solid ${NO.borderMedium}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 500,
                    color: NO.inkStrong,
                    fontFamily: 'inherit',
                  }}
                >
                  <ArrowLeft size={14} color={NO.inkStrong} strokeWidth={2} />
                  Geri
                </button>
              )}
              {onNext && (
                <button
                  onClick={loading ? undefined : onNext}
                  disabled={loading}
                  style={{
                    padding: '9px 20px',
                    borderRadius: 9999,
                    backgroundColor:
                      actionPrimary === 'success' ? NO.success
                      : actionPrimary === 'saffron' ? NO.saffron
                      : NO.inkStrong,
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: loading ? 'wait' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                    fontSize: 13,
                    fontWeight: 500,
                    color: actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF',
                    fontFamily: 'inherit',
                  }}
                >
                  {loading
                    ? <Loader size={14} color={actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF'} strokeWidth={2} />
                    : null}
                  {nextLabel ?? 'İleri'}
                  {!loading && (
                    actionPrimary === 'success'
                      ? <Check size={14} color="#FFFFFF" strokeWidth={2.5} />
                      : <ArrowRight size={14} color={actionPrimary === 'saffron' ? NO.inkStrong : '#FFFFFF'} strokeWidth={2} />
                  )}
                </button>
              )}
            </div>
          </div>,
          document.body
        )
      }
    </View>
  );
}

// ─── Glass action button — translucent liquid glass disc for the safe-zone header ───
function GlassActionBtn({
  onPress, label, children, badge, iconColor,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
  badge?: { value: number; color: string };
  iconColor?: string;
}) {
  void iconColor; // children paints the icon; prop kept for future use
  const NO = useNOTokens();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const SIZE = 44;
  const RADIUS = 16;
  const shadow = Platform.OS === 'web'
    ? ({ boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.45)' : '0 4px 12px rgba(15,23,42,0.10)' } as any)
    : {
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.35 : 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      };

  const badgeNode = badge ? (
    <View style={{
      position: 'absolute', top: -5, right: -5,
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: badge.color,
      borderWidth: 2, borderColor: T.card,
      zIndex: 2,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
        {badge.value > 99 ? '99+' : String(badge.value)}
      </Text>
    </View>
  ) : null;

  if (LIQUID_GLASS) {
    return (
      <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}>
        {({ pressed }: any) => (
          <View
            style={{
              width: SIZE, height: SIZE, borderRadius: RADIUS,
              backgroundColor: 'transparent',
              alignItems: 'center', justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
              position: 'relative',
              overflow: 'hidden',
              ...shadow,
            }}
          >
            <LiquidGlassView
              effect="regular"
              colorScheme={isDark ? 'dark' : 'light'}
              interactive
              tintColor={isDark ? 'rgba(27,25,22,0.32)' : 'rgba(255,255,255,0.32)'}
              style={[StyleSheet.absoluteFillObject, { borderRadius: RADIUS }]}
            />
            {children}
            {badgeNode}
          </View>
        )}
      </Pressable>
    );
  }

  // Fallback — solid surface
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6}>
      {({ pressed }: any) => (
        <View
          style={{
            width: SIZE, height: SIZE, borderRadius: RADIUS,
            backgroundColor: T.card,
            borderWidth: 1, borderColor: NO.borderMedium,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            position: 'relative',
            ...shadow,
          }}
        >
          {children}
          {badgeNode}
        </View>
      )}
    </Pressable>
  );
}
