/**
 * DatePicker — Modern popover takvim seçici (Patterns §13)
 *
 * Kullanım:
 *   <DatePicker
 *     value="2026-05-07"      // ISO date string (YYYY-MM-DD)
 *     onChange={setDate}      // Callback receives ISO date string
 *     accent="#2563EB"        // Panel accent rengi
 *     placeholder="Tarih seç"
 *   />
 *
 * Özellikler:
 *   • Modal popover — DOM hiyerarşisi sorunlarından bağımsız
 *   • Ay/yıl gezinme oku
 *   • Bugün rozeti
 *   • Türkçe ay/gün isimleri (Pzt-Paz haftası)
 *   • Panel-aware accent (varsayılan koyu mürekkep)
 *   • Min/max tarih sınırı
 */
import React, { useState, useMemo, useRef } from 'react';
import { View, Text, Pressable, ScrollView, Modal, Platform } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react-native';
import { DS } from '../theme/dsTokens';

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const WEEKDAYS_TR = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const DISPLAY = {
  fontFamily: 'Inter Tight, Inter, system-ui, sans-serif',
  fontWeight: '300' as const,
};

// ── Helpers ──────────────────────────────────────────────────────────
function parseISODate(s?: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return isNaN(d.getTime()) ? null : d;
}

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplay(s?: string | null): string {
  const d = parseISODate(s);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth() &&
         a.getDate()     === b.getDate();
}

// Pazartesi-başlı haftalık offset (0 = Pzt, 6 = Paz)
function mondayOffset(weekday: number): number {
  return (weekday + 6) % 7;
}

