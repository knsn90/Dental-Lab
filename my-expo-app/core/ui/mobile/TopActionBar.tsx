/**
 * TopActionBar — Mobil sağ üst kalıcı aksiyon butonları (QR · Bell · Profile).
 *
 * Tüm panel layout'larında (lab/admin/doctor/clinic) sabit konumda render edilir.
 * Sadece mobile'da (width < 768) görünür; desktop'ta DesktopShell kendi başlığı
 * vasıtasıyla bu aksiyonları sunar.
 */
import React, { useState } from 'react';
import { autoT } from '../../i18n/autoTranslate';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Alert, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QrCode, Bell, User as UserIcon, Search, MessageCircle, LogOut, ChevronRight, ChevronLeft, BellOff, Check, Monitor, Sun, Moon, CheckCircle, Wallet, Package, Truck, Calendar } from '../icons';
import { useInkUI } from '../../theme/inkScale';
import type { NotificationRow } from '../../store/notificationsStore';
import { isRTL } from '../../i18n';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { PulseRing } from '../PulseRing';
import { useScanStore } from '../../store/scanStore';
import { useUiOverlayStore } from '../../store/uiOverlayStore';
import { useNotifications, useNotificationsActions } from '../../store/notificationsStore';
import { useThemeModeStore } from '../../store/themeModeStore';
import { usePanelTheme } from '../../theme/usePanelTheme';
import { useAccentTones } from '../HeroGlow';
import { useCommandPalette } from '../../store/commandPaletteStore';
import { useAuthStore } from '../../store/authStore';
import { useOrderChatInbox } from '../../../modules/orders/hooks/useOrderChatInbox';
import { ProfileMenu as SharedProfileMenu } from './ProfileMenu';
import { confirmAsync } from '../../util/confirm';
import { onAccentInk } from '../../theme/usePanelTheme';

// MessagesPopup — lazy (modül katmanı, circular import riskini önler)
const MessagesPopup: any = React.lazy(() =>
  import('../../../modules/orders/components/MessagesPopup').then(m => ({ default: (m as any).MessagesPopup })),
);

const LIQUID_GLASS = Platform.OS === 'ios' && !!isLiquidGlassSupported;

interface Props {
  /** Panel root, e.g. '/(lab)' — profile route'u için */
  routePrefix: string;
  /** Bildirim için yönlendirilecek route (genelde dashboard root); verilmezse routePrefix kullanılır */
  notificationsRoute?: string;
  /** Panel accent rengi — Mesajlar popup başlığı/vurguları için */
  accentColor?: string;
  /**
   * OPTIONAL — onboarding tour target hook for the Messages button. Only the
   * doctor layout passes this; other panels leave it undefined → no-op.
   */
  messagesRef?: (node: any) => void;
  /** Genel arama (2. dalga 1): en solda arama düğmesi → ortadaki arama penceresi. Paleti mount
   *  edilmiş ve çubuğunda başka arama girişi olmayan paneller verir (istasyonda "Ara" sekmesi var). */
  showSearch?: boolean;
  /** Mesajlar düğmesi (varsayılan açık). Alt çubuğunda zaten Mesaj olan panel (admin) kapatır. */
  showMessages?: boolean;
  /** Zil rozeti: 'count' (varsayılan, sayı) · 'dot' (yalnız kırmızı nokta — büyük sayılar
   *  okunmuyor; sayı bildirim listesinin başlığında zaten yazıyor). */
  bellBadge?: 'count' | 'dot';
  /** Profil düğmesi genel ikon yerine kullanıcının baş harflerini (panel renginde) gösterir. */
  profileInitials?: boolean;
  /** Bildirim kartı: 'menu' (varsayılan, düz liste) · 'panel' (Okunmamış/Tümü, güne ve siparişe göre gruplu) */
  notificationsLayout?: 'menu' | 'panel';
}

