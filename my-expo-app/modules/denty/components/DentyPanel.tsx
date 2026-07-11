/**
 * DentyPanel — Denty sohbet arayüzü (panel temalı).
 * Mobil: alttan tam genişlik sheet · Web: sağ panel.
 *
 * Faz 2: yazma aksiyonları için onay kartı (Onayla / Vazgeç) gösterir.
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput, Platform, Animated, Easing,
} from 'react-native';
import { ArrowUp, X, RotateCcw, Check, ShieldQuestion, FilePlus2, Wallet, Search, GraduationCap, Mic, Paperclip, FileText, Image as ImageIcon, Box, Film } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useDentyPalette } from '../theme';
import { DentyVoiceMode } from './DentyVoiceMode';
import { useDentyStore, detectAttachmentKind, newAttachmentId, type DentyAttachment, type DentyAttachmentKind } from '../store/dentyStore';
import { useDentyContext } from '../context';
import { useDentyToolkit } from '../tools';
import { runDentyTurn, resumeDentyTurn } from '../api';
import type { DentyOutcome } from '../types';
import { ColorOrb } from './ColorOrb';

const SUGGESTION_CARDS: { title: string; prompt: string; icon: any }[] = [
  { title: 'Sipariş oluştur', prompt: 'Yeni bir sipariş oluşturmak istiyorum', icon: FilePlus2 },
  { title: 'Cari durum',      prompt: 'Cari hesap durumum ne? Ne kadar borcum var?', icon: Wallet },
  { title: 'Sipariş ara',     prompt: 'Son siparişlerimi göster', icon: Search },
  { title: 'Yardım',          prompt: 'Bu ekran ne işe yarıyor, bana anlat', icon: GraduationCap },
];

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// Panel-adaptif gradyan: web'de CSS linear-gradient, native'de solid fallback.
function gradStyle(from: string, to: string): any {
  return Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
    : { backgroundColor: from };
}

// Gradyan metin (web): clip-text; native'de düz renk.
function gradTextStyle(from: string, to: string): any {
  return Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(100deg, ${from}, ${to})`, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
    : { color: from };
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
      {/* Yumuşak glow halesi (nabız) */}
      {!disabled && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', width: 56, height: 56, borderRadius: 28,
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }),
            transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.22] }) }],
            ...(Platform.OS === 'web'
              ? ({ backgroundImage: `linear-gradient(135deg, ${color}, ${deep})`, filter: 'blur(11px)' } as any)
              : { backgroundColor: color }),
          }}
        />
      )}
      {/* Dolu gradient daire + beyaz mikrofon */}
      <Animated.View
        style={[
          {
            width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
            transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }],
            ...(Platform.OS === 'web'
              ? ({ boxShadow: `0 6px 18px ${hexA(color, 0.45)}` } as any)
              : { shadowColor: color, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }),
          },
          gradStyle(color, deep),
        ]}
      >
        <Mic size={20} color="#FFFFFF" strokeWidth={2} />
      </Animated.View>
    </Pressable>
  );
}

