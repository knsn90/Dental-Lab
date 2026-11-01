// modules/delivery/proof/DeliveryProofSheet.tsx
// Kurye "Teslim kanıtı" penceresi (spec 4.1–4.5b, 5.1, 6; prototip 2026-10-27-kurye-teslim-kaniti-prototip.html).
// Fotoğraf → Teslim alan → İmza → "İmza alınamadı" (Switch + nedenler). Lab'a teslimde yalnız fotoğraf.
// Aynı kliniğe başka açık teslimat varsa "birlikte kapat" (varsayılan açık): her teslimatın klasörüne
// aynı fotoğraf/imza yüklenir, tek deliver_with_proof çağrısıyla hepsi birlikte kapanır.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, ScrollView, TextInput, Switch, Animated, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Check, X } from '../../../core/ui/icons';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { evaluateProof, needsSignature, SKIP_REASONS, OTHER_REASON, proofErrorText, pruneSiblings, SIBLINGS_CHANGED_TEXT } from './proofModel';
import {
  uploadProofFile, deliverWithProof, fetchProofSiblings, fetchDeliveryForProof, type ProofDelivery,
} from './api';
import { useAnchoredSpring, haptic, useReduceMotion, type OriginRect } from './useAnchoredSpring';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';
import { ProofPhotoField, type CapturedPhoto } from './ProofPhotoField';

const NATIVE_DRIVER = Platform.OS !== 'web';
const SUCCESS = '#2D9A6B';
const AMBER = '#E89B2A';
const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

export interface DemoDelivery { direction: string; destination_name: string; order_number: string; siblings: number }

export type Req = 'required' | 'ok' | 'skipped' | 'optional';

export function ReqTag({ state }: { state: Req }) {
  const U = useInkUI();
  const tone = state === 'ok' ? U.chipTones.success : state === 'skipped' ? U.chipTones.warning : U.chipTones.neutral;
  const label = state === 'ok' ? 'Tamam' : state === 'skipped' ? 'Alınamadı' : state === 'optional' ? 'İsteğe bağlı' : 'Zorunlu';
  const pop = useRef(new Animated.Value(1)).current;
  const prev = useRef(state);
  const reduce = useReduceMotion();
  useEffect(() => {
    if (state === 'ok' && prev.current !== 'ok' && !reduce) {
      pop.setValue(0.85);
      Animated.spring(pop, { toValue: 1, stiffness: 420, damping: 18, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
    }
    prev.current = state;
  }, [state, reduce, pop]);
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: tone.bg, transform: [{ scale: pop }] }}>
      {state === 'ok' ? <Check size={10} color={tone.fg} strokeWidth={3} /> : null}
      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, color: tone.fg }}>{autoT(label).toLocaleUpperCase()}</Text>
    </Animated.View>
  );
}

function Label({ text, state }: { text: string; state: Req }) {
  const U = useInkUI();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }}>{autoT(text)}</Text>
      <ReqTag state={state} />
    </View>
  );
}

/** Kaydırma kenarı: sert çizgi yerine içerik altından geçerken beliren solma (spec 6). */
function EdgeFade({ side, show }: { side: 'top' | 'bottom'; show: boolean }) {
  const U = useInkUI();
  const base = { position: 'absolute', left: 0, right: 0, [side]: 0, height: 18, opacity: show ? 1 : 0 } as any;
  if (Platform.OS === 'web') {
    const dir = side === 'top' ? 'to bottom' : 'to top';
    return <View pointerEvents="none" style={{ ...base, backgroundImage: `linear-gradient(${dir}, ${U.surface}, transparent)` }} />;
  }
  // native: degrade yok → ince bantlarla yaklaşık solma
  const steps = [0.92, 0.75, 0.58, 0.42, 0.26, 0.1];
  const bands = side === 'top' ? steps : [...steps].reverse();
  return (
    <View pointerEvents="none" style={base}>
      {bands.map((o, i) => <View key={i} style={{ flex: 1, backgroundColor: U.surface, opacity: o }} />)}
    </View>
  );
}

