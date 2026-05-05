/**
 * RegisterChoiceScreen — "Muayenehane mi, Klinik mi?" seçim ekranı
 *
 * V3 Editorial layout (LoginScreen uyumlu) — yeşil (clinic) tema
 * Desktop: dark left brand panel + krem right choice cards
 * Mobile: dark header + krem sliding cards
 */
import React, { useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Animated, Easing,
  useWindowDimensions, Image, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import {
  ChevronLeft, ChevronRight, Stethoscope, Building2, Users, User,
} from 'lucide-react-native';

// ── Design tokens — clinic green ──
const INK   = DS.ink[900];
const GREEN = DS.clinic.primary;     // #6BA888 sage
const GREEN_DEEP = DS.clinic.accent; // #0F2A1F dark forest
const GREEN_BG = DS.clinic.bg;       // #EDF2EE
const KREM  = '#F5F2EA';
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

// ── Choice card ──
function ChoiceCard({
  icon, title, subtitle, features, onPress, accent,
}: {
  icon: React.ReactNode; title: string; subtitle: string;
  features: string[]; onPress: () => void; accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minWidth: 220,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1.5,
        borderColor: pressed ? accent : 'rgba(0,0,0,0.06)',
        opacity: pressed ? 0.95 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      {/* Icon badge */}
      <View style={{
        width: 48, height: 48, borderRadius: 14,
        backgroundColor: `${accent}18`,
        alignItems: 'center', justifyContent: 'center', marginBottom: 16,
      }}>
        {icon}
      </View>

      <Text style={{ fontSize: 17, fontWeight: '700', color: INK, letterSpacing: -0.3, marginBottom: 4 }}>
        {title}
      </Text>
      <Text style={{ fontSize: 12, color: DS.ink[500], lineHeight: 17, marginBottom: 18 }}>
        {subtitle}
      </Text>

      {/* Features */}
      {features.map((f, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent }} />
          <Text style={{ fontSize: 12, color: DS.ink[700] }}>{f}</Text>
        </View>
      ))}

      {/* Arrow */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 18, alignSelf: 'flex-end',
      }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>Devam</Text>
        <ChevronRight size={14} color={accent} strokeWidth={2} />
      </View>
    </Pressable>
  );
}

