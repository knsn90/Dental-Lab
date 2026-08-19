/**
 * DentyPanel — Denty sohbet arayüzü (panel temalı).
 * Mobil: alttan tam genişlik sheet · Web: sağ panel.
 *
 * Faz 2: yazma aksiyonları için onay kartı (Onayla / Vazgeç) gösterir.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Platform, Animated, Easing, StyleSheet,
} from 'react-native';
import { ArrowUp, X, RotateCcw, Check, ShieldQuestion, FilePlus2, Wallet, Search, GraduationCap, Mic, Paperclip, FileText, Image as ImageIcon, Box, Film } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useDentyPalette } from '../theme';
import { DentyVoiceMode } from './DentyVoiceMode';
import { useDentyStore, detectAttachmentKind, newAttachmentId, type DentyAttachment, type DentyAttachmentKind } from '../store/dentyStore';
import { useDentyContext, dentyRoleLabel } from '../context';
import { PANEL_GREETING, PANEL_SUGGESTIONS } from '../prompts';
import { useSuggestionStats, type StatKey } from '../useSuggestionStats';
import { useDentyToolkit } from '../tools';
import { runDentyTurn, resumeDentyTurn } from '../api';
import type { DentyOutcome } from '../types';
import { ColorOrb } from './ColorOrb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Stop, Rect, LinearGradient as SvgLinearGradient, RadialGradient } from 'react-native-svg';

// MaskedView yalnız native'de yüklenir (web'de gradyan metin CSS ile yapılır).
const MaskedView: any = Platform.OS !== 'web' ? require('@react-native-masked-view/masked-view').default : null;

// Öneri kartları PANELE göre değişir (prompts/index.ts). Simgeler başlıktan
// türetilir — her panel için ayrı ikon tablosu tutmaya değmez.
function suggestionIcon(label: string): any {
  const l = label.toLocaleLowerCase('tr');
  if (l.includes('oluştur') || l.includes('sipariş açma')) return FilePlus2;
  if (l.includes('cari') || l.includes('tahsilat') || l.includes('fatura')) return Wallet;
  if (l.includes('ara') || l.includes('vaka') || l.includes('teslimat') || l.includes('adres')) return Search;
  return GraduationCap;
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Gradyan metin (web): clip-text; native'de MaskedView ile (aşağıda).
function gradTextStyle(from: string, to: string): any {
  return Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(100deg, ${from}, ${to})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : { color: from };
}

// Gerçek gradyan dolgu — web'de CSS, native'de SVG (PWA ile birebir).
// Kapsayıcının içine ilk mutlak çocuk olarak konur; içerik üstünde çizilir.
function GradientFill({ from, to, angle = 135, radius = 0 }: { from: string; to: string; angle?: number; radius?: number }) {
  const uid = React.useId().replace(/:/g, '');
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius, backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` } as any]}
      />
    );
  }
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          <SvgLinearGradient id={uid} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={from} />
            <Stop offset="100%" stopColor={to} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${uid})`} />
      </Svg>
    </View>
  );
}

// Gradyan başlık — web: CSS clip-text · native: MaskedView + gradyan.
function GradientHeading({ from, to, style, children }: { from: string; to: string; style: any; children: React.ReactNode }) {
  if (Platform.OS === 'web') {
    return <Text style={[style, gradTextStyle(from, to)]}>{children}</Text>;
  }
  if (!MaskedView) return <Text style={[style, { color: from }]}>{children}</Text>;
  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <View>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
        <GradientFill from={from} to={to} angle={100} />
      </View>
    </MaskedView>
  );
}

// Ambient aurora — üst marka ışıması (web: CSS radial · native: SVG radial).
function Aurora({ a, deep }: { a: string; deep: string }) {
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 360,
          backgroundImage: `radial-gradient(60% 60% at 22% 8%, ${hexA(a, 0.18)} 0%, transparent 60%), radial-gradient(55% 55% at 92% 0%, ${hexA(deep, 0.16)} 0%, transparent 55%)`,
        } as any}
      />
    );
  }
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="denty-aurora-1" cx="22%" cy="8%" r="62%">
            <Stop offset="0%" stopColor={a} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={a} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="denty-aurora-2" cx="92%" cy="0%" r="60%">
            <Stop offset="0%" stopColor={deep} stopOpacity={0.16} />
            <Stop offset="100%" stopColor={deep} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#denty-aurora-1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#denty-aurora-2)" />
      </Svg>
    </View>
  );
}

// Yumuşak radial ışıma — native'de blur olmadığı için sert daire yerine (kenar şeffaflığa erir).
function RadialGlow({ color, opacity = 0.5 }: { color: string; opacity?: number }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={uid} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={opacity} />
            <Stop offset="55%" stopColor={color} stopOpacity={opacity * 0.4} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${uid})`} />
      </Svg>
    </View>
  );
}

// "Yazıyor…" üç-nokta animasyonu (ActivityIndicator yerine, Apple-vari).
function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  useEffect(() => {
    const loops = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(d, { toValue: 1, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(d, { toValue: 0, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 }}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={{
            width: 6, height: 6, borderRadius: 3, backgroundColor: color,
            opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
          }}
        />
      ))}
    </View>
  );
}

// Animasyonlu sesli komut butonu — dolu mavi→teal gradient daire + yumuşak nabız glow.
function MicButton({ onPress, disabled, color, deep }: { onPress: () => void; disabled: boolean; color: string; deep: string }) {
  const glow = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (disabled) return;
    const g = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    g.start(); b.start();
    return () => { g.stop(); b.stop(); };
  }, [disabled, glow, breathe]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }: any) => ({
        width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.92 : 1 }],
        ...(Platform.OS === 'web' && !disabled ? ({ cursor: 'pointer' } as any) : {}),
      })}
    >
      {/* Yumuşak glow halesi (nabız) — web ve native AYNI yolu kullanır (SVG radial).
          Eskiden web'de CSS `filter: blur(11px)` vardı: blur taşması kırpan bir
          kapsayıcıya denk gelince hale kare/kesik görünüyordu ve PWA app'ten
          farklı çiziliyordu. Native doğru çalıştığı için web de ona hizalandı. */}
      {!disabled && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: 60, height: 60,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.22] }) }],
          }}
        >
          <RadialGlow color={color} opacity={0.55} />
        </Animated.View>
      )}
      {/* Dolu gradient daire + beyaz mikrofon */}
      <Animated.View
        style={{
          width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
          backgroundColor: color,
          transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
          ...(Platform.OS === 'web'
            ? ({ boxShadow: `0 6px 18px ${hexA(color, 0.45)}` } as any)
            : { shadowColor: color, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
        }}
      >
        <GradientFill from={color} to={deep} radius={22} />
        <View style={{ position: 'relative' }}><Mic size={20} color="#FFFFFF" strokeWidth={2} /></View>
      </Animated.View>
    </Pressable>
  );
}

