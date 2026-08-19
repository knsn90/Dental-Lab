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
import { supabase } from '../../core/api/supabase';
import { SlideTabBar } from '../../core/ui/SlideTabBar';
import { usePanelTheme } from '../../core/theme/usePanelTheme';
import { usePageTitleStore } from '../../core/store/pageTitleStore';
import { useAuthStore } from '../../core/store/authStore';
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

      {/* Sekme çubuğu — masaüstü: paylaşılan SlideTabBar (users/logs ile aynı).
          Mobil: tam genişliğe yayılan kısa etiketli segmented; orada yayılmak
          doğru ve SlideTabBar'ın sabit dolgusu 5 sekmede taşardı. */}
      <View style={{
        paddingHorizontal: isDesktop ? 24 : 16,
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
        ) : (
        <View style={{
          flexDirection: 'row',
          alignSelf: 'stretch',
          maxWidth: '100%',
          // DESIGN_LANGUAGE §6 — üst nav "Pill" variant:
          // padding 4 + bg rgba(0,0,0,0.05) + radius 999. (Segmented/radius 12
          // yalnız görünüm değiştirici içindir: Liste / Kart / Grid.)
          backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
          borderRadius: 999,
          padding: 4,
        }}>
          {TABS.map(t => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={({ pressed }: any) => ({
                  flex: 1,
                  minWidth: 0,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 38,
                  paddingHorizontal: 4,
                  borderRadius: 999,
                  opacity: pressed ? 0.7 : 1,
                  overflow: 'hidden',
                  backgroundColor: active ? T.card : 'transparent',
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
                })}
              >
                <Icon
                  size={15}
                  color={active ? T.ink : T.ink3}
                  strokeWidth={active ? 2 : 1.7}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 12.5,
                    fontWeight: active ? '600' : '500',
                    color: active ? T.ink : T.ink3,
                    letterSpacing: -0.1,
                    flexShrink: 1,
                  }}
                >
                  {t.short}
                </Text>
                {t.count != null && (
                  /* Bu bir HATA değil, İŞ sayacı — kırmızıydı. Onay kuyruğunda
                     bekleyen kayıt normal iştir; hepsini alarm rengiyle boyamak
                     gerçekten aciliyet taşıyan yerlerde kırmızının anlamını
                     tüketiyordu. Nötr ton, aktif sekmede koyulaşır. */
                  <View style={{
                    minWidth: 18, height: 18, borderRadius: 9,
                    paddingHorizontal: 5,
                    backgroundColor: active
                      ? (isDark ? 'rgba(255,255,255,0.16)' : 'rgba(15,23,42,0.10)')
                      : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)'),
                    alignItems: 'center', justifyContent: 'center',
                    marginStart: 2,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: active ? T.ink : T.ink3 }}>{t.count}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
        )}

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
