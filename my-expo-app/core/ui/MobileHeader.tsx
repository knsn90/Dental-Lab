// core/ui/MobileHeader.tsx
// BTop — Variant B floating glass top bar.
//   • Root tabs: left logo+wordmark glass · right role pill+bell glass
//   • Detail pages (canGoBack): back arrow + page title in single glass pill
// Hidden when title is null AND no back-stack (avoids ghost header on splash).

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments } from 'expo-router';
import { ChevronLeft, Bell } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useAuthStore } from '../store/authStore';
import { usePageTitleStore } from '../store/pageTitleStore';
import { useMobileRole, ROLE_LABEL, MFONT } from '../theme/mobileTheme';
import { DS } from '../theme/dsTokens';

// Routes where the floating header should NOT render — these screens
// own their full top area (have their own SafeAreaView/back button).
const HIDE_ON_SUB_ROUTES = new Set([
  'new-order', 'order', 'scan', 'occlusion', 'occlusion-test',
  'invoice', 'route', 'delivery', 'profile',
]);

export function MobileHeader({ accentColor }: { accentColor?: string }) {
  const router    = useRouter();
  const segments  = useSegments() as string[];
  const title     = usePageTitleStore(s => s.title);
  const subtitle  = usePageTitleStore(s => s.subtitle);
  const actions   = usePageTitleStore(s => s.actions);
  const { profile } = useAuthStore();
  const role = useMobileRole();

  // Hide on sub-routes that own their top area (e.g., new-order form, order detail)
  const sub = segments?.[1];
  if (sub && HIDE_ON_SUB_ROUTES.has(sub)) return null;

  const canGoBack = router.canGoBack();
  const accent = accentColor ?? DS[role].primary;

  // Detail mode: back + title pill
  if (canGoBack && title) {
    return (
      <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.wrap}>
        <GlassPill style={styles.detailPill}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backBtn}
          >
            <ChevronLeft size={22} color={DS.ink[900]} strokeWidth={2} />
          </Pressable>
          <View style={styles.detailTitleWrap}>
            <Text numberOfLines={1} style={styles.detailTitle}>{title}</Text>
            {subtitle ? (
              <Text numberOfLines={1} style={styles.detailSubtitle}>{subtitle}</Text>
            ) : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : <View style={{ width: 36 }} />}
        </GlassPill>
      </SafeAreaView>
    );
  }

  // Root mode: split logo + role pill
  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.rootRow}>
        {/* Left: logo + wordmark */}
        <GlassPill style={styles.leftPill}>
          <View style={[styles.logoBubble, { backgroundColor: DS[role].accent }]}>
            <Text style={[styles.logoMono, { color: '#FFFFFF' }]}>L</Text>
          </View>
          <Text style={styles.wordmark}>Lab.</Text>
        </GlassPill>

        {/* Right: role pill + bell */}
        <View style={styles.rightCluster}>
          <GlassPill style={styles.rolePill}>
            <View style={[styles.roleAvatar, { backgroundColor: accent }]}>
              <Text style={styles.roleAvatarLetter}>
                {(profile?.full_name?.[0] ?? 'U').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.roleLabel}>{ROLE_LABEL[role]}</Text>
          </GlassPill>
          <GlassPill style={styles.bellPill}>
            <Bell size={18} color={DS.ink[900]} strokeWidth={1.8} />
          </GlassPill>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Solid white pill primitive — sadece pill'in kendi bg'si var ────────────
function GlassPill({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.glass, styles.pillSolid, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: 'transparent',
  },

  rootRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Pill primitive
  glass: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    overflow: 'hidden',
  },
  // Solid white pill bg + soft shadow
  pillSolid: {
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 4px 12px rgba(15,23,42,0.06)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }),
  },

  glassWeb: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    ...(Platform.OS === 'web'
      ? ({
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
        } as any)
      : {}),
  },

  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.50)',
  },

  glassBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },

  // Left pill — logo + wordmark
  leftPill: {
    paddingLeft: 4,
    paddingRight: 14,
    height: 38,
    gap: 8,
  },

  logoBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoMono: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 13,
    letterSpacing: -0.2,
  },

  wordmark: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 14,
    letterSpacing: -0.2,
    color: DS.ink[900],
  },

  // Right pill — role
  rolePill: {
    paddingLeft: 4,
    paddingRight: 12,
    height: 36,
    gap: 6,
  },

  roleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  roleAvatarLetter: {
    color: '#FFFFFF',
    fontFamily: MFONT.uiSemibold,
    fontSize: 12,
  },

  roleLabel: {
    fontFamily: MFONT.uiMedium,
    fontSize: 12,
    color: DS.ink[900],
    letterSpacing: -0.1,
  },

  bellPill: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Detail mode
  detailPill: {
    paddingLeft: 4,
    paddingRight: 10,
    height: 44,
    gap: 4,
  },

  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  detailTitleWrap: {
    flex: 1,
    minWidth: 0,
  },

  detailTitle: {
    fontFamily: MFONT.uiSemibold,
    fontSize: 15,
    color: DS.ink[900],
    letterSpacing: -0.2,
  },

  detailSubtitle: {
    fontFamily: MFONT.uiRegular,
    fontSize: 11,
    color: DS.ink[500],
    marginTop: 1,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
