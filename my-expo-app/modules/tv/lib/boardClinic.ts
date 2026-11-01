// modules/tv/lib/boardClinic.ts — TV panosunda vakanın klinik adı (saf, import'suz → node --test).
// Kaynak sırası: kayıtta clinic_name varsa o → hekiminin kliniği (doctor_id polimorfik:
// doctors.id VEYA profiles.id; harita fetchBoard'da çözülür). Not: work_orders'ta
// clinic_name sütunu YOK — panoda ad hep hekimden gelir; alan genel yardımcı için duruyor.

type WoClinicFields = { clinic_name?: string | null; doctor_id?: string | null };

const clean = (s: string | null | undefined): string | null => {
  const t = String(s ?? '').trim();
  return t ? t : null;
};

export function boardClinicName(wo: WoClinicFields, byDoctor: Map<string, string | null>): string | null {
  return clean(wo.clinic_name) ?? (wo.doctor_id ? clean(byDoctor.get(wo.doctor_id)) : null);
}

/** Klinik adı boş siparişlerin hekim kimlikleri (tekil) — yalnız bunlar için sorgu atılır. */
export function doctorIdsNeedingClinic(wos: WoClinicFields[]): string[] {
  return Array.from(new Set(
    wos.filter(w => !clean(w.clinic_name) && w.doctor_id).map(w => w.doctor_id as string),
  ));
}
