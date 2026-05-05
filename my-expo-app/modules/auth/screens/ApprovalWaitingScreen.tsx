/**
 * ApprovalWaitingScreen — Kayıt tamamlandı, onay bekleniyor
 *
 * Telefon doğrulaması başarılı → bu ekran gösterilir.
 * "Laboratuvar onayından sonra erişim sağlanacaktır."
 * V3 Editorial layout — yeşil (clinic) tema
 */
import React, { useRef, useEffect } from 'react';
import {
  View, Text, Pressable, Animated, Easing,
  useWindowDimensions, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../core/api/supabase';
import { DS } from '../../../core/theme/dsTokens';
import {
  CheckCircle, Clock, ArrowRight, Shield,
} from 'lucide-react-native';

// ── Design tokens — clinic green ──
const INK = DS.ink[900];
const GREEN = DS.clinic.primary;
const GREEN_DEEP = DS.clinic.accent;
const KREM = '#F5F2EA';
const DISPLAY: any = { fontFamily: DS.font.display, fontWeight: '300' };

const isDesktopWidth = (w: number) => w >= 900;

// ── Pulsing dot ──
function PulseDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(400),
      ]),
    ).start();
  }, [anim]);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] });
  return <Animated.View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color, opacity, marginRight: 8 }} />;
}

// ── Pulsing clock icon ──
function PulsingClock() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  return (
    <Animated.View style={{ transform: [{ scale }], opacity }}>
      <Clock size={32} color={GREEN} strokeWidth={1.5} />
    </Animated.View>
  );
}

