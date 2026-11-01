/**
 * ProvaModal — sipariş detayındaki "Prova" popup'ı (B düzeni; spec 2026-10-27-prova-takibi §5.2–5.3).
 *
 * Onaylı prototip: docs/superpowers/specs/2026-10-27-prova-takibi-prototip.html
 *  - Kart, hero'daki Prova düğmesinin olduğu yerden büyüyerek ortaya gelir; kapanınca aynı yoldan döner
 *    (kritik sönümlü yay, taşma yok; hareketi azalt → yalnız solma). Zemin uygulamanın bulanık popup zemini.
 *  - En üstte "Şu an" kartı: durum rengi, büyük ince başlık, üç parçalı şerit, en çok iki satır, tek ana iş.
 *  - Elle işaret onay penceresi açmaz; 5 sn "Geri al" bildirimi çıkar (sunucu 10 dk + aynı kullanıcı).
 *  - RANDEVULAR: lab doğrudan, hekim/klinik planlama sonrası öneri; lab bekleyen öneriyi onaylar/reddeder.
 *  - ÖNCEKİ PROVALAR: açılır satırlar.
 * Metin `autoT` ile çevrilir; tarih biçimi `localeTag()`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, Modal, Platform, Animated, Easing, AccessibilityInfo, ScrollView, TextInput,
  useWindowDimensions,
} from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';
import { useInkUI } from '../../../core/theme/inkScale';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  X, CalendarClock, Calendar, PauseCircle, PlayCircle, Bell, Truck, Plus, ChevronDown, ChevronUp, Trash2,
} from '../../../core/ui/icons';
import {
  nowCard, activeProva, riskChip, apptLine, fmtDayMonth,
  type ProvaSnapshot, type ProvaRow, type ApptRow, type NowCard, type NowTone,
} from './provaModel';
import {
  provaCreate, provaMarkSent, provaMarkReturned, provaClientReturned, provaUndo, provaSetNote,
  apptSave, apptRemove, apptReview,
} from './api';

const NATIVE_DRIVER = Platform.OS !== 'web';
const DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
const WEB_PTR: any = Platform.OS === 'web' ? { cursor: 'pointer' } : null;

export type OriginRect = { x: number; y: number; w: number; h: number };

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { if (alive) setReduce(!!v); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduce(!!v));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduce;
}

/** Durum tonu → kart zemini, metin ve şerit rengi (koyu temada yarı saydam zemin + açık metin). */
function useTone(tone: NowTone) {
  const U = useInkUI();
  const map = {
    clinic: { ...U.chipTones.warning, bar: '#E89B2A' },
    late: { ...U.chipTones.danger, bar: '#D94B4B' },
    done: { ...U.chipTones.success, bar: '#2D9A6B' },
    plan: { ...U.chipTones.info, bar: '#4A8FC9' },
    pending: { ...U.chipTones.info, bar: '#4A8FC9' },
    empty: { ...U.chipTones.neutral, bar: U.ink[300] },
  } as const;
  return map[tone];
}

function lineIcon(icon: NowCard['lines'][number]['icon']) {
  switch (icon) {
    case 'pause': return PauseCircle;
    case 'play': return PlayCircle;
    case 'bell': return Bell;
    default: return Calendar;
  }
}

// ── Küçük düğmeler (tek stil: hap) ────────────────────────────────────────────────────────────
function PrimaryBtn({ label, hint, onPress, busy, accent }: { label: string; hint: string; onPress: () => void; busy?: boolean; accent: string }) {
  const ink = onAccentInk(accent);
  return (
    <GlassTooltip title={label} text={hint}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed, hovered }: any) => ({
          height: 40, paddingHorizontal: 18, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: accent, opacity: busy ? 0.6 : hovered ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }], ...WEB_PTR,
        })}
      >
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: ink }}>{busy ? autoT('İşleniyor…') : label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

function PlainBtn({ label, hint, onPress, icon: Icon, disabled }: { label: string; hint: string; onPress: () => void; icon?: any; disabled?: boolean }) {
  const U = useInkUI();
  return (
    <GlassTooltip title={label} text={hint}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed, hovered }: any) => ({
          height: 40, paddingHorizontal: 16, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
          opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }], ...WEB_PTR,
        })}
      >
        {Icon ? <Icon size={15} color={U.plainBtn.fg} strokeWidth={1.8} /> : null}
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

