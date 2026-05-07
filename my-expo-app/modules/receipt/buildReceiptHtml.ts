/**
 * Lab letterhead tipi — fatura/teslimat fişi/cari hesap özeti gibi
 * yazdırılabilir HTML şablonlarda kullanılır.
 *
 * Daha önce ayrı bir `buildReceiptHtml` modülü olduğu varsayılıyordu;
 * bu modül kaybolmuş ama tip referansı 4 dosyada hâlâ aktifti
 * (buildInvoiceHtml, buildStatementHtml, printInvoice, ClinicStatementScreen).
 *
 * Bu dosya o eksiği kapatır — sadece tip + opsiyonel placeholder
 * builder. İleride teslimat fişi şablonu yeniden yazılırsa burada
 * konumlanır.
 */

export interface LabLetterhead {
  /** Lab UUID — opsiyonel (cache key, vs.) */
  id?:         string;
  /** Lab/şirket adı — başlıkta görünür */
  name:        string;
  /** Açık adres — opsiyonel */
  address?:    string | null;
  /** İletişim telefonu — opsiyonel */
  phone?:      string | null;
  /** E-posta — opsiyonel */
  email?:      string | null;
  /** Website — opsiyonel */
  website?:    string | null;
  /** Vergi numarası / VKN — opsiyonel */
  tax_number?: string | null;
  /** Logo URL'si — opsiyonel */
  logo_url?:   string | null;
}
