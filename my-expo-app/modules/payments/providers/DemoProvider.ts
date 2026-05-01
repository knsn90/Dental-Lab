/**
 * DemoProvider — Sandbox/test POS provider'ı
 *
 *   • Gerçek HTTP yapmaz
 *   • CVC '000' → fail, '999' → 3DS pending, diğer → otomatik success
 *   • Taksit: BIN ilk hanesi 4 (Visa) → 1,2,3,6 / 5 (Master) → 1,2,3,6,9,12
 */
import { BasePaymentProvider, type PaymentProviderConfig } from './BaseProvider';
import type {
  PaymentIntent, CardInput, ChargeInitResult, ChargeQueryResult,
  RefundResult, InstallmentOption,
} from '../types';

export class DemoPaymentProvider extends BasePaymentProvider {
  readonly key = 'demo';
  readonly displayName = 'Demo POS (Sandbox)';

  constructor(config?: Partial<PaymentProviderConfig>) {
    super({
      api_url: 'https://demo.local',
      environment: 'sandbox',
      ...config,
    });
  }

  async charge3D(intent: PaymentIntent, card: CardInput): Promise<ChargeInitResult> {
    if (!card.holder_name || !card.number || !card.cvc) {
      return { ok: false, error: 'Kart bilgileri eksik', error_code: 'MISSING_FIELDS' };
    }
    if (card.number.replace(/\s/g, '').length < 15) {
      return { ok: false, error: 'Geçersiz kart numarası', error_code: 'INVALID_CARD' };
    }

    await new Promise(r => setTimeout(r, 400));

    // Test CVC kuralları
    if (card.cvc === '000') {
      return {
        ok: false,
        error: 'Yetersiz bakiye (sandbox)',
        error_code: 'INSUFFICIENT_FUNDS',
        status: 'failed',
      };
    }

    const providerRef = 'demo_' + Math.random().toString(36).slice(2, 10);

    // 3DS pending ise HTML iframe içeriği döner
    if (card.cvc === '999') {
      return {
        ok: true,
        provider_ref: providerRef,
        status: 'awaiting_3ds',
        threeds_html: `
          <html><body style="font-family:sans-serif;padding:24px;text-align:center">
            <h2>Sandbox 3DS Doğrulama</h2>
            <p>SMS kodu: <b>123456</b></p>
            <button onclick="parent.postMessage({type:'demo-3ds-success',ref:'${providerRef}'},'*')"
              style="padding:12px 24px;background:#10B981;color:#fff;border:0;border-radius:8px;font-size:16px;cursor:pointer">
              Onayla
            </button>
          </body></html>`,
      };
    }

    // Otomatik success — direkt paid
    return {
      ok: true,
      provider_ref: providerRef,
      status: 'paid',
    };
  }

  async query(providerRef: string): Promise<ChargeQueryResult> {
    await new Promise(r => setTimeout(r, 200));
    return {
      ok: true,
      status: 'paid',
      raw_response: { provider_ref: providerRef, status: 'paid' },
    };
  }

  async refund(providerRef: string, amount?: number): Promise<RefundResult> {
    await new Promise(r => setTimeout(r, 200));
    return {
      ok: true,
      refunded_amount: amount,
      status: amount === undefined ? 'refunded' : 'partially_refunded',
      raw_response: { provider_ref: providerRef, refunded: amount },
    };
  }

  async getInstallments(binNumber: string, amount: number): Promise<InstallmentOption[]> {
    await new Promise(r => setTimeout(r, 100));
    const first = binNumber[0];
    const counts = first === '5' ? [1, 2, 3, 6, 9, 12] : [1, 2, 3, 6];
    return counts.map(c => ({
      count: c,
      monthly_amount: +(amount / c).toFixed(2),
      total_amount: amount,
      commission_rate: c === 1 ? 0 : 0.5 + (c - 1) * 0.3,
    }));
  }
}
