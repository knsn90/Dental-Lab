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

// ─── Gönderim önizlemesi ───────────────────────────────────────────────
// efatura-luca `preview` işleminin döndürdüğü özet — sunucudaki
// supabase/functions/_shared/lucaInvoice.ts → LucaPreview ile BİREBİR aynı şekil.
// Gönderimle aynı hazırlıktan üretilir; Luca'ya gitmez, DB'ye yazılmaz.
export interface EFaturaPreview {
  env: 'test' | 'prod';
  kind: 'e_fatura' | 'e_arsiv';
  scenario: 'TEMELFATURA' | 'TICARIFATURA' | null;
  sendingType: 'ELEKTRONIK' | 'KAGIT' | null;
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  crossRate: number | null;
  seller: { name: string; taxCode: string; taxOffice: string; address: string };
  receiver: { name: string; taxCode: string; taxOffice: string | null; address: string; email: string | null; inboxTag: string | null };
  lines: Array<{ name: string; note?: string | null; quantity: number; unitPrice: number; discount: number; vatRate: number; net: number; vat: number }>;
  totals: { net: number; discount: number; vat: number; payable: number; payableTry: number | null };
  notes: string[];
}

/** preview null → sağlayıcının önizlemesi yok (demo); panel yalnız onay sorar. */
export type EFaturaPreviewResult =
  /** previewToken: gerçek gönderimde ZORUNLU (sunucu önizlenen içerikle birebir eşleşmeyi doğrular). */
  | { ok: true; preview: EFaturaPreview | null; previewToken?: string; previewExpiresAt?: string }
  | { ok: false; error: string };

// ─── Provider Result Types ─────────────────────────────────────────────
export interface EFaturaSendResult {
  ok:            boolean;
  uuid?:         string;       // entegratör tarafından üretilen UUID
  etag?:         string;
  status?:       EFaturaStatus;
  /** Düz, kullanıcıya gösterilebilecek hata mesajı */
  error?:        string;
  /** Sunucu yeniden önizleme istedi (jeton yok / süresi doldu / fatura değişti) — hiçbir şey gönderilmedi. */
  needsPreview?: boolean;
  /** Ham hata kodu (provider-specific) */
  error_code?:   string;
  /** Ham response (debug + log) */
  raw_response?: any;
  /** Ham request (log için) */
  raw_request?:  any;
  http_status?:  number;
  /** Entegratörün resmi fatura numarası (Luca) */
  number?:       string | null;
  type?:         EFaturaType;
  /** Sonuç + log sunucuda yazıldı (Luca) — istemci tekrar yazmaz */
  persisted?:    boolean;
}

export interface EFaturaQueryResult {
  ok:           boolean;
  status?:      EFaturaStatus;
  error?:       string;
  raw_response?: any;
  number?:      string | null;
  /** Sonuç + log sunucuda yazıldı (Luca) — istemci tekrar yazmaz */
  persisted?:   boolean;
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
