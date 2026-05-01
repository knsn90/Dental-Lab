/**
 * Online Payments — Domain Types (provider-agnostic)
 */

export type PaymentStatus =
  | 'pending'
  | 'awaiting_3ds'
  | 'authorized'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentIntent {
  id:                string;
  lab_id:            string;
  invoice_id:        string;
  clinic_id:         string | null;
  doctor_id:         string | null;
  public_token:      string;
  amount:            number;
  currency:          'TRY' | 'USD' | 'EUR';
  installments:      number;
  commission_rate?:  number | null;
  commission_amount?:number | null;
  provider:          string;
  provider_ref?:     string | null;
  provider_token?:   string | null;
  status:            PaymentStatus;
  error_code?:       string | null;
  error_message?:    string | null;
  expires_at:        string;
  paid_at?:          string | null;
  refunded_at?:      string | null;
  created_at:        string;
  updated_at:        string;
}

/** Halka açık intent — anonim okuma sonucu */
export interface PublicPaymentIntent {
  intent_id:        string;
  amount:           number;
  currency:         string;
  installments:     number;
  status:           PaymentStatus;
  expires_at:       string;
  invoice_number:   string;
  invoice_due_date: string | null;
  clinic_name:      string | null;
  doctor_name:      string | null;
  lab_name:         string;
}

export interface InstallmentOption {
  count:           number;        // 1, 2, 3, 6, 9, 12
  monthly_amount:  number;
  total_amount:    number;
  /** Komisyon dahil edilirse (%): provider'a göre */
  commission_rate: number;
}

export interface CardInput {
  holder_name:   string;
  number:        string;          // boşluksuz 16 hane
  expire_month:  string;          // 'MM'
  expire_year:   string;          // 'YYYY' veya 'YY'
  cvc:           string;
  installment?:  number;
}

export interface ChargeInitResult {
  ok:              boolean;
  /** Provider tarafındaki referans (callback'te eşleşir) */
  provider_ref?:   string;
  /** 3DS HTML içeriği (Iframe içinde render edilir) */
  threeds_html?:   string;
  /** Veya 3DS başlatma URL'i (window.location ile yönlendirme) */
  threeds_url?:    string;
  status?:         PaymentStatus;
  error?:          string;
  error_code?:     string;
  raw_request?:    any;
  raw_response?:   any;
  http_status?:    number;
}

export interface ChargeQueryResult {
  ok:              boolean;
  status?:         PaymentStatus;
  paid_amount?:    number;
  error?:          string;
  raw_response?:   any;
}

export interface RefundResult {
  ok:              boolean;
  refunded_amount?:number;
  status?:         PaymentStatus;
  error?:          string;
  raw_response?:   any;
}
