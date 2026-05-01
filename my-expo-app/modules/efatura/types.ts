/**
 * e-Fatura — Domain Types
 *
 * Provider-agnostic. Tüm entegratörler bu tipleri kullanır.
 */

export type EFaturaType   = 'e_fatura' | 'e_arsiv';
export type EFaturaStatus = 'pending' | 'queued' | 'sent' | 'accepted' | 'rejected' | 'cancelled' | 'error';
export type EFaturaAction = 'send' | 'query' | 'cancel' | 'status_check';

export interface EFaturaLab {
  id:          string;
  name:        string;
  vkn:         string;        // 10 haneli VKN
  tax_office:  string;
  address:     string;
  city?:       string;
  district?:   string;
  postal_code?:string;
  phone?:      string;
  email?:      string;
  website?:    string;
}

export interface EFaturaCustomer {
  type:        'corporate' | 'individual';
  name:        string;        // şirket ünvanı veya kişi tam ad
  vkn?:        string | null; // corporate ise zorunlu
  tckn?:       string | null; // individual ise zorunlu
  tax_office?: string | null;
  address:     string;
  city?:       string | null;
  district?:   string | null;
  email?:      string | null;
  phone?:      string | null;
  /** GİB mükellef alias'ı (e-Fatura için zorunlu — provider belirler) */
  alias?:      string | null;
}

export interface EFaturaLineItem {
  description: string;
  quantity:    number;
  unit:        string;        // 'C62' (adet), 'NIU' (number), 'HUR' (saat) vb. UBL-TR
  unit_price:  number;
  tax_rate:    number;        // KDV % (20, 10, 1, 0)
  discount?:   number;        // tutar bazlı iskonto
  /** İsteğe bağlı GTIP/HS kodu */
  hs_code?:    string;
}

export interface EFaturaInvoice {
  invoice_number: string;
  issue_date:     string;     // YYYY-MM-DD
  due_date?:      string | null;
  currency:       'TRY' | 'USD' | 'EUR';
  type:           EFaturaType;
  lab:            EFaturaLab;
  customer:       EFaturaCustomer;
  items:          EFaturaLineItem[];
  /** Notes / explanation */
  notes?:         string | null;
}

// ─── Provider Result Types ─────────────────────────────────────────────
export interface EFaturaSendResult {
  ok:            boolean;
  uuid?:         string;       // entegratör tarafından üretilen UUID
  etag?:         string;
  status?:       EFaturaStatus;
  /** Düz, kullanıcıya gösterilebilecek hata mesajı */
  error?:        string;
  /** Ham hata kodu (provider-specific) */
  error_code?:   string;
  /** Ham response (debug + log) */
  raw_response?: any;
  /** Ham request (log için) */
  raw_request?:  any;
  http_status?:  number;
}

export interface EFaturaQueryResult {
  ok:           boolean;
  status?:      EFaturaStatus;
  error?:       string;
  raw_response?: any;
}

export interface MukellefCheckResult {
  ok:            boolean;
  vkn:           string;
  is_registered: boolean;
  alias?:        string;
  title?:        string;
  tax_office?:   string;
  error?:        string;
}