export function DentyPanel() {
  const theme = useDentyPalette();
  const A = theme.primary;
  const insets = useSafeAreaInsets();
  const ctx = useDentyContext();
  // Karşılama ve öneri kartları PANELE göre — lab kullanıcısına "cari durum",
  // kliniğe "istasyon yükü" önermek anlamsızdı.
  const greeting = (ctx.panel && PANEL_GREETING[ctx.panel]) ?? 'Sana nasıl yardımcı olabilirim?';
  const display = useDentyStore((s) => s.display);
  // İstatistikler yalnız karşılama ekranı görünürken çekilir — sohbet
  // başladıktan sonra kartlar zaten gizli, sorgu boşa gider.
  const showWelcome = display.length === 0;
  const stats = useSuggestionStats(ctx.panel, showWelcome);
  const suggestionCards = ((ctx.panel && PANEL_SUGGESTIONS[ctx.panel]) ?? []).map((c) => ({
    title: c.label,
    prompt: c.prompt,
    icon: suggestionIcon(c.label),
    stat: c.stat ? stats[c.stat as StatKey] : undefined,
  }));
  const toolkit = useDentyToolkit(ctx);

  const busy = useDentyStore((s) => s.busy);
  const pending = useDentyStore((s) => s.pending);
  const close = useDentyStore((s) => s.close);
  const reset = useDentyStore((s) => s.reset);
  const openVoice = useDentyStore((s) => s.openVoice);
  const attachments = useDentyStore((s) => s.attachments);
  const addAttachments = useDentyStore((s) => s.addAttachments);
  const removeAttachment = useDentyStore((s) => s.removeAttachment);

  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  // Dosya seçici — web'de DOM input (kullanıcı gesture'ı → tarayıcı izin verir),
  // native'de expo-document-picker. Seçilen dosyalar store'a "staged" olarak eklenir;
  // yeni sipariş oluşturulunca work_order_photos'a yüklenir (tools.ts createOrder).
  const pickFiles = useCallback(async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.multiple = true;
      inp.onchange = () => {
        const files = Array.from((inp as any).files ?? []) as any[];
        if (!files.length) return;
        const list: DentyAttachment[] = files.map((f) => ({
          id: newAttachmentId(),
          name: f.name || 'dosya',
          mime: f.type || 'application/octet-stream',
          size: f.size,
          blob: f,
          kind: detectAttachmentKind(f.name || '', f.type),
        }));
        addAttachments(list);
      };
      inp.click();
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (res.canceled) return;
      const list: DentyAttachment[] = (res.assets ?? []).map((a) => ({
        id: newAttachmentId(),
        name: a.name || 'dosya',
        mime: a.mimeType || 'application/octet-stream',
        size: a.size ?? undefined,
        uri: a.uri,
        kind: detectAttachmentKind(a.name || '', a.mimeType || undefined),
      }));
      if (list.length) addAttachments(list);
    } catch { /* iptal / hata — sessiz geç */ }
  }, [addAttachments]);

  const applyOutcome = useCallback((outcome: DentyOutcome, pendingId: string) => {
    const store = useDentyStore.getState();
    if (outcome.kind === 'final') {
      store.setRaw(outcome.raw);
      store.updateDisplay(pendingId, { text: outcome.text, pending: false });
    } else {
      store.setRaw(outcome.pending.raw);
      store.updateDisplay(pendingId, { text: outcome.text, pending: false });
      store.setPending(outcome.pending);
      outcome.cards.forEach((card) => store.pushCard(card));
    }
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      const store = useDentyStore.getState();
      if (!text || store.busy || store.pending) return;
      store.pushDisplay('user', text);
      setInput('');
      store.setBusy(true);
      const pendingId = store.pushDisplay('denty', '', { pending: true });
      try {
        const outcome = await runDentyTurn({
          system: ctx.systemPrompt,
          history: store.raw,
          userText: text,
          toolkit,
        });
        applyOutcome(outcome, pendingId);
      } catch (e: any) {
        store.updateDisplay(pendingId, { text: `Üzgünüm, şu an yanıt veremedim. ${e?.message ?? ''}`.trim(), pending: false });
      } finally {
        store.setBusy(false);
      }
    },
    [ctx.systemPrompt, toolkit, applyOutcome],
  );

  const decide = useCallback(
    async (cardId: string, confirmed: boolean) => {
      const store = useDentyStore.getState();
      const p = store.pending;
      if (!p || store.busy) return;
      store.updateDisplay(cardId, { decided: confirmed ? 'confirmed' : 'cancelled' });
      store.setPending(null);
      store.setBusy(true);
      const pendingId = store.pushDisplay('denty', '', { pending: true });
      try {
        const outcome = await resumeDentyTurn(p, confirmed, toolkit);
        applyOutcome(outcome, pendingId);
      } catch (e: any) {
        store.updateDisplay(pendingId, { text: `İşlem tamamlanamadı: ${e?.message ?? ''}`.trim(), pending: false });
      } finally {
        store.setBusy(false);
      }
    },
    [toolkit, applyOutcome],
  );

  const isEmpty = display.length === 0;
  const inputDisabled = busy || !!pending;

  return (
    // Klavye yönetimi PANELDE değil, modal kapsayıcısında (DentyFAB) yapılır —
    // panel sabit yükseklikli ve alta yaslı olduğu için burada itecek boşluk yok.
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Ambient aurora — yumuşak marka ışıması (web + native) */}
      <Aurora a={A} deep={theme.primaryDeep} />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface }}>
        <ColorOrb size={32} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.accent }}>Simanty</Text>
          <Text style={{ fontSize: 11, color: hexA(theme.accent, 0.55) }}>{dentyRoleLabel(ctx.panel)}</Text>
        </View>
        <Pressable onPress={reset} hitSlop={8} style={{ padding: 6 }}>
          <RotateCcw size={16} color={hexA(theme.accent, 0.5)} strokeWidth={1.8} />
        </Pressable>
        <Pressable onPress={close} hitSlop={8} style={{ padding: 6 }}>
          <X size={18} color={hexA(theme.accent, 0.6)} strokeWidth={1.8} />
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 14, gap: 10, flexGrow: 1 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {/* Karşılama alanı ~%40 kısaldı: ekranın üçte birini kaplıyordu ve
            kullanıcı zaten konuşmaya gelmiş oluyor. Orb 132→106 (-%20),
            başlık 28→21, dikey boşluklar 18→10, üst kicker 12→10.5.
            Odak kartlara ve yazma kutusuna kaydı.
            Başlık gradyanı da yumuşadı: turkuaz→mavi geçişi çok kuvvetliydi;
            artık accent'in kendi içinde çok hafif bir ton farkı (Siman sade). */}
        {isEmpty ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 12, paddingVertical: 4 }}>
            <View style={{ alignItems: 'center', gap: 10 }}>
              <ColorOrb size={106} spinDuration={22} />
              <View style={{ gap: 4, alignItems: 'center' }}>
                <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.8, textTransform: 'uppercase', color: hexA(theme.accent2, 0.7) }}>Merhaba 👋</Text>
                <GradientHeading from={A} to={hexA(theme.accent2, 0.85)} style={{ fontSize: 21, fontWeight: '600', textAlign: 'center', letterSpacing: -0.5, lineHeight: 26, maxWidth: 290 }}>
                  {greeting}
                </GradientHeading>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {suggestionCards.map((c) => {
                const Icon = c.icon;
                return (
                  <Pressable
                    key={c.title}
                    onPress={() => send(c.prompt)}
                    // NativeWind v4 native'de fonksiyon-stildeki backgroundColor'ı düşürüyor →
                    // native'de OBJE stil (kart zemini/gölge görünür), web'de hover'lı fonksiyon-stil.
                    style={
                      Platform.OS === 'web'
                        ? (({ hovered }: any) => ({
                            width: '47%', flexGrow: 1,
                            backgroundColor: theme.surface, borderRadius: 24,
                            borderWidth: 1, borderColor: theme.border,
                            padding: 16, gap: 12,
                            shadowColor: '#000', shadowOpacity: hovered ? (theme.dark ? 0.5 : 0.1) : (theme.dark ? 0.35 : 0.05), shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
                            transform: [{ translateY: hovered ? -3 : 0 }],
                            cursor: 'pointer', transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                          })) as any
                        : {
                            width: '47%', flexGrow: 1,
                            backgroundColor: theme.surface, borderRadius: 24,
                            borderWidth: 1, borderColor: theme.border,
                            padding: 16, gap: 12,
                            shadowColor: '#000', shadowOpacity: theme.dark ? 0.35 : 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
                            elevation: 3,
                          }
                    }
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: A, alignItems: 'center', justifyContent: 'center' }}>
                      <GradientFill from={A} to={theme.accent2} radius={12} />
                      <View style={{ position: 'relative' }}><Icon size={17} color="#FFFFFF" strokeWidth={2} /></View>
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.accent, letterSpacing: -0.2 }}>{c.title}</Text>
                    {c.stat ? (
                      // CANLI rakam — kart artık bir şey BİLİYOR. Tıklamadan
                      // önce cevabın bir kısmını verir; sabit etiketler asistanı
                      // ölü gösteriyordu.
                      <View style={{ gap: 2 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: c.stat.alert ? '#D94B4B' : theme.accent, lineHeight: 17 }}>
                          {c.stat.primary}
                        </Text>
                        {!!c.stat.secondary && (
                          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.muted, lineHeight: 16 }}>{c.stat.secondary}</Text>
                        )}
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: theme.muted, lineHeight: 16.5 }}>{c.prompt}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : (
          display.map((m) => {
            // ── Onay kartı ──
            if (m.role === 'card' && m.card) {
              const decided = m.decided;
              return (
                <View key={m.id} style={{ alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, borderColor: hexA(A, 0.35), backgroundColor: theme.surface, overflow: 'hidden' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: hexA(A, 0.1) }}>
                    <ShieldQuestion size={15} color={A} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: theme.accent }}>{m.card.title}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 13, paddingVertical: 10, gap: 5 }}>
                    {m.card.rows.map((r, i) => (
                      <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                        <Text style={{ fontSize: 11.5, fontWeight: '700', color: hexA(theme.accent, 0.5), width: 78 }}>{r.label}</Text>
                        <Text style={{ fontSize: 12.5, color: theme.accent, flex: 1 }}>{r.value}</Text>
                      </View>
                    ))}
                  </View>
                  {decided ? (
                    <View style={{ paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 1, borderTopColor: hexA(theme.accent, 0.06) }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: decided === 'confirmed' ? '#2D9A6B' : hexA(theme.accent, 0.5) }}>
                        {decided === 'confirmed' ? '✓ Onaylandı' : 'İptal edildi'}
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 1, borderTopColor: hexA(theme.accent, 0.06) }}>
                      <Pressable onPress={() => decide(m.id, false)} disabled={busy} style={{ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: hexA(theme.accent, 0.18), ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}) }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '700', color: hexA(theme.accent, 0.7) }}>Vazgeç</Text>
                      </Pressable>
                      <Pressable onPress={() => decide(m.id, true)} disabled={busy} style={{ flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: busy ? hexA(A, 0.5) : A, ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}) }}>
                        <Check size={14} color="#FFFFFF" strokeWidth={2.2} />
                        <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' }}>Onayla</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            }

            // ── Normal baloncuk ──
            const mine = m.role === 'user';
            return (
              <View
                key={m.id}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%',
                  paddingHorizontal: 13, paddingVertical: 9,
                  borderRadius: 18,
                  borderTopEndRadius: mine ? 6 : 18,
                  borderBottomStartRadius: mine ? 18 : 6,
                  backgroundColor: mine ? A : theme.surface,
                  borderWidth: mine ? 0 : 1, borderColor: hexA(theme.accent, 0.08),
                  overflow: mine ? 'hidden' : 'visible',
                }}
              >
                {mine && <GradientFill from={A} to={theme.primaryDeep} />}
                <View style={{ position: 'relative' }}>
                  {m.pending ? (
                    <TypingDots color={hexA(theme.accent, 0.55)} />
                  ) : (
                    <Text style={{ fontSize: 13.5, lineHeight: 19, color: mine ? '#FFFFFF' : theme.accent }}>{m.text}</Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Composer */}
      {/* PWA'da insets.bottom = 0 → composer ekranın altına yapışıyordu.
          Web'de daha cömert bir taban payı bırakılıyor (iOS home-indicator payı
          native tarafta zaten insets'ten geliyor). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12), borderTopWidth: 1, borderTopColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface }}>
        {pending && (
          <View style={{ marginBottom: 6, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 11, color: hexA(theme.accent, 0.5) }}>
              Önce yukarıdaki işlemi onayla veya iptal et.
            </Text>
          </View>
        )}
        {/* Staged dosya çipleri — yeni sipariş oluşturulunca yüklenir */}
        {attachments.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, paddingHorizontal: 2 }}>
            {attachments.map((a) => {
              const KIcon = a.kind === 'photo' ? ImageIcon : a.kind === 'scan' ? Box : a.kind === 'video' ? Film : a.kind === 'pdf' ? FileText : Paperclip;
              return (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingStart: 9, paddingEnd: 6, paddingVertical: 6, borderRadius: 12, backgroundColor: hexA(A, 0.09), borderWidth: 1, borderColor: hexA(A, 0.2), maxWidth: 200 }}>
                  <KIcon size={13} color={A} strokeWidth={2} />
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: theme.accent, flexShrink: 1, maxWidth: 130 }}>{a.name}</Text>
                  <Pressable onPress={() => removeAttachment(a.id)} hitSlop={6} style={{ padding: 2, ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {}) }}>
                    <X size={13} color={hexA(theme.accent, 0.55)} strokeWidth={2.2} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MicButton onPress={openVoice} disabled={inputDisabled} color={A} deep={theme.accent2} />
          <Pressable
            onPress={pickFiles}
            disabled={busy}
            hitSlop={6}
            style={({ pressed }: any) => ({
              width: 44, height: 48, alignItems: 'center', justifyContent: 'center',
              opacity: busy ? 0.45 : 1, transform: [{ scale: pressed ? 0.9 : 1 }],
              ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}),
            })}
          >
            <Paperclip size={21} color={hexA(theme.accent, 0.55)} strokeWidth={1.9} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!inputDisabled}
            // "Simanty'ye yaz…" ne yazılabileceğini söylemiyordu; bu placeholder
            // aynı zamanda asistanın kapsamını öğretiyor.
            placeholder={pending ? 'Onay bekleniyor…' : 'Sipariş, üretim, finans… ne istersen sor'}
            placeholderTextColor={hexA(theme.accent, 0.4)}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            blurOnSubmit={false}
            style={[
              { flex: 1, height: 48, paddingHorizontal: 18, paddingVertical: 0, borderRadius: 24, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, fontSize: 15, color: theme.accent, opacity: inputDisabled ? 0.6 : 1 },
              Platform.OS === 'web' ? ({ outlineStyle: 'none', boxSizing: 'border-box' } as any) : null,
            ]}
          />
          {(() => {
            const active = !inputDisabled && !!input.trim();
            return (
              <Pressable
                onPress={() => send(input)}
                disabled={!active}
                style={({ pressed }: any) => ({
                  width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: active ? A : hexA(A, 0.14),
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                  ...(Platform.OS === 'web' && active
                    ? ({ cursor: 'pointer', boxShadow: `0 6px 18px ${hexA(A, 0.4)}` } as any)
                    : {}),
                })}
              >
                {active && <GradientFill from={A} to={theme.accent2} radius={24} />}
                <View style={{ position: 'relative' }}><ArrowUp size={20} color={active ? '#FFFFFF' : hexA(A, 0.85)} strokeWidth={2.4} /></View>
              </Pressable>
            );
          })()}
        </View>
      </View>

      {/* Sesli mod — panel-içi overlay (tam ekran değil, panel boyutunda) */}
      <DentyVoiceMode />
    </View>
  );
}
