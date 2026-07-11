// core/ui/NumberTickerX.tsx
// Magic UI NumberTicker — değer değiştiğinde count-up animasyonu.
// useCountUp ile (ProgressX'tekiyle aynı pattern).

import React, { useEffect, useState, useRef } from 'react';
import { Text, type TextStyle } from 'react-native';
import i18n from '../i18n';

const _FA = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function faDigitsIfFa(s: string): string {
  return i18n.language === 'fa' ? s.replace(/[0-9]/g, (d) => _FA[+d]) : s;
}

export function NumberTickerX({
  value, duration = 800, decimals = 0, style, prefix, suffix,
}: {
  value:    number;
  duration?: number;
  decimals?: number;
  style?:   TextStyle;
  prefix?:  string;
  suffix?:  string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = Date.now();
    let raf: number | null = null;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [value, duration]);

  const formatted = faDigitsIfFa(decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toString());

  return (
    <Text style={style}>
      {prefix}{formatted}{suffix}
    </Text>
  );
}
