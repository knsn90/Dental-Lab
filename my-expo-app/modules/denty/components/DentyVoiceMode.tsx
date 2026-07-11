/**
 * DentyVoiceMode — panel-içi GERÇEK sesli komut katmanı.
 *
 * Tam ekran değil; DentyPanel içinde panel boyutunda açılır.
 * Akış: mikrofona konuş → Web Speech API metne çevirir → mevcut Denty agent'ına
 * gönderilir (sohbete düşer + onay akışı) → cevap burada ve sohbette görünür.
 *
 * Gerçek ses tanıma yalnızca web/PWA'da (Chrome/Edge/Android). Desteklenmeyen
 * ortamda (iOS Safari / native) zarif bilgi mesajı gösterir.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, Platform } from 'react-native';
import { X, Mic, MicOff } from 'lucide-react-native';
import { useDentyPalette } from '../theme';
import { useDentyStore } from '../store/dentyStore';
import { useSpeechRecognition } from '../useSpeechRecognition';
import { useDentyAgent } from '../useDentyAgent';
import type { AIState } from '../orbState';
import { ColorOrb } from './ColorOrb';
import { Waveform } from './Waveform';

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

type Phase = 'listening' | 'thinking' | 'speaking' | 'error' | 'unsupported';

function Ring({ color, delay, size, on }: { color: string; delay: number; size: number; on: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) { a.stopAnimation(); a.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    const t = setTimeout(() => loop.start(), delay);
    return () => { clearTimeout(t); loop.stop(); };
  }, [a, delay, on]);
  if (!on) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: 1.5, borderColor: hexA(color, 0.5),
        opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
        transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.55] }) }],
      }}
    />
  );
}

export function DentyVoiceMode() {
  const theme = useDentyPalette();
  const A = theme.primary;
  const open = useDentyStore((s) => s.voiceOpen);
  const closeVoice = useDentyStore((s) => s.closeVoice);
  const { send } = useDentyAgent();

  const [phase, setPhase] = useState<Phase>('listening');
  const [userText, setUserText] = useState('');
  const [answer, setAnswer] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  const onFinal = async (text: string) => {
    setNotice(null);
    setUserText(text);
    setPhase('thinking');
    const res = await send(text);
    if (res) {
      setAnswer(res.needsConfirm ? `${res.text}\n\n(Onaylamak için sohbete dokun.)` : res.text);
      setPhase('speaking');
    } else {
      // store meşgul/pending → kullanıcıyı bilgilendir
      setNotice('Önce mevcut işlemi tamamla, sonra tekrar dene.');
      setPhase('error');
    }
  };

  const onNoInput = () => {
    setNotice('Seni duyamadım. Mikrofona dokunup tekrar konuş.');
    setPhase('error');
  };

  const sr = useSpeechRecognition({ lang: 'tr-TR', onFinal, onNoInput });

  // Aç/kapa
  useEffect(() => {
    if (!open) { setPhase('listening'); setUserText(''); setAnswer(''); setNotice(null); sr.reset(); fade.setValue(0); return; }
    Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    if (!sr.supported) { setPhase('unsupported'); return; }
    setUserText(''); setAnswer(''); setNotice(null); setPhase('listening'); sr.start();
    return () => { sr.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Hata yansıt
  useEffect(() => {
    if (sr.error && sr.error !== 'unsupported' && phase === 'listening') setPhase('error');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sr.error]);

  if (!open) return null;

  const orbState: AIState =
    phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'speaking' ? 'speaking' : 'idle';

  const errMsg =
    sr.error === 'not-allowed' || sr.error === 'service-not-allowed'
      ? 'Mikrofon izni gerekli. Tarayıcı ayarlarından izin verip tekrar dene.'
      : sr.error === 'no-speech'
        ? 'Ses algılanmadı. Mikrofona dokunup tekrar konuş.'
        : 'Bir sorun oldu. Tekrar dokunup dene.';

  const caption =
    phase === 'unsupported' ? 'Desteklenmiyor'
      : phase === 'error' ? 'Hata'
        : phase === 'thinking' ? 'Düşünüyorum…'
          : phase === 'speaking' ? 'Simanty'
            : sr.listening ? 'Dinliyorum…' : 'Konuşmak için dokun';

  const body =
    phase === 'unsupported'
      ? 'Bu tarayıcı/cihaz ses tanımayı desteklemiyor. Lütfen aşağıdan yazarak sor (sohbet).'
      : phase === 'error' ? (notice || errMsg)
        : phase === 'thinking' ? (userText ? `“${userText}”` : '')
          : phase === 'speaking' ? answer
            : sr.transcript ? sr.transcript : 'Mikrofona dokun ve konuş.';

  const micOnPress = () => {
    if (phase === 'unsupported') return;
    if (sr.listening) { sr.stop(); return; }     // dinlemeyi bitir → işle
    // tekrar sor
    setUserText(''); setAnswer(''); setNotice(null); setPhase('listening'); sr.start();
  };

  const hint =
    phase === 'unsupported' ? 'Kapatmak için ✕'
      : sr.listening ? 'Konuşmayı bitir' : phase === 'speaking' || phase === 'error' ? 'Tekrar sormak için dokun' : 'Konuşmak için dokun';

  return (
    <Animated.View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.bg, opacity: fade, zIndex: 30 }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: -30, left: -30, right: -30, height: 300,
          backgroundColor: hexA(A, 0.12),
          borderBottomLeftRadius: 300, borderBottomRightRadius: 300,
          ...(Platform.OS === 'web' ? ({ filter: 'blur(36px)' } as any) : {}),
        }}
      />

      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 22, alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={closeVoice}
          hitSlop={10}
          style={{ alignSelf: 'flex-end', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}
        >
          <X size={17} color={hexA(theme.accent, 0.6)} strokeWidth={2} />
        </Pressable>

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <View style={{ width: 210, height: 210, alignItems: 'center', justifyContent: 'center' }}>
            <Ring color={A} delay={0} size={186} on={phase === 'listening' && sr.listening} />
            <Ring color={A} delay={800} size={186} on={phase === 'listening' && sr.listening} />
            <ColorOrb size={184} state={orbState} />
          </View>

          <View style={{ minHeight: 110, alignItems: 'center', justifyContent: 'flex-start' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', color: phase === 'error' ? '#D94B4B' : A }}>
              {caption}
            </Text>
            {!!body && (
              <Text style={{ marginTop: 10, maxWidth: 320, fontSize: 16, fontWeight: '500', lineHeight: 23, letterSpacing: -0.2, color: theme.accent, textAlign: 'center' }}>
                {body}
              </Text>
            )}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 16 }}>
          <Waveform bars={38} active={phase === 'listening' && sr.listening} height={46} color={A} />
          <Pressable
            onPress={micOnPress}
            disabled={phase === 'unsupported' || phase === 'thinking'}
            style={{
              width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center',
              backgroundColor: phase === 'unsupported' ? hexA(theme.accent, 0.25) : A,
              opacity: phase === 'thinking' ? 0.5 : 1,
              ...(Platform.OS === 'web' ? ({ cursor: 'pointer', boxShadow: `0 10px 28px ${hexA(A, 0.5)}` } as any) : { shadowColor: A, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }),
            }}
          >
            {phase === 'unsupported' ? <MicOff size={22} color="#FFFFFF" strokeWidth={2.2} /> : <Mic size={22} color="#FFFFFF" strokeWidth={2.2} />}
          </Pressable>
          <Text style={{ fontSize: 12, color: theme.muted }}>{hint}</Text>
        </View>
      </View>
    </Animated.View>
  );
}
