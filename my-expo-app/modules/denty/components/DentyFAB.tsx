/**
 * DentyFAB — root layout'ta tek instance, her ekranda sağ-altta.
 *
 *   Dinlenme : yalnız 60px orb (masaüstü) / 56px orb (mobil)
 *   Hover    : orbun solunda "Simanty" etiketi açılır (Linear/Notion kalıbı)
 *   Tıklama  : sohbet paneli masaüstünde sağdan, mobilde alttan girer
 *
 * KABUK YOK. Eskiden orb camlı bir hapın (blur + kenar + gölge + iridesans)
 * içindeydi ve kalıcı "Simanty'ye sor" yazısıyla ~230px yer kaplıyordu —
 * sayfanın bir parçası gibi değil, üstüne yapıştırılmış bir reklam şeridi gibi
 * duruyordu. Cam katmanları tamamen kaldırıldı; orb kendi başına okunaklı.
 *
 * Yalnızca giriş yapmış kullanıcıya ve desteklenen panellerde görünür.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, Platform, Animated, Easing, useWindowDimensions,
} from 'react-native';
import { useSegments } from 'expo-router';
import { useDentyPalette } from '../theme';
import { useAuthStore } from '../../../core/store/authStore';
import { useDentyStore } from '../store/dentyStore';
import { isDentyPanel, dentyRoleLabel } from '../context';
import { useUiOverlayStore } from '../../../core/store/uiOverlayStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DentyPanel } from './DentyPanel';
import { ColorOrb } from './ColorOrb';
import { useAnimatedKeyboardHeight } from '../../../core/ui/useAnimatedKeyboardHeight';

/** Masaüstü orb çapı. Tooltip'in sağ konumu buna bağlı — tek yerden yönetilir. */
const ORB_SIZE = 60;
/** DS.ink[900] — tooltip başlığı. Panel temasından bağımsız nötr metin. */
const INK_900 = '#0A0A0A';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

