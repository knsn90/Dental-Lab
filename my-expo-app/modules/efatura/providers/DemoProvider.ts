/**
 * DemoProvider — Sandbox/test entegratörü
 *
 * Gerçek HTTP çağrısı yapmaz. UUID üretir, "kabul edildi" döner.
 * Geliştirme aşamasında ve gerçek entegratör seçilmeden önce
 * tüm UI akışını uçtan uca test etmek için.
 *
 * Mukellef sorgusu: VKN'nin son hanesi çift ise registered=true,
 *                   tek ise false (deterministik test).
 */
import { BaseEFaturaProvider, type ProviderConfig } from './BaseProvider';
import type {
  EFaturaInvoice,
  EFaturaSendResult,
  EFaturaQueryResult,
  MukellefCheckResult,
} from '../types';

function randomUuid(): string {
  // RFC4122 v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class DemoProvider extends BaseEFaturaProvider {
  readonly key = 'demo';
  readonly displayName = 'Demo (Sandbox)';

  constructor(config?: Partial<ProviderConfig>) {
    super({
      api_url: 'https://demo.local',
      environment: 'sandbox',
      ...config,
    });
  }

  async send(invoice: EFaturaInvoice): Promise<EFaturaSendResult> {
    // Basit validation
    if (!invoice.lab.vkn) {
      return { ok: false, error: 'Lab VKN eksik', error_code: 'MISSING_LAB_VKN' };
    }
    if (invoice.type === 'e_fatura' && !invoice.customer.vkn) {
      return { ok: false, error: 'e-Fatura için müşteri VKN zorunlu', error_code: 'MISSING_CUSTOMER_VKN' };
    }
    if (invoice.items.length === 0) {
      return { ok: false, error: 'En az bir kalem zorunlu', error_code: 'EMPTY_ITEMS' };
    }

    // Sahte gecikme
    await new Promise(r => setTimeout(r, 300));

    const uuid = randomUuid();
    return {
      ok:           true,
      uuid,
      etag:         '1',
      status:       'sent',
      raw_request:  { invoice_number: invoice.invoice_number },
      raw_response: { uuid, accepted: true, environment: 'demo' },
      http_status:  200,
    };
  }

  async queryStatus(uuid: string): Promise<EFaturaQueryResult> {
    await new Promise(r => setTimeout(r, 200));
    return {
      ok:           true,
      status:       'accepted',
      raw_response: { uuid, status: 'accepted' },
    };
  }

  async cancel(uuid: string, reason?: string): Promise<EFaturaSendResult> {
    await new Promise(r => setTimeout(r, 200));
    return {
      ok:           true,
      uuid,
      status:       'cancelled',
      raw_response: { uuid, cancelled: true, reason },
    };
  }

  async checkMukellef(vkn: string): Promise<MukellefCheckResult> {
    await new Promise(r => setTimeout(r, 100));
    if (!vkn || ![10, 11].includes(vkn.length)) {
      return { ok: false, vkn, is_registered: false, error: 'Geçersiz VKN/TCKN' };
    }
    // Deterministik kural: son hane çift → mükellef
    const lastDigit = parseInt(vkn[vkn.length - 1], 10);
    const registered = !isNaN(lastDigit) && lastDigit % 2 === 0;
    return {
      ok:            true,
      vkn,
      is_registered: registered,
      alias:         registered ? `urn:mail:demo${vkn}@efatura.gov.tr` : undefined,
      title:         registered ? 'Demo Mükellef A.Ş.' : undefined,
      tax_office:    registered ? 'Demo Vergi Dairesi' : undefined,
    };
  }
}
