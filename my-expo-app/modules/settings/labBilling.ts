/**
 * Lab fatura (künye) bilgileri — tek kaynak kurallar.
 *
 * Bu bilgiler bir entegratöre değil LAB'a aittir: e-fatura (Luca ve ileride
 * eklenecek diğerleri), ekstre, iş kâğıdı aynı alanları okur. Ayarlar → Genel
 * ve kurulum sihirbazı bu kurallarla zorunlu tutar; efatura-luca sunucuda aynı
 * alanları labs tablosundan okur.
 *
 * Saf modül (React/Supabase yok) — testler: labBilling.test.mts
 */

export interface LabBilling {
  /** Ticari unvan (ör. "… Laboratuvar Hizmetleri San. Tic. Ltd. Şti.") */
  legal_name: string;
  /** VKN (10) ya da şahıs şirketinde TCKN (11) — labs.tax_number */
  tax_number: string;
  tax_office: string;
  /** Açık adres: mahalle, cadde/sokak, no */
  street: string;
  /** İlçe */
  district: string;
  /** İl */
  city: string;
  /** İsteğe bağlı, 5 hane */
  postal_code: string;
}

export type LabBillingField = keyof LabBilling;

export const EMPTY_LAB_BILLING: LabBilling = {
  legal_name: '', tax_number: '', tax_office: '', street: '', district: '', city: '', postal_code: '',
};

export const REQUIRED_LAB_BILLING_FIELDS: LabBillingField[] = [
  'legal_name', 'tax_number', 'tax_office', 'street', 'district', 'city',
];

/** Alan adları (Türkçe kaynak — ekranda autoT/JSX çevirir) */
export const LAB_BILLING_LABELS: Record<LabBillingField, string> = {
  legal_name: 'Ticari unvan',
  tax_number: 'VKN / TCKN',
  tax_office: 'Vergi dairesi',
  street: 'Açık adres',
  district: 'İlçe',
  city: 'İl',
  postal_code: 'Posta kodu',
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

export function normalizeLabBilling(raw: Partial<Record<LabBillingField, unknown>> | null | undefined): LabBilling {
  const r = raw ?? {};
  return {
    legal_name: str(r.legal_name),
    tax_number: str(r.tax_number).replace(/\s+/g, ''),
    tax_office: str(r.tax_office),
    street: str(r.street),
    district: str(r.district),
    city: str(r.city),
    postal_code: str(r.postal_code).replace(/\s+/g, ''),
  };
}

/** Alan → hata mesajı (Türkçe kaynak). Boş nesne = geçerli. */
export function validateLabBilling(input: LabBilling): Partial<Record<LabBillingField, string>> {
  const b = normalizeLabBilling(input);
  const errs: Partial<Record<LabBillingField, string>> = {};
  for (const f of REQUIRED_LAB_BILLING_FIELDS) if (!b[f]) errs[f] = 'Zorunlu alan';
  if (b.tax_number && !/^(\d{10}|\d{11})$/.test(b.tax_number)) errs.tax_number = 'VKN 10, TCKN 11 haneli olmalı';
  if (b.postal_code && !/^\d{5}$/.test(b.postal_code)) errs.postal_code = 'Posta kodu 5 haneli olmalı';
  return errs;
}

export function missingLabBillingFields(input: LabBilling): LabBillingField[] {
  const b = normalizeLabBilling(input);
  return REQUIRED_LAB_BILLING_FIELDS.filter((f) => !b[f]);
}

export function isLabBillingComplete(input: LabBilling): boolean {
  return Object.keys(validateLabBilling(input)).length === 0;
}

/**
 * labs.address (görünen adres) yapılandırılmış alanlardan oluşur: "…, İlçe / İl".
 * Klinik adresleriyle aynı biçim — e-fatura adres ayrıştırıcısı da bunu bekler.
 * Posta kodu bilinçli olarak dışarıda: "34750 Ataşehir" ilçe sanılırdı.
 */
export function composeLabAddress(input: LabBilling): string {
  const b = normalizeLabBilling(input);
  const place = [b.district, b.city].filter(Boolean).join(' / ');
  return [b.street, place].filter(Boolean).join(', ');
}

/** Eski tek satır adresten ilk doldurma ("…, İlçe / İl" tutmazsa tümü açık adrese). */
export function splitLegacyAddress(address?: string | null): Pick<LabBilling, 'street' | 'district' | 'city'> {
  const s = str(address);
  if (!s) return { street: '', district: '', city: '' };
  const slashes = (s.match(/\//g) ?? []).length;
  if (slashes === 1) {
    const [left, right] = s.split('/');
    const city = right.trim();
    const l = left.trim();
    const comma = l.lastIndexOf(',');
    if (city && !city.includes(',') && comma >= 0) {
      const district = l.slice(comma + 1).trim();
      if (district) return { street: l.slice(0, comma).trim(), district, city };
    }
  }
  return { street: s, district: '', city: '' };
}
