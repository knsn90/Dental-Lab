/**
 * TopActionBar — Mobil sağ üst kalıcı aksiyon butonları (QR · Bell · Profile).
 *
 * Tüm panel layout'larında (lab/admin/doctor/clinic) sabit konumda render edilir.
 * Sadece mobile'da (width < 768) görünür; desktop'ta DesktopShell kendi başlığı
 * vasıtasıyla bu aksiyonları sunar.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet, Modal, Alert, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { QrCode, Bell, User as UserIcon, Search, MessageCircle, LogOut, ChevronRight, BellOff, Check, Monitor, Sun, Moon } from 'lucide-react-native';
import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass';
import { useScanStore } from '../../store/scanStore';
import { useUiOverlayStore } from '../../store/uiOverlayStore';
import { useNotifications, useNotificationsActions } from '../../store/notificationsStore';
import { useThemeModeStore } from '../../store/themeModeStore';
import { useCommandPalette } from '../../store/commandPaletteStore';
import { useAuthStore } from '../../store/authStore';
import { useOrderChatInbox } from '../../../modules/orders/hooks/useOrderChatInbox';
import { ProfileMenu as SharedProfileMenu } from './ProfileMenu';

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
}

export function TopActionBar({ routePrefix, notificationsRoute, accentColor }: Props) {
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
  const onMenuLogout = () => {
    setProfileMenuOpen(false);
    Alert.alert(
      'Çıkış Yap',
      'Hesabınızdan çıkış yapmak istediğinize emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkış Yap',
          style: 'destructive',
          onPress: async () => {
            try { await useAuthStore.getState().signOut(); }
            catch { /* noop */ }
          },
        },
      ],
    );
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: Math.max(insets.top, 8) + 6,
          right: 12,
          flexDirection: 'row',
          gap: 6,
          zIndex: 1200,
        }}
      >
        <TopBtn icon={QrCode} onPress={onScan} />
        <TopBtn icon={MessageCircle} onPress={onMessages} badgeCount={chatUnread} />
        <TopBtn icon={Bell} onPress={onNotifications} badgeCount={unreadCount} />
        <TopBtn icon={UserIcon} onPress={onProfile} />
      </View>

      <SharedProfileMenu
        visible={profileMenuOpen}
        anchorTop={Math.max(insets.top, 8) + 6 + 38 + 8}
        onClose={() => setProfileMenuOpen(false)}
        onProfile={onMenuProfile}
        onLogout={onMenuLogout}
      />

      <NotificationsMenu
        visible={notifMenuOpen}
        anchorTop={Math.max(insets.top, 8) + 6 + 38 + 8}
        onClose={() => setNotifMenuOpen(false)}
        accentColor={accentColor}
      />

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
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const mode    = useThemeModeStore(s => s.mode);
  const setMode = useThemeModeStore(s => s.setMode);

  const surface = isDark ? '#1B1916' : '#FFFFFF';
  const ink     = isDark ? '#F7F2E9' : '#0E0E0E';
  const ink2    = isDark ? 'rgba(247,242,233,0.72)' : 'rgba(20,16,12,0.7)';
  const ink3    = isDark ? 'rgba(247,242,233,0.45)' : 'rgba(20,16,12,0.5)';
  const hairline = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.06)';
  const segBg    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(20,16,12,0.05)';
  const activeBg = isDark ? '#2A2724' : '#FFFFFF';
  const activeBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(20,16,12,0.08)';

  const themeOptions: Array<{ value: 'system' | 'light' | 'dark'; icon: any; label: string }> = [
    { value: 'system', icon: Monitor, label: 'Otomatik' },
    { value: 'light',  icon: Sun,     label: 'Açık' },
    { value: 'dark',   icon: Moon,    label: 'Koyu' },
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
            right: 12,
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
            <View style={{
              flexDirection: 'row',
              backgroundColor: segBg,
              borderRadius: 8,
              padding: 2,
              gap: 2,
            }}>
              {themeOptions.map(opt => {
                const Icon = opt.icon;
                const isActive = mode === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setMode(opt.value)}
                    style={{ flex: 1 }}
                    accessibilityLabel={opt.label}
                  >
                    {({ pressed }: any) => (
                      <View style={{
                        paddingVertical: 6,
                        borderRadius: 6,
                        backgroundColor: isActive ? activeBg : 'transparent',
                        borderWidth: isActive ? 1 : 0,
                        borderColor: isActive ? activeBorder : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                      }}>
                        <Icon size={15} color={isActive ? ink : ink2} strokeWidth={isActive ? 2 : 1.8} />
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
            label="Profil"
            iconColor={ink}
            labelColor={ink}
            ink3={ink3}
            onPress={onProfile}
            showDivider
            hairline={hairline}
          />
          <MenuRow
            icon={LogOut}
            label="Çıkış Yap"
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
          <ChevronRight size={16} color={ink3} strokeWidth={1.8} />
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
              right: 12,
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
                  Bildirimler
                </Text>
                {unreadCount > 0 && (
                  <View style={{
                    minWidth: 20, height: 18, paddingHorizontal: 6, borderRadius: 9,
                    backgroundColor: accent,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#0E0E0E' }}>
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
                        Tümünü oku
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
                  Henüz bildirim yok
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

// ─── Relative-time helper ──────────────────────────────────────────────────
function formatNotifTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return 'şimdi';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} gün önce`;
    const d = new Date(iso);
    return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function TopBtn({ icon: Icon, onPress, badgeCount }: { icon: any; onPress?: () => void; badgeCount?: number }) {
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const surface  = isDark ? '#1B1916'                : '#FFFFFF';
  const border   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(20,16,12,0.08)';
  const iconColor = isDark ? '#F7F2E9'               : '#0E0E0E';
  const badgeRingColor = isDark ? '#1B1916'          : '#FFFFFF';

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

  const badge = badgeCount && badgeCount > 0 ? (
    <View style={{
      position: 'absolute', top: -5, right: -5,
      minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#EF4444',
      borderWidth: 2, borderColor: badgeRingColor,
      zIndex: 2,
    }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.2 }}>
        {badgeCount > 99 ? '99+' : String(badgeCount)}
      </Text>
    </View>
  ) : null;

  // iOS 26+ liquid glass: opaque neutral parent bg + LiquidGlassView with
  // matching tintColor (same pattern as PillTabBar's search button).
  if (LIQUID_GLASS) {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
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
    <Pressable onPress={onPress} hitSlop={8}>
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
