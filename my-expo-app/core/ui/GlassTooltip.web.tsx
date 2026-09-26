// GlassTooltip (web) — site geneli hover balonu. Tasarım dili §5 "GlassTooltip".
//
// Liquid glass: yarı saydam zemin + backdrop blur(18) saturate(180%) + parlak
// 1px kenar + yumuşak gölge / üst parlama. Başlık 12/700 + açıklama 11.5/16.
// Dock tarzı ok sarılan öğenin ortasını gösterir.
//
// Balon document.body'ye PORTAL ile çizilir: kurye paneli gibi overflow:hidden +
// backdrop-filter'lı kaplarda kesilmesin (backdrop-filter, fixed çocukları da
// kendi kutusuna hapseder). Konum hover anında ölçülür, ekrana sığdırılır;
// tercih edilen yön sığmazsa ters yöne döner.
import React, { useRef, useState } from 'react';
import { View, Text } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createPortal } = require('react-dom') as { createPortal: (n: React.ReactNode, el: Element) => React.ReactNode };
import { useThemeModeStore } from '../store/themeModeStore';
import type { GlassTooltipProps, GlassTooltipPlacement } from './GlassTooltip';

export type { GlassTooltipProps, GlassTooltipPlacement } from './GlassTooltip';

const GAP = 9;      // öğe ↔ balon
const EDGE = 8;     // ekran kenarı payı
const ARROW = 14;   // ok kutusu (kırpma alanı) uzun kenarı
const EST_H = 58;   // yön kararı için tahmini balon yüksekliği

type Pos = { left: number; top: number; place: GlassTooltipPlacement; arrow: number };

export function GlassTooltip({
  children, title, text, placement = 'top', width = 190, style, enabled = true,
}: GlassTooltipProps) {
  const ref = useRef<any>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [h, setH] = useState(EST_H);
  const isDark = useThemeModeStore(s => s.resolvedDark);

  const show = () => {
    const wrap = ref.current as HTMLElement | null;
    if (!wrap || !enabled) return;
    // Ok, sarmalayıcıyı değil SARILAN öğeyi gösterir (sarmalayıcı esneyebilir).
    const el = (wrap.firstElementChild as HTMLElement | null) ?? wrap;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let place = placement;
    if (place === 'top' && r.top - GAP - EST_H < EDGE) place = 'bottom';
    else if (place === 'bottom' && r.bottom + GAP + EST_H > vh - EDGE) place = 'top';
    else if (place === 'left' && r.left - GAP - width < EDGE) place = 'right';
    else if (place === 'right' && r.right + GAP + width > vw - EDGE) place = 'left';
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    if (place === 'top' || place === 'bottom') {
      const left = clamp(cx - width / 2, EDGE, vw - width - EDGE);
      const top = place === 'top' ? r.top - GAP : r.bottom + GAP; // top: balonun ALT kenarı
      setPos({ left, top, place, arrow: clamp(cx - left - ARROW / 2, 10, width - ARROW - 10) });
    } else {
      const left = place === 'left' ? r.left - GAP - width : r.right + GAP;
      setPos({ left, top: cy, place, arrow: 0 });
    }
  };
  const hide = () => setPos(null);

  const bg = isDark ? 'rgba(40,36,32,0.55)' : 'rgba(255,255,255,0.55)';
  const line = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.75)';
  const glassFx = { backdropFilter: 'blur(18px) saturate(180%)', WebkitBackdropFilter: 'blur(18px) saturate(180%)' };

  let bubble: React.ReactNode = null;
  if (pos) {
    const { place } = pos;
    const boxPos = place === 'top' ? { left: pos.left, top: pos.top - h }
      : place === 'bottom' ? { left: pos.left, top: pos.top }
      : { left: pos.left, top: Math.max(EDGE, pos.top - h / 2) };
    // Ok: balonun DIŞINDA kırpılmış döndürülmüş kare (cam iki kat koyulaşmasın).
    const clip = place === 'top' ? { bottom: -7, left: pos.arrow, width: ARROW, height: 7 }
      : place === 'bottom' ? { top: -7, left: pos.arrow, width: ARROW, height: 7 }
      : place === 'left' ? { right: -7, top: pos.top - (boxPos.top as number) - ARROW / 2, width: 7, height: ARROW }
      : { left: -7, top: pos.top - (boxPos.top as number) - ARROW / 2, width: 7, height: ARROW };
    const sq = place === 'top' ? { top: -6, left: 2, borderRightWidth: 1, borderBottomWidth: 1 }
      : place === 'bottom' ? { top: 2, left: 2, borderLeftWidth: 1, borderTopWidth: 1 }
      : place === 'left' ? { left: -6, top: 2, borderRightWidth: 1, borderTopWidth: 1 }
      : { left: 2, top: 2, borderLeftWidth: 1, borderBottomWidth: 1 };
    bubble = createPortal(
      <View
        pointerEvents="none"
        onLayout={e => { const nh = Math.round(e.nativeEvent.layout.height); if (nh && nh !== h) setH(nh); }}
        style={{
          position: 'fixed' as any, ...boxPos, width, zIndex: 100000,
          paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12,
          backgroundColor: bg, borderWidth: 1, borderColor: line,
          ...({ ...glassFx, boxShadow: isDark
            ? '0 8px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.10)'
            : '0 8px 24px rgba(15,23,42,0.14), inset 0 1px 0 rgba(255,255,255,0.9)' } as any),
        }}
      >
        {title ? (
          <Text style={{ fontSize: 12, fontWeight: '700', color: isDark ? '#F2F2F2' : '#0F172A' }}>{title}</Text>
        ) : null}
        <Text style={{
          fontSize: 11.5, lineHeight: 16, marginTop: title ? 2 : 0,
          color: isDark ? 'rgba(255,255,255,0.72)' : 'rgba(15,23,42,0.70)',
        }}>{text}</Text>
        <View style={{ position: 'absolute' as any, overflow: 'hidden', ...clip }}>
          <View style={{
            position: 'absolute' as any, width: 10, height: 10, ...sq,
            backgroundColor: bg, borderColor: line,
            transform: [{ rotate: '45deg' }], ...(glassFx as any),
          }} />
        </View>
      </View>,
      document.body,
    );
  }

  return (
    <View
      ref={ref}
      style={style}
      {...({ onMouseEnter: show, onMouseLeave: hide, onMouseDown: hide } as any)}
    >
      {children}
      {bubble}
    </View>
  );
}
