// modules/delivery/proof/SignaturePad.web.tsx — web: tuval + Pointer Events.
// Parmağı birebir izler (getCoalescedEvents), çizgi hıza göre incelir, orta noktalı eğriyle yumuşar.
// İmza "kâğıt" yüzeyinde durur (iki temada da açık zemin + koyu mürekkep) → dışa aktarılan PNG
// her görüntüleyicide okunur (CLAUDE.md: kâğıt = hep açık).
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { ProofAsset } from './api';
import { PAPER, INK, type Pt, type SignaturePadHandle, type SignaturePadProps, nextPoint } from './signatureInk';

export type { SignaturePadHandle, SignaturePadProps };

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { disabled, onChange, onDrawStart, onDrawEnd, height = 156 }, ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokes = useRef<Pt[][]>([]);
  const cleared = useRef<Pt[][] | null>(null);
  const cur = useRef<Pt[] | null>(null);
  const [hasInk, setHasInk] = useState(false);

  const draw = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const d = window.devicePixelRatio || 1;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cv.width / d, cv.height / d);
    ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const st of strokes.current) {
      if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0].x, st[0].y, st[0].w / 2, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill(); ctx.fillStyle = PAPER; continue; }
      for (let i = 1; i < st.length; i++) {
        const a = st[i - 1], b = st[i];
        const m0 = i > 1 ? { x: (st[i - 2].x + a.x) / 2, y: (st[i - 2].y + a.y) / 2 } : a;
        const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ctx.lineWidth = b.w; ctx.beginPath(); ctx.moveTo(m0.x, m0.y); ctx.quadraticCurveTo(a.x, a.y, m1.x, m1.y); ctx.stroke();
      }
    }
  }, []);

  const size = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const d = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * d); cv.height = Math.round(r.height * d);
    draw();
  }, [draw]);

  useEffect(() => {
    size();
    const ro = new ResizeObserver(size);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [size]);

  const sync = () => { const ink = strokes.current.length > 0; setHasInk(ink); onChange(ink); };

  const at = (e: any, prev?: Pt): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return nextPoint(e.clientX - r.left, e.clientY - r.top, performance.now(), prev);
  };

  useImperativeHandle(ref, () => ({
    clear() { cleared.current = strokes.current; strokes.current = []; draw(); sync(); },
    restore() {
      if (!cleared.current) return false;
      strokes.current = cleared.current; cleared.current = null; draw(); sync(); return true;
    },
    toAsset(): Promise<ProofAsset | null> {
      const cv = canvasRef.current;
      if (!cv || !strokes.current.length) return Promise.resolve(null);
      return new Promise((res) => cv.toBlob((b) => res(b ? { uri: '', blob: b, mimeType: 'image/png' } : null), 'image/png'));
    },
  }));

  return (
    <View style={{ height, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: PAPER, opacity: disabled ? 0.35 : 1 }}>
      <canvas
        ref={canvasRef}
        aria-label={autoT('İmza alanı')}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' } as any}
        onPointerDown={(e: any) => {
          if (disabled) return;
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sentetik olay */ }
          onDrawStart?.();
          cur.current = [at(e)]; strokes.current = [...strokes.current, cur.current]; cleared.current = null; draw();
        }}
        onPointerMove={(e: any) => {
          if (!cur.current) return;
          const co = e.nativeEvent?.getCoalescedEvents?.() ?? [];
          const evs = co.length ? co : [e];
          for (const ev of evs) cur.current.push(at(ev, cur.current[cur.current.length - 1]));
          draw();
          if (!hasInk) sync();
        }}
        onPointerUp={() => { cur.current = null; onDrawEnd?.(); sync(); }}
        onPointerCancel={() => { cur.current = null; onDrawEnd?.(); sync(); }}
      />
      {!hasInk ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 36, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(0,0,0,0.18)' }} />
      ) : null}
      {!hasInk ? (
        <Text pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, textAlign: 'center', fontSize: 11.5, color: '#9A9A9A' }}>
          {autoT('Teslim alan burayı imzalasın')}
        </Text>
      ) : null}
    </View>
  );
});
