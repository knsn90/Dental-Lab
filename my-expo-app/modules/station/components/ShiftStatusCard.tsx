// modules/station/components/ShiftStatusCard.tsx
// Teknisyen Özet — mesai kartı. Bugünkü devam kaydına göre üç durum:
//   1) giriş yok   → "Mesaiye başla" + Okut
//   2) mesaide     → geçen süre + giriş saati + Çıkış
//   3) gün bitti   → toplam süre + giriş–çıkış saatleri
// Kayıt RLS ile yalnız kendi satırına süzülür (ea_read: employee_id = my_employee_id()).

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { QrCode, Clock, CheckCircle2 } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { supabase } from '../../../core/api/supabase';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useInkUI } from '../../../core/theme/inkScale';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { useScanStore } from '../../../core/store/scanStore';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { useFocusEffect } from 'expo-router';


function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const hhmm = (t?: string | null) => (t ? t.slice(0, 5) : '');
function toMin(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function fmtDur(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h} ${autoT('sa')} ${m} ${autoT('dk')}`;
  if (h) return `${h} ${autoT('sa')}`;
  return `${m} ${autoT('dk')}`;
}

interface Row { check_in: string | null; check_out: string | null; work_minutes: number | null }

export type ShiftRow = Row;

/** Bugünkü devam kaydı — Özet, kartı duruma göre konumlandırmak için tek yerden okur. */
// undefined = henüz okunmadı (kart çizilmez; önce üstte görünüp sonra aşağı zıplamasın)
export function useTodayShift(refreshKey?: unknown): ShiftRow | null | undefined {
  const scanOpen = useScanStore(s => s.open);
  const [row, setRow] = useState<Row | null | undefined>(undefined);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    const { data: empId } = await supabase.rpc('my_employee_id');
    if (!empId) { setRow(null); return; }
    const { data } = await supabase
      .from('employee_attendance')
      .select('check_in, check_out, work_minutes')
      .eq('employee_id', empId)
      .eq('work_date', localDate())
      .maybeSingle();
    setRow((data as Row) ?? null);
  }, []);

  // İlk açılış, çekip yenileme ve tarama penceresi kapanınca yeniden oku
  useEffect(() => { if (!scanOpen) load(); }, [load, scanOpen, refreshKey]);
  // Ekrana dönünce (QR ile giriş /checkin sayfasında tamamlanıp geri gelinir) hemen oku
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // Dakikada bir: geçen süre ilerler, başka yerden yapılan giriş/çıkış da yansır
  useEffect(() => {
    const id = setInterval(() => { setTick(t => t + 1); load(); }, 60_000);
    return () => clearInterval(id);
  }, [load]);

  return row;
}

/** Girişi olmayan teknisyen için true — kart sayfanın en üstüne çıkar. */
export const shiftNotStarted = (row: ShiftRow | null | undefined) => row !== undefined && !row?.check_in;

export function ShiftStatusCard({ accentColor, row, flush }: { accentColor: string; row: ShiftRow | null; flush?: boolean }) {
  const T = useMobileTokens();
  const U = useInkUI();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const setScanOpen = useScanStore(s => s.setOpen);
  const inMin = toMin(row?.check_in);
  const outMin = toMin(row?.check_out);
  const state: 'none' | 'in' | 'done' = inMin == null ? 'none' : outMin == null ? 'in' : 'done';

  const now = new Date();
  const elapsed = inMin != null ? Math.max(0, now.getHours() * 60 + now.getMinutes() - inMin) : 0;
  const worked = row?.work_minutes ?? (inMin != null && outMin != null ? Math.max(0, outMin - inMin) : 0);

  const accentInk = isDark ? '#93C5FD' : accentColor;
  const tone = state === 'in' ? U.chipTones.success : state === 'done' ? U.chipTones.neutral : { bg: `${accentColor}22`, fg: accentInk };
  // Zemin duruma göre: giriş bekleniyorsa DOLU accent (günün çağrısı), mesaideyken
  // yumuşak accent tonu, gün bittiyse nötr kart.
  const solid = state === 'none';
  const cardBg = solid ? accentColor : state === 'in' ? (isDark ? `${accentColor}33` : `${accentColor}1F`) : T.card;
  const titleInk = solid ? '#FFFFFF' : T.ink;
  const subInk = solid ? 'rgba(255,255,255,0.85)' : (state === 'in' ? T.ink2 : T.ink3);
  const iconBg = solid ? 'rgba(255,255,255,0.22)' : state === 'in' ? T.card : tone.bg;
  const iconFg = solid ? '#FFFFFF' : tone.fg;
  const Icon = state === 'in' ? Clock : state === 'done' ? CheckCircle2 : QrCode;

  const title = state === 'none'
    ? autoT('Mesaiye başla')
    : state === 'in'
      ? `${autoT('Mesaidesin')} · ${fmtDur(elapsed)}`
      : `${autoT('Bugünkü çalışma')} · ${fmtDur(worked)}`;
  const sub = state === 'none'
    ? autoT('Girişteki QR kodu okut')
    : state === 'in'
      ? `${autoT('Giriş')} ${hhmm(row?.check_in)}`
      : `${hhmm(row?.check_in)} – ${hhmm(row?.check_out)}`;

  return (
    <View style={{
      ...(flush ? {} : { marginHorizontal: PAGE_PADDING, marginBottom: 16 }),
      paddingHorizontal: 16, paddingVertical: 14, borderRadius: 28, backgroundColor: cardBg,
      borderWidth: 1, borderColor: solid ? 'transparent' : T.hairline,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={iconFg} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: titleInk, letterSpacing: -0.2 }} numberOfLines={1}>{title}</Text>
          <Text style={{ fontSize: 13, color: subInk, marginTop: 2 }} numberOfLines={1}>{sub}</Text>
        </View>
        {state !== 'done' ? (
          <Pressable
            onPress={() => setScanOpen(true)}
            accessibilityRole="button"
            hitSlop={6}
            style={{
              minHeight: 38, paddingHorizontal: 16, borderRadius: 999,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: solid ? '#FFFFFF' : accentColor,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: solid ? accentColor : '#FFFFFF' }}>
              {state === 'none' ? autoT('Okut') : autoT('Çıkış')}
            </Text>
          </Pressable>
        ) : null}
      </View>

    </View>
  );
}
