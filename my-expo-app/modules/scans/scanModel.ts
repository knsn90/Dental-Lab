// Tarama randevularının saf zamanlama modeli (React ve Supabase bağımlılığı yok; test: scanModel.test.mts).
// Lab-yerel saat dönüşümü, ayarlar, çakışma + yol uyarıları (spec 4.4), uygun saat önerisi (spec 4.5).
// Bütün saatler "lab-yerel, günün dakikası" (09:00 → 540); ISO ↔ yerel çeviri labLocalParts/labLocalToIso'da.

export type ScanKind = 'intraoral' | 'photogrammetry';
export type ApptStatus = 'planlandi' | 'yapildi' | 'kapandi' | 'iptal';
export type Decision = 'siparise_baglandi' | 'yeni_siparis' | 'yalniz_tarama';

export const SOURCES = ['telefon', 'whatsapp', 'yuz_yuze', 'diger'] as const;
export type ScanSource = typeof SOURCES[number];
export const SOURCE_LABEL: Record<ScanSource, string> = {
  telefon: 'Telefon', whatsapp: 'WhatsApp', yuz_yuze: 'Yüz yüze', diger: 'Diğer',
};
export const CANCEL_REASONS = ['Hasta gelmedi', 'Klinik iptal etti', 'Lab iptal etti', 'Diğer'] as const;
/** Randevu verilirken beklenen sonuç (kesin karar değil; karar penceresinde varsayılan olur) */
export const INTENTS = ['mevcut_siparis', 'yeni_siparis', 'yalniz_tarama', 'belirsiz'] as const;
export type ScanIntent = typeof INTENTS[number];
export const INTENT_LABEL: Record<ScanIntent, string> = {
  mevcut_siparis: 'Mevcut siparişe bağlanacak', yeni_siparis: 'Yeni sipariş açılacak',
  yalniz_tarama: 'Yalnız tarama', belirsiz: 'Belli değil',
};
/** Tercih aralıkları — lab-yerel dakika, [başlangıç, bitiş) */
export const WINDOWS = { sabah: [540, 720], ogle: [720, 900], aksam: [900, 1200] } as const;

export interface ScanSettings { hoursStart: number; hoursEnd: number; workdays: number[]; defaultMinutes: number; bufferMinutes: number }
export interface ApptBlock { id: string; clinicId: string; technicianId: string; equipmentIds: string[]; startMin: number; minutes: number; status: ApptStatus }
export type Travel = { minutes: number; estimated: boolean } | null;
/** from: clinicId ya da 'LAB'; atMin: yola çıkılan lab-yerel dakika */
export type TravelFn = (from: string, to: string, atMin: number) => Travel;
export type Warning =
  | { kind: 'tech_overlap' | 'device_overlap' | 'outside_hours' | 'no_location'; otherId?: string }
  | { kind: 'late_from_prev' | 'late_to_next' | 'late_from_lab'; otherId?: string; needMin: number; haveMin: number; estimated: boolean };

// ── Lab-yerel saat ──
const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function wallParts(ms: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    y: Number(get('year')), mo: Number(get('month')), d: Number(get('day')),
    h: Number(get('hour')) % 24, mi: Number(get('minute')), wd: WEEKDAY[get('weekday')] ?? 1,
  };
}

