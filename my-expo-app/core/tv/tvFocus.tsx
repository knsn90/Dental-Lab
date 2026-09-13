// core/tv/tvFocus.tsx
// TV (10-foot) D-pad odak motoru — WEB spatial navigation.
//
// TV box tarayıcısında fare/dokunma yok, yalnız uzaktan kumanda (ok tuşları + OK).
// Bu modül kayıtlı odaklanabilir öğeler arasında GEOMETRİK en-yakın komşuyu bulup
// odağı taşır; OK (Enter/Space) odaklı öğenin onSelect'ini çağırır.
//
// Yalnız web'de aktif (TV box = web). Native'de no-op (kumanda kavramı yok) →
// öğeler normal render olur, halka çıkmaz. İleride fare/dokunma da eklenebilir
// (Pressable onPress zaten çalışır; odak halkası sadece kumandada görünür).

import React, {
  createContext, useContext, useRef, useState, useEffect, useCallback, useId,
} from 'react';
import { View, Platform } from 'react-native';

type Dir = 'up' | 'down' | 'left' | 'right';
type Entry = { id: string; node: any; onSelect?: () => void };

type Ctx = {
  register: (id: string, node: any, onSelect?: () => void) => void;
  unregister: (id: string) => void;
  focusedId: string | null;
  requestFocus: (id: string) => void;
};

const TVFocusContext = createContext<Ctx | null>(null);
export const useTVFocusContext = () => useContext(TVFocusContext);

const IS_WEB = Platform.OS === 'web';

function rectOf(node: any): { x: number; y: number; w: number; h: number; cx: number; cy: number } | null {
  try {
    const r = node?.getBoundingClientRect?.();
    if (!r || (r.width === 0 && r.height === 0)) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  } catch { return null; }
}

/** Verili yönde en yakın komşuyu seç (birincil eksen mesafesi + çapraz ceza). */
function nearestInDirection(from: any, entries: Entry[], dir: Dir): string | null {
  const a = rectOf(from);
  if (!a) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const e of entries) {
    const b = rectOf(e.node);
    if (!b) continue;
    const dx = b.cx - a.cx;
    const dy = b.cy - a.cy;
    // Yön filtresi — küçük örtüşme toleransıyla (12px)
    const T = 12;
    if (dir === 'up'    && b.cy >= a.cy - T) continue;
    if (dir === 'down'  && b.cy <= a.cy + T) continue;
    if (dir === 'left'  && b.cx >= a.cx - T) continue;
    if (dir === 'right' && b.cx <= a.cx + T) continue;
    // Birincil eksen mesafesi + çapraz sapma cezası (hizalı öğeler tercih edilir)
    const primary = (dir === 'up' || dir === 'down') ? Math.abs(dy) : Math.abs(dx);
    const cross   = (dir === 'up' || dir === 'down') ? Math.abs(dx) : Math.abs(dy);
    const score = primary + cross * 2.5;
    if (score < bestScore) { bestScore = score; best = e.id; }
  }
  return best;
}

export function TVFocusProvider({ children }: { children: React.ReactNode }) {
  const registry = useRef<Map<string, Entry>>(new Map());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  focusedRef.current = focusedId;

  const register = useCallback((id: string, node: any, onSelect?: () => void) => {
    registry.current.set(id, { id, node, onSelect });
    // İlk kayıtlı öğe otomatik odaklanır (kumanda için başlangıç noktası).
    if (!focusedRef.current) { focusedRef.current = id; setFocusedId(id); }
  }, []);

  const unregister = useCallback((id: string) => {
    registry.current.delete(id);
    if (focusedRef.current === id) {
      const next = registry.current.keys().next().value ?? null;
      focusedRef.current = next;
      setFocusedId(next);
    }
  }, []);

  const requestFocus = useCallback((id: string) => {
    if (registry.current.has(id)) { focusedRef.current = id; setFocusedId(id); }
  }, []);

  const move = useCallback((dir: Dir) => {
    const cur = focusedRef.current;
    const entries = Array.from(registry.current.values());
    if (entries.length === 0) return;
    const from = cur ? registry.current.get(cur)?.node : null;
    const nextId = from
      ? nearestInDirection(from, entries.filter(e => e.id !== cur), dir)
      : entries[0].id;
    if (nextId) {
      focusedRef.current = nextId;
      setFocusedId(nextId);
      try { registry.current.get(nextId)?.node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch { /* noop */ }
    }
  }, []);

  const activate = useCallback(() => {
    const cur = focusedRef.current;
    if (!cur) return;
    try { registry.current.get(cur)?.onSelect?.(); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (!IS_WEB || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':    e.preventDefault(); move('up'); break;
        case 'ArrowDown':  e.preventDefault(); move('down'); break;
        case 'ArrowLeft':  e.preventDefault(); move('left'); break;
        case 'ArrowRight': e.preventDefault(); move('right'); break;
        case 'Enter':
        case ' ':          e.preventDefault(); activate(); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, activate]);

  return (
    <TVFocusContext.Provider value={{ register, unregister, focusedId, requestFocus }}>
      {children}
    </TVFocusContext.Provider>
  );
}

/**
 * Odaklanabilir sarmalayıcı. Kumanda odağı buradayken `focused` true olur; render-prop
 * ile çocuk odak halkasını kendi çizer, ya da varsayılan halka uygulanır.
 */
export function TVFocusable({
  onSelect, autoFocus, style, children, focusRing = true,
}: {
  onSelect?: () => void;
  autoFocus?: boolean;
  style?: any;
  focusRing?: boolean;
  children: React.ReactNode | ((focused: boolean) => React.ReactNode);
}) {
  const ctx = useTVFocusContext();
  const rid = useId();
  const nodeRef = useRef<any>(null);
  const focused = ctx?.focusedId === rid;

  const setRef = useCallback((n: any) => {
    nodeRef.current = n;
    if (n && ctx) ctx.register(rid, n, onSelect);
  }, [ctx, rid, onSelect]);

  // onSelect değişince kaydı tazele (stale closure olmasın)
  useEffect(() => {
    if (nodeRef.current && ctx) ctx.register(rid, nodeRef.current, onSelect);
  }, [ctx, rid, onSelect]);

  useEffect(() => () => { ctx?.unregister(rid); }, [ctx, rid]);

  useEffect(() => {
    if (autoFocus && ctx) ctx.requestFocus(rid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringStyle = (focusRing && focused) ? {
    ...(Platform.OS === 'web'
      ? { outlineWidth: 3, outlineStyle: 'solid', outlineColor: '#3B82F6', outlineOffset: 3 } as any
      : { borderWidth: 3, borderColor: '#3B82F6' }),
  } : null;

  return (
    <View ref={setRef} style={[style, ringStyle]}>
      {typeof children === 'function' ? (children as any)(focused) : children}
    </View>
  );
}
