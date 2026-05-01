// ─────────────────────────────────────────────────────────────────────────
//  Fatura / Tahsilat modülü — TypeScript tipleri
//  Migration 021 şemasıyla 1-1 eşleşir.
// ─────────────────────────────────────────────────────────────────────────

export type InvoiceStatus =
  | 'taslak'          // henüz kesilmedi, lab düzenliyor
  | 'kesildi'         // kliniğe gönderildi, ödeme bekliyor
  | 'kismi_odendi'    // kısmi ödeme alındı
  | 'odendi'          // tamamı tahsil edildi
  | 'iptal';          // iptal edildi

export type PaymentMethod =
  | 'nakit'
  | 'kart'
  | 'havale'
  | 'cek'
  | 'diger';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  taslak:       'Taslak',
  kesildi:      'Kesildi',
  kismi_odendi: 'Kısmi Ödendi',
  odendi:       'Ödendi',
  iptal:        'İptal',
};

export const INVOICE_STATUS_COLORS: Record<InvoiceStatus, { fg: string; bg: string }> = {
  taslak:       { fg: '#64748B', bg: '#F1F5F9' },
  kesildi:      { fg: '#1D4ED8', bg: '#DBEAFE' },
  kismi_odendi: { fg: '#B45309', bg: '#FEF3C7' },
  odendi:       { fg: '#047857', bg: '#D1FAE5' },
  iptal:        { fg: '#991B1B', bg: '#FEE2E2' },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  nakit:   'Nakit',
  kart:    'Kredi Kartı',
  havale:  'Havale / EFT',
  cek:     'Çek',
  diger:   'Diğer',
};

// ─── Tablolar ──────────────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  lab_id: string | null;
  invoice_number: string;            // FTR-YYYY-NNNNN
  doctor_id: string | null;
  clinic_id: string | null;
  work_order_id: string | null;
  status: InvoiceStatus;
  issue_date: string;                // YYYY-MM-DD
  due_date: string | null;
  subtotal: number;
  tax_rate: number;                  // %20 vb.
  tax_amount: number;
  total: number;
  paid_amount: number;
  currency: string;                  // 'TRY'
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // e-Fatura (migration 067)
  efatura_uuid?:     string | null;
  efatura_etag?:     string | null;
  efatura_type?:     'e_fatura' | 'e_arsiv' | null;
  efatura_status?:   'pending' | 'queued' | 'sent' | 'accepted' | 'rejected' | 'cancelled' | 'error' | null;
  efatura_sent_at?:  string | null;
  efatura_error?:    string | null;
  efatura_provider?: string | null;
  // Joined (optional)
  doctor?:  { id: string; full_name: string; phone?: string | null; clinic_id?: string | null } | null;
  clinic?:  { id: string; name: string; address?: string | null; phone?: string | null; email?: string | null } | null;
  work_order?: { id: string; order_number: string; patient_name: string | null; delivery_date: string | null } | null;
  items?:    InvoiceItem[];
  payments?: Payment[];
  // Toplu fatura: birden fazla iş emri (migration 022 junction'ından)
  linked_orders?: LinkedWorkOrder[];
}

export interface LinkedWorkOrder {
  work_order_id: string;
  invoice_id: string;
  work_order: {
    id: string;
    order_number: string;
    patient_name: string | null;
    work_type: string | null;
    delivery_date: string | null;
  } | null;
}

/**
 * Henüz faturalanmamış teslim edilmiş sipariş
 * (v_unbilled_work_orders view'i)
 */
export interface UnbilledWorkOrder {
  work_order_id: string;
  lab_id: string | null;
  order_number: string;
  patient_name: string | null;
  work_type: string | null;
  tooth_numbers: number[] | null;
  delivery_date: string | null;
  delivered_at: string | null;
  created_at: string;
  doctor_id: string | null;
  doctor_name: string | null;
  clinic_id: string | null;
  clinic_name: string | null;
  estimated_total: number;
  item_count: number;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  order_item_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;                     // generated = qty * unit_price
  sort_order: number;
  created_at: string;
}

export interface Payment {
  id: string;
  lab_id: string | null;
  invoice_id: string;
  amount: number;
  payment_date: string;              // YYYY-MM-DD
  payment_method: PaymentMethod;
  reference_no: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
  // Joined
  receiver?: { id: string; full_name: string } | null;
}

// ─── View ──────────────────────────────────────────────────────────────────

export interface ClinicBalance {
  clinic_id: string;
  clinic_name: string;
  lab_id: string | null;
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  balance: number;                   // = total_billed - total_paid
  overdue_amount: number;
  oldest_overdue_date: string | null;
  // Aging buckets (migration 063) — null geriye uyumlu
  aging_current?: number;            // vadesi gelmemiş
  aging_30?: number;                 // 1–30 gün gecikmiş
  aging_60?: number;                 // 31–60 gün gecikmiş
  aging_90?: number;                 // 61+ gün gecikmiş
}

// ─── Form / Create parametreleri ───────────────────────────────────────────

export interface CreateInvoiceParams {
  doctor_id: string;
  clinic_id?: string | null;
  work_order_id?: string | null;
  issue_date?: string;               // YYYY-MM-DD (default: today)
  due_date?: string | null;          // YYYY-MM-DD
  tax_rate?: number;                 // default 20
  notes?: string;
  items: Array<Omit<InvoiceItemInput, 'sort_order'>>;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unit_price: number;
  order_item_id?: string | null;
  sort_order?: number;
}

/**
 * Toplu fatura RPC parametreleri
 * create_bulk_invoice(p_clinic_id, p_work_order_ids[], p_due_days, p_notes)
 */
export interface CreateBulkInvoiceParams {
  clinic_id: string;
  work_order_ids: string[];
  due_days?: number;                 // default 30
  notes?: string | null;
}

export interface RecordPaymentParams {
  invoice_id: string;
  amount: number;
  payment_date?: string;             // default today
  payment_method?: PaymentMethod;    // default nakit
  reference_no?: string;
  notes?: string;
}

// ─── Filtreler (liste ekranı) ──────────────────────────────────────────────

export interface InvoiceListFilters {
  status?: InvoiceStatus | 'all';
  clinic_id?: string;
  doctor_id?: string;
  date_from?: string;                // YYYY-MM-DD
  date_to?: string;
  overdue_only?: boolean;
  search?: string;                   // invoice_number veya hasta adı
}
