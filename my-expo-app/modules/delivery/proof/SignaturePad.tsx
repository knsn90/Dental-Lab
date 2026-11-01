// modules/delivery/proof/SignaturePad.tsx — native: react-native-svg + PanResponder.
// Web karşılığı SignaturePad.web.tsx. Aynı "kâğıt" yüzeyi; dışa aktarım Svg.toDataURL (PNG).
import React, { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View, Text, PanResponder } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { ProofAsset } from './api';
import { PAPER, INK, type Pt, type SignaturePadHandle, type SignaturePadProps, nextPoint, strokePath } from './signatureInk';

export type { SignaturePadHandle, SignaturePadProps };

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(
  { disabled, onChange, onDrawStart, onDrawEnd, height = 156 }, ref,
) {
  const [strokes, setStrokes] = useState<Pt[][]>([]);
  const strokesRef = useRef<Pt[][]>([]);
  const cleared = useRef<Pt[][] | null>(null);
  const svgRef = useRef<any>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  // PanResponder bir kez kurulur; güncel geri çağrılar ref'ten okunur
  const drawCbs = useRef({ onDrawStart, onDrawEnd });
  drawCbs.current = { onDrawStart, onDrawEnd };

  const commit = (next: Pt[][]) => {
    strokesRef.current = next;
    setStrokes(next);
    onChange(next.length > 0);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponder: () => !disabledRef.current,
    onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      drawCbs.current.onDrawStart?.();
      cleared.current = null;
      commit([...strokesRef.current, [nextPoint(locationX, locationY, Date.now())]]);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      const all = strokesRef.current;
      const last = all[all.length - 1];
      if (!last) return;
      const st = [...last, nextPoint(locationX, locationY, Date.now(), last[last.length - 1])];
      strokesRef.current = [...all.slice(0, -1), st];
      setStrokes(strokesRef.current);
    },
    onPanResponderRelease: () => { drawCbs.current.onDrawEnd?.(); onChange(strokesRef.current.length > 0); },
    // Sistem dokunuşu elinden alırsa (ör. kenardan geri hareketi) çizim yine biter, kilit kalkar
    onPanResponderTerminate: () => { drawCbs.current.onDrawEnd?.(); onChange(strokesRef.current.length > 0); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useImperativeHandle(ref, () => ({
    clear() { cleared.current = strokesRef.current; commit([]); },
    restore() {
      if (!cleared.current) return false;
      const back = cleared.current; cleared.current = null; commit(back); return true;
    },
    toAsset(): Promise<ProofAsset | null> {
      if (!strokesRef.current.length || !svgRef.current?.toDataURL) return Promise.resolve(null);
      return new Promise((res) => svgRef.current.toDataURL((b64: string) =>
        res(b64 ? { uri: `data:image/png;base64,${b64}`, mimeType: 'image/png' } : null)));
    },
  }));

  const hasInk = strokes.length > 0;
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={autoT('İmza alanı')}
      style={{ height, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', backgroundColor: PAPER, opacity: disabled ? 0.35 : 1 }}
    >
      <Svg ref={svgRef} width="100%" height="100%">
        <Rect x={0} y={0} width="100%" height="100%" fill={PAPER} />
        {strokes.map((st, i) => (
          <Path
            key={i}
            d={strokePath(st)}
            stroke={INK}
            strokeWidth={st.reduce((a, p) => a + p.w, 0) / st.length}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
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
