// Tarama ekranlarının ortak parçaları (onaylı prototip: docs/superpowers/specs/2026-10-28-tarama-randevulari-prototip.html).
// Renkler token'lardan (useInkUI + panel accent); koyu tema aynı anda. Her ikon düğmesi GlassTooltip'li.
// Pencere: tetikleyiciden açılan, aynı yoldan kapanan, yarıda kesilebilen yay (useAnchoredSpring).
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView, Animated, Platform, useWindowDimensions } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { useNeonNavy, NeonPulse, HERO_NAVY } from '../../../core/ui/HeroGlow';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { autoT } from '../../../core/i18n/autoTranslate';
import { X } from '../../../core/ui/icons';
import { useAnchoredSpring, useReduceMotion, type OriginRect } from '../../delivery/proof/useAnchoredSpring';
import type { ScanKind } from '../scanModel';

export const WEB_PTR = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
export const DISPLAY_FONT = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : undefined;
/** Basış tepkisi dokunuşta: 0.97 */
export const pressScale = (pressed: boolean) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] });

/** Hizmet türü renkleri — ağız içi = info mavisi, fotogrametri = plum (DS); koyuda yarı saydam zemin + açık metin */
export function useKindTones() {
  const U = useInkUI();
  return {
    intraoral: U.isDark ? { fg: '#9BC6EC', bg: 'rgba(74,143,201,0.24)' } : { fg: '#2C6593', bg: 'rgba(74,143,201,0.13)' },
    photogrammetry: U.isDark ? { fg: '#CDB2EA', bg: 'rgba(139,92,184,0.26)' } : { fg: '#6B3F94', bg: 'rgba(139,92,184,0.13)' },
  } as Record<ScanKind, { fg: string; bg: string }>;
}

export const KIND_LABEL: Record<ScanKind, string> = { intraoral: 'Ağız içi tarama', photogrammetry: 'Fotogrametri' };

export function Chip({ label, tone, kind }: { label: string; tone?: 'warning' | 'success' | 'info' | 'danger' | 'neutral'; kind?: ScanKind }) {
  const U = useInkUI();
  const K = useKindTones();
  const c = kind ? K[kind] : U.chipTones[tone ?? 'neutral'];
  return (
    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: c.bg, justifyContent: 'center' }}>
      <Text style={{ fontSize: 11.5, fontWeight: '600', color: c.fg }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Hap düğme: pri = panel accent, sec = düz (U.plainBtn), ghost = yazı */
export function Btn({ label, onPress, kind = 'sec', icon, tip, tipTitle, disabled, busy, flex }: {
  label: string; onPress: () => void; kind?: 'pri' | 'sec' | 'ghost'; icon?: (color: string) => React.ReactNode;
  tip?: string; tipTitle?: string; disabled?: boolean; busy?: boolean; flex?: boolean;
}) {
  const U = useInkUI();
  const panel = usePanelTheme();
  const bg = kind === 'pri' ? panel.primary : kind === 'sec' ? U.plainBtn.bg : 'transparent';
  const fg = kind === 'pri' ? onAccentInk(panel.primary) : kind === 'sec' ? U.plainBtn.fg : U.ink[500];
  const body = (
    <Pressable
      onPress={disabled || busy ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }: any) => ({
        height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: bg,
        borderWidth: kind === 'sec' ? 1 : 0, borderColor: U.plainBtn.border,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: disabled ? 0.4 : busy ? 0.7 : 1, ...(flex ? { flex: 1 } : {}),
        ...pressScale(pressed && !disabled), ...WEB_PTR,
      })}
    >
      {icon ? icon(fg) : null}
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: fg }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  return tip ? <GlassTooltip title={tipTitle ?? label} text={tip} style={flex ? { flex: 1 } : undefined}>{body}</GlassTooltip> : body;
}