function LinkBtn({ label, hint, onPress, icon: Icon }: { label: string; hint: string; onPress: () => void; icon?: any }) {
  const T = useMobileTokens();
  return (
    <GlassTooltip title={label} text={hint}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={({ hovered }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8,
          backgroundColor: hovered ? T.hairline2 : 'transparent', ...WEB_PTR,
        })}
      >
        {Icon ? <Icon size={13} color={T.ink2} strokeWidth={1.9} /> : null}
        <Text style={{ fontSize: 12.5, fontWeight: '600', color: T.ink2 }}>{label}</Text>
      </Pressable>
    </GlassTooltip>
  );
}

// ── İlerleme şeridi: her parça kendi yayıyla dolar ─────────────────────────────────────────────
function Track({ fill, color, reduce }: { fill: [number, number, number]; color: string; reduce: boolean }) {
  const isDark = useThemeModeStore((s) => s.resolvedDark);
  const vals = useRef(fill.map((f) => new Animated.Value(f))).current;
  useEffect(() => {
    fill.forEach((f, i) => {
      if (reduce) vals[i].setValue(f);
      else Animated.spring(vals[i], { toValue: f, stiffness: 220, damping: 30, mass: 1, useNativeDriver: false }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fill.join(','), reduce]);
  return (
    <View style={{ flexDirection: 'row', gap: 5, marginTop: 16, marginBottom: 6 }}>
      {vals.map((v, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }}>
          <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
        </View>
      ))}
    </View>
  );
}

// ── Popup ─────────────────────────────────────────────────────────────────────────────────────
export function ProvaModal({
  visible, onClose, orderId, orderNumber, workTitle, originRect, snapshot, loading, error, refetch, onChanged, onCallCourier,
}: {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber?: string | null;
  workTitle?: string | null;
  originRect?: OriginRect | null;
  snapshot: ProvaSnapshot | null;
  loading?: boolean;
  error?: string | null;
  refetch: () => void | Promise<void>;
  /** Sipariş satırını (teslim tarihi, bekleme) yeniden çekmek için. */
  onChanged?: () => void;
  /** "Prova kuryesi" / "Dönüş kuryesi" — popup kapanır, kurye penceresi bu amaçla açılır. */
  onCallCourier?: (purpose: 'prova_gidis' | 'prova_donus') => void;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const reduce = useReduceMotion();
  const accent = usePanelTheme().primary;
  const loc = localeTag();

  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(1)).current;     // 0 = yerinde, 1 = düğmede
  const origin = useRef({ dx: 0, dy: 24 });

  useEffect(() => {
    if (visible) {
      if (originRect) {
        origin.current = { dx: originRect.x + originRect.w / 2 - width / 2, dy: originRect.y + originRect.h / 2 - height / 2 };
      } else {
        origin.current = { dx: 0, dy: 24 };
      }
      setMounted(true);
      if (reduce) {
        Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
      } else {
        // Kritik sönümlü yay (k=320, c=36 ≈ 2√k): taşma yok; anlık değerden başlar → kesilebilir.
        Animated.spring(progress, { toValue: 0, stiffness: 320, damping: 36, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
      }
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 1, duration: reduce ? 120 : 220, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER,
      }).start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ── eylem durumu ──
  const [busy, setBusy] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [undo, setUndo] = useState<{ provaId: string; text: string } | null>(null);
  const toastP = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<any>(null);

  useEffect(() => {
    if (!visible) { setActErr(null); setPickDay(null); setDayOpen(false); setNoteOpen(false); setUndo(null); }
  }, [visible]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const s = snapshot;
  const card = useMemo(() => (s ? nowCard(s, autoT, loc) : null), [s, loc]);
  const active = s ? activeProva(s) : null;
  const tone = useTone(card?.tone ?? 'empty');

  const showToast = (provaId: string, text: string) => {
    setUndo({ provaId, text });
    toastP.setValue(0);
    if (reduce) toastP.setValue(1);
    else Animated.spring(toastP, { toValue: 1, stiffness: 300, damping: 34, mass: 1, useNativeDriver: NATIVE_DRIVER }).start();
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(hideToast, 5000);
  };
  const hideToast = () => {
    Animated.timing(toastP, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(() => setUndo(null));
  };

  const after = async () => { await refetch(); onChanged?.(); };

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, toast?: { provaId: string; text: string }) => {
    if (busy) return;
    setBusy(true); setActErr(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { setActErr(r.error ?? autoT('İşlem yapılamadı')); return; }
    setPickDay(null); setDayOpen(false);
    await after();
    if (toast) showToast(toast.provaId, toast.text);
  };

  const onPrimary = () => {
    if (!card?.primary || !s) return;
    const day = pickDay ?? null;
    switch (card.primary.action) {
      case 'send':
        if (active) void run(() => provaMarkSent(active.id, day), { provaId: active.id, text: autoT('Gönderildi olarak işaretlendi') });
        break;
      case 'return':
      case 'confirm':
        if (active) void run(() => provaMarkReturned(active.id, day), { provaId: active.id, text: autoT('Döndü olarak işaretlendi') });
        break;
      case 'clientReturned':
        if (active) void run(() => provaClientReturned(active.id));
        break;
      case 'createSend':
        void (async () => {
          if (busy) return;
          setBusy(true); setActErr(null);
          const c = await provaCreate(orderId);
          if (!c.ok || !c.data) { setBusy(false); setActErr(c.error ?? autoT('İşlem yapılamadı')); return; }
          const m = await provaMarkSent(c.data, day);
          setBusy(false);
          if (!m.ok) { setActErr(m.error ?? autoT('İşlem yapılamadı')); await after(); return; }
          setPickDay(null); setDayOpen(false);
          await after();
          showToast(c.data, autoT('Gönderildi olarak işaretlendi'));
        })();
        break;
      case 'note': {
        const last = [...s.provas].filter((p) => p.status === 'döndü').sort((a, b) => (b.return_date ?? '').localeCompare(a.return_date ?? ''))[0];
        setNoteText(last?.doctor_notes ?? '');
        setNoteOpen((v) => !v);
        break;
      }
    }
  };

  const saveNote = () => {
    if (!s) return;
    const last = [...s.provas].filter((p) => p.status === 'döndü').sort((a, b) => (b.return_date ?? '').localeCompare(a.return_date ?? ''))[0];
    if (!last) return;
    void run(() => provaSetNote(last.id, noteText)).then(() => setNoteOpen(false));
  };

  const doUndo = () => {
    if (!undo) return;
    const id = undo.provaId;
    clearTimeout(toastTimer.current);
    hideToast();
    void run(() => provaUndo(id));
  };

  if (!mounted) return null;

  const travelStyle = {
    opacity: progress.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 0.6, 0] }),
    transform: reduce ? [] : [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, origin.current.dx] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, origin.current.dy] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] }) },
    ],
  };
  const lab = s?.viewer === 'lab';
  const canDay = !!card?.primary && lab && ['send', 'return', 'confirm', 'createSend'].includes(card.primary.action);
  const dayMin = card?.primary?.action === 'return' || card?.primary?.action === 'confirm' ? active?.sent_date ?? undefined : undefined;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable
          onPress={onClose}
          accessibilityLabel={autoT('Kapat')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, ...(Platform.OS === 'web' ? { cursor: 'default' } as any : null) }}
        />
        <Animated.View style={[U.modalCard, { maxWidth: 540, maxHeight: Math.round(height * 0.88) }, travelStyle as any]} accessibilityViewIsModal>
          {/* Başlık */}
          <View style={[U.modalHeaderRow, { borderBottomWidth: 0, paddingBottom: 6, gap: 12 }]}>
            <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.neutral.bg }}>
              <CalendarClock size={17} color={U.ink[700]} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[U.modalTitle, { letterSpacing: -0.2 }]} numberOfLines={1}>{autoT('Prova')}</Text>
              <Text style={{ fontSize: 12, color: U.ink[400], marginTop: 1, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
                {orderNumber ? `#${orderNumber}` : ''}{orderNumber && workTitle ? ' · ' : ''}{workTitle ?? ''}
              </Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Prova penceresini kapatır')} placement="bottom">
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={autoT('Kapat')}
                style={({ pressed }: any) => ({ ...U.modalCloseBtn, opacity: pressed ? 0.6 : 1, ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}) })}
              >
                <X size={15} color={U.ink[500]} strokeWidth={2} />
              </Pressable>
            </GlassTooltip>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 22 }} keyboardShouldPersistTaps="handled">
            {!s ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: error ? U.chipTones.danger.fg : U.ink[400] }}>
                  {error ? error : loading ? autoT('Yükleniyor…') : ''}
                </Text>
              </View>
            ) : card ? (
              <>
                {/* Şu an */}
                <View style={{ borderRadius: 20, padding: 18, backgroundColor: tone.bg }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: tone.fg, textTransform: 'uppercase' }} numberOfLines={1}>
                    {card.eyebrow}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                    <Text style={{ fontFamily: DISPLAY_FONT, fontWeight: '300', fontSize: 34, lineHeight: 38, letterSpacing: -0.85, color: T.ink }}>{card.big}</Text>
                    {card.days ? <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink3 }}>{card.days}</Text> : null}
                  </View>
                  <Track fill={card.fill} color={tone.bar} reduce={reduce} />
                  <View style={{ flexDirection: 'row' }}>
                    {card.steps.map((st, i) => (
                      <Text key={i} numberOfLines={1} style={{ flex: 1, fontSize: 11, color: T.ink3, textAlign: i === 0 ? 'left' : i === 1 ? 'center' : 'right' }}>{st}</Text>
                    ))}
                  </View>
                  {card.lines.map((l, i) => {
                    const I = lineIcon(l.icon);
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                        <I size={15} color={T.ink2} strokeWidth={1.8} />
                        <Text style={{ flex: 1, fontSize: 12.5, color: T.ink2 }}>{l.text}</Text>
                      </View>
                    );
                  })}

                  {(card.primary || card.secondary) ? (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      {card.primary ? (
                        <PrimaryBtn label={card.primary.label} hint={primaryHint(card.primary.action)} onPress={onPrimary} busy={busy} accent={accent} />
                      ) : null}
                      {card.secondary && onCallCourier ? (
                        <PlainBtn
                          label={card.secondary.label}
                          hint={autoT('Bu amaçla kurye çağırma penceresini açar')}
                          icon={Truck}
                          onPress={() => onCallCourier(card.secondary!.purpose)}
                        />
                      ) : null}
                    </View>
                  ) : null}

                  {canDay ? (
                    <View style={{ marginTop: 8 }}>
                      <LinkBtn
                        label={`${autoT('Tarih')}: ${pickDay ? fmtDayMonth(pickDay, loc) : autoT('bugün')}`}
                        hint={autoT('İşaret bir gün geç yapılıyorsa gerçek günü seçin')}
                        icon={Calendar}
                        onPress={() => setDayOpen((v) => !v)}
                      />
                      {dayOpen ? (
                        <View style={{ marginTop: 6, maxWidth: 260 }}>
                          <DatePicker value={pickDay ?? s.today} onChange={(iso) => setPickDay(iso === s.today ? null : iso)} accent={accent} maxDate={s.today} minDate={dayMin} compact />
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {noteOpen ? (
                    <View style={{ marginTop: 12, gap: 8 }}>
                      <TextInput
                        value={noteText}
                        onChangeText={setNoteText}
                        multiline
                        placeholder={autoT('Hekim notu (isteğe bağlı) · ör. distal kontak sıkı')}
                        placeholderTextColor={T.ink3}
                        style={{ minHeight: 64, borderRadius: 14, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, fontSize: 13, padding: 12, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null) }}
                      />
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <PrimaryBtn label={autoT('Notu kaydet')} hint={autoT('Hekim notunu provaya yazar')} onPress={saveNote} busy={busy} accent={accent} />
                        <PlainBtn label={autoT('Vazgeç')} hint={autoT('Notu kaydetmeden kapatır')} onPress={() => setNoteOpen(false)} />
                      </View>
                    </View>
                  ) : null}

                  {actErr ? <Text style={{ marginTop: 10, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{actErr}</Text> : null}
                </View>

                <ApptSection s={s} orderId={orderId} accent={accent} onChanged={after} />
                <PrevProvas s={s} active={active} doneShown={card.tone === 'done'} orderId={orderId} onChanged={after} />
              </>
            ) : null}
          </ScrollView>

          {/* Geri al bildirimi */}
          {undo ? (
            <Animated.View
              pointerEvents="box-none"
              style={{
                position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center',
                opacity: toastP, transform: [{ translateY: toastP.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              }}
            >
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, paddingLeft: 18, paddingRight: 10,
                borderRadius: 16, backgroundColor: 'rgba(28,26,22,0.88)',
                ...(Platform.OS === 'web' ? { backdropFilter: 'blur(18px) saturate(160%)', WebkitBackdropFilter: 'blur(18px) saturate(160%)', boxShadow: '0 12px 30px rgba(0,0,0,0.25)' } as any : null),
              }}>
                <Text style={{ fontSize: 13.5, color: '#FFFFFF' }} numberOfLines={1}>{undo.text}</Text>
                <GlassTooltip title={autoT('Geri al')} text={autoT('Son işareti, teslim tarihi ve bekleme dahil geri alır')}>
                  <Pressable onPress={doUndo} accessibilityRole="button" accessibilityLabel={autoT('Geri al')}
                    style={({ pressed }: any) => ({ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', transform: [{ scale: pressed ? 0.96 : 1 }], ...WEB_PTR })}>
                    <Text style={{ fontSize: 12.5, fontWeight: '600', color: '#FFFFFF' }}>{autoT('Geri al')}</Text>
                  </Pressable>
                </GlassTooltip>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

function primaryHint(a: NonNullable<NowCard['primary']>['action']): string {
  switch (a) {
    case 'send': return autoT('Prova kliniğe gitti; teslim sayacı durur');
    case 'return': return autoT('Prova laboratuvara döndü; sayaç yeniden işler, teslim tarihi klinikte geçen gün kadar kayar');
    case 'confirm': return autoT('Hekimin geri gönderdiği provayı teslim aldığınızı onaylar');
    case 'clientReturned': return autoT('Provayı laboratuvara gönderdiğinizi bildirir; lab teslim alınca onaylar');
    case 'createSend': return autoT('Yeni prova açar ve kliniğe gönderildi olarak işaretler');
    case 'note': return autoT('Dönen provaya hekim notu ekler');
  }
}

// ── Randevular ────────────────────────────────────────────────────────────────────────────────
type Draft = { id: string | null; kind: 'prova' | 'takma'; date: string; time: string };

function ApptSection({ s, orderId, accent, onChanged }: { s: ProvaSnapshot; orderId: string; accent: string; onChanged: () => Promise<void> }) {
  const U = useInkUI();
  const T = useMobileTokens();
  const loc = localeTag();
  const canEdit = s.can_manage || s.can_propose;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [info, setInfo] = useState<string | null>(null);

  const rows = s.appointments.filter((a) => !a.removed || a.review_note);
  const chip = riskChip(s.risk, autoT, loc);

  const save = async () => {
    if (!draft) return;
    if (!draft.date) { setErr(autoT('Gün seçin')); return; }
    if (draft.time && !/^\d{1,2}:\d{2}$/.test(draft.time.trim())) { setErr(autoT('Saati SS:DD biçiminde yazın')); return; }
    setBusy(true); setErr(null);
    const r = await apptSave(orderId, draft.id, draft.kind, draft.date, draft.time.trim() || null);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? autoT('Kaydedilemedi')); return; }
    setDraft(null);
    if (!s.can_manage) setInfo(autoT('Randevu değişikliği lab onayına gönderildi'));
    await onChanged();
  };
  const remove = async (a: ApptRow) => {
    setBusy(true); setErr(null);
    const r = await apptRemove(a.id);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? autoT('Silinemedi')); return; }
    setDraft(null);
    if (!s.can_manage) setInfo(autoT('Randevu değişikliği lab onayına gönderildi'));
    await onChanged();
  };
  const review = async (a: ApptRow, approve: boolean) => {
    setBusy(true); setErr(null);
    const r = await apptReview(a.id, approve, approve ? null : rejectNote);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? autoT('İşlem yapılamadı')); return; }
    setRejectFor(null); setRejectNote('');
    await onChanged();
  };

  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: T.ink3, textTransform: 'uppercase' }}>{autoT('Randevular')}</Text>
        {canEdit && !draft ? (
          <LinkBtn label={autoT('Randevu')} icon={Plus} hint={autoT('Hastanın prova ya da takma randevusunu ekler')}
            onPress={() => { setInfo(null); setErr(null); setDraft({ id: null, kind: 'takma', date: '', time: '' }); }} />
        ) : null}
      </View>

      {rows.length === 0 && !draft ? (
        <Text style={{ fontSize: 12.5, color: T.ink3, paddingVertical: 8 }}>{autoT('Randevu girilmemiş')}</Text>
      ) : null}

      {rows.map((a, i) => {
        const l = apptLine(a, autoT, loc);
        const isTakma = a.kind === 'takma' && !a.removed && a.appt_date && s.risk?.takma_date === a.appt_date;
        const editing = draft?.id === a.id;
        return (
          <View key={a.id} style={{ paddingVertical: 12, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: T.hairline2 }}>
            <Pressable
              disabled={!canEdit || a.removed}
              onPress={() => { setInfo(null); setErr(null); setDraft(editing ? null : { id: a.id, kind: a.kind, date: a.pending_date ?? a.appt_date ?? '', time: (a.pending_time ?? a.appt_time ?? '').slice(0, 5) }); }}
              style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, backgroundColor: hovered && canEdit ? T.hairline2 : 'transparent', ...(canEdit ? WEB_PTR : null) })}
            >
              <Text style={{ width: 64, fontSize: 13.5, color: T.ink3 }}>{l.title}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '600', color: a.removed ? T.ink3 : T.ink, fontVariant: ['tabular-nums'], textDecorationLine: a.removed ? 'line-through' : 'none' }} numberOfLines={1}>
                  {l.when || '—'}
                </Text>
                {l.pending ? <Text style={{ fontSize: 11.5, color: U.chipTones.warning.fg, marginTop: 2 }}>{l.pending}{a.pending_by_name ? ` · ${a.pending_by_name}` : ''}</Text> : null}
                {l.note ? <Text style={{ fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{autoT('Reddedildi')}: {l.note}</Text> : null}
              </View>
              {isTakma && chip ? (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: chip.tone === 'bad' ? U.chipTones.danger.bg : chip.tone === 'warn' ? U.chipTones.warning.bg : U.chipTones.success.bg }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '600', color: chip.tone === 'bad' ? U.chipTones.danger.fg : chip.tone === 'warn' ? U.chipTones.warning.fg : U.chipTones.success.fg }}>{chip.label}</Text>
                </View>
              ) : null}
            </Pressable>

            {s.can_manage && a.pending_action ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <PrimaryBtn label={autoT('Onayla')} hint={autoT('Önerilen randevuyu geçerli yapar')} onPress={() => review(a, true)} busy={busy} accent={accent} />
                <PlainBtn label={autoT('Reddet')} hint={autoT('Öneriyi reddeder; eski tarih kalır')} onPress={() => { setRejectFor(rejectFor === a.id ? null : a.id); setRejectNote(''); }} />
              </View>
            ) : null}
            {rejectFor === a.id ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                <TextInput value={rejectNote} onChangeText={setRejectNote} placeholder={autoT('Kısa not (isteğe bağlı)')} placeholderTextColor={T.ink3}
                  style={{ height: 40, borderRadius: 12, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, paddingHorizontal: 12, fontSize: 13, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null) }} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <PlainBtn label={autoT('Reddet')} hint={autoT('Öneriyi bu notla reddeder')} onPress={() => review(a, false)} disabled={busy} />
                </View>
              </View>
            ) : null}

            {editing && draft ? (
              <ApptEditor draft={draft} setDraft={setDraft} today={s.today} accent={accent} busy={busy}
                onSave={save} onRemove={() => remove(a)} onCancel={() => setDraft(null)} />
            ) : null}
          </View>
        );
      })}

      {draft && draft.id === null ? (
        <ApptEditor draft={draft} setDraft={setDraft} today={s.today} accent={accent} busy={busy} onSave={save} onCancel={() => setDraft(null)} />
      ) : null}
      {err ? <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{err}</Text> : null}
      {info ? <Text style={{ marginTop: 8, fontSize: 12, color: T.ink3 }}>{info}</Text> : null}
    </View>
  );
}