export function DeliveryProofSheet({ visible, deliveryId, origin, onClose, onDelivered, demo }: {
  visible: boolean;
  deliveryId: string | null;
  origin?: OriginRect | null;
  onClose: () => void;
  onDelivered: (closed: number) => void;
  demo?: DemoDelivery;
}) {
  const U = useInkUI();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const { mounted, cardStyle } = useAnchoredSpring(visible, origin ?? null);

  const [delivery, setDelivery] = useState<ProofDelivery | null>(null);
  const [siblings, setSiblings] = useState<{ delivery_id: string; order_number: string | null }[]>([]);
  const [together, setTogether] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [name, setName] = useState('');
  const [hasSig, setHasSig] = useState(false);
  const [skip, setSkip] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');
  const [busy, setBusy] = useState(false);
  // İmza çizilirken pencerenin kaydırması kilitli (native'de ScrollView aksi hâlde dokunuşu alıp çizgiyi keser)
  const [drawing, setDrawing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [edge, setEdge] = useState({ top: false, bottom: false });
  const padRef = useRef<SignaturePadHandle | null>(null);
  const undoTimer = useRef<any>(null);
  const shake = useRef(new Animated.Value(0)).current;

  // Açılışta sıfırla + teslimatı/kardeşleri yükle (demo: ağ yok)
  useEffect(() => {
    if (!visible) return;
    setPhoto(null); setName(''); setHasSig(false); setSkip(false); setReason(null); setOtherText('');
    setErr(null); setBusy(false); setTogether(true); setUndoOpen(false); setLoadErr(null);
    if (demo) {
      setDelivery({ id: 'demo', lab_id: 'demo', direction: demo.direction, destination_name: demo.destination_name, order_number: demo.order_number });
      setSiblings(Array.from({ length: demo.siblings }, (_, i) => ({ delivery_id: `demo-${i}`, order_number: `${Number(demo.order_number) + i + 1}` })));
      return;
    }
    setDelivery(null); setSiblings([]);
    if (!deliveryId) return;
    let alive = true;
    void (async () => {
      const d = await fetchDeliveryForProof(deliveryId);
      if (!alive) return;
      if (!d) { setLoadErr(autoT('Teslimat bulunamadı')); return; }
      setDelivery(d);
      if (needsSignature(d.direction)) {
        const sib = await fetchProofSiblings(deliveryId);
        if (alive) setSiblings(sib);
      }
    })();
    return () => { alive = false; };
  }, [visible, deliveryId, demo]);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const direction = delivery?.direction ?? null;
  const clinic = needsSignature(direction);
  const ev = useMemo(
    () => evaluateProof({ hasPhoto: !!photo, recipientName: name, hasSignature: hasSig, skip, reason, otherText }, direction),
    [photo, name, hasSig, skip, reason, otherText, direction],
  );

  const nameState: Req = name.trim().length >= 2 ? 'ok' : skip ? 'optional' : 'required';
  const sigState: Req = hasSig && !skip ? 'ok' : skip ? 'skipped' : 'required';

  const wobble = () => {
    haptic(12);
    shake.setValue(-6);
    Animated.spring(shake, { toValue: 0, stiffness: 600, damping: 9, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
  };

  const clearSignature = () => {
    padRef.current?.clear();
    setUndoOpen(true);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoOpen(false), 4000);
  };

  const submit = async () => {
    if (busy) return;
    if (!ev.ok || !delivery || !photo) { wobble(); return; }
    setBusy(true); setErr(null);
    const ids = [delivery.id, ...(clinic && together ? siblings.map((s) => s.delivery_id) : [])];
    if (demo) {
      haptic(14); setBusy(false); onDelivered(ids.length); onClose(); return;
    }
    try {
      const sigAsset = clinic && !skip ? await padRef.current?.toAsset() ?? null : null;
      if (clinic && !skip && !sigAsset) { setErr(autoT('Teslim için teslim alanın adı ve imzası gerekli')); setBusy(false); return; }
      const items: { delivery_id: string; photo_path: string; signature_path: string | null }[] = [];
      for (const id of ids) {
        const ph = await uploadProofFile(delivery.lab_id, id, 'photo', photo);
        if (!ph.path) throw new Error(ph.error ?? 'Kanıt dosyası bulunamadı');
        let sg: string | null = null;
        if (sigAsset) {
          const r = await uploadProofFile(delivery.lab_id, id, 'signature', sigAsset);
          if (!r.path) throw new Error(r.error ?? 'Kanıt dosyası bulunamadı');
          sg = r.path;
        }
        items.push({ delivery_id: id, photo_path: ph.path, signature_path: sg });
      }
      const res = await deliverWithProof(items, ev.recipientName, ev.skipReason);
      if (!res.ok) throw new Error(res.error ?? 'Teslimat bulunamadı');
      haptic(14);
      setBusy(false);
      onDelivered(res.closed ?? ids.length);
      onClose();
    } catch (e: any) {
      // Çekilen fotoğraf ve imza korunur; yeniden denenebilir. Birlikte kapatılan bir kardeş arada
      // kapandıysa/iptal edildiyse liste tazelenir — aksi hâlde her deneme aynı yerden düşerdi.
      let msg = proofErrorText(String(e?.message ?? e));
      if (clinic && together && siblings.length) {
        const fresh = await fetchProofSiblings(delivery.id);
        const { next, changed } = pruneSiblings(siblings, fresh);
        if (changed) { setSiblings(next); msg = SIBLINGS_CHANGED_TEXT; }
      }
      setErr(autoT(msg));
      setBusy(false);
    }
  };

  if (!mounted) return null;

  const subtitle = [delivery?.destination_name ?? (direction && !clinic ? autoT("Lab'a teslim") : null), delivery?.order_number ? `#${delivery.order_number}` : null]
    .filter(Boolean).join(' · ');
  const steps = ev.steps;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Animated.View
          style={[U.modalCard, { maxWidth: 480, maxHeight: Math.round(height * 0.92), padding: 0, overflow: 'hidden' }, cardStyle as any]}
          accessibilityViewIsModal
        >
          {/* Başlık */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 10, backgroundColor: U.surface, zIndex: 2 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 20, fontWeight: '400', letterSpacing: -0.4, color: U.ink[900], fontFamily: Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined }} numberOfLines={1}>
                {autoT('Teslim kanıtı')}
              </Text>
              {subtitle ? <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Teslimi kapatmadan pencereyi kapatır')} placement="bottom">
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...WEB_PTR })}>
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <View style={{ flexShrink: 1 }}>
            <ScrollView
              scrollEnabled={!drawing}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              scrollEventThrottle={32}
              onScroll={(e) => {
                const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
                const top = contentOffset.y > 2, bottom = contentOffset.y + layoutMeasurement.height < contentSize.height - 2;
                if (top !== edge.top || bottom !== edge.bottom) setEdge({ top, bottom });
              }}
              onContentSizeChange={(_, h) => setEdge((s) => ({ ...s, bottom: h > height * 0.6 }))}
              contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 10 }}
            >
              {loadErr ? <Text style={{ fontSize: 13, color: U.chipTones.danger.fg, marginTop: 8 }}>{loadErr}</Text> : null}
              {!delivery && !loadErr ? <ActivityIndicator style={{ marginVertical: 24 }} color={U.ink[500]} /> : null}

              {delivery ? (
                <>
                  <Label text="Fotoğraf" state={photo ? 'ok' : 'required'} />
                  <ProofPhotoField value={photo} onChange={setPhoto} disabled={busy} demo={!!demo} />

                  {clinic ? (
                    <>
                      <Label text="Teslim alan" state={nameState} />
                      <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder={autoT('Ad soyad')}
                        placeholderTextColor={U.ink[400]}
                        autoCapitalize="words"
                        autoComplete="off"
                        returnKeyType="done"
                        editable={!busy}
                        style={{ ...U.inputStyle, height: 48, fontSize: 16 }}
                      />

                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Label text="İmza" state={sigState} />
                        {hasSig && !skip ? (
                          <GlassTooltip title={autoT('Temizle')} text={autoT('İmzayı siler; 4 saniye geri alınabilir')} placement="top">
                            <Pressable onPress={clearSignature} accessibilityRole="button" accessibilityLabel={autoT('Temizle')}
                              style={({ pressed }: any) => ({ marginTop: 8, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.7 : 1, ...WEB_PTR })}>
                              <Text style={{ fontSize: 11.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Temizle')}</Text>
                            </Pressable>
                          </GlassTooltip>
                        ) : null}
                      </View>
                      <SignaturePad ref={padRef} disabled={skip || busy} onDrawStart={() => setDrawing(true)} onDrawEnd={() => setDrawing(false)} onChange={(ink) => { setHasSig(ink); if (ink) setUndoOpen(false); }} />

                      <GlassTooltip title={autoT('İmza alınamadı')} text={autoT('Teslim yine kapanır; kanıt fotoğraf olur')} placement="top">
                        <Pressable
                          onPress={() => setSkip((v) => !v)}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: skip }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: U.surfaceSoft, ...WEB_PTR }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>{autoT('İmza alınamadı')}</Text>
                            <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 3 }}>{autoT('Teslim yine kapanır; kanıt fotoğraf olur')}</Text>
                          </View>
                          <Switch value={skip} onValueChange={setSkip} trackColor={{ false: U.fieldBorder, true: AMBER }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as any)} />
                        </Pressable>
                      </GlassTooltip>

                      {skip ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 10 }}>
                          {SKIP_REASONS.map((r) => {
                            const on = reason === r;
                            return (
                              <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="button" accessibilityState={{ selected: on }}
                                style={({ pressed }: any) => ({
                                  paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999,
                                  backgroundColor: on ? U.chipTones.warning.bg : U.plainBtn.bg,
                                  borderWidth: 1, borderColor: on ? 'transparent' : U.plainBtn.border,
                                  transform: [{ scale: pressed ? 0.97 : 1 }], ...WEB_PTR,
                                })}>
                                <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? U.chipTones.warning.fg : U.plainBtn.fg }}>{autoT(r)}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                      {skip && reason === OTHER_REASON ? (
                        <TextInput
                          value={otherText}
                          onChangeText={setOtherText}
                          placeholder={autoT('Kısaca neden')}
                          placeholderTextColor={U.ink[400]}
                          autoFocus
                          style={{ ...U.inputStyle, height: 48, fontSize: 16, marginTop: 8 }}
                        />
                      ) : null}

                      {siblings.length > 0 ? (
                        <GlassTooltip title={autoT('Birlikte kapat')} text={autoT('Aynı fotoğraf ve imza bu klinikteki diğer teslimatlarınıza da yazılır')} placement="top">
                          <Pressable
                            onPress={() => setTogether((v) => !v)}
                            accessibilityRole="switch"
                            accessibilityState={{ checked: together }}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: U.surfaceSoft, ...WEB_PTR }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>
                                {autoT('Bu klinikteki teslimatları birlikte kapat')}
                              </Text>
                              <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 3, fontVariant: ['tabular-nums'] }} numberOfLines={2}>
                                {`${siblings.length} ${autoT('teslimat daha')}: ${siblings.map((s) => `#${s.order_number ?? '?'}`).join(', ')}`}
                              </Text>
                            </View>
                            <Switch value={together} onValueChange={setTogether} trackColor={{ false: U.fieldBorder, true: SUCCESS }} thumbColor="#FFFFFF" {...({ activeThumbColor: '#FFFFFF' } as any)} />
                          </Pressable>
                        </GlassTooltip>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </ScrollView>
            <EdgeFade side="top" show={edge.top} />
            <EdgeFade side="bottom" show={edge.bottom} />
          </View>

          {/* Alt: adım çizgisi + düğme + ipucu/hata (hata düğmenin yanında — görünür eylem hatası kuralı) */}
          <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, backgroundColor: U.surface }}>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {steps.map((on, i) => <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: on ? SUCCESS : U.hairline }} />)}
            </View>
            <GlassTooltip title={autoT('Teslimi tamamla')} text={autoT('Kanıtı kaydeder ve teslimi kapatır')} placement="top">
              <Pressable
                onPress={submit}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ev.ok || busy }}
                accessibilityLabel={autoT('Teslimi tamamla')}
                style={({ pressed }: any) => ({
                  marginTop: 12, height: 52, borderRadius: 16, backgroundColor: SUCCESS,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: !ev.ok || !delivery ? 0.38 : 1,
                  transform: [{ scale: pressed && ev.ok ? 0.97 : 1 }], ...WEB_PTR,
                })}
              >
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Check size={16} color="#FFFFFF" strokeWidth={2.4} />}
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.1 }}>{autoT('Teslimi tamamla')}</Text>
              </Pressable>
            </GlassTooltip>
            <Animated.Text
              accessibilityLiveRegion="polite"
              style={{ textAlign: 'center', marginTop: 9, minHeight: 16, fontSize: 12, color: err ? U.chipTones.danger.fg : U.ink[500], transform: [{ translateX: shake }] }}
            >
              {err ?? (ev.hint ? autoT(ev.hint) : (!clinic && delivery ? autoT("Lab'a teslim · yalnız fotoğraf") : ''))}
            </Animated.Text>
          </View>

          {/* "Temizle" sonrası geri al (4 sn) — onay sormaz, geri alınır */}
          {undoOpen ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 110, alignItems: 'center' }} pointerEvents="box-none">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 999, backgroundColor: U.isDark ? 'rgba(247,242,233,0.94)' : 'rgba(28,26,22,0.92)' }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.isDark ? '#141312' : '#F7F2E9' }}>{autoT('İmza silindi')}</Text>
                <GlassTooltip title={autoT('Geri al')} text={autoT('Silinen imzayı geri getirir')} placement="top">
                  <Pressable onPress={() => { padRef.current?.restore(); setUndoOpen(false); }} accessibilityRole="button" style={WEB_PTR}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#3B82F6' }}>{autoT('Geri al')}</Text>
                  </Pressable>
                </GlassTooltip>
              </View>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