// ── Main ──
export function RegisterChoiceScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = isDesktopWidth(width);

  const cardSlide  = useRef(new Animated.Value(isDesktop ? 0 : 40)).current;
  const cardOpacity = useRef(new Animated.Value(isDesktop ? 1 : 0)).current;

  useEffect(() => {
    if (!isDesktop) {
      Animated.parallel([
        Animated.spring(cardSlide,   { toValue: 0, tension: 60, friction: 11, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start();
    }
  }, []);

  // ── Choices content ──
  const choicesContent = (
    <View>
      {/* Back */}
      <Pressable
        onPress={() => router.back()}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 24, paddingVertical: 4 }}
      >
        <ChevronLeft size={16} color={DS.ink[500]} strokeWidth={2} />
        <Text style={{ fontSize: 12, color: DS.ink[500], fontWeight: '500' }}>Giriş sayfası</Text>
      </Pressable>

      {/* Header */}
      <Text style={{ fontSize: 11, color: GREEN, letterSpacing: 1.1, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>
        Kayıt Türü
      </Text>
      <Text style={{ ...DISPLAY, fontSize: 28, letterSpacing: -0.03 * 28, color: INK, marginBottom: 6 }}>
        Nasıl çalışıyorsunuz?
      </Text>
      <Text style={{ fontSize: 13, color: DS.ink[500], lineHeight: 19, marginBottom: 28 }}>
        Size en uygun kayıt yolunu seçin.
      </Text>

      {/* Choice cards */}
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: 14 }}>
        <ChoiceCard
          icon={<User size={22} color={GREEN} strokeWidth={1.8} />}
          title="Muayenehane"
          subtitle="Tek hekim, kendi kliniğinizde çalışıyorsunuz."
          features={[
            'Tek hekim profili oluşturulur',
            'Klinik bilgileri otomatik eklenir',
            'Hemen sipariş verebilirsiniz',
          ]}
          accent={GREEN}
          onPress={() => router.push('/(auth)/register-doctor')}
        />

        <ChoiceCard
          icon={<Building2 size={22} color={GREEN_DEEP} strokeWidth={1.8} />}
          title="Klinik / Poliklinik"
          subtitle="Birden fazla hekim çalışan bir kurumsunuz."
          features={[
            'Klinik hesabı oluşturulur',
            'Hekimleri davet edebilirsiniz',
            'Merkezi sipariş & fatura yönetimi',
          ]}
          accent={GREEN_DEEP}
          onPress={() => router.push('/(auth)/register-clinic')}
        />
      </View>

      {/* Login link */}
      <Text style={{ fontSize: 11, color: DS.ink[400], textAlign: 'center', marginTop: 28 }}>
        Zaten hesabınız var mı?{' '}
        <Text
          onPress={() => router.replace('/(auth)/login')}
          style={{ color: INK, fontWeight: '500', textDecorationLine: 'underline' }}
        >
          Giriş yapın
        </Text>
      </Text>
    </View>
  );

  // ════════ DESKTOP ════════
  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: GREEN_DEEP }}>
        {/* Left — dark green editorial panel */}
        <View style={{ flex: 1, padding: 48, justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -60, top: 80, opacity: 0.06 }} pointerEvents="none">
            <Image
              source={require('../../../assets/images/icon.png')}
              style={{ width: 380, height: 380, tintColor: '#FFFFFF' }}
              resizeMode="contain"
            />
          </View>

          {/* Top */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 11, backgroundColor: GREEN,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Image
                source={require('../../../assets/images/icon.png')}
                style={{ width: 22, height: 22 }}
                resizeMode="contain"
              />
            </View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#FFF', letterSpacing: -0.02 * 14 }}>
              Dental Lab
            </Text>
          </View>

          {/* Middle */}
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <PulseDot color={GREEN} />
              <Text style={{ fontSize: 11, color: GREEN, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: '600' }}>
                Hekim kayıt sistemi
              </Text>
            </View>
            <Text style={{
              ...DISPLAY, fontSize: 82, letterSpacing: -0.045 * 82, lineHeight: 82 * 0.92,
              color: '#FFFFFF', marginBottom: 24,
            }}>
              Dijital{'\n'}
              <Text style={{ color: GREEN }}>diş hekimi</Text>{'\n'}
              ağına{'\n'}
              katılın.
            </Text>
            <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 460, lineHeight: 21 }}>
              Hızlı kayıt, kolay sipariş takibi. Laboratuvarınız ile doğrudan bağlantı kurun.
            </Text>
          </View>

          <View />
        </View>

        {/* Right — krem card */}
        <View style={{
          width: 520, backgroundColor: KREM,
          borderRadius: 28, borderTopRightRadius: 0, borderBottomRightRadius: 0,
          padding: 40, marginTop: 24, marginBottom: 24, marginLeft: 24,
        }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          >
            {choicesContent}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ════════ MOBILE ════════
  return (
    <View style={{ flex: 1, backgroundColor: GREEN_DEEP }}>
      <View style={{
        paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: 24,
        alignItems: 'center',
      }}>
        <View style={{
          width: 52, height: 52, borderRadius: 16, backgroundColor: GREEN,
          alignItems: 'center', justifyContent: 'center', marginBottom: 10,
        }}>
          <Stethoscope size={24} color="#FFFFFF" strokeWidth={1.8} />
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#FFF', letterSpacing: 1.5, marginBottom: 4 }}>
          HEKİM KAYDI
        </Text>
        <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Dental Lab sistemi</Text>
      </View>

      <Animated.View style={{
        flex: 1, backgroundColor: KREM,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        paddingHorizontal: 24, paddingTop: 28,
        paddingBottom: insets.bottom + 24,
        transform: [{ translateY: cardSlide }],
        opacity: cardOpacity,
      }}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
        >
          {choicesContent}
        </ScrollView>
      </Animated.View>
    </View>
  );
}
