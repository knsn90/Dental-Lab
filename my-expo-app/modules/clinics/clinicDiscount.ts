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
