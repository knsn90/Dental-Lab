/**
 * Son 6 ayın aylık ortalama çizgisi (1–5). Puansız ay çizgiyi böler; son nokta
 * önceki 3 aya göre düştüyse kırmızı, yükseldiyse yeşil, karşılaştırma yoksa içi boş gri.
 */
import React from 'react';
import Svg, { Polyline, Circle } from 'react-native-svg';
import { sparkSegments } from '../../dashboardRules';
import { useReviewTones } from './dashboardUi';

const PAD = 4;

export function ReviewSparkline({ series, positive, width = 96, height = 28 }: {
  series: (number | null)[];
  positive: boolean | null;
  width?: number;
  height?: number;
}) {
  const T = useReviewTones();
  const iw = width - PAD * 2;
  const ih = height - PAD * 2;
  const segs = sparkSegments(series, iw, ih).map(seg => seg.map(p => ({ x: p.x + PAD, y: p.y + PAD })));

  // Son nokta: son ayın puanı varsa onun yeri; yoksa son ayın x'i ve en son puanın yüksekliği.
  const n = series.length;
  const lastX = PAD + (n > 1 ? iw : iw / 2);
  const lastSeg = segs[segs.length - 1];
  const lastPoint = lastSeg?.[lastSeg.length - 1];
  const hasLast = n > 0 && series[n - 1] != null;
  const markerY = lastPoint ? lastPoint.y : PAD + ih / 2;
  const filled = hasLast && positive != null;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {segs.map((seg, i) => (seg.length > 1 ? (
        <Polyline
          key={i}
          points={seg.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={T.line} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        />
      ) : (
        <Circle key={i} cx={seg[0].x} cy={seg[0].y} r={1.4} fill={T.line} />
      )))}
      {filled ? (
        <Circle cx={lastX} cy={markerY} r={3} fill={positive ? T.good : T.bad} />
      ) : (
        <Circle cx={lastX} cy={markerY} r={2.5} fill="none" stroke={T.line} strokeWidth={1.4} />
      )}
    </Svg>
  );
}
