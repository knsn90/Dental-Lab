export type ClinicCategory = 'muayenehane' | 'klinik' | 'poliklinik' | 'hastane' | 'laboratuvar';

export interface Clinic {
  id: string;
  name: string;
  category: ClinicCategory | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Kurumun ortak WhatsApp hattı (migration 20260922120000). */
  whatsapp_phone?: string | null;
  contact_person: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  // e-Fatura (migration 067)
  vkn?: string | null;
  tax_office?: string | null;
  efatura_registered?: boolean | null;
  efatura_alias?: string | null;
  efatura_checked_at?: string | null;
}

export interface Doctor {
  id: string;
  clinic_id: string | null;
  full_name: string;
  phone: string | null;
  specialty: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  clinic?: Clinic;
  // e-Arşiv (migration 067)
  tckn?: string | null;
}
