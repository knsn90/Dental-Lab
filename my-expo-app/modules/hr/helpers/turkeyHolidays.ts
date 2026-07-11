/**
 * Türkiye resmi tatilleri (ulusal + dini bayramlar).
 *
 * Ulusal tatiller sabit tarihlerden hesaplanır. Dini bayramlar (Ramazan/Kurban)
 * hijri takvime dayanır — burada 2024-2028 aralığı için lookup table tutulur.
 */

export interface TRHoliday {
  /** ISO YYYY-MM-DD */
  date:  string;
  label: string;
  kind:  'ulusal' | 'dini' | 'arefe';
}

// ─── Dini bayram aralıkları (lookup; arefe + 3 gün / 4 gün) ────────────────
const RELIGIOUS: Record<number, TRHoliday[]> = {
  2024: [
    { date: '2024-04-09', label: 'Ramazan Arefesi (yarım gün)', kind: 'arefe' },
    { date: '2024-04-10', label: 'Ramazan Bayramı 1. Gün',      kind: 'dini' },
    { date: '2024-04-11', label: 'Ramazan Bayramı 2. Gün',      kind: 'dini' },
    { date: '2024-04-12', label: 'Ramazan Bayramı 3. Gün',      kind: 'dini' },
    { date: '2024-06-16', label: 'Kurban Arefesi (yarım gün)',  kind: 'arefe' },
    { date: '2024-06-17', label: 'Kurban Bayramı 1. Gün',       kind: 'dini' },
    { date: '2024-06-18', label: 'Kurban Bayramı 2. Gün',       kind: 'dini' },
    { date: '2024-06-19', label: 'Kurban Bayramı 3. Gün',       kind: 'dini' },
    { date: '2024-06-20', label: 'Kurban Bayramı 4. Gün',       kind: 'dini' },
  ],
  2025: [
    { date: '2025-03-29', label: 'Ramazan Arefesi (yarım gün)', kind: 'arefe' },
    { date: '2025-03-30', label: 'Ramazan Bayramı 1. Gün',      kind: 'dini' },
    { date: '2025-03-31', label: 'Ramazan Bayramı 2. Gün',      kind: 'dini' },
    { date: '2025-04-01', label: 'Ramazan Bayramı 3. Gün',      kind: 'dini' },
    { date: '2025-06-05', label: 'Kurban Arefesi (yarım gün)',  kind: 'arefe' },
    { date: '2025-06-06', label: 'Kurban Bayramı 1. Gün',       kind: 'dini' },
    { date: '2025-06-07', label: 'Kurban Bayramı 2. Gün',       kind: 'dini' },
    { date: '2025-06-08', label: 'Kurban Bayramı 3. Gün',       kind: 'dini' },
    { date: '2025-06-09', label: 'Kurban Bayramı 4. Gün',       kind: 'dini' },
  ],
  2026: [
    { date: '2026-03-19', label: 'Ramazan Arefesi (yarım gün)', kind: 'arefe' },
    { date: '2026-03-20', label: 'Ramazan Bayramı 1. Gün',      kind: 'dini' },
    { date: '2026-03-21', label: 'Ramazan Bayramı 2. Gün',      kind: 'dini' },
    { date: '2026-03-22', label: 'Ramazan Bayramı 3. Gün',      kind: 'dini' },
    { date: '2026-05-26', label: 'Kurban Arefesi (yarım gün)',  kind: 'arefe' },
    { date: '2026-05-27', label: 'Kurban Bayramı 1. Gün',       kind: 'dini' },
    { date: '2026-05-28', label: 'Kurban Bayramı 2. Gün',       kind: 'dini' },
    { date: '2026-05-29', label: 'Kurban Bayramı 3. Gün',       kind: 'dini' },
    { date: '2026-05-30', label: 'Kurban Bayramı 4. Gün',       kind: 'dini' },
  ],
  2027: [
    { date: '2027-03-09', label: 'Ramazan Arefesi (yarım gün)', kind: 'arefe' },
    { date: '2027-03-10', label: 'Ramazan Bayramı 1. Gün',      kind: 'dini' },
    { date: '2027-03-11', label: 'Ramazan Bayramı 2. Gün',      kind: 'dini' },
    { date: '2027-03-12', label: 'Ramazan Bayramı 3. Gün',      kind: 'dini' },
    { date: '2027-05-16', label: 'Kurban Arefesi (yarım gün)',  kind: 'arefe' },
    { date: '2027-05-17', label: 'Kurban Bayramı 1. Gün',       kind: 'dini' },
    { date: '2027-05-18', label: 'Kurban Bayramı 2. Gün',       kind: 'dini' },
    { date: '2027-05-19', label: 'Kurban Bayramı 3. Gün',       kind: 'dini' },
    { date: '2027-05-20', label: 'Kurban Bayramı 4. Gün',       kind: 'dini' },
  ],
};

export function getTurkeyHolidaysForYear(year: number): TRHoliday[] {
  const nat: TRHoliday[] = [
    { date: `${year}-01-01`, label: 'Yılbaşı',                          kind: 'ulusal' },
    { date: `${year}-04-23`, label: 'Ulusal Egemenlik ve Çocuk Bayramı', kind: 'ulusal' },
    { date: `${year}-05-01`, label: 'Emek ve Dayanışma Günü',           kind: 'ulusal' },
    { date: `${year}-05-19`, label: 'Atatürk’ü Anma, Gençlik ve Spor Bayramı', kind: 'ulusal' },
    { date: `${year}-07-15`, label: 'Demokrasi ve Milli Birlik Günü',   kind: 'ulusal' },
    { date: `${year}-08-30`, label: 'Zafer Bayramı',                    kind: 'ulusal' },
    { date: `${year}-10-29`, label: 'Cumhuriyet Bayramı',               kind: 'ulusal' },
  ];
  const rel = RELIGIOUS[year] ?? [];
  return [...nat, ...rel].sort((a, b) => a.date.localeCompare(b.date));
}

/** YYYY-MM-DD verilen tarih için tatil objesini (yoksa null) döndür. */
export function getHoliday(dateStr: string): TRHoliday | null {
  const year = Number(dateStr.slice(0, 4));
  if (!year) return null;
  const list = getTurkeyHolidaysForYear(year);
  return list.find(h => h.date === dateStr) ?? null;
}

/** Belirli ay için tüm tatilleri döndürür. month: 1–12 */
export function getHolidaysForMonth(year: number, month: number): TRHoliday[] {
  const all = getTurkeyHolidaysForYear(year);
  const mm  = String(month).padStart(2, '0');
  return all.filter(h => h.date.slice(5, 7) === mm);
}
