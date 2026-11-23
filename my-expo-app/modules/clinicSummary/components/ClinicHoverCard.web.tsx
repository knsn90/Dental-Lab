// ClinicHoverCard (web) — klinik logosunun üzerine gelince açılan klinik kartı.
//
// Davranış (apple-design):
//  - Logo üzerine gelinir gelinmez (gecikmesiz) hafifçe büyür — anında geri bildirim.
//  - Kart ~380 ms "niyet" gecikmesiyle açılır: listede fareyi gezdirirken her satırda
//    kart patlamasın. Kart açıkken başka bir logoya geçiş anında olur (grace).
//  - Kart LOGODAN doğar: transform-origin logonun merkezi; ölçek + saydamlık ile
//    "materyal" gibi gelir, aynı yoldan geri döner. Kapanırken fare karta geçebilir
//    (160 ms tolerans) — kart da üzerine gelinince açık kalır.
//  - Kesintiye açık: kapanırken tekrar üzerine gelinirse animasyon bulunduğu yerden
//    geri döner (CSS geçişi o anki değerden başlar).
//  - prefers-reduced-motion → yalnız saydamlık; ölçek/kayma yok.
//
// Kart document.body'ye PORTAL ile çizilir (tablo kartlarının overflow:hidden'ı
// kesmesin). Portal React ağacında satırın İÇİNDE kaldığı için karttaki tıklamalar
// satıra kabarcıklanır (satır açılırdı) → kökte yanıtlayıcı alınır + click durdurulur.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createPortal } = require('react-dom') as { createPortal: (n: React.ReactNode, el: Element) => React.ReactNode };
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useInkUI } from '../../../core/theme/inkScale';
import { LogoImage, DefaultLogo } from '../../../core/ui/LogoImage';
import { ArrowUpRight } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { titleCaseTR } from '../../../core/utils/textCase';
import { ClinicSummaryStrip } from './ClinicSummaryStrip';
import type { ClinicHoverCardProps } from './ClinicHoverCard';

export type { ClinicHoverCardProps } from './ClinicHoverCard';

const W = 300;          // kart genişliği
const GAP = 10;         // logo ↔ kart
const EDGE = 12;        // ekran kenarı payı
const OPEN_DELAY = 380; // niyet gecikmesi
const CLOSE_DELAY = 160;
const EST_H = 190;

// Aynı anda tek kart: yeni kart açılınca önceki kapanır; açık bir kart varken
// başka logoya geçiş gecikmesiz olur (Apple menü çubuğu gibi).
let activeClose: (() => void) | null = null;
let lastClosedAt = 0;

type Pos = { left: number; top: number; originX: number; originY: number; above: boolean };

const reduceMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ClinicHoverCard({
  children, clinicId, clinicName, logoUrl, doctorName, onOpenSummary, style,
}: ClinicHoverCardProps) {
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const ref = useRef<any>(null);
  const openT = useRef<any>(null);
  const closeT = useRef<any>(null);
  const unmountT = useRef<any>(null);
  const [hot, setHot] = useState(false);        // logo büyüme
  const [pos, setPos] = useState<Pos | null>(null);
  const [shown, setShown] = useState(false);    // giriş/çıkış animasyon durumu
  const [h, setH] = useState(EST_H);

  const clearTimers = () => { clearTimeout(openT.current); clearTimeout(closeT.current); };

  const measure = useCallback((cardH: number): Pos | null => {
    const wrap = ref.current as HTMLElement | null;
    if (!wrap) return null;
    const el = (wrap.firstElementChild as HTMLElement | null) ?? wrap;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const above = r.bottom + GAP + cardH > vh - EDGE && r.top - GAP - cardH > EDGE;
    const left = Math.max(EDGE, Math.min(vw - W - EDGE, r.left - 14));
    const top = above ? r.top - GAP - cardH : r.bottom + GAP;
    return { left, top, above, originX: r.left + r.width / 2 - left, originY: above ? cardH : 0 };
  }, []);

  const hideNow = useCallback(() => {
    clearTimers();
    setShown(false);
    lastClosedAt = Date.now();
    clearTimeout(unmountT.current);
    unmountT.current = setTimeout(() => setPos(null), reduceMotion() ? 120 : 170);
    if (activeClose === hideNow) activeClose = null;
  }, []);

  const showNow = useCallback(() => {
    if (!clinicId) return;
    const p = measure(h);
    if (!p) return;
    if (activeClose && activeClose !== hideNow) activeClose();
    activeClose = hideNow;
    clearTimeout(unmountT.current);
    setPos(p);
    // Bir sonraki karede `shown` → CSS geçişi başlangıç değerinden çalışır.
    requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
  }, [clinicId, measure, h, hideNow]);

  const enter = () => {
    // Kart açılamayan yerde (klinik bilinmiyor / klinik-hekim paneli) logo da büyümez.
    if (!clinicId) return;
    setHot(true);
    clearTimeout(closeT.current);
    if (pos) { setShown(true); return; }   // kapanırken geri dönüldü → yarıda geri al
    const warm = !!activeClose || Date.now() - lastClosedAt < 300;
    clearTimeout(openT.current);
    openT.current = setTimeout(showNow, warm ? 0 : OPEN_DELAY);
  };
  const leave = () => {
    setHot(false);
    clearTimeout(openT.current);
    if (!pos) return;
    clearTimeout(closeT.current);
    closeT.current = setTimeout(hideNow, CLOSE_DELAY);
  };

  // Kaydırma / yeniden boyutlandırma → kart logodan kopmasın, kapanır.
  useEffect(() => {
    if (!pos) return;
    const off = () => hideNow();
    window.addEventListener('scroll', off, true);
    window.addEventListener('resize', off);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hideNow(); };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', off, true);
      window.removeEventListener('resize', off);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos, hideNow]);

  useEffect(() => () => { clearTimers(); clearTimeout(unmountT.current); if (activeClose === hideNow) activeClose = null; }, [hideNow]);

  const reduce = reduceMotion();
  const ink = isDark ? '#F7F2E9' : '#0F172A';
  const inkSoft = isDark ? 'rgba(247,242,233,0.66)' : 'rgba(15,23,42,0.62)';
  const name = clinicName ? titleCaseTR(clinicName) : autoT('Klinik');

  let card: React.ReactNode = null;
  if (pos) {
    // Kartın gerçek yüksekliği gelince (onLayout) konum yeniden ölçülür.
    const top = pos.top;
    card = createPortal(
      <View
        onLayout={e => {
          const nh = Math.round(e.nativeEvent.layout.height);
          if (nh && nh !== h) { setH(nh); const p = measure(nh); if (p) setPos(p); }
        }}
        // Satır Pressable'ına kabarcıklanmasın (React ağacında satırın içindeyiz).
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        {...({
          onClick: (e: any) => e.stopPropagation(),
          onMouseEnter: () => { clearTimeout(closeT.current); setHot(true); },
          onMouseLeave: () => { setHot(false); clearTimeout(closeT.current); closeT.current = setTimeout(hideNow, CLOSE_DELAY); },
        } as any)}
        accessibilityRole={'dialog' as any}
        accessibilityLabel={name}
        style={{
          position: 'fixed' as any, left: pos.left, top, width: W, zIndex: 100000,
          borderRadius: 20, padding: 16, gap: 12,
          backgroundColor: isDark ? 'rgba(30,28,26,0.82)' : 'rgba(255,255,255,0.80)',
          borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.9)',
          ...({
            backdropFilter: 'blur(24px) saturate(180%)', WebkitBackdropFilter: 'blur(24px) saturate(180%)',
            boxShadow: isDark
              ? '0 18px 48px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)'
              : '0 18px 48px rgba(15,23,42,0.18), 0 2px 6px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.95)',
            transformOrigin: `${pos.originX}px ${pos.originY}px`,
            opacity: shown ? 1 : 0,
            transform: reduce ? 'none' : (shown ? 'scale(1) translateY(0px)' : `scale(0.94) translateY(${pos.above ? 6 : -6}px)`),
            transition: reduce
              ? 'opacity 140ms ease'
              : 'opacity 160ms ease-out, transform 220ms cubic-bezier(0.2, 0.9, 0.25, 1)',
            cursor: 'default',
          } as any),
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{
            width: 60, height: 60, borderRadius: 30, overflow: 'hidden', flexShrink: 0,
            alignItems: 'center', justifyContent: 'center',
            // Logolar saydam + koyu mürekkep: her iki temada beyaz zemin.
            backgroundColor: logoUrl ? '#FFFFFF' : U.chipNeutral,
            borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(15,23,42,0.08)',
          }}>
            {logoUrl
              ? <LogoImage uri={logoUrl} style={{ width: '100%', height: '100%' }} fitStyle={{ width: '76%', height: '76%' }} />
              : <DefaultLogo size={26} color={U.ink[500]} />}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15.5, fontWeight: '650' as any, letterSpacing: -0.2, lineHeight: 20, color: ink }} numberOfLines={2}>
              {name}
            </Text>
            {doctorName ? (
              <Text style={{ fontSize: 12.5, color: inkSoft, marginTop: 2 }} numberOfLines={1}>{doctorName}</Text>
            ) : null}
          </View>
        </View>

        {clinicId ? <ClinicSummaryStrip clinicId={clinicId} /> : null}

        {onOpenSummary && clinicId ? (
          <Pressable
            onPress={(e: any) => { e?.stopPropagation?.(); hideNow(); onOpenSummary(clinicId); }}
            accessibilityRole="button"
            style={({ pressed, hovered }: any) => ({
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
              paddingVertical: 9, borderRadius: 999,
              backgroundColor: hovered ? U.plainBtn.hoverBg : U.plainBtn.bg,
              borderWidth: 1, borderColor: U.plainBtn.border,
              transform: [{ scale: pressed ? 0.97 : 1 }],
              cursor: 'pointer',
              transition: 'transform 100ms ease-out, background-color 120ms ease',
            } as any)}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Klinik özetini aç')}</Text>
            <ArrowUpRight size={14} color={U.plainBtn.fg} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>,
      document.body,
    );
  }

  return (
    <View
      ref={ref}
      style={style}
      {...({ onMouseEnter: enter, onMouseLeave: leave } as any)}
    >
      <View style={{
        ...({
          transform: hot && !reduce ? 'scale(1.12)' : 'scale(1)',
          transition: 'transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1)',
        } as any),
      }}>
        {children}
      </View>
      {card}
    </View>
  );
}
