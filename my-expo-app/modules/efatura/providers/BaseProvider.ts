/**
 * BaseProvider — Tüm e-Fatura entegratörlerinin uyması gereken arayüz
 *
 * Yeni entegratör ekleme adımları:
 *   1. providers/<Provider>Provider.ts oluştur, BaseProvider'ı extend et
 *   2. send/queryStatus/cancel/checkMukellef metodlarını implementli yap
 *   3. providers/index.ts'de PROVIDERS map'ine ekle
 *   4. lab.efatura_provider alanı bu key olarak kaydedilebilir
 */
import type {
  EFaturaInvoice,
  EFaturaSendResult,
  EFaturaQueryResult,
  MukellefCheckResult,
} from '../types';

export interface ProviderConfig {
  api_url:     string;
  api_key?:    string;
  username?:   string;
  password?:   string;
  /** sandbox / production */
  environment: 'sandbox' | 'production';
  /** Lab VKN — provider auth için bazılarında gerekli */
  lab_vkn?:    string;
  [key: string]: any;
}

export abstract class BaseEFaturaProvider {
  /** Provider'ı tanımlayan benzersiz key (örn. 'nilvera', 'efinans') */
  abstract readonly key: string;
  /** Kullanıcıya gösterilen isim */
  abstract readonly displayName: string;

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  /** Faturayı entegratöre gönder */
  abstract send(invoice: EFaturaInvoice): Promise<EFaturaSendResult>;

  /** Bir UUID için durum sorgula */
  abstract queryStatus(uuid: string): Promise<EFaturaQueryResult>;

  /** Faturayı iptal et (gönderilmiş ise) */
  abstract cancel(uuid: string, reason?: string): Promise<EFaturaSendResult>;

  /** GİB Mükellef sorgusu (e-Fatura mı e-Arşiv mi karar için) */
  abstract checkMukellef(vkn: string): Promise<MukellefCheckResult>;
}
