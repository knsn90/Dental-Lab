// modules/search/types.ts — genel arama (2. dalga 1). Şekil: public.global_search (20261025140000).
export type SearchPanel = 'admin' | 'lab' | 'clinic' | 'doctor' | 'station';
export type SearchKind = 'orders' | 'clinics' | 'doctors' | 'invoices';

export interface OrderHit {
  id: string; order_number: string; patient_name: string | null; status: string;
  delivery_date: string | null; work_type: string | null; is_archived: boolean;
  clinic_name: string | null; doctor_name: string | null;
}
export interface ClinicHit { id: string; name: string; is_active: boolean; doctor_count: number }
export interface DoctorHit { id: string; full_name: string; clinic_name: string | null; is_active: boolean }
export interface InvoiceHit {
  id: string; invoice_number: string; efatura_number: string | null; clinic_name: string | null;
  total: number | null; currency: string | null; status: string;
}
export interface GlobalSearchResult {
  orders: OrderHit[]; orders_more: boolean; clinics: ClinicHit[]; doctors: DoctorHit[]; invoices: InvoiceHit[];
}

export const EMPTY_RESULT: GlobalSearchResult = { orders: [], orders_more: false, clinics: [], doctors: [], invoices: [] };
