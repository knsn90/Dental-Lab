/**
 * BasePaymentProvider — Tüm POS entegratörlerinin uyması gereken arayüz
 *
 * Yeni entegratör eklemek için:
 *   1. providers/<Name>Provider.ts → BasePaymentProvider extend
 *   2. 4 metot: charge3D, query, refund, getInstallments
 *   3. providers/index.ts'de PROVIDERS'a kaydet
 */
import type {
  PaymentIntent, CardInput, ChargeInitResult, ChargeQueryResult,
  RefundResult, InstallmentOption,
} from '../types';

export interface PaymentProviderConfig {
  api_url:     string;
  api_key?:    string;
  secret_key?: string;
  merchant_id?:string;
  environment: 'sandbox' | 'production';
  /** Callback URL'i — provider 3DS tamamlandığında buraya yönlendirir */
  callback_url?: string;
  [key: string]: any;
}

export abstract class BasePaymentProvider {
  abstract readonly key: string;
  abstract readonly displayName: string;

  protected config: PaymentProviderConfig;

  constructor(config: PaymentProviderConfig) {
    this.config = config;
  }

  /** 3DS akışı başlat → HTML/URL döner */
  abstract charge3D(
    intent: PaymentIntent,
    card:   CardInput,
  ): Promise<ChargeInitResult>;

  /** Provider tarafında ödeme durumu sorgu */
  abstract query(providerRef: string): Promise<ChargeQueryResult>;

  /** İade et (kısmi veya tam) */
  abstract refund(
    providerRef: string,
    amount?:     number,
  ): Promise<RefundResult>;

  /** BIN'e göre taksit seçenekleri */
  abstract getInstallments(
    binNumber: string,
    amount:    number,
  ): Promise<InstallmentOption[]>;
}