/** 38px ikon düğmesi; navy = panelin birincil düğmesi. Yönetimde lacivert (açıkta düz #004B87, koyuda neon yüzey);
    diğer panellerde panel accent'i — lab'da açıkta düz safran + koyu ikon, koyuda safranın derin tonu + neon kenar
    (kullanıcı: "+ düğmesinin rengi panele uymuyor"; eskiden her panelde sabit lacivertti). */
export function IconBtn({ onPress, children, tip, tipTitle, label, navy, size = 38, innerRef }: {
  onPress: () => void; children: (color: string) => React.ReactNode; tip: string; tipTitle?: string; label: string;
  navy?: boolean; size?: number; innerRef?: React.Ref<any>;
}) {
  const U = useInkUI();
  const panel = usePanelTheme();
  const nv = useNeonNavy(panel.key === 'exec' ? HERO_NAVY.light : panel.primary);
  const color = navy ? nv.ink : U.plainBtn.fg;
  return (
    <GlassTooltip title={tipTitle ?? label} text={tip}>
      <Pressable
        ref={innerRef as any}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }: any) => ({
          width: size, height: size, borderRadius: Math.round(size * 0.34), alignItems: 'center', justifyContent: 'center',
          ...(navy ? nv.surface : { backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border }),
          ...pressScale(pressed), ...WEB_PTR,
        })}
      >
        {navy && !nv.flat ? <NeonPulse radius={Math.round(size * 0.34)} color={nv.glow} /> : null}
        {children(color)}
      </Pressable>
    </GlassTooltip>
  );
}

/** Seçilebilir kapsül (prototip .tg): seçiliyken ink zemin + ters metin */
export function Toggle({ label, on, onPress, dot }: { label: string; on: boolean; onPress: () => void; dot?: string }) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={({ pressed }: any) => ({
        height: 38, paddingHorizontal: on ? 16 : 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: on ? U.ink[900] : U.plainBtn.bg, borderWidth: 1, borderColor: on ? 'transparent' : U.fieldBorder,
        ...pressScale(pressed), ...WEB_PTR,
      })}
    >
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? U.onDarkPill : U.ink[700] }}>{label}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: string }) {
  const U = useInkUI();
  return <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[700], marginBottom: 7 }}>{children}</Text>;
}

export function Eyebrow({ children }: { children: string }) {
  const U = useInkUI();
  return <Text style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 1.2, color: U.ink[400] }}>{children.toLocaleUpperCase('tr')}</Text>;
}

/** Ortadaki pencere: bulanık arka plan (U.modalOverlay), tetikleyiciden yay, yapışkan başlık + alt şerit */
/**
 * Web: tetikleyiciden büyüyen pencere TARAYICININ compositor'ında (Web Animations API) — kullanıcı:
 * "çok yavaş ve titreye titreye". JS ile sürülen yay (web'de native driver yok) + Modal'ın kendi fade'i
 * + açılışta ağır içerik ana iş parçacığını tıkayıp kare düşürüyordu. transform/opacity compositor'da
 * koşar; JS meşgulken de akıcı. Yarıda kesilirse o anki değerden döner; hareketi azaltmada yalnız solma.
 */