export function ApprovalWaitingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWidth(width);

  const btnScale = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(isDesktop ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Card animation
    if (!isDesktop) {
      Animated.parallel([
        Animated.spring(cardSlide, { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
    // Check icon bounce
    Animated.spring(checkScale, { toValue: 1, tension: 100, friction: 8, useNativeDriver: true }).start();
  }, []);

  const handleGoToLogin = async () => {
    // Oturumu kapat ve login'e yönlendir
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  // ── Content card ──
  const contentCard = (
    <View style={{ alignItems: 'center' }}>
      {/* Success check */}
      <Animated.View style={{
        transform: [{ scale: checkScale }],
        width: 80, height: 80, borderRadius: 24,
        backgroundColor: `${GREEN}15`, alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <CheckCircle size={40} color={GREEN} strokeWidth={1.5} />
      </Animated.View>

      <Text style={{
        ...DISPLAY, fontSize: 26, letterSpacing: -0.03 * 26, color: INK,
        marginBottom: 8, textAlign: 'center',
      }}>
        Kaydınız alındı
      </Text>

      <Text style={{
        fontSize: 14, color: DS.ink[500], lineHeight: 21, textAlign: 'center',
        maxWidth: 300, marginBottom: 32,
      }}>
        Telefon doğrulamanız başarılı. Hesabınız incelemeye alınmıştır.
      </Text>

      {/* Waiting card */}
      <View style={{
        width: '100%', maxWidth: 340,
        backgroundColor: '#FFFFFF', borderRadius: 16,
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
        padding: 24, alignItems: 'center', gap: 16,
        marginBottom: 32,
      }}>
        <PulsingClock />

        <Text style={{
          fontSize: 15, fontWeight: '600', color: INK, textAlign: 'center',
        }}>
          Laboratuvar onayı bekleniyor
        </Text>

        <Text style={{
          fontSize: 13, color: DS.ink[500], lineHeight: 19, textAlign: 'center',
        }}>
          Laboratuvar yöneticisi kaydınızı onayladıktan sonra sisteme giriş yapabilirsiniz. Onay süreci genellikle 24 saat içinde tamamlanır.
        </Text>

        {/* Steps */}
        <View style={{ width: '100%', gap: 12, marginTop: 8 }}>
          {[
            { step: '1', label: 'Kayıt oluşturuldu', done: true },
            { step: '2', label: 'Telefon doğrulandı', done: true },
            { step: '3', label: 'Laboratuvar onayı', done: false },
          ].map((item, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <View style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: item.done ? GREEN : DS.ink[100],
                alignItems: 'center', justifyContent: 'center',
              }}>
                {item.done ? (
                  <CheckCircle size={14} color="#FFFFFF" strokeWidth={2.5} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: '700', color: DS.ink[400] }}>{item.step}</Text>
                )}
              </View>
              <Text style={{
                fontSize: 13,
                color: item.done ? DS.ink[700] : DS.ink[400],
                fontWeight: item.done ? '500' : '400',
              }}>
                {item.label}
              </Text>
              {!item.done && (
                <View style={{
                  marginLeft: 'auto',
                  paddingHorizontal: 8, paddingVertical: 3,
                  backgroundColor: `${DS.clinic.warning}15`,
                  borderRadius: 8,
                }}>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: DS.clinic.warning }}>Bekleniyor</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>

      {/* Go to login button */}
      <Animated.View style={{ transform: [{ scale: btnScale }], width: '100%', maxWidth: 340 }}>
        <Pressable
          onPress={handleGoToLogin}
          onPressIn={() => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start()}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 14, paddingVertical: 15,
            backgroundColor: GREEN_DEEP,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#FFF' }}>Giriş sayfasına dön</Text>
          <ArrowRight size={14} color="#FFF" strokeWidth={2} />
        </Pressable>
      </Animated.View>

      {/* Trust footer */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 32,
      }}>
        <Shield size={12} color={DS.ink[400]} strokeWidth={2} />
        <Text style={{ fontSize: 10, color: DS.ink[400] }}>
          Bilgileriniz güvenle korunmaktadır
        </Text>
      </View>
    </View>
  );

  // ════════ DESKTOP ════════
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: GREEN_DEEP }}>
        {/* Left editorial panel */}
        <View style={{ flex: 1, padding: 48, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -60, top: 80, opacity: 0.06 }} pointerEvents="none">
            <Image source={require('../../../assets/images/icon.png')}
              style={{ width: 380, height: 380, tintColor: '#FFFFFF' }} resizeMode="contain" />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={require('../../../assets/images/icon.png')} style={{ width: 22, height: 22 }} resizeMode="contain" />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', letterSpacing: -0.02 * 14 }}>Dental Lab</Text>
          </View>

          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <PulseDot color={GREEN} />
              <Text style={{ fontSize: 11, color: GREEN, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '600' }}>
                Kayıt tamamlandı
              </Text>
            </View>
            <Text style={{
              ...DISPLAY, fontSize: 72, letterSpacing: -0.045 * 72, lineHeight: 72 * 0.92,
              color: '#FFFFFF', marginBottom: 24,
            }}>
              Neredeyse{'\n'}
              <Text style={{ color: GREEN }}>hazır</Text>{'\n'}
              oldu.
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 420, lineHeight: 21 }}>
              Kaydınız başarıyla oluşturuldu. Laboratuvar onayından sonra sisteme erişebilirsiniz.
            </Text>
          </View>

          <View />
        </View>

        {/* Right — krem card */}
        <View style={{
          width: 440, backgroundColor: KREM,
          borderRadius: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0,
          padding: 40, marginTop: 24, marginBottom: 24, marginLeft: 24,
          justifyContent: 'center',
        }}>
          {contentCard}
        </View>
      </View>
    );
  }

  // ════════ MOBILE ════════
  return (
    <View style={{ flex: 1, backgroundColor: GREEN_DEEP }}>
      <View style={{
        paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center',
      }}>
        <View style={{
          width: 52, height: 52, borderRadius: 16, backgroundColor: GREEN,
          alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        }}>
          <CheckCircle size={24} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF', letterSpacing: 1.5, marginBottom: 4 }}>
          KAYIT TAMAM
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Onay bekleniyor</Text>
      </View>

      <Animated.View style={{
        flex: 1, backgroundColor: KREM,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 24, paddingTop: 28, paddingBottom: insets.bottom + 24,
        transform: [{ translateY: cardSlide }], opacity: cardOpacity,
        justifyContent: 'center',
      }}>
        {contentCard}
      </Animated.View>
    </View>
  );
}
