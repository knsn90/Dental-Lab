// Ekstre liste ayarı — kullanıcı: "ekstre sayfasına liste ayarı ekleyelim, kullanıcı
// karar versin ekstrede neleri açıp kapatacağını". Ekran + PDF + Excel aynı ayarı
// kullanır; tercih kullanıcıya özel, cihazda saklanır (hooks/useStatementPrefs).
// Saf yardımcı — içe aktarma yok (node --test doğrudan çalıştırır).

export interface StatementPrefs {
  /** KDV sütunu + sondaki KDV dökümü */
  vat: boolean;
  /** Hasta adı, sipariş no, hekim adı */
  details: boolean;
  /** Tahsilat satırları (kapalıyken yürüyen bakiye yine tahsilatları içerir) */
  payments: boolean;
  /** Durum etiketi (Kesildi/Ödendi) + revizyon notu */
  status: boolean;
}

export const DEFAULT_STATEMENT_PREFS: StatementPrefs = { vat: true, details: true, payments: true, status: true };

/** Saklanan JSON'u okur; bozuk/eksik alan varsayılana (açık) düşer. */
export function parseStatementPrefs(raw: string | null | undefined): StatementPrefs {
  if (!raw) return { ...DEFAULT_STATEMENT_PREFS };
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return { ...DEFAULT_STATEMENT_PREFS }; }
  const out = { ...DEFAULT_STATEMENT_PREFS };
  for (const k of Object.keys(out) as (keyof StatementPrefs)[]) {
    if (typeof obj?.[k] === 'boolean') out[k] = obj[k];
  }
  return out;
}

type PrefLine = {
  type: 'invoice' | 'payment';
  description: string;
  invoiceNo?: string | null;
  patientName?: string | null;
  orderNo?: string | null;
  doctorName?: string | null;
  status?: string;
  revisionOf?: string | null;
  revisionResponsible?: string | null;
  tax?: number;
  taxRate?: number;
};

/**
 * Görünür satırlar: kapalı alanlar boşaltılır, tahsilat kapalıysa satırları çıkar.
 * Tutar ve yürüyen bakiye DEĞİŞMEZ (önceden hesaplanmış satırlar üzerinde çalışır).
 */
export function applyStatementPrefs<L extends PrefLine>(lines: L[], p: StatementPrefs): L[] {
  const all = p.vat && p.details && p.payments && p.status;
  if (all) return lines;
  return lines
    .filter(l => p.payments || l.type !== 'payment')
    .map(l => {
      const o: L = { ...l };
      if (!p.details) {
        o.patientName = null;
        o.orderNo = null;
        o.doctorName = null;
        // Fatura açıklaması "Hasta — Fatura no" biçiminde; hasta adı kalmasın
        if (l.type === 'invoice') o.description = l.invoiceNo ?? l.description;
      }
      if (!p.status) {
        o.status = undefined;
        o.revisionOf = null;
        o.revisionResponsible = null;
      }
      if (!p.vat) {
        o.tax = undefined;
        o.taxRate = undefined;
      }
      return o;
    });
}