function useWebSheet(visible: boolean, origin: OriginRect | null) {
  const { width, height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const [mounted, setMounted] = useState(visible);
  const card = useRef<any>(null);
  const back = useRef<any>(null);
  const anims = useRef<{ card?: any; back?: any }>({});
  const hidden = useRef('none');
  const started = useRef(false);
  useEffect(() => { if (visible) setMounted(true); }, [visible]);
  useLayoutEffect(() => {
    if (!mounted) return;
    const c = card.current, b = back.current;
    if (!c?.animate || !b?.animate) { if (!visible) setMounted(false); return; }
    const first = !started.current;
    if (first) {
      hidden.current = reduce ? 'none' : origin
        ? `translate(${Math.round(origin.x + origin.w / 2 - width / 2)}px, ${Math.round(origin.y + origin.h / 2 - height / 2)}px) scale(0.86)`
        : 'translateY(24px) scale(0.96)';
    }
    // başlangıç: ilk açılışta gizli hâl, kesintide o anki (çalışan animasyon dahil) hesaplanmış değer
    const cs = first ? null : getComputedStyle(c);
    const bs = first ? null : getComputedStyle(b);
    const fromCard = cs ? { transform: cs.transform, opacity: cs.opacity } : { transform: hidden.current, opacity: '0' };
    const fromBack = bs ? { opacity: bs.opacity } : { opacity: '0' };
    anims.current.card?.cancel(); anims.current.back?.cancel();
    started.current = true;
    const toCard = visible ? { transform: 'none', opacity: '1' } : { transform: hidden.current, opacity: '0' };
    const timing = reduce
      ? { duration: 160, easing: 'ease-out' }
      : visible ? { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' } : { duration: 220, easing: 'cubic-bezier(0.4, 0, 1, 1)' };
    const a = c.animate([fromCard, toCard], { ...timing, fill: 'forwards' });
    anims.current.card = a;
    anims.current.back = b.animate([fromBack, { opacity: visible ? '1' : '0' }], { duration: visible ? 240 : 200, easing: 'ease-out', fill: 'forwards' });
    if (!visible) a.onfinish = () => { started.current = false; setMounted(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mounted]);
  return { mounted, card, back };
}

export function SheetModal({ visible, origin, onClose, title, subtitle, children, footer, maxWidth = 560 }: {
  visible: boolean; origin: OriginRect | null; onClose: () => void; title: string; subtitle?: string;
  children: React.ReactNode; footer?: React.ReactNode; maxWidth?: number;
}) {
  const U = useInkUI();
  const { width, height } = useWindowDimensions();
  const narrow = width < 768;
  const web = Platform.OS === 'web';
  // iki yol da koşulsuz çağrılır; yalnız biri etkin (native: yay, web: compositor)
  const spring = useAnchoredSpring(web ? false : visible, origin);
  const ws = useWebSheet(web && visible, origin);
  if (!(web ? ws.mounted : spring.mounted)) return null;

  const cardBase = [U.modalCard, { maxWidth, width: '100%', maxHeight: Math.round(height * 0.9), padding: 0, overflow: 'hidden' }];
  const content = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 21, fontWeight: '300', letterSpacing: -0.5, color: U.ink[900], fontFamily: DISPLAY_FONT }} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: 12.5, color: U.ink[500], marginTop: 3, fontVariant: ['tabular-nums'] }} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <IconBtn onPress={onClose} label={autoT('Kapat')} tip={autoT('Pencereyi kapatır')} size={34}>
          {(c) => <X size={17} color={c} strokeWidth={2} />}
        </IconBtn>
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12, gap: 16 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, borderTopColor: U.hairline, gap: 10, backgroundColor: U.surface }}>
          {footer}
        </View>
      ) : null}
    </>
  );

  if (web) {
    const { flex: _f, justifyContent: _j, alignItems: _a, padding: _p, ...backdrop } = U.modalOverlay as any;
    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: narrow ? 12 : 24 }}>
          {/* bulanık scrim ayrı katman: kartla birlikte değil, kendi solmasıyla */}
          <View ref={ws.back} style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, backdrop]} />
          <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View ref={ws.card} style={[...cardBase, { willChange: 'transform, opacity' } as any]} accessibilityViewIsModal>
            {content}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[U.modalOverlay, narrow ? { padding: 12 } : null]}>
        <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <Animated.View style={[...cardBase, spring.cardStyle as any]} accessibilityViewIsModal>
          {content}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Uyarı satırları (kaydet düğmesinin yanında; kaydı engellemez) */
export function WarnLines({ lines }: { lines: string[] }) {
  const U = useInkUI();
  if (!lines.length) return null;
  return (
    <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
      {lines.map((l) => (
        <View key={l} style={{ borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: U.chipTones.warning.bg }}>
          <Text style={{ fontSize: 12.5, color: U.chipTones.warning.fg }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}
