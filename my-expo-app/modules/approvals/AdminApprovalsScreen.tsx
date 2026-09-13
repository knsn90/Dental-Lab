/**
 * AdminApprovalsScreen — Modernized.
 *
 *  • Büyük page title + subtitle
 *  • iOS-style segmented control (büyük, belirgin)
 *  • URL ?tab= ile state senkron
 *  • Badge count ile sayısal vurgu
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, useWindowDimensions, Platform, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Users, ClipboardCheck, Wrench, Ban, Pencil, Menu, X as CloseIcon } from '../../core/ui/icons';
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
import { supabase } from '../../core/api/supabase';
import { SlideTabBar } from '../../core/ui/SlideTabBar';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';
import { useMobileTokens } from '../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../core/store/themeModeStore';
import { PAGE_PADDING } from '../../core/ui/pageMetrics';
import { autoT } from '../../core/i18n/autoTranslate';

type Tab = 'doctors' | 'design' | 'material' | 'cancel' | 'change';
const VALID: Tab[] = ['doctors', 'design', 'material', 'cancel', 'change'];

export function AdminApprovalsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const initial = (typeof params.tab === 'string' && (VALID as string[]).includes(params.tab))
    ? params.tab as Tab
    : 'doctors';
  const [tab, setTabRaw] = useState<Tab>(initial);
  const [overflowOpen, setOverflowOpen] = useState(false);

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

  // Hekim kaydı bekleyen sayısı. Eskiden bu sekmenin rozeti HİÇ yoktu: sayı
  // PendingApprovalsScreen'in içinde kalıyordu, o da yalnız sekme açıkken mount
  // oluyordu. Sonuç: beş sekme birbirinin aynı görünüyor, iş nerede belli
  // olmuyordu. Diğer sayaçlarla aynı desen — yalnız COUNT çeker, satır taşımaz.
  const [doctorsPending, setDoctorsPending] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('user_type', 'doctor')
          .eq('approval_status', 'pending');
        if (!cancelled) setDoctorsPending(count ?? 0);
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

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
  // SlideTabBar cursor'ı beyaz metin zorluyor → accent KOYU olmalı.
  // Panel `primary`si (ör. lab safranı #F5C24B) beyazla okunmuyordu; `accent`
  // her panelde koyu ink (lab #0A0A0A · exec #172235 · klinik #2F313F).
  const panel = usePanelTheme();

  // Shell title kullan — Siparişler sayfası pattern'i.
  // Sayfa içi büyük başlık yok, sidebar/topbar'da küçük "Onaylar" yazsın.
  useEffect(() => {
    setTitle('Onaylar', '');
    return clear;
  }, []);

  const TABS: { key: Tab; label: string; short: string; icon: React.ComponentType<any>; count?: number }[] = [
    { key: 'doctors', label: 'Hekim Kayıtları',  short: 'Hekimler', icon: Users, count: doctorsPending > 0 ? doctorsPending : undefined },
    { key: 'design',  label: 'Tasarım Onayları', short: 'Tasarım',  icon: ClipboardCheck, count: designPending > 0 ? designPending : undefined },
    ...(showMaterial ? [{ key: 'material' as Tab, label: 'Malzeme Talepleri', short: 'Malzeme', icon: Wrench, count: materialPending > 0 ? materialPending : undefined }] : []),
    ...(showCancel ? [{ key: 'cancel' as Tab, label: 'İptal Talepleri', short: 'İptal', icon: Ban, count: cancelPending > 0 ? cancelPending : undefined }] : []),
    ...(showCancel ? [{ key: 'change' as Tab, label: 'Değişiklik Talepleri', short: 'Değişiklik', icon: Pencil, count: changePending > 0 ? changePending : undefined }] : []),
  ];

  // Görünür sekmelerin toplamı — rol yüzünden gizli sekmelerin sayısı eklenmez,
  // aksi hâlde kullanıcı açamayacağı bir işi bekliyor sanırdı.
  const totalPending = TABS.reduce((n, t) => n + (t.count ?? 0), 0);

  // ─── Top padding — mobile için TopActionBar yüksekliğini geç ─────────
  // Mobilde global PanelTopHeader logosu insets.top+7'den başlar ve 38px yüksektir
  // (alt kenar = insets.top+45). +30 başlığı logonun ÜZERİNE bindiriyordu.
  // +54 → kicker logoyu net geçer, başlık MobilePageTitle ile aynı hizaya (≈+72) oturur.
  const headerTopPad = isDesktop ? 16 : Math.max(insets.top, 8) + 54;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Mobil sayfa başlığı — TopActionBar'ın altında */}
      {!isDesktop && (
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: headerTopPad, paddingBottom: 6 }}>
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

      {/* Sekme çubuğu — masaüstü: paylaşılan SlideTabBar (users/logs ile aynı).
          Mobil: tam genişliğe yayılan kısa etiketli segmented; orada yayılmak
          doğru ve SlideTabBar'ın sabit dolgusu 5 sekmede taşardı. */}
      <View style={{
        paddingHorizontal: isDesktop ? 24 : PAGE_PADDING,
        paddingTop: isDesktop ? headerTopPad : 8,
        paddingBottom: 12,
        ...(isDesktop ? { flexDirection: 'row', alignItems: 'center', gap: 14 } : null),
      }}>
        {isDesktop ? (
          /* Masaüstünde uygulamanın KANONİK sekme çubuğu — (admin)/users,
             (admin)/logs ve Hizmetler ekranıyla aynı bileşen. Buradaki elle
             yapılmış gri raylı, ikonlu, 38px'lik şerit onlardan belirgin
             biçimde daha iri duruyordu. İkonlar da düştü: etiketler zaten açık,
             komşu sayfaların hiçbirinde ikon yok.
             marginLeft -4 → çubuğun kendi iç dolgusunu geri alır, ilk pill
             altındaki içerik paneliyle aynı 24 kenarından başlar. */
          <SlideTabBar
            items={TABS.map(t => ({ key: t.key, label: t.label, count: t.count }))}
            activeKey={tab}
            onChange={(k) => setTab(k as Tab)}
            accentColor={panel.accent}
            style={{ marginStart: -4 }}
          />
        ) : (() => {
          /* Finans hub'ıyla AYNI kalıp: 3 birincil sekme inline + hamburger.
             Beş sekme aynı satıra sığmıyordu ve etiketler "Hekim…" diye
             kırpılıyordu; kırpılmış etiket sekmenin ne olduğunu söylemiyor. */
          const PRIMARY_KEYS: Tab[] = ['doctors', 'design', 'material'];
          const PRIMARY_INLINE = PRIMARY_KEYS
            .map(k => TABS.find(t => t.key === k))
            .filter((t): t is typeof TABS[number] => !!t);
          const activeInPrimary = PRIMARY_INLINE.some(t => t.key === tab);
          const activeTab = TABS.find(t => t.key === tab);
          const inlineTabs = activeInPrimary
            ? PRIMARY_INLINE
            : (activeTab ? [...PRIMARY_INLINE, activeTab] : PRIMARY_INLINE);
          const overflowTabs = TABS.filter(t => !inlineTabs.some(i => i.key === t.key));
          const overflowPending = overflowTabs.reduce((n, t) => n + (t.count ?? 0), 0);

          return (
          <View style={{
            flexDirection: 'row', gap: 3, padding: 3, alignItems: 'center',
            alignSelf: 'stretch', maxWidth: '100%',
            backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            borderRadius: 999,
          }}>
            {inlineTabs.map(t => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setTab(t.key)}
                  /* object style ZORUNLU — fonksiyon-stilli Pressable native'de
                     row layout'u düşürüyor (ikon etiketin üstüne biner). */
                  style={{
                    // CLAUDE.md §1c — seçili pill daha çok pay + dolgu alır.
                    flex: active ? 1.55 : 1,
                    minWidth: 0,
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
                    paddingHorizontal: active ? 12 : 8, paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: active ? panel.primary : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Icon
                    size={12}
                    strokeWidth={active ? 2.2 : 1.8}
                    color={active ? '#FFFFFF' : panel.primary}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 11, fontWeight: active ? '700' : '600',
                      color: active ? '#FFFFFF' : T.ink3, flexShrink: 1,
                    }}
                  >
                    {t.short}
                  </Text>
                  {t.count != null && (
                    <View style={{
                      minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      backgroundColor: active
                        ? 'rgba(255,255,255,0.24)'
                        : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)'),
                    }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: active ? '#FFFFFF' : T.ink3 }}>{t.count}</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}

            {overflowTabs.length > 0 && (
              <>
                <View style={{ width: 1, height: 16, backgroundColor: T.hairline, marginHorizontal: 2 }} />
                <Pressable
                  onPress={() => setOverflowOpen(true)}
                  accessibilityLabel={autoT('Diğer onaylar')}
                  style={{
                    alignItems: 'center', justifyContent: 'center',
                    width: 36, height: 30, borderRadius: 999,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Menu size={16} strokeWidth={2} color={panel.primary} />
                  {overflowPending > 0 && (
                    <View style={{
                      position: 'absolute', top: 2, insetInlineEnd: 4,
                      minWidth: 8, height: 8, borderRadius: 4, backgroundColor: panel.primary,
                    }} />
                  )}
                </Pressable>
              </>
            )}
          </View>
          );
        })()}

        {/* Sayfaya gelen kişinin ilk sorusu "bana bakan bir şey var mı?".
            Rozetler nerede olduğunu söylüyor, bu satır VAR MI sorusunu tek
            bakışta kapatıyor — beş sekmeyi tarayıp toplama gerek kalmıyor. */}
        {isDesktop && (
          <Text style={{ fontSize: 12.5, color: T.ink3, fontWeight: '500' }}>
            {totalPending > 0
              ? `${totalPending} kayıt onay bekliyor`
              : 'Bekleyen onay yok'}
          </Text>
        )}
      </View>

      {/* ── Hamburger çekmecesi — Finans hub'ıyla aynı sağ-kenar drawer ── */}
      <Modal visible={overflowOpen} transparent animationType="fade" onRequestClose={() => setOverflowOpen(false)}>
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <Pressable
            onPress={() => setOverflowOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' }}
            accessibilityLabel={autoT('Menüyü kapat')}
          />
          <View style={{
            width: Math.min(320, width * 0.85), height: '100%',
            backgroundColor: T.card,
            paddingTop: Math.max(insets.top, 12) + 8,
            paddingBottom: Math.max(insets.bottom, 16) + 12,
            ...(Platform.OS === 'web'
              ? ({ boxShadow: '-4px 0 24px rgba(15,23,42,0.18)' } as any)
              : { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: -4, height: 0 }, elevation: 20 }),
          }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 14, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, marginBottom: 2 }}>
                  {autoT('Onaylar')}
                </Text>
                <Text style={{ fontSize: 17, fontWeight: '700', color: T.ink }}>
                  {totalPending > 0 ? `${totalPending} ${autoT('kayıt onay bekliyor')}` : autoT('Bekleyen onay yok')}
                </Text>
              </View>
              <Pressable
                onPress={() => setOverflowOpen(false)}
                style={{
                  width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}
              >
                <CloseIcon size={16} strokeWidth={2} color={T.ink3} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 4 }}>
              {TABS.map(t => {
                const active = tab === t.key;
                const Icon = t.icon;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => { setTab(t.key); setOverflowOpen(false); }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14,
                      backgroundColor: active ? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)') : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}
                  >
                    <View style={{
                      width: 34, height: 34, borderRadius: 11, flexShrink: 0,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: active ? panel.primary : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                    }}>
                      <Icon size={16} strokeWidth={1.9} color={active ? '#FFFFFF' : panel.primary} />
                    </View>
                    <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: active ? '700' : '600', color: T.ink }}>
                      {t.label}
                    </Text>
                    {t.count != null && (
                      <View style={{
                        minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, flexShrink: 0,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.08)',
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: T.ink2 }}>{t.count}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