export function TopActionBar({ routePrefix, notificationsRoute, accentColor, messagesRef, showSearch, showMessages = true, bellBadge = 'count', profileInitials, notificationsLayout = 'menu' }: Props) {
  const fullName = useAuthStore((s) => (s.profile as any)?.full_name as string | undefined);
  const initials = (() => {
    const w = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
    return ((w[0]?.[0] ?? '') + (w.length > 1 ? w[w.length - 1][0] : '')).toLocaleUpperCase('tr');
  })();
  const { width } = useWindowDimensions();
  const isNarrow = width < 768;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const bumpNotifications = useUiOverlayStore((s) => s.bumpNotifications);
  const { unreadCount } = useNotifications();
  const { totalUnread: chatUnread } = useOrderChatInbox();
  // TÜM hook'lar early return'den ÖNCE çağrılmalı — React Rules of Hooks ihlali olmasın.
  // Aksi halde "Rendered fewer hooks than expected" hatası oluşur.
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [notifMenuOpen, setNotifMenuOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const rtl = isRTL();

  if (!isNarrow) return null;

  const onScan = () => useScanStore.getState().setOpen(true);
  const onMessages = () => setMessagesOpen(true);
  const onSearch = () => {
    try { useCommandPalette.getState().openPalette(); } catch { /* noop */ }
  };
  const onNotifications = () => {
    // Old behaviour: bumpNotifications() opened the dashboard's full sheet.
    // New: only the local dropdown opens.
    setNotifMenuOpen(true);
  };
  const onProfile = () => setProfileMenuOpen(true);

  const onMenuProfile = () => {
    setProfileMenuOpen(false);
    router.push(`${routePrefix}/profile` as any);
  };
  const onMenuLogout = async () => {
    setProfileMenuOpen(false);
    // Alert.alert çok-butonlu hâli react-native-web'de NO-OP: butonlar yok
    // sayılıyor, onPress hiç çalışmıyor. PWA'da "Çıkış Yap" sessizce ölüyordu.
    // confirmAsync JSX'ten geçmez → metinler autoT() ile çevrilir
    const ok = await confirmAsync(
      autoT('Çıkış Yap'),
      autoT('Hesabınızdan çıkış yapmak istediğinize emin misiniz?'),
      { confirmText: autoT('Çıkış Yap'), destructive: true },
    );
    if (!ok) return;
    try { await useAuthStore.getState().signOut(); }
    catch { /* noop */ }
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          // Web: fixed — tarayıcı modunda sayfa kayınca üst butonlar ekran dışına
          // çıkmasın (PillTabBar ile aynı gerekçe).
          position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as any,
          top: Math.max(insets.top, 8) + 6,
          // `end:` inline stili bu projede güvenilir değil → yönü açıkça seç
          ...(rtl ? { left: 12 } : { right: 12 }),
          flexDirection: 'row',
          gap: 6,
          zIndex: 1200,
          // iOS WebKit: backdrop-filter'lı üst şerit (z 8) kendi GPU katmanında;
          // katmanı olmayan kardeşleri z-index'e bakmadan ÖRTÜYOR → butonlar
          // PWA'da beyaz tül altında bulanık görünüyordu. Kendi katmanı → üstte.
          ...(Platform.OS === 'web' ? ({ transform: [{ translateZ: 0 }], willChange: 'transform' } as any) : {}),
        }}
      >
        {showSearch ? <TopBtn icon={Search} onPress={onSearch} label={autoT('Ara')} /> : null}
        <TopBtn icon={QrCode} onPress={onScan} />
        {showMessages ? <TopBtn icon={MessageCircle} onPress={onMessages} badgeCount={chatUnread} btnRef={messagesRef} /> : null}
        <TopBtn icon={Bell} onPress={onNotifications} badgeCount={unreadCount} dot={bellBadge === 'dot'}
          label={unreadCount > 0 ? `${autoT('Bildirimler')}, ${unreadCount}` : autoT('Bildirimler')} />
        <TopBtn icon={UserIcon} onPress={onProfile} label={autoT('Profil')}
          initials={profileInitials && initials ? initials : undefined} fill={accentColor} />
      </View>

      <SharedProfileMenu
        visible={profileMenuOpen}
        anchorTop={Math.max(insets.top, 8) + 6 + 38 + 8}
        onClose={() => setProfileMenuOpen(false)}
        onProfile={onMenuProfile}
        onLogout={onMenuLogout}
      />

      {notificationsLayout === 'panel' ? (
        <NotificationsPanel
          visible={notifMenuOpen}
          anchorTop={Math.max(insets.top, 8) + 6 + 38 + 8}
          onClose={() => setNotifMenuOpen(false)}
          accentColor={accentColor}
        />
      ) : (
      <NotificationsMenu
        visible={notifMenuOpen}
        anchorTop={Math.max(insets.top, 8) + 6 + 38 + 8}
        onClose={() => setNotifMenuOpen(false)}
        accentColor={accentColor}
      />
      )}

      {/* Mesajlar popup — kendi içinde yönetilir, her panel otomatik alır */}
      {messagesOpen && (
        <React.Suspense fallback={null}>
          <MessagesPopup
            visible={messagesOpen}
            onClose={() => setMessagesOpen(false)}
            accentColor={accentColor}
          />
        </React.Suspense>
      )}
    </>
  );
}

