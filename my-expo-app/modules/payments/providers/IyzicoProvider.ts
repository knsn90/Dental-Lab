/**
 * IyzicoProvider — iyzico POS (Türkiye)
 *
 * DİKKAT: kart verisi ve ödeme kararı TARAYICIDA İŞLENMEZ. Gerçek çağrılar
 * `payments-charge` / `payments-callback` edge function'larında yapılır
 * (2026-08-02 güvenlik kararı: bir ödemeyi "paid" yapabilen tek yol sunucudur).
 *
 * Bu sınıf yalnız İSTEMCİ TARAFINDAKİ görünür yüz: sağlayıcı adı ve taksit
 * seçenekleri. `charge3D` bilerek desteklenmez — çağrılırsa hata döndürür ki
 * yanlışlıkla istemciden ödeme başlatılmasın.
 */
import { BasePaymentProvider, type PaymentProviderConfig } from './BaseProvider';
import type {
  PaymentIntent, CardInput, ChargeInitResult, ChargeQueryResult,
  RefundResult, InstallmentOption,
} from '../types';

export class IyzicoPaymentProvider extends BasePaymentProvider {
  readonly key = 'iyzico';
  readonly displayName = 'iyzico';

  constructor(config?: Partial<PaymentProviderConfig>) {
    super({
      api_url: 'https://sandbox-api.iyzipay.com',
      environment: 'sandbox',
      ...config,
    });
  }

  get isProduction(): boolean {
    return String(this.config.api_url ?? '').includes('api.iyzipay.com')
      && !String(this.config.api_url ?? '').includes('sandbox');
  }

  async charge3D(_intent: PaymentIntent, _card: CardInput): Promise<ChargeInitResult> {
    return {
      ok: false,
      error: 'iyzico ödemesi sunucu üzerinden başlatılır (payments-charge)',
      error_code: 'CLIENT_CHARGE_DISABLED',
    };
  }

  async query(_providerRef: string): Promise<ChargeQueryResult> {
    return { ok: false, error: 'Sorgulama sunucu tarafında yapılır' } as ChargeQueryResult;
  }

  async refund(_providerRef: string, _amount?: number): Promise<RefundResult> {
    return { ok: false, error: 'İade sunucu tarafında yapılır' } as RefundResult;
  }

  /**
   * Taksit seçenekleri. Gerçek oranlar iyzico BIN servisinden gelir
   * (/payment/iyzipos/installment); o uç da sunucuya taşınacak. Şimdilik
   * komisyonsuz peşin + yaygın taksit adetleri gösterilir, tutar bölünür.
   */
  async getInstallments(binNumber: string, amount: number): Promise<InstallmentOption[]> {
    const counts = binNumber?.[0] === '5' ? [1, 2, 3, 6, 9] : [1, 2, 3, 6];
    return counts.map(c => ({
      count: c,
      monthly_amount: +(amount / c).toFixed(2),
      total_amount: amount,
      commission_rate: 0,
    }));
  }
}