export function DentyPanel() {
  const theme = useDentyPalette();
  const A = theme.primary;
  const ctx = useDentyContext();
  const toolkit = useDentyToolkit(ctx);

  const display = useDentyStore((s) => s.display);
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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Ambient aurora — yumuşak marka ışıması (web) */}
      {Platform.OS === 'web' && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 360,
            backgroundImage: `radial-gradient(60% 60% at 22% 8%, ${hexA(A, 0.18)} 0%, transparent 60%), radial-gradient(55% 55% at 92% 0%, ${hexA(theme.primaryDeep, 0.16)} 0%, transparent 55%)`,
          } as any}
        />
      )}

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface }}>
        <ColorOrb size={32} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: theme.accent }}>Simanty</Text>
          <Text style={{ fontSize: 11, color: hexA(theme.accent, 0.55) }}>Yapay zekâ asistanın</Text>
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
        {isEmpty ? (
          <View style={{ flex: 1, justifyContent: 'center', gap: 18, paddingVertical: 12 }}>
            <View style={{ alignItems: 'center', gap: 18 }}>
              <ColorOrb size={132} spinDuration={22} />
              <View style={{ gap: 6, alignItems: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', color: theme.accent2 }}>Merhaba 👋</Text>
                <Text style={[{ fontSize: 28, fontWeight: '600', textAlign: 'center', letterSpacing: -0.7, lineHeight: 33, maxWidth: 300 }, gradTextStyle(A, theme.accent2)]}>
                  Sana nasıl yardımcı olabilirim?
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {SUGGESTION_CARDS.map((c) => {
                const Icon = c.icon;
                return (
                  <Pressable
                    key={c.title}
                    onPress={() => send(c.prompt)}
                    style={({ hovered }: any) => ({
                      width: '47%', flexGrow: 1,
                      backgroundColor: theme.surface, borderRadius: 24,
                      borderWidth: 1, borderColor: theme.border,
                      padding: 16, gap: 12,
                      shadowColor: '#000', shadowOpacity: hovered ? (theme.dark ? 0.5 : 0.1) : (theme.dark ? 0.35 : 0.05), shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
                      transform: [{ translateY: hovered ? -3 : 0 }],
                      ...(Platform.OS === 'web' ? ({ cursor: 'pointer', transition: 'box-shadow 0.2s ease, transform 0.2s ease' } as any) : {}),
                    })}
                  >
                    <View style={[{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, gradStyle(A, theme.accent2)]}>
                      <Icon size={17} color="#FFFFFF" strokeWidth={2} />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: theme.accent, letterSpacing: -0.2 }}>{c.title}</Text>
                    <Text style={{ fontSize: 12, color: theme.muted, lineHeight: 16.5 }}>{c.prompt}</Text>
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
                style={[
                  {
                    alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%',
                    paddingHorizontal: 13, paddingVertical: 9,
                    borderRadius: 18,
                    borderTopRightRadius: mine ? 6 : 18,
                    borderBottomLeftRadius: mine ? 18 : 6,
                    backgroundColor: mine ? A : theme.surface,
                    borderWidth: mine ? 0 : 1, borderColor: hexA(theme.accent, 0.08),
                  },
                  mine ? gradStyle(A, theme.primaryDeep) : null,
                ]}
              >
                {m.pending ? (
                  <TypingDots color={hexA(theme.accent, 0.55)} />
                ) : (
                  <Text style={{ fontSize: 13.5, lineHeight: 19, color: mine ? '#FFFFFF' : theme.accent }}>{m.text}</Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Composer */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: hexA(theme.accent, 0.08), backgroundColor: theme.surface }}>
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
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 9, paddingRight: 6, paddingVertical: 6, borderRadius: 12, backgroundColor: hexA(A, 0.09), borderWidth: 1, borderColor: hexA(A, 0.2), maxWidth: 200 }}>
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
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <MicButton onPress={openVoice} disabled={inputDisabled} color={A} deep={theme.accent2} />
          <Pressable
            onPress={pickFiles}
            disabled={busy}
            hitSlop={6}
            style={({ pressed }: any) => ({
              width: 40, height: 48, alignItems: 'center', justifyContent: 'center',
              opacity: busy ? 0.45 : 1, transform: [{ scale: pressed ? 0.9 : 1 }],
              ...(Platform.OS === 'web' && !busy ? ({ cursor: 'pointer' } as any) : {}),
            })}
          >
            <Paperclip size={21} color={hexA(theme.accent, 0.6)} strokeWidth={1.9} />
          </Pressable>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!inputDisabled}
            placeholder={pending ? 'Onay bekleniyor…' : 'Simanty\'ye yaz…'}
            placeholderTextColor={hexA(theme.accent, 0.4)}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            blurOnSubmit={false}
            style={[
              { flex: 1, height: 48, paddingHorizontal: 18, paddingVertical: 0, borderRadius: 24, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface2, fontSize: 15, color: theme.accent, opacity: inputDisabled ? 0.6 : 1 },
              Platform.OS === 'web' ? ({ outlineStyle: 'none', boxSizing: 'border-box' } as any) : null,
            ]}
          />
          <Pressable
            onPress={() => send(input)}
            disabled={inputDisabled || !input.trim()}
            style={({ pressed }: any) => [
              {
                width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
                backgroundColor: inputDisabled || !input.trim() ? hexA(A, 0.35) : A,
                transform: [{ scale: pressed ? 0.92 : 1 }],
                ...(Platform.OS === 'web' && !inputDisabled && input.trim()
                  ? ({ cursor: 'pointer', boxShadow: `0 6px 18px ${hexA(A, 0.4)}` } as any)
                  : {}),
              },
              !inputDisabled && input.trim() ? gradStyle(A, theme.accent2) : null,
            ]}
          >
            <ArrowUp size={20} color="#FFFFFF" strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      {/* Sesli mod — panel-içi overlay (tam ekran değil, panel boyutunda) */}
      <DentyVoiceMode />
    </View>
  );
}