// ─── Profile dropdown menu ─────────────────────────────────────────────────
function ProfileMenu({
  visible, anchorTop, onClose, onProfile, onLogout,
}: {
  visible: boolean;
  anchorTop: number;
  onClose: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const mode    = useThemeModeStore(s => s.mode);
  const setMode = useThemeModeStore(s => s.setMode);
  // Seçili tema dairesi panel accent'iyle dolar (koyuda derin karşılığı).
  const { fill: accentFill } = useAccentTones(usePanelTheme().primary);

  const surface = isDark ? '#1B1916' : '#FFFFFF';
  const ink     = isDark ? '#F7F2E9' : '#0E0E0E';
  const ink2    = isDark ? 'rgba(247,242,233,0.72)' : 'rgba(20,16,12,0.7)';
  const ink3    = isDark ? 'rgba(247,242,233,0.45)' : 'rgba(20,16,12,0.5)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)';
  const segBg    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(20,16,12,0.05)';

  const themeOptions: Array<{ value: 'system' | 'light' | 'dark'; icon: any; label: string }> = [
    // Sabit dizideki label alanı JSX değil → autoT() şart
    { value: 'system', icon: Monitor, label: autoT('Otomatik') },
    { value: 'light',  icon: Sun,     label: autoT('Açık') },
    { value: 'dark',   icon: Moon,    label: autoT('Koyu') },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
      >
        <View
          style={{
            position: 'absolute',
            top: anchorTop,
            ...(rtl ? { left: 12 } : { right: 12 }),
            width: 260,
            borderRadius: 16,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: hairline,
            overflow: 'hidden',
            ...(Platform.OS === 'web'
              ? ({
                  boxShadow: isDark
                    ? '0 12px 32px rgba(0,0,0,0.55)'
                    : '0 12px 32px rgba(15,23,42,0.18)',
                } as any)
              : {
                  shadowColor: '#000',
                  shadowOpacity: isDark ? 0.45 : 0.18,
                  shadowRadius: 18,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 10,
                }),
          }}
        >
          {/* Theme mode segmented control — compact, icon-only */}
          <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8 }}>
            {/* Toggle tarzı: kapsül ray + seçili olan DOLU accent daire
                (profil kartıyla aynı dil). */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              alignSelf: 'flex-start',
              backgroundColor: segBg,
              borderRadius: 999,
              padding: 3,
              gap: 2,
            }}>
              {themeOptions.map(opt => {
                const Icon = opt.icon;
                const isActive = mode === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setMode(opt.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={opt.label}
                  >
                    {({ pressed }: any) => (
                      <View style={{
                        width: 30, height: 30, borderRadius: 15,
                        backgroundColor: isActive ? accentFill : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.75 : 1,
                      }}>
                        <Icon size={15} color={isActive ? '#FFFFFF' : ink2} strokeWidth={isActive ? 2.2 : 1.8} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: hairline }} />

          <MenuRow
            icon={UserIcon}
            label={autoT('Profil')}
            iconColor={ink}
            labelColor={ink}
            ink3={ink3}
            onPress={onProfile}
            showDivider
            hairline={hairline}
          />
          <MenuRow
            icon={LogOut}
            label={autoT('Çıkış Yap')}
            iconColor="#DC2626"
            labelColor="#DC2626"
            ink3={ink3}
            onPress={onLogout}
            hairline={hairline}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon: Icon, label, iconColor, labelColor, ink3, onPress, showDivider, hairline,
}: {
  icon: any;
  label: string;
  iconColor: string;
  labelColor: string;
  ink3: string;
  onPress: () => void;
  showDivider?: boolean;
  hairline: string;
}) {
  // Satır sonu chevron'u yön bildirir → RTL'de aynalanır
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress}>
      {({ pressed }: any) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 12,
            opacity: pressed ? 0.6 : 1,
            borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: hairline,
          }}
        >
          <Icon size={18} color={iconColor} strokeWidth={1.8} />
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '500', color: labelColor }}>
            {label}
          </Text>
          <Chevron size={16} color={ink3} strokeWidth={1.8} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Notifications dropdown menu ───────────────────────────────────────────