/** Bir anın lab saat dilimindeki tarihi, haftanın günü (1=Pzt) ve günün dakikası */
export function labLocalParts(iso: string, tz: string): { date: string; weekday: number; minutes: number } {
  const p = wallParts(Date.parse(iso), tz);
  const date = `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  return { date, weekday: p.wd, minutes: p.h * 60 + p.mi };
}

/** Lab saat dilimindeki "tarih + günün dakikası" anının UTC ISO karşılığı (yaz saati geçişini izler) */
export function labLocalToIso(date: string, minutes: number, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d, 0, minutes);
  const offsetAt = (ms: number) => {
    const p = wallParts(ms, tz);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t);
  return new Date(t).toISOString();
}

// ── Takvim ve saat yardımcıları (ekranlar) ──
/** "YYYY-MM-DD" + n gün (saat dilimi bağımsız takvim aritmetiği) */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Tarihin haftası, pazartesiden pazara */
export function weekDates(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number);
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // 0 = pazartesi
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - wd));
}

/** "YYYY-MM-DD"nin n ay sonrasının 1'i */
export function addMonths(date: string, n: number): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

/** Ay görünümü: 6 hafta × 7 gün, pazartesiden; inMonth = o ayın günü mü */
export function monthGrid(date: string): { date: string; inMonth: boolean }[] {
  const first = addMonths(date, 0);
  const start = weekDates(first)[0];
  const month = first.slice(0, 7);
  return Array.from({ length: 42 }, (_, i) => {
    const d = addDays(start, i);
    return { date: d, inMonth: d.slice(0, 7) === month };
  });
}

/** Günün dakikası → "HH:MM" */
export function hhmm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "9:05" / "16.30" → günün dakikası; geçersizse null */
export function parseHHMM(s: string): number | null {
  const m = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** Randevu satırlarından o lab-yerel günün blokları (iptal dışarıda) */
export function toBlocks(
  rows: { id: string; clinic_id: string; technician_id: string; starts_at: string; duration_min: number; status: ApptStatus; services: { equipment_id: string | null }[] }[],
  date: string, tz: string,
): ApptBlock[] {
  const out: ApptBlock[] = [];
  for (const r of rows) {
    if (r.status === 'iptal') continue;
    const p = labLocalParts(r.starts_at, tz);
    if (p.date !== date) continue;
    out.push({
      id: r.id, clinicId: r.clinic_id, technicianId: r.technician_id,
      equipmentIds: r.services.map((s) => s.equipment_id).filter((e): e is string => !!e),
      startMin: p.minutes, minutes: r.duration_min, status: r.status,
    });
  }
  return out;
}

// ── Ayarlar ──
function timeToMin(v: unknown): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** lab_settings satırından; NULL ya da eksik alanlarda spec varsayılanları */
export function parseScanSettings(row: Record<string, any> | null): ScanSettings {
  const num = (v: unknown, d: number) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
  const days = Array.isArray(row?.scan_workdays) ? (row!.scan_workdays as unknown[]).map(Number).filter((n) => n >= 1 && n <= 7) : null;
  return {
    hoursStart: timeToMin(row?.scan_hours_start) ?? 540,
    hoursEnd: timeToMin(row?.scan_hours_end) ?? 1200,
    workdays: days && days.length ? days : [1, 2, 3, 4, 5, 6],
    defaultMinutes: num(row?.scan_default_minutes, 90),
    bufferMinutes: num(row?.scan_buffer_minutes, 10),
  };
}

// ── Çakışma ve yol ──
/** Yarı açık aralık: uç uca değmek çakışma değildir */
export function overlaps(a: { startMin: number; minutes: number }, b: { startMin: number; minutes: number }): boolean {
  return a.startMin < b.startMin + b.minutes && b.startMin < a.startMin + a.minutes;
}

/**
 * Aday randevu için uyarılar (kaydı engellemez). Yalnız diğer `planlandi` randevular sayılır.
 * Önceki/sonraki: aynı teknisyenin adayla kesişmeyen en yakın randevuları. Aynı klinik → yol ve yol payı yok.
 * need = yol + yol payı, have = boşluk; need > have ise uyarı. Yol bilinmiyorsa bir kez no_location.
 */
export function apptWarnings(c: ApptBlock, sameDay: ApptBlock[], travel: TravelFn, s: ScanSettings, weekday: number): Warning[] {
  const others = sameDay.filter((o) => o.id !== c.id && o.status === 'planlandi');
  const out: Warning[] = [];

  const techHit = others.find((o) => o.technicianId === c.technicianId && overlaps(o, c));
  if (techHit) out.push({ kind: 'tech_overlap', otherId: techHit.id });
  const devHit = c.equipmentIds.length
    ? others.find((o) => overlaps(o, c) && o.equipmentIds.some((e) => c.equipmentIds.includes(e)))
    : undefined;
  if (devHit) out.push({ kind: 'device_overlap', otherId: devHit.id });

  const mine = others.filter((o) => o.technicianId === c.technicianId && !overlaps(o, c));
  const end = c.startMin + c.minutes;
  const prev = mine.filter((o) => o.startMin + o.minutes <= c.startMin)
    .sort((a, b) => (b.startMin + b.minutes) - (a.startMin + a.minutes))[0];
  const next = mine.filter((o) => o.startMin >= end).sort((a, b) => a.startMin - b.startMin)[0];

  let unknown = false;
  const leg = (from: string, to: string, have: number, kind: 'late_from_prev' | 'late_to_next' | 'late_from_lab', atMin: number, otherId?: string) => {
    if (from === to) return;
    const t = travel(from, to, atMin);
    if (!t) { unknown = true; return; }
    const need = t.minutes + s.bufferMinutes;
    if (need > have) {
      out.push(otherId
        ? { kind, otherId, needMin: need, haveMin: have, estimated: t.estimated }
        : { kind, needMin: need, haveMin: have, estimated: t.estimated });
    }
  };
  if (prev) leg(prev.clinicId, c.clinicId, c.startMin - (prev.startMin + prev.minutes), 'late_from_prev', prev.startMin + prev.minutes, prev.id);
  else leg('LAB', c.clinicId, c.startMin - s.hoursStart, 'late_from_lab', s.hoursStart);
  if (next) leg(c.clinicId, next.clinicId, next.startMin - end, 'late_to_next', end, next.id);
  if (unknown) out.push({ kind: 'no_location' });

  if (!s.workdays.includes(weekday) || c.startMin < s.hoursStart || end > s.hoursEnd) out.push({ kind: 'outside_hours' });
  return out;
}

/** Uyarının ekrandaki metni; t = autoT (sözlük parçaları ayrı ayrı çevrilir) */
export function warningText(w: Warning, t: (s: string) => string): string {
  switch (w.kind) {
    case 'tech_overlap': return t('Teknisyenin bu saatte başka randevusu var');
    case 'device_overlap': return t('Cihaz bu saatte başka randevuda');
    case 'outside_hours': return t('Tarama saatleri dışında');
    case 'no_location': return t('Klinik konumu bilinmiyor, yol süresi hesaplanmadı');
    default: {
      const head = w.kind === 'late_from_prev' ? 'Önceki randevudan yola'
        : w.kind === 'late_to_next' ? 'Sonraki randevuya yola' : "Lab'dan yola";
      const base = `${t(head)} ${w.needMin} ${t('dk gerekiyor')}, ${w.haveMin} ${t('dk açık')}`;
      return w.estimated ? `${base} · ${t('tahmini')}` : base;
    }
  }
}

// ── Yol tahmini ve önbellek yardımcıları ──
/** Kuş uçuşu km × 1,4 yol katsayısı ÷ 30 km/sa şehir içi hız; yukarı yuvarlanır, en az 10 dk */
export function estimateMinutes(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
  return Math.max(10, Math.ceil(((km * 1.4) / 30) * 60));
}

/** Yol süresi önbelleğinin gün dilimi (WINDOWS sınırları; dışında kalan uçlar en yakın dilime) */
export function slotOfDay(min: number): 'sabah' | 'ogle' | 'aksam' {
  if (min < WINDOWS.ogle[0]) return 'sabah';
  if (min < WINDOWS.aksam[0]) return 'ogle';
  return 'aksam';
}

/** Adres satırının özeti (FNV-1a 32 bit): koordinatın hangi adresten çıkarıldığını saklamak için */
export function addrHash(line: string): string {
  const s = line.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export type GeoPoint = { lat: number; lng: number };

/** Google süre önbelleğinin anahtarı: "from|to|dilim" */
export function travelKey(from: string, to: string, slot: 'sabah' | 'ogle' | 'aksam'): string {
  return `${from}|${to}|${slot}`;
}

/**
 * Senkron yol fonksiyonu: aynı nokta 0; Google sonucu (o gün dilimi için) varsa o, tahmini değil;
 * iki koordinat da biliniyorsa kaba tahmin (estimated); değilse null (bilinmiyor).
 */
export function makeTravelFn(points: Record<string, GeoPoint | null | undefined>, google: Record<string, number>): TravelFn {
  return (from, to, atMin) => {
    if (from === to) return { minutes: 0, estimated: false };
    const g = google[travelKey(from, to, slotOfDay(atMin))];
    if (typeof g === 'number' && Number.isFinite(g)) return { minutes: g, estimated: false };
    const a = points[from];
    const b = points[to];
    if (!a || !b) return null;
    return { minutes: estimateMinutes(a, b), estimated: true };
  };
}

/** Geocoder'a verilecek tek satır; format = formatAddressWith (ülke adlarıyla) sarmalı. Boşsa null */
export function clinicAddressLine(address: string | null, format: (raw: string) => string): string | null {
  if (!address || !address.trim()) return null;
  const line = format(address).trim();
  return line ? line : null;
}

// ── Uygun saat önerisi (spec 4.5) ──
export interface SuggestInput {
  clinicId: string; minutes: number; weekday: number; window: [number, number] | null;
  requiredKinds: ScanKind[]; technicians: { id: string }[]; devices: { id: string; kind: ScanKind }[];
  dayAppts: ApptBlock[]; travel: TravelFn; settings: ScanSettings; stepMin?: number; limit?: number;
}
export interface Slot { startMin: number; minutes: number; technicianId: string; equipmentIds: string[]; prev: Travel; next: Travel; idleMin: number; inWindow: boolean }

const BLOCKING = new Set<Warning['kind']>(['tech_overlap', 'device_overlap', 'late_from_prev', 'late_to_next', 'late_from_lab', 'outside_hours']);

/**
 * Tarama saatleri içinde stepMin (15) adımla her teknisyen için uygun başlangıçlar.
 * Elenir: çakışma, yola yetişememe, saat dışı. Yol bilinmiyorsa (no_location) elenmez, 0 sayılır.
 * Cihaz: her istenen tür için o aralıkta boş ilk cihaz; tür için cihaz tanımlı değilse cihazsız.
 * idleMin = (başlangıç − en erken varış) + (sonrakinin başı − bu bitiş + yol + pay); sonraki yoksa 0.
 * Sıra: tercih aralığında olan → az boşluk → o gün az randevulu teknisyen → erken saat; saat başına tek öneri.
 */
export function suggestSlots(i: SuggestInput): Slot[] {
  const s = i.settings;
  const step = i.stepMin ?? 15;
  const limit = i.limit ?? 5;
  if (!s.workdays.includes(i.weekday)) return [];
  const live = i.dayAppts.filter((a) => a.status === 'planlandi');
  const leg = (from: string, to: string, at: number): { t: Travel; need: number } => {
    if (from === to) return { t: { minutes: 0, estimated: false }, need: 0 };
    const t = i.travel(from, to, at);
    return { t, need: (t?.minutes ?? 0) + s.bufferMinutes };
  };

  const cands: (Slot & { count: number })[] = [];
  for (let start = s.hoursStart; start + i.minutes <= s.hoursEnd; start += step) {
    const end = start + i.minutes;
    const inWindow = !!i.window && start >= i.window[0] && start < i.window[1];
    for (const tech of i.technicians) {
      const eq: string[] = [];
      let ok = true;
      for (const kind of i.requiredKinds) {
        const pool = i.devices.filter((d) => d.kind === kind);
        if (!pool.length) continue;
        const free = pool.find((d) => !eq.includes(d.id)
          && !live.some((a) => a.equipmentIds.includes(d.id) && overlaps(a, { startMin: start, minutes: i.minutes })));
        if (!free) { ok = false; break; }
        eq.push(free.id);
      }
      if (!ok) continue;
      const c: ApptBlock = { id: '__aday__', clinicId: i.clinicId, technicianId: tech.id, equipmentIds: eq, startMin: start, minutes: i.minutes, status: 'planlandi' };
      if (apptWarnings(c, live, i.travel, s, i.weekday).some((w) => BLOCKING.has(w.kind))) continue;

      const mine = live.filter((o) => o.technicianId === tech.id);
      const prev = mine.filter((o) => o.startMin + o.minutes <= start)
        .sort((a, b) => (b.startMin + b.minutes) - (a.startMin + a.minutes))[0];
      const next = mine.filter((o) => o.startMin >= end).sort((a, b) => a.startMin - b.startMin)[0];
      const p = prev ? leg(prev.clinicId, i.clinicId, prev.startMin + prev.minutes) : leg('LAB', i.clinicId, s.hoursStart);
      const earliest = (prev ? prev.startMin + prev.minutes : s.hoursStart) + p.need;
      const n = next ? leg(i.clinicId, next.clinicId, end) : null;
      const idle = (start - earliest) + (next && n ? next.startMin - (end + n.need) : 0);
      cands.push({
        startMin: start, minutes: i.minutes, technicianId: tech.id, equipmentIds: eq,
        prev: p.t, next: n ? n.t : null, idleMin: idle, inWindow, count: mine.length,
      });
    }
  }
  cands.sort((a, b) => (Number(b.inWindow) - Number(a.inWindow)) || (a.idleMin - b.idleMin)
    || (a.count - b.count) || (a.startMin - b.startMin));
  const seen = new Set<number>();
  const out: Slot[] = [];
  for (const { count: _c, ...slot } of cands) {
    if (seen.has(slot.startMin)) continue;
    seen.add(slot.startMin);
    out.push(slot);
    if (out.length >= limit) break;
  }
  return out;
}

/** "Tarama yapıldı" için istemci ön kontrolü — sunucu metinleriyle aynı; geçerse null */
export function canMarkDone(patients: { patient_name: string | null }[]): string | null {
  if (!patients.length) return 'Tarama yapıldı demek için en az bir hasta ekleyin';
  if (patients.some((p) => (p.patient_name ?? '').trim().length < 2)) return 'Her hastanın adını yazın';
  return null;
}