function ApptEditor({ draft, setDraft, today, accent, busy, onSave, onRemove, onCancel }: {
  draft: Draft; setDraft: (d: Draft) => void; today: string; accent: string; busy: boolean;
  onSave: () => void; onRemove?: () => void; onCancel: () => void;
}) {
  const T = useMobileTokens();
  const U = useInkUI();
  return (
    <View style={{ marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: T.cardSoft, borderWidth: 1, borderColor: T.hairline, gap: 10 }}>
      <View style={{ flexDirection: 'row', backgroundColor: U.chipNeutral, borderRadius: 999, padding: 3, alignSelf: 'flex-start' }}>
        {(['prova', 'takma'] as const).map((k) => {
          const on = draft.kind === k;
          const label = autoT(k === 'prova' ? 'Prova' : 'Takma');
          return (
            <GlassTooltip key={k} title={label} text={autoT(k === 'prova' ? 'Hastanın prova randevusu' : 'Hastanın takma (teslim) randevusu')}>
              <Pressable onPress={() => setDraft({ ...draft, kind: k })} accessibilityRole="button" accessibilityLabel={label}
                style={{ paddingVertical: 8, paddingHorizontal: on ? 18 : 12, borderRadius: 999, backgroundColor: on ? U.segActive : 'transparent', ...WEB_PTR }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? T.ink : T.ink3 }}>{label}</Text>
              </Pressable>
            </GlassTooltip>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <View style={{ minWidth: 180 }}>
          <DatePicker value={draft.date || null} onChange={(iso) => setDraft({ ...draft, date: iso })} accent={accent} minDate={today} compact placeholder={autoT('Gün seçin')} />
        </View>
        <TextInput value={draft.time} onChangeText={(v) => setDraft({ ...draft, time: v })} placeholder={autoT('Saat (isteğe bağlı)')} placeholderTextColor={T.ink3}
          style={{ height: 36, width: 140, borderRadius: 10, borderWidth: 1, borderColor: T.hairline, backgroundColor: T.card, color: T.ink, paddingHorizontal: 10, fontSize: 13, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : null) }} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <PrimaryBtn label={autoT('Kaydet')} hint={autoT('Randevuyu kaydeder; hekim değişikliği lab onayına gider')} onPress={onSave} busy={busy} accent={accent} />
        {onRemove ? <PlainBtn label={autoT('Sil')} hint={autoT('Randevuyu kaldırır')} icon={Trash2} onPress={onRemove} disabled={busy} /> : null}
        <PlainBtn label={autoT('Vazgeç')} hint={autoT('Değişiklik yapmadan kapatır')} onPress={onCancel} />
      </View>
    </View>
  );
}

// ── Önceki provalar ──────────────────────────────────────────────────────────────────────────
function PrevProvas({ s, active, doneShown, orderId, onChanged }: {
  s: ProvaSnapshot; active: ProvaRow | null; doneShown: boolean; orderId: string; onChanged: () => Promise<void>;
}) {
  const U = useInkUI();
  const T = useMobileTokens();
  const loc = localeTag();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastDone = doneShown
    ? [...s.provas].filter((p) => p.status === 'döndü').sort((a, b) => (b.return_date ?? '').localeCompare(a.return_date ?? ''))[0]
    : null;
  const rows = [...s.provas].filter((p) => p.id !== active?.id && p.id !== lastDone?.id).sort((a, b) => b.number - a.number);
  if (rows.length === 0 && !s.can_manage) return null;

  const create = async () => {
    setBusy(true); setErr(null);
    const r = await provaCreate(orderId);
    setBusy(false);
    if (!r.ok) { setErr(r.error ?? autoT('İşlem yapılamadı')); return; }
    await onChanged();
  };

  return (
    <View style={{ marginTop: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ flex: 1, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1, color: T.ink3, textTransform: 'uppercase' }}>{autoT('Önceki provalar')}</Text>
        {s.can_manage ? <LinkBtn label={autoT('Yeni prova')} hint={autoT('Sıradaki provayı "Hazırlanıyor" olarak açar')} icon={Plus} onPress={() => { if (!busy) void create(); }} /> : null}
      </View>
      {rows.length === 0 ? <Text style={{ fontSize: 12.5, color: T.ink3, paddingVertical: 8 }}>{autoT('Önceki prova yok')}</Text> : null}
      {rows.map((p, i) => {
        const isOpen = open === p.id;
        const done = p.status === 'döndü' || p.status === 'tamamlandı';
        const tone = done ? U.chipTones.success : p.status === 'planlandı' ? U.chipTones.info : U.chipTones.warning;
        const label = done ? autoT('Döndü') : p.status === 'planlandı' ? autoT('Hazırlanıyor') : autoT('Klinikte');
        const name = `${p.number}. ${autoT(p.type ? ({ bisküvi: 'Bisküvi prova', metal: 'Metal prova', seramik: 'Seramik prova', bitmek: 'Bitmek prova', teslim: 'Teslim' } as Record<string, string>)[p.type] ?? p.type : 'Prova')}`;
        const when = p.sent_date ? `${fmtDayMonth(p.sent_date, loc)}${p.return_date ? ` → ${fmtDayMonth(p.return_date, loc)}` : ''}` : '';
        const Chev = isOpen ? ChevronUp : ChevronDown;
        return (
          <View key={p.id} style={{ borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: T.hairline2 }}>
            <Pressable onPress={() => setOpen(isOpen ? null : p.id)} accessibilityRole="button" accessibilityLabel={name}
              style={({ hovered }: any) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderRadius: 8, backgroundColor: hovered ? T.hairline2 : 'transparent', ...WEB_PTR })}>
              <Text style={{ flex: 1, fontSize: 13.5, color: T.ink }} numberOfLines={1}>{name}</Text>
              {when ? <Text style={{ fontSize: 12, color: T.ink3, fontVariant: ['tabular-nums'] }}>{when}</Text> : null}
              <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tone.bg }}>
                <Text style={{ fontSize: 11.5, fontWeight: '600', color: tone.fg }}>{label}</Text>
              </View>
              <Chev size={14} color={T.ink3} strokeWidth={1.9} />
            </Pressable>
            {isOpen ? (
              <View style={{ paddingBottom: 12, gap: 4 }}>
                {p.item_name ? <Text style={{ fontSize: 12.5, color: T.ink3 }}>{p.item_name}</Text> : null}
                <Text style={{ fontSize: 12.5, color: T.ink3 }}>{autoT('Hekim notu')}: {p.doctor_notes || '—'}</Text>
                {s.viewer === 'lab' && p.lab_notes ? <Text style={{ fontSize: 12.5, color: T.ink3 }}>{autoT('Lab notu')}: {p.lab_notes}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {err ? <Text style={{ marginTop: 8, fontSize: 12, fontWeight: '600', color: U.chipTones.danger.fg }}>{err}</Text> : null}
    </View>
  );
}

export default ProvaModal;
