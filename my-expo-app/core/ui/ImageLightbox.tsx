// Uygulama-içi görsel önizleme (lightbox) — web (RN-web → hem desktop hem mobil-web).
// Özellikler: zoom (desktop scroll + mobil pinch), pan (sürükle), next/prev (buton + klavye
// + mobil kaydırma), safe-area uyumlu başlık, çift-tık/çift-tıkla zoom toggle.
// DOM tabanlı (web-only) — hassas wheel/touch kontrolü için raw div/img kullanır.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { isRTL } from '../i18n';

/** `thumb` verilirse alt şeritte o kullanılır — tam boy indirmemek için. */
type Img = { url: string; name: string; thumb?: string };

const MIN = 1;
const MAX = 5;

export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
  topInset = 0,
}: {
  images: Img[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
  topInset?: number;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const swipe = useRef<{ x: number } | null>(null);

  const cur = images[index];
  const many = images.length > 1;
  // RTL: "önceki" fiziksel olarak SAĞDA olur; ok tuşu/kaydırma yönü de aynalanır.
  const rtl = isRTL();

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  // Görsel değişince zoom/pan sıfırla
  useEffect(() => { reset(); }, [index, reset]);

  const go = useCallback((d: number) => {
    if (!many) return;
    onIndexChange((index + d + images.length) % images.length);
  }, [index, images.length, many, onIndexChange]);

  const zoomBy = useCallback((factor: number) => {
    setScale(s => {
      const next = Math.min(MAX, Math.max(MIN, s * factor));
      if (next <= 1) { setTx(0); setTy(0); }
      return next;
    });
  }, []);

  // Klavye: Esc kapat · ←/→ gezin · +/- zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
      else if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.25);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, go, zoomBy, rtl]);

  const onWheel = (e: any) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  };

  const onDoubleClick = () => { if (scale > 1) reset(); else setScale(2.5); };

  // ── Mouse pan (zoom > 1) ──
  const onMouseDown = (e: any) => {
    if (scale <= 1) return;
    drag.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
  };
  const onMouseMove = (e: any) => {
    if (!drag.current) return;
    drag.current.moved = true;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const onMouseUp = () => { drag.current = null; };

  // ── Touch: pinch zoom + tek parmak pan/swipe ──
  const tdist = (t: any) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const onTouchStart = (e: any) => {
    if (e.touches.length === 2) {
      pinch.current = { dist: tdist(e.touches), scale };
      swipe.current = null;
    } else if (e.touches.length === 1) {
      if (scale > 1) drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty, moved: false };
      else swipe.current = { x: e.touches[0].clientX };
    }
  };
  const onTouchMove = (e: any) => {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const r = tdist(e.touches) / pinch.current.dist;
      setScale(Math.min(MAX, Math.max(MIN, pinch.current.scale * r)));
    } else if (e.touches.length === 1 && drag.current) {
      e.preventDefault();
      drag.current.moved = true;
      setTx(drag.current.tx + (e.touches[0].clientX - drag.current.x));
      setTy(drag.current.ty + (e.touches[0].clientY - drag.current.y));
    }
  };
  const onTouchEnd = (e: any) => {
    // Tek parmak yatay kaydırma (zoom yokken) → görsel değiştir
    if (swipe.current && e.changedTouches.length) {
      const dx = e.changedTouches[0].clientX - swipe.current.x;
      if (Math.abs(dx) > 60) go((dx < 0) === rtl ? -1 : 1);
    }
    if (e.touches.length === 0) { drag.current = null; pinch.current = null; swipe.current = null; }
  };

  const onBackdrop = (e: any) => {
    // Boş alana tık → kapat (zoom yok ve sürüklemediyse)
    if (e.target === e.currentTarget && scale <= 1 && !drag.current?.moved) onClose();
  };

  const E = React.createElement;
  const headerPad = `max(${Math.max(topInset, 14) + 6}px, env(safe-area-inset-top, 14px))`;

  const circleBtn = (key: string, label: string, onClick: () => void, extra: any = {}) =>
    E('div', {
      key,
      onClick: (ev: any) => { ev.stopPropagation(); onClick(); },
      style: {
        width: 40, height: 40, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: 22, lineHeight: '22px', cursor: 'pointer',
        userSelect: 'none', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', ...extra,
      },
    }, label);

  return E('div', {
    onClick: onBackdrop,
    onWheel,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    style: {
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.94)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden', touchAction: 'none',
    },
  }, [
    // Görsel
    E('img', {
      key: 'img',
      src: cur?.url,
      draggable: false,
      onMouseDown,
      onDoubleClick,
      alt: cur?.name ?? '',
      style: {
        maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        transition: (drag.current || pinch.current) ? 'none' : 'transform 0.12s ease-out',
        cursor: scale > 1 ? 'grab' : 'zoom-in',
        userSelect: 'none', willChange: 'transform',
      },
    }),

    // Üst başlık (safe-area)
    E('div', {
      key: 'header',
      style: {
        position: 'absolute', top: 0, left: 0, right: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: `${headerPad} 16px 12px`,
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))',
        pointerEvents: 'none',
      },
    }, [
      E('div', {
        key: 't',
        style: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      }, cur?.name ?? ''),
      many ? E('div', { key: 'c', style: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } }, `${index + 1} / ${images.length}`) : null,
      E('div', { key: 'x', style: { pointerEvents: 'auto' } }, circleBtn('close', '×', onClose)),
    ]),

    // Prev / Next
    // `start`/`end` DOM'da geçerli CSS değil (sessizce yok sayılır) → fiziksel left/right.
    many ? circleBtn('prev', rtl ? '›' : '‹', () => go(-1), { position: 'absolute', ...(rtl ? { right: 12 } : { left: 12 }), top: '50%', marginTop: -20, width: 44, height: 44, fontSize: 28 }) : null,
    many ? circleBtn('next', rtl ? '‹' : '›', () => go(1), { position: 'absolute', ...(rtl ? { left: 12 } : { right: 12 }), top: '50%', marginTop: -20, width: 44, height: 44, fontSize: 28 }) : null,

    // Alt zoom kontrolleri
    E('div', {
      key: 'zoom',
      style: {
        position: 'absolute', bottom: 'max(20px, env(safe-area-inset-bottom, 20px))', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 8,
      },
    }, [
      circleBtn('zout', '−', () => zoomBy(1 / 1.25)),
      E('div', { key: 'pct', style: { color: '#fff', fontSize: 12, fontWeight: 600, minWidth: 44, textAlign: 'center', fontVariantNumeric: 'tabular-nums' } }, `${Math.round(scale * 100)}%`),
      circleBtn('zin', '+', () => zoomBy(1.25)),
    ]),

    // Alt şerit — diğer fotoğraflar. Zoom satırının hemen üstünde, ortalı;
    // çok fotoğrafta yatay kaydırır. Küçük resim varsa tam boy indirilmez.
    many ? E('div', {
      key: 'strip',
      style: {
        position: 'absolute',
        bottom: 'calc(max(20px, env(safe-area-inset-bottom, 20px)) + 46px)',
        left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        pointerEvents: 'none',
      },
    }, [
      E('div', {
        key: 'inner',
        style: {
          display: 'flex', gap: 4, padding: 6,
          maxWidth: 'min(92vw, 760px)', overflowX: 'auto',
          background: 'rgba(0,0,0,0.42)', borderRadius: 12,
          backdropFilter: 'blur(6px)',
          pointerEvents: 'auto',
          scrollbarWidth: 'thin',
        },
      }, images.map((im, i) => E('img', {
        key: `t${i}`,
        src: im.thumb ?? im.url,
        alt: im.name,
        onClick: (e: any) => { e.stopPropagation(); onIndexChange(i); },
        style: {
          width: i === index ? 84 : 44, height: 56,
          objectFit: 'cover', borderRadius: 6, cursor: 'pointer',
          flexShrink: 0,
          opacity: i === index ? 1 : 0.55,
          outline: i === index ? '2px solid rgba(255,255,255,0.9)' : 'none',
          outlineOffset: -2,
          transition: 'width 200ms ease-out, opacity 200ms ease-out',
        },
      }))),
    ]) : null,
  ]);
}
