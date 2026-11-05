/**
 * clinicDiscount — Klinikler ekranındaki "Klinik İndirimi" kaydının saf kuralları.
 *
 * `clinic_discounts` tablosunun benzersiz anahtarı (lab_id, clinic_id). Upsert'in
 * onConflict'i bu anahtarla aynı olmalı; yalnız 'clinic_id' Postgres'te 42P10
 * ("ON CONFLICT'e uyan benzersiz kural yok") verir ve kayıt hiç yazılmaz.
 */
export interface ClinicDiscountTarget {
  id: string;
  lab_id?: string | null;
}

export interface ClinicDiscountRow {
  lab_id?: string;
  clinic_id: string;
  discount_rate: number;
}

export function clinicDiscountUpsert(
  clinic: ClinicDiscountTarget,
  percent: number,
): { row: ClinicDiscountRow; onConflict: string } {
  const row: ClinicDiscountRow = {
    // lab_id yoksa gönderme: sütun varsayılanı get_my_lab_id() doldurur, RLS de aynısını ister.
    ...(clinic.lab_id ? { lab_id: clinic.lab_id } : {}),
    clinic_id: clinic.id,
    discount_rate: percent,
  };
  return { row, onConflict: 'lab_id,clinic_id' };
}

/** "7,5" / "10" → sayı; boş, sayı dışı ya da 0–100 dışı → null. */
export function parseDiscountPercent(input: string): number | null {
  const s = String(input ?? '').trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * Sayıyı (String(n) biçimindeki ondalık gösterimiyle) tam sayı + ölçek olarak çözer:
 * değer = digits / 10^scale. Kayan nokta aritmetiği kullanılmaz.
 */
function toDecimal(n: number): { neg: boolean; digits: bigint; scale: number } {
  const neg = n < 0;
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(Math.abs(n)));
  if (!m) return { neg, digits: BigInt(0), scale: 0 };
  const frac = m[2] ?? '';
  const exp = m[3] ? Number(m[3]) : 0;
  let scale = frac.length - exp;
  let digits = BigInt(m[1] + frac);
  if (scale < 0) {
    digits = digits * BigInt('1' + '0'.repeat(-scale));
    scale = 0;
  }
  return { neg, digits, scale };
}

/**
 * Klinik genel oranı: ROUND(catalog × (100 − pct) / 100, 2) ile kuruşu kuruşuna aynı.
 * Yarım kuruş sıfırdan uzağa yuvarlanır (Postgres numeric ROUND). Oran sınırlanmaz (clamp yok);
 * geçersiz (sonlu olmayan) katalog 0, sonlu olmayan oran 0 kabul edilir.
 */
export function applyClinicRate(catalog: number, pct: number): number {
  if (!Number.isFinite(catalog)) return 0;
  const p = Number.isFinite(pct) ? pct : 0;
  const c = toDecimal(catalog);
  const r = toDecimal(p);
  const pow = (k: number) => BigInt('1' + '0'.repeat(k));
  // catalog × (100 − pct) / 100 = C·(100·10^ps − P) / 10^(cs+ps+2); kuruşa çevirmek için 100 ile çarpılır:
  // cents = N / 10^(cs+ps), N = C·(100·10^ps − P)·(±).
  const pSigned = r.neg ? -r.digits : r.digits;
  const cSigned = c.neg ? -c.digits : c.digits;
  const n = cSigned * (BigInt(100) * pow(r.scale) - pSigned);
  const k = c.scale + r.scale;
  const div = pow(k);
  const absN = n < BigInt(0) ? -n : n;
  let q = absN / div;
  const rem = absN % div;
  if (BigInt(2) * rem >= div) q = q + BigInt(1);
  const cents = n < BigInt(0) ? -q : q;
  return Number(cents) / 100;
}