// ── Component ────────────────────────────────────────────────────────
export function DatePicker({
  value,
  onChange,
  accent = DS.ink[900],
  placeholder = 'Tarih seç',
  minDate,
  maxDate,
  disabled,
  compact = false,
}: {
  value?: string | null;
  onChange: (iso: string) => void;
  accent?: string;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  /** Daha kısa trigger (height 36 / radius 10) — dar formlar için */
  compact?: boolean;
}) {
  const selected = useMemo(() => parseISODate(value), [value]);
  const minD = useMemo(() => parseISODate(minDate), [minDate]);
  const maxD = useMemo(() => parseISODate(maxDate), [maxDate]);

  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const triggerRef = useRef<any>(null);

  // Görünümdeki ay/yıl — açıldığında seçili tarih veya bugün
  const [viewYear,  setViewYear]  = useState(() => (selected ?? new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected ?? new Date()).getMonth());

  // Dropdown panelleri
  const [monthDropOpen, setMonthDropOpen] = useState(false);
  const [yearDropOpen,  setYearDropOpen]  = useState(false);

  // Yıl listesi: bugünden 60 yıl geriye, 10 yıl ileri
  const yearList = useMemo(() => {
    const cur = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = cur + 10; y >= cur - 60; y--) arr.push(y);
    return arr;
  }, []);

  const handleOpen = () => {
    if (disabled) return;
    if (selected) {
      setViewYear(selected.getFullYear());
      setViewMonth(selected.getMonth());
    }
    triggerRef.current?.measure?.((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
      setAnchor({ x: px, y: py, w, h });
      setOpen(true);
    });
    if (Platform.OS !== 'web') {
      // Mobile fallback — measure may not fire reliably
      setOpen(true);
    }
  };

  // ── Calendar grid ──────────────────────────────────────────────
  const grid = useMemo(() => {
    const firstDay  = new Date(viewYear, viewMonth, 1);
    const offset    = mondayOffset(firstDay.getDay()); // 0 = Pzt
    const daysInMon = new Date(viewYear, viewMonth + 1, 0).getDate();

    const cells: Array<{ day: number; date: Date; muted: boolean } | null> = [];
    // Önceki ay padding
    for (let i = 0; i < offset; i++) cells.push(null);
    // Bu ayın günleri
    for (let d = 1; d <= daysInMon; d++) {
      cells.push({ day: d, date: new Date(viewYear, viewMonth, d, 12), muted: false });
    }
    // 6 satır olacak şekilde sondan padding
    while (cells.length < 42) cells.push(null);
    return cells;
  }, [viewYear, viewMonth]);

  const today = new Date();

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else                 { setViewMonth(m => m - 1); }
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else                  { setViewMonth(m => m + 1); }
  };

  const pick = (d: Date) => {
    onChange(formatISODate(d));
    setOpen(false);
  };

  const isDisabled = (d: Date): boolean => {
    if (minD && d < minD) return true;
    if (maxD && d > maxD) return true;
    return false;
  };

  // ── Popover position ───────────────────────────────────────────
  const POPOVER_W = 300;
  const POPOVER_H = 340;
  const popoverStyle = useMemo(() => {
    if (Platform.OS !== 'web') {
      // Mobile: center
      return { alignSelf: 'center' as const, marginTop: 80 };
    }
    // Web: anchor altına
    let left = anchor.x;
    let top  = anchor.y + anchor.h + 6;
    if (typeof window !== 'undefined') {
      if (left + POPOVER_W > window.innerWidth - 16) left = Math.max(16, window.innerWidth - POPOVER_W - 16);
      if (top + POPOVER_H > window.innerHeight - 16) top = Math.max(16, anchor.y - POPOVER_H - 6);
    }
    return { position: 'absolute' as const, left, top };
  }, [anchor]);

  return (
    <>
      {/* Trigger — input görünümlü buton */}
      <Pressable
        ref={triggerRef}
        onPress={handleOpen}
        disabled={disabled}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          height: compact ? 36 : 44,
          paddingHorizontal: compact ? 12 : 14,
          borderRadius: compact ? 10 : 14,
          borderWidth: 1, borderColor: open ? accent : 'rgba(0,0,0,0.08)',
          backgroundColor: '#FFF',
          opacity: disabled ? 0.6 : 1,
          cursor: (disabled ? 'not-allowed' : 'pointer') as any,
        }}
      >
        <Calendar size={compact ? 14 : 15} color={selected ? DS.ink[700] : DS.ink[400]} strokeWidth={1.7} />
        <Text style={{ flex: 1, fontSize: compact ? 13 : 14, color: selected ? DS.ink[900] : DS.ink[400] }}>
          {selected ? formatDisplay(value) : placeholder}
        </Text>
      </Pressable>

      {/* Popover */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? 'transparent' : 'rgba(0,0,0,0.20)' }}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={[
              {
                width: POPOVER_W,
                backgroundColor: '#FFFFFF',
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: 'rgba(0,0,0,0.05)',
                ...Platform.select({
                  web:     { boxShadow: '0 16px 40px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.06)' } as any,
                  default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 },
                }),
              },
              popoverStyle as any,
            ]}
          >
            {/* Header — ay & yıl trigger + nav okları */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Pressable
                onPress={goPrev}
                style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' }}
              >
                <ChevronLeft size={15} color={DS.ink[700]} strokeWidth={1.8} />
              </Pressable>

              {/* Ay trigger */}
              <Pressable
                onPress={() => { setMonthDropOpen(v => !v); setYearDropOpen(false); }}
                style={{
                  flex: 1,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: monthDropOpen ? '#F5F5F5' : 'transparent',
                }}
              >
                <Text style={{ ...DISPLAY, fontSize: 15, color: DS.ink[900], letterSpacing: -0.2 }}>
                  {MONTHS_TR[viewMonth]}
                </Text>
                <ChevronDown size={12} color={DS.ink[500]} strokeWidth={2} />
              </Pressable>

              {/* Yıl trigger */}
              <Pressable
                onPress={() => { setYearDropOpen(v => !v); setMonthDropOpen(false); }}
                style={{
                  width: 80,
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
                  paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
                  backgroundColor: yearDropOpen ? '#F5F5F5' : 'transparent',
                }}
              >
                <Text style={{ ...DISPLAY, fontSize: 15, color: DS.ink[900], letterSpacing: -0.2 }}>
                  {viewYear}
                </Text>
                <ChevronDown size={12} color={DS.ink[500]} strokeWidth={2} />
              </Pressable>

              <Pressable
                onPress={goNext}
                style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAFA' }}
              >
                <ChevronRight size={15} color={DS.ink[700]} strokeWidth={1.8} />
              </Pressable>
            </View>

            {/* Hafta başlıkları */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              {WEEKDAYS_TR.map(w => (
                <Text
                  key={w}
                  style={{
                    flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '600',
                    letterSpacing: 0.7, textTransform: 'uppercase', color: DS.ink[400],
                  }}
                >
                  {w}
                </Text>
              ))}
            </View>

            {/* Günler grid'i */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {grid.map((cell, i) => {
                if (!cell) return <View key={i} style={{ width: '14.2857%', aspectRatio: 1 }} />;
                const isSelected = !!(selected && isSameDay(cell.date, selected));
                const isToday    = isSameDay(cell.date, today);
                const dis        = isDisabled(cell.date);
                return (
                  <View key={i} style={{ width: '14.2857%', aspectRatio: 1, padding: 2 }}>
                    <Pressable
                      onPress={() => !dis && pick(cell.date)}
                      disabled={dis}
                      style={{
                        flex: 1,
                        borderRadius: 10,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isSelected ? accent : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: isToday && !isSelected ? accent : 'transparent',
                        opacity: dis ? 0.3 : 1,
                        cursor: (dis ? 'not-allowed' : 'pointer') as any,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isSelected ? '700' : isToday ? '600' : '500',
                          color: isSelected ? '#FFF' : isToday ? accent : DS.ink[800],
                        }}
                      >
                        {cell.day}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Footer — Bugün ve Temizle */}
            <View style={{
              flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              marginTop: 10, paddingTop: 10,
              borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)',
            }}>
              <Pressable
                onPress={() => pick(new Date())}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FAFAFA' }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: accent }}>Bugün</Text>
              </Pressable>
              <Pressable
                onPress={() => setOpen(false)}
                style={{ paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Text style={{ fontSize: 12, fontWeight: '500', color: DS.ink[500] }}>Kapat</Text>
              </Pressable>
            </View>

            {/* ── Dropdown overlays — popover üzerinde grid'i tamamen kapatır ── */}
            {monthDropOpen && (
              <Pressable
                onPress={() => setMonthDropOpen(false)}
                style={{ position: 'absolute', top: 56, left: 50, width: 140, maxHeight: 240,
                  backgroundColor: '#FFFFFF', borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  paddingVertical: 4, overflow: 'hidden',
                  ...Platform.select({
                    web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
                    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
                  }),
                }}
              >
                <ScrollView showsVerticalScrollIndicator={false}>
                  {MONTHS_TR.map((m, idx) => {
                    const active = idx === viewMonth;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => { setViewMonth(idx); setMonthDropOpen(false); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 9,
                          backgroundColor: active ? accent + '14' : '#FFFFFF',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? accent : DS.ink[800] }}>
                          {m}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            )}

            {yearDropOpen && (
              <Pressable
                onPress={() => setYearDropOpen(false)}
                style={{ position: 'absolute', top: 56, right: 50, width: 100, maxHeight: 240,
                  backgroundColor: '#FFFFFF', borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)',
                  paddingVertical: 4, overflow: 'hidden',
                  ...Platform.select({
                    web:     { boxShadow: '0 8px 24px rgba(0,0,0,0.15)' } as any,
                    default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 10 },
                  }),
                }}
              >
                <ScrollView showsVerticalScrollIndicator={false}>
                  {yearList.map(y => {
                    const active = y === viewYear;
                    return (
                      <Pressable
                        key={y}
                        onPress={() => { setViewYear(y); setYearDropOpen(false); }}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 9,
                          alignItems: 'center',
                          backgroundColor: active ? accent + '14' : '#FFFFFF',
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: active ? '700' : '500', color: active ? accent : DS.ink[800] }}>
                          {y}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
