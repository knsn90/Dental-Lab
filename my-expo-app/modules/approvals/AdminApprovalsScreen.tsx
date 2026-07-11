/**
 * AdminApprovalsScreen — Modernized.
 *
 *  • Büyük page title + subtitle
 *  • iOS-style segmented control (büyük, belirgin)
 *  • URL ?tab= ile state senkron
 *  • Badge count ile sayısal vurgu
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, ClipboardCheck, Wrench, Ban, Pencil } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PendingApprovalsScreen } from './PendingApprovalsScreen';
import { DesignApprovalsScreen } from './DesignApprovalsScreen';
import { CancelRequestsPanel } from './CancelRequestsPanel';
import { ChangeRequestsPanel } from './ChangeRequestsPanel';
import { fetchPendingChangeRequests } from '../orders/changeRequests';
import { fetchPendingCancelRequests } from '../orders/cancellation';
import { usePendingApprovals as useDesignApprovals } from './hooks/usePendingApprovals';
import { MaterialRequestsScreen } from '../material-requests/screens/MaterialRequestsScreen';
import { getRequestCounts } from '../material-requests/api';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';
import { DS } from '../../core/theme/dsTokens';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';

type Tab = 'doctors' | 'design' | 'material' | 'cancel' | 'change';
const VALID: Tab[] = ['doctors', 'design', 'material', 'cancel', 'change'];

export function AdminApprovalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = (typeof params.tab === 'string' && (VALID as string[]).includes(params.tab))
    ? params.tab as Tab
    : 'doctors';
  const [tab, setTabRaw] = useState<Tab>(initial);

  useEffect(() => {
    const t = typeof params.tab === 'string' ? params.tab : null;
    if (t && (VALID as string[]).includes(t) && t !== tab) setTabRaw(t as Tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tab]);

  const setTab = useCallback((k: Tab) => {
    setTabRaw(k);
    try { router.setParams({ tab: k } as any); } catch {}
  }, [router]);

  const { approvals } = useDesignApprovals();
  const designPending = approvals.length;

  // Rol kontrolü — manager (mesul müdür) / admin material onayını görür
  const profile     = useAuthStore(s => s.profile);
  const userType    = profile?.user_type;
  const userRole    = (profile as any)?.role;
  const showMaterial =
    userType === 'admin' ||
    (userType === 'lab' && (userRole === 'manager' || userRole === 'admin'));

  // Material requests pending count (manager için submitted, admin için forwarded_admin)
  const [materialPending, setMaterialPending] = useState<number>(0);
  useEffect(() => {
    if (!showMaterial) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const c = await getRequestCounts();
        if (cancelled) return;
        const n = userType === 'admin' ? c.forwarded_admin : c.submitted;
        setMaterialPending(n);
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [showMaterial, userType]);

  // İptal + Değişiklik talepleri — admin + mesul müdür görür
  const showCancel = userType === 'admin' || (userType === 'lab' && userRole === 'manager');
  const [cancelPending, setCancelPending] = useState<number>(0);
  const [changePending, setChangePending] = useState<number>(0);
  useEffect(() => {
    if (!showCancel) return;
    let cancelled = false;
    const tick = async () => {
      try { const r = await fetchPendingCancelRequests(); if (!cancelled) setCancelPending(r.length); } catch { /* */ }
      try { const c = await fetchPendingChangeRequests(); if (!cancelled) setChangePending(c.length); } catch { /* */ }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [showCancel]);

  const { setTitle, clear } = usePageTitleStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);

  // Shell title kullan — Siparişler sayfası pattern'i.
  // Sayfa içi büyük başlık yok, sidebar/topbar'da küçük "Onaylar" yazsın.
  useEffect(() => {
    setTitle('Onaylar', '');
    return clear;
  }, []);

  const TABS: { key: Tab; label: string; short: string; icon: React.ComponentType<any>; count?: number }[] = [
    { key: 'doctors', label: 'Hekim Kayıtları',  short: 'Hekimler', icon: Users },
    { key: 'design',  label: 'Tasarım Onayları', short: 'Tasarım',  icon: ClipboardCheck, count: designPending > 0 ? designPending : undefined },
    ...(showMaterial ? [{ key: 'material' as Tab, label: 'Malzeme Talepleri', short: 'Malzeme', icon: Wrench, count: materialPending > 0 ? materialPending : undefined }] : []),
    ...(showCancel ? [{ key: 'cancel' as Tab, label: 'İptal Talepleri', short: 'İptal', icon: Ban, count: cancelPending > 0 ? cancelPending : undefined }] : []),
    ...(showCancel ? [{ key: 'change' as Tab, label: 'Değişiklik Talepleri', short: 'Değişiklik', icon: Pencil, count: changePending > 0 ? changePending : undefined }] : []),
  ];

  // ─── Top padding — mobile için TopActionBar yüksekliğini geç ─────────
  const headerTopPad = isDesktop ? 16 : Math.max(insets.top, 8) + 30;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Mobil sayfa başlığı — TopActionBar'ın altında */}
      {!isDesktop && (
        <View style={{ paddingHorizontal: 24, paddingTop: headerTopPad, paddingBottom: 6 }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>
            YÖNETİM
          </Text>
          <Text style={{
            fontSize: 34, fontWeight: '300', color: T.ink, letterSpacing: -1.2, lineHeight: 38, marginTop: 4,
            ...(Platform.OS === 'web' ? { fontFamily: T.display } as any : {}),
          }}>
            Onaylar
          </Text>
        </View>
      )}

      {/* iOS-style segmented control (full-width) */}
      <View style={{
        paddingHorizontal: 16,
        paddingTop: isDesktop ? headerTopPad : 8,
        paddingBottom: 12,
      }}>
        <View style={{
          flexDirection: 'row',
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          borderRadius: 12,
          padding: 4,
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  height: 38,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  overflow: 'hidden',
                  backgroundColor: active ? (isDark ? '#2A2724' : '#FFFFFF') : 'transparent',
                  ...(active && Platform.OS === 'ios'
                    ? {
                        shadowColor: '#000',
                        shadowOpacity: isDark ? 0.35 : 0.08,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                      }
                    : active && Platform.OS === 'web'
                      ? ({ boxShadow: isDark ? '0 1px 3px rgba(0,0,0,0.45)' : '0 1px 3px rgba(0,0,0,0.10)' } as any)
                      : {}),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <Icon
                  size={15}
                  color={active ? T.ink : T.ink3}
                  strokeWidth={active ? 2 : 1.7}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: isDesktop ? 13 : 12.5,
                    fontWeight: active ? '700' : '600',
                    color: active ? T.ink : T.ink3,
                    letterSpacing: -0.1,
                    flexShrink: 1,
                  }}
                >
                  {isDesktop ? t.label : t.short}
                </Text>
                {t.count != null && (
                  <View style={{
                    minWidth: 18, height: 18, borderRadius: 9,
                    paddingHorizontal: 5,
                    backgroundColor: '#DC2626',
                    alignItems: 'center', justifyContent: 'center',
                    marginLeft: 2,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFFFFF' }}>{t.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Content panel */}
      <View style={{ flex: 1 }}>
        {tab === 'doctors'   && <PendingApprovalsScreen />}
        {tab === 'design'    && <DesignApprovalsScreen />}
        {tab === 'material'  && showMaterial && <MaterialRequestsScreen />}
        {tab === 'cancel'    && showCancel && <CancelRequestsPanel />}
        {tab === 'change'    && showCancel && <ChangeRequestsPanel />}
      </View>
    </View>
  );
}
