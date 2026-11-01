/**
 * LogsSection — Ayarlar > Loglar sekmesi.
 * ────────────────────────────────────────
 * Gövde ortak: modules/logs/LogsBrowser (sunucu süzgeci + sayfalama, yalnız hesap sahibi).
 * (admin)/logs rotası da aynı bileşeni kullanır.
 */
import React from 'react';
import { LogsBrowser } from '../../logs/LogsBrowser';

interface Props { accentColor?: string; }

export function LogsSection({ accentColor = '#004B87' }: Props) {
  return <LogsBrowser accentColor={accentColor} />;
}