export function DentyFAB() {
  const theme = useDentyPalette();
  const profile = useAuthStore((s) => s.profile);
  const isOpen = useDentyStore((s) => s.isOpen);
  const open = useDentyStore((s) => s.open);
  const close = useDentyStore((s) => s.close);
  const { width } = useWindowDimensions();
  const isWide = width >= 760;
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  // Ekranın yapışkan aksiyon çubuğu varsa FAB onun üstüne çıkar
  const bottomBar = useUiOverlayStore((s) => s.bottomBarHeight);
  // Asistanın yardımcı olamayacağı akışlar (ör. sipariş düzenleme sihirbazı)
  // FAB'ı bastırır — useSuppressDentyFab().
  const suppressed = useUiOverlayStore((s) => s.dentyFabSuppress > 0);
  const panel = String(segments?.[0] ?? '');

  // Klavye açılınca panel yukarı taşınır (composer klavyenin altında kalıyordu).
  // Panel sabit yükseklikli olduğu için düzeltme burada, kapsayıcıda yapılmalı.
  const { height: kbHeight } = useAnimatedKeyboardHeight();

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: isOpen ? 1 : 0,
      useNativeDriver: true,
      // Daha zarif, hafif yaylanmalı açılış (snappy yerine akışkan)
      stiffness: 340,
      damping: 26,
      mass: 0.9,
    }).start();
  }, [isOpen, anim]);

  // Buton statik; canlılık yalnızca orb'un kendi animasyonundan gelir (örnek gibi).
  const backdropOpacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  // ── Hover'da açılan etiket (Linear/Notion kalıbı) ──────────────────────────
  //
  // Dinlenme hâlinde YALNIZ orb durur; etiket imleç üstüne gelince açılır.
  // Önceki hâl kalıcı olarak ~230px yer kaplıyordu ve sayfanın bir parçası
  // gibi değil, üstüne yapıştırılmış bir reklam şeridi gibi duruyordu.
  //
  // Tooltip MUTLAK konumlandırılır ve yalnız opacity + translateX ile gelir.
  // Genişlik animasyonu denendi ve bırakıldı: `overflow: hidden` gerektiriyor,
  // o da cam kutunun gölgesini kırpıyordu. Ayrıca transform/opacity compositor
  // üzerinde çalışır — düzen hesabı yok, daha akıcı. Metin genişliğini ölçmeye
  // de gerek kalmadı (çeviride uzasa bile sorun çıkmaz).
  const [hovered, setHovered] = useState(false);
  const hoverAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(hoverAnim, {
      toValue: hovered ? 1 : 0,
      duration: hovered ? 200 : 140,   // çıkış girişten kısa — daha çevik hissettirir
      easing: hovered ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [hovered, hoverAnim]);

  const tooltipStyle = {
    opacity: hoverAnim,
    transform: [
      // Orbun yanından hafifçe açılır; 6px'lik bu kayma "oradan çıktı" hissini verir.
      { translateX: hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
      { scale: hoverAnim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
    ],
  };

  if (!profile) return null;
  // Simanty artık TÜM panellerde (lab, admin, klinik, hekim, istasyon, kurye).
  // Desteklenmeyen route'larda (auth, platform, dev, public link) görünmez.
  if (!isDentyPanel(panel)) return null;
  // Panel AÇIKKEN bastırma gelirse sohbeti ortadan kaldırmayız — yalnız
  // kapalı haldeki pill gizlenir.
  if (suppressed && !isOpen) return null;

  // Masaüstünde panel SAĞDAN kayarak girer (mobilde alttan). Girişi ve çıkışı
  // aynı yol üzerinde olur — çıkarken geldiği yere döner (mekânsal tutarlılık).
  const panelStyle = {
    opacity: anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1] }),
    transform: [
      { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [isWide ? 0.98 : 0.9, 1] }) },
      { translateX: isWide ? anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) : 0 },
      { translateY: isWide ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
    ],
  };

  return (
    <>
      {/* ── Kapalı: morph-pill ── */}
      {!isOpen && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', right: isWide ? 24 : 16, bottom: (isWide ? 24 : (insets.bottom + 74)) + bottomBar, zIndex: 9999 }}
        >
          {isWide ? (
          // Kabuk YOK — yalnız 60px orb. Camlı hap (blur + kenar + gölge +
          // iridesans katmanı) tamamen kaldırıldı: orb zaten kendi başına
          // okunaklı ve arkasındaki kutu onu bir "reklam düğmesi"ne çeviriyordu.
          // Etiket hover'da orbun SOLUNDA belirir (sağda ekran dışına taşardı).
          <Pressable
            onPress={open}
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            style={{
              flexDirection: 'row', alignItems: 'center',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            {/* Cam tooltip — orbun 8px solunda. Mutlak konumlu olduğu için
                orbun yerini oynatmaz; açılıp kapanırken düzen hiç kıpırdamaz. */}
            <Animated.View
              pointerEvents="none"
              style={[
                tooltipStyle,
                {
                  position: 'absolute', right: ORB_SIZE + 8,
                  paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11,
                  backgroundColor: 'rgba(255,255,255,0.72)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)',
                  ...(Platform.OS === 'web'
                    ? ({
                        backdropFilter: 'blur(10px) saturate(140%)',
                        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
                        boxShadow: '0 6px 20px rgba(16,24,40,0.10), 0 1px 3px rgba(16,24,40,0.06)',
                        whiteSpace: 'nowrap',
                      } as any)
                    : { shadowColor: '#101828', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 }),
                },
              ]}
            >
              <Text numberOfLines={1} style={{ fontSize: 12.5, fontWeight: '700', color: INK_900, lineHeight: 16 }}>
                Simanty
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '500', color: theme.accent, opacity: 0.85, lineHeight: 14 }}>
                {dentyRoleLabel(panel)}
              </Text>
            </Animated.View>

            <ColorOrb size={ORB_SIZE} />
          </Pressable>
          ) : (
            <Pressable
              onPress={open}
              android_ripple={{ color: hexA(theme.accent, 0.12), radius: 32 }}
              style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
            >
              <ColorOrb size={56} />
            </Pressable>
          )}
        </View>
      )}

      {/* ── Açık: panel (morph) ── */}
      <Modal visible={isOpen} transparent animationType="none" onRequestClose={close}>
        <Animated.View
          style={{
            flex: 1,
            backgroundColor: 'rgba(10,14,26,0.42)',
            opacity: backdropOpacity,
            justifyContent: isWide ? 'center' : 'flex-end',
            alignItems: isWide ? 'flex-end' : 'stretch',
            paddingBottom: isWide ? 0 : kbHeight,
            ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
          }}
        >
          <Pressable onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <Animated.View
            style={[
              {
                backgroundColor: theme.bg,
                overflow: 'hidden',
                ...(isWide
                  ? { width: 440, height: '100%', borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }
                  : { height: '84%', borderTopLeftRadius: 32, borderTopRightRadius: 32 }),
              },
              panelStyle,
            ]}
          >
            <DentyPanel />
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}