function NotificationsMenu({
  visible, anchorTop, onClose, accentColor,
}: {
  visible: boolean;
  anchorTop: number;
  onClose: () => void;
  accentColor?: string;
}) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const { items, unreadCount } = useNotifications();
  const { markRead, markAllRead } = useNotificationsActions();
  const router = useRouter();

  const surface  = isDark ? '#1B1916' : '#FFFFFF';
  const ink      = isDark ? '#F7F2E9' : '#0E0E0E';
  const ink2     = isDark ? 'rgba(247,242,233,0.72)' : 'rgba(20,16,12,0.7)';
  const ink3     = isDark ? 'rgba(247,242,233,0.45)' : 'rgba(20,16,12,0.5)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)';
  const accent   = accentColor ?? '#F5C24B'; // panel accent (yoksa saffron)
  const unreadBg = `${accent}${isDark ? '14' : '18'}`; // hafif accent tint (hex8 alpha)

  const onItemPress = async (item: any) => {
    if (!item.read_at) {
      try { await markRead(item.id); } catch { /* noop */ }
    }
    onClose();
    if (item.action_url) {
      try { router.push(item.action_url as any); } catch { /* noop */ }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose}>
        <View
            style={{
              position: 'absolute',
              top: anchorTop,
              ...(rtl ? { left: 12 } : { right: 12 }),
              width: 320,
              maxHeight: 480,
              borderRadius: 18,
              backgroundColor: surface,
              borderWidth: 1,
              borderColor: hairline,
              overflow: 'hidden',
              ...(Platform.OS === 'web'
                ? ({
                    boxShadow: isDark
                      ? '0 12px 32px rgba(0,0,0,0.55)'
                      : '0 12px 32px rgba(15,23,42,0.18)',
                  } as any)
                : {
                    shadowColor: '#000',
                    shadowOpacity: isDark ? 0.45 : 0.18,
                    shadowRadius: 18,
                    shadowOffset: { width: 0, height: 8 },
                    elevation: 10,
                  }),
            }}
          >
            {/* Header */}
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: hairline,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: ink }}>
                  {autoT('Bildirimler')}
                </Text>
                {unreadCount > 0 && (
                  <View style={{
                    minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9,
                    backgroundColor: accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {/* Metin accent'in luminansına göre: lacivertte BEYAZ,
                        safran gibi açık accent'te koyu kalır (sabit koyu metin
                        lacivert hapta okunmuyordu). */}
                    <Text style={{ fontSize: 11, fontWeight: '700', color: onAccentInk(accent) }}>
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
              {unreadCount > 0 && (
                <Pressable onPress={() => { markAllRead(); }} hitSlop={8}>
                  {({ pressed }: any) => (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      opacity: pressed ? 0.5 : 1,
                    }}>
                      <Check size={12} color={ink3} strokeWidth={2} />
                      <Text style={{ fontSize: 12, color: ink3, fontWeight: '500' }}>
                        {autoT('Tümünü oku')}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}
            </View>

            {/* List or empty */}
            {items.length === 0 ? (
              <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                <BellOff size={28} color={ink3} strokeWidth={1.5} />
                <Text style={{ fontSize: 13, color: ink3 }}>
                  {autoT('Henüz bildirim yok')}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {items.slice(0, 20).map((item, i) => {
                  const isUnread = !item.read_at;
                  return (
                    <Pressable key={item.id} onPress={() => onItemPress(item)}>
                      {({ pressed }: any) => (
                        <View style={{
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          backgroundColor: isUnread ? unreadBg : 'transparent',
                          opacity: pressed ? 0.6 : 1,
                          borderBottomWidth: i < Math.min(items.length, 20) - 1 ? StyleSheet.hairlineWidth : 0,
                          borderBottomColor: hairline,
                          flexDirection: 'row',
                          gap: 10,
                        }}>
                          {/* unread dot */}
                          <View style={{ width: 6, paddingTop: 6 }}>
                            {isUnread && (
                              <View style={{
                                width: 6, height: 6, borderRadius: 3,
                                backgroundColor: accent,
                              }} />
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              numberOfLines={1}
                              style={{
                                fontSize: 13, fontWeight: isUnread ? '600' : '500',
                                color: ink, letterSpacing: -0.1,
                              }}
                            >
                              {item.title}
                            </Text>
                            {item.body && (
                              <Text
                                numberOfLines={2}
                                style={{ fontSize: 12, color: ink2, marginTop: 2, lineHeight: 16 }}
                              >
                                {item.body}
                              </Text>
                            )}
                            <Text style={{ fontSize: 10, color: ink3, marginTop: 4, letterSpacing: 0.3 }}>
                              {formatNotifTime(item.created_at)}
                            </Text>
                          </View>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
        </View>
      </Pressable>
    </Modal>
  );
}

// ─── Notifications panel (gruplu) ──────────────────────────────────────────
// 'menu' düzeninin sorunları (2026-11-14): 88 satırın hepsi aynı "okunmamış"
// tonunda; aynı sipariş art arda 4 satır; tür ayrımı yok; arka plan kararmıyor;
// yalnız ilk 20 kayıt. Bu düzen: Okunmamış/Tümü seçimi · güne göre başlık ·
// aynı siparişin olayları TEK satır · kategoriye göre ikon · okunmamış = kalın
// başlık + nokta (satır boyanmaz) · arkada karartma + bulanıklık.
type NotifGroup = { key: string; main: NotificationRow; rest: NotificationRow[]; unread: boolean };

function notifDayKey(iso: string): 'today' | 'yesterday' | 'older' {
  const d = new Date(iso); const now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  return diff <= 0 ? 'today' : diff === 1 ? 'yesterday' : 'older';
}

function groupNotifications(items: NotificationRow[]): { day: 'today' | 'yesterday' | 'older'; groups: NotifGroup[] }[] {
  const days: Record<string, NotifGroup[]> = { today: [], yesterday: [], older: [] };
  const index = new Map<string, NotifGroup>();
  for (const it of items) {               // items yeni → eski sıralı
    const day = notifDayKey(it.created_at);
    // Aynı gün + aynı kaynak (sipariş) → tek satır. Kaynağı olmayan kayıt tek başına.
    const key = it.resource_id ? `${day}:${it.resource_type ?? ''}:${it.resource_id}` : `${day}:${it.id}`;
    const g = index.get(key);
    if (g) { g.rest.push(it); if (!it.read_at) g.unread = true; }
    else { const ng: NotifGroup = { key, main: it, rest: [], unread: !it.read_at }; index.set(key, ng); days[day].push(ng); }
  }
  return (['today', 'yesterday', 'older'] as const).filter(d => days[d].length > 0).map(d => ({ day: d, groups: days[d] }));
}

/** "Kritik aşama tamamlandı: Frezeleme" → "Frezeleme" (ek olay özetinde yer kazanmak için) */
const notifShort = (title: string) => { const i = title.indexOf(':'); return (i >= 0 ? title.slice(i + 1) : title).trim(); };

function NotificationsPanel({ visible, anchorTop, onClose, accentColor }: {
  visible: boolean; anchorTop: number; onClose: () => void; accentColor?: string;
}) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const U = useInkUI();
  const { items, unreadCount } = useNotifications();
  const { markRead, markAllRead } = useNotificationsActions();
  const router = useRouter();
  const { width: W, height: H } = useWindowDimensions();
  const [tab, setTab] = useState<'unread' | 'all'>('unread');
  // Her açılışta: okunmamış varsa o sekme, yoksa Tümü
  React.useEffect(() => { if (visible) setTab(unreadCount > 0 ? 'unread' : 'all'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visible]);

  const surface  = isDark ? '#1B1916' : '#FFFFFF';
  const ink      = isDark ? '#F7F2E9' : '#0E0E0E';
  const ink2     = isDark ? 'rgba(247,242,233,0.72)' : 'rgba(20,16,12,0.66)';
  const ink3     = isDark ? 'rgba(247,242,233,0.48)' : 'rgba(20,16,12,0.48)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)';
  const segBg    = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(20,16,12,0.05)';
  const accent   = accentColor ?? '#0E0E0E';
  // Koyu temada lacivert accent koyu yüzeyde okunmaz → açık karşılığı
  const accentText = isDark ? '#9EC0E8' : accent;

  const shown = tab === 'unread' ? items.filter(i => !i.read_at) : items;
  const days = React.useMemo(() => groupNotifications(shown), [shown]);
  const dayLabel = (d: 'today' | 'yesterday' | 'older') => d === 'today' ? autoT('Bugün') : d === 'yesterday' ? autoT('Dün') : autoT('Daha önce');

  const toneOf = (cat: string) => {
    const T = U.chipTones;
    switch (cat) {
      case 'stage_critical': case 'order_status': case 'approval': return { icon: CheckCircle, tone: T.success };
      case 'chat': case 'scan_annotation': return { icon: MessageCircle, tone: T.info };
      case 'payment': return { icon: Wallet, tone: T.warning };
      case 'stock': case 'stock_count': case 'material_request': case 'implant_parts': return { icon: Package, tone: T.warning };
      case 'delivery': return { icon: Truck, tone: T.info };
      case 'scan_schedule': return { icon: Calendar, tone: T.info };
      case 'review_problem': case 'review_low': case 'review_low_reminder': return { icon: Bell, tone: T.danger };
      default: return { icon: Bell, tone: T.neutral };
    }
  };

  const onGroupPress = async (g: NotifGroup) => {
    const unread = [g.main, ...g.rest].filter(i => !i.read_at);
    try { await Promise.all(unread.map(i => markRead(i.id))); } catch { /* noop */ }
    onClose();
    if (g.main.action_url) { try { router.push(g.main.action_url as any); } catch { /* noop */ } }
  };

  const cardW = Math.min(420, W - 32);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Arka plan: karartma + bulanıklık (popup kuralı) */}
      <Pressable
        onPress={onClose}
        accessibilityLabel={autoT('Kapat')}
        style={[StyleSheet.absoluteFillObject, {
          backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(15,23,42,0.32)',
          ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any) : {}),
        }]}
      />
      <View
        style={{
          position: 'absolute', top: anchorTop, left: Math.round((W - cardW) / 2), width: cardW,
          maxHeight: Math.max(280, Math.floor(H * 0.72)),
          borderRadius: 24, backgroundColor: surface, overflow: 'hidden',
          ...(Platform.OS === 'web'
            ? ({ boxShadow: isDark ? '0 18px 44px rgba(0,0,0,0.6)' : '0 18px 44px rgba(15,23,42,0.22)' } as any)
            : { shadowColor: '#000', shadowOpacity: isDark ? 0.45 : 0.2, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12 }),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: ink, letterSpacing: -0.2 }}>{autoT('Bildirimler')}</Text>
          <View style={{ flex: 1 }} />
          {unreadCount > 0 ? (
            <Pressable onPress={() => { markAllRead(); }} hitSlop={8} accessibilityRole="button">
              <Text style={{ fontSize: 13, fontWeight: '500', color: accentText }}>{autoT('Tümünü okundu say')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: segBg, borderRadius: 999, padding: 2, marginHorizontal: 16, marginBottom: 6 }}>
          {([['unread', unreadCount > 0 ? `${autoT('Okunmamış')} · ${unreadCount}` : autoT('Okunmamış')], ['all', autoT('Tümü')]] as const).map(([k, label]) => {
            const on = tab === k;
            return (
              <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999, backgroundColor: on ? (isDark ? 'rgba(255,255,255,0.14)' : '#FFFFFF') : 'transparent' }}>
                <Text style={{ fontSize: 13, fontWeight: on ? '600' : '500', color: on ? ink : ink2 }} numberOfLines={1}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {days.length === 0 ? (
          <View style={{ paddingVertical: 44, alignItems: 'center', gap: 8 }}>
            <BellOff size={28} color={ink3} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: ink3 }}>{tab === 'unread' ? autoT('Okunmamış bildirim yok') : autoT('Henüz bildirim yok')}</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
            {days.map(({ day, groups }) => (
              <View key={day}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: ink3, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}>{dayLabel(day)}</Text>
                {groups.map((g) => {
                  const { icon: Icon, tone } = toneOf(String(g.main.category));
                  return (
                    <Pressable key={g.key} onPress={() => onGroupPress(g)} accessibilityRole="button"
                      style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-start',
                        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={17} color={tone.fg} strokeWidth={1.8} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontWeight: g.unread ? '600' : '400', color: ink, letterSpacing: -0.1 }}>{g.main.title}</Text>
                        {g.main.body ? <Text numberOfLines={1} style={{ fontSize: 12, color: ink2, marginTop: 1 }}>{g.main.body}</Text> : null}
                        {g.rest.length > 0 ? (
                          <Text numberOfLines={1} style={{ fontSize: 12, color: accentText, marginTop: 3 }}>
                            {`+${g.rest.length} ${autoT('daha')}: ${g.rest.map(r => notifShort(r.title)).join(', ')}`}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 12, color: ink3, marginTop: 1 }} numberOfLines={1}>{formatNotifTime(g.main.created_at)}</Text>
                      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: g.unread ? accentText : 'transparent' }} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: hairline, marginTop: 6 }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ─── Relative-time helper ──────────────────────────────────────────────────
function formatNotifTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return autoT('şimdi');
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} ${autoT('dk önce')}`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ${autoT('sa önce')}`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} ${autoT('gün önce')}`;
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function TopBtn({ icon: Icon, onPress, badgeCount, btnRef, label, dot, initials, fill }: {
  icon: any; onPress?: () => void; badgeCount?: number; btnRef?: (node: any) => void; label?: string;
  /** Rozet sayı yerine küçük kırmızı nokta */
  dot?: boolean;
  /** Verilirse ikon yerine baş harfler, `fill` renginde dolu düğme */
  initials?: string; fill?: string;
}) {
  const rtl = isRTL();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const surface  = isDark ? '#1B1916'                : '#FFFFFF';
  const border   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.08)';
  const iconColor = isDark ? '#F7F2E9'               : '#0E0E0E';

  const shadow = Platform.OS === 'web'
    ? ({
        cursor: 'pointer',
        boxShadow: isDark
          ? '0 4px 12px rgba(0,0,0,0.55)'
          : '0 4px 12px rgba(15,23,42,0.10)',
      } as any)
    : {
        shadowColor: '#000',
        shadowOpacity: isDark ? 0.4 : 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      };

  const badge = badgeCount && badgeCount > 0 ? (dot ? (
    <View style={{
      position: 'absolute', top: 6, ...(rtl ? { left: 7 } : { right: 7 }),
      width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444',
      borderWidth: 2, borderColor: surface, zIndex: 2,
    }} />
  ) : (
    <>
    <PulseRing size={20} color="#EF4444" top={-5} {...(rtl ? { left: -5 } : { right: -5 })} />
    <View style={{
      position: 'absolute', top: -5, ...(rtl ? { left: -5 } : { right: -5 }),
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#EF4444',
      zIndex: 2,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
        {badgeCount > 99 ? '99+' : String(badgeCount)}
      </Text>
    </View>
    </>
  )) : null;

  // Baş harfli profil düğmesi — aynı ölçü/köşe, panel renginde dolu (her iki tema).
  if (initials) {
    const bg = fill ?? '#0E0E0E';
    return (
      <Pressable ref={btnRef} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
        {({ pressed }: any) => (
          <View style={{
            width: 38, height: 38, borderRadius: 14, backgroundColor: bg,
            alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1, ...shadow,
          }}>
            <Text style={{ fontSize: 13, fontWeight: '700', letterSpacing: 0.2, color: onAccentInk(bg) }}>{initials}</Text>
          </View>
        )}
      </Pressable>
    );
  }

  // iOS 26+ liquid glass: opaque neutral parent bg + LiquidGlassView with
  // matching tintColor (same pattern as PillTabBar's search button).
  if (LIQUID_GLASS) {
    return (
      <Pressable ref={btnRef} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
        {({ pressed }: any) => (
          // Dış sarmal — overflow YOK, badge buradan taşabilir (kırpılmaz)
          <View style={{ width: 38, height: 38, position: 'relative', opacity: pressed ? 0.7 : 1 }}>
            {/* İç sarmal — liquid glass için overflow:hidden (yuvarlak köşeye kırpar) */}
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 14,
                backgroundColor: 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...shadow,
              }}
            >
              <LiquidGlassView
                effect="regular"
                colorScheme={isDark ? 'dark' : 'light'}
                interactive
                tintColor={isDark ? 'rgba(27,25,22,0.32)' : 'rgba(255,255,255,0.32)'}
                style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]}
              />
              <Icon size={16} color={iconColor} strokeWidth={1.8} />
            </View>
            {/* Badge — overflow'suz dış sarmalda, kırpılmaz */}
            {badge}
          </View>
        )}
      </Pressable>
    );
  }

  // Fallback — solid surface (web / older iOS / Android)
  return (
    <Pressable ref={btnRef} onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }: any) => (
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 14,
            backgroundColor: surface,
            borderWidth: 1,
            borderColor: border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
            position: 'relative',
            ...shadow,
          }}
        >
          <Icon size={16} color={iconColor} strokeWidth={1.8} />
          {badge}
        </View>
      )}
    </Pressable>
  );
}
