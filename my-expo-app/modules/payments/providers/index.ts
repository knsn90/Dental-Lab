/**
 * Payment Provider Registry
 *
 * - DB'deki provider_credentials tablosundan aktif sağlayıcıyı okur
 * - Cache TTL: 60 sn
 * - Yeni provider eklemek için PROVIDER_FACTORY map'ine kaydet
 */
import { BasePaymentProvider } from './BaseProvider';
import { DemoPaymentProvider } from './DemoProvider';
import { getActiveCredential } from '../../integrations/api';

type Factory = (cfg: any) => BasePaymentProvider;

const PROVIDER_FACTORY: Record<string, Factory> = {
  demo: (cfg) => new DemoPaymentProvider(cfg),
  // Yeni eklenecekler:
  // iyzico: (cfg) => new IyzicoProvider(cfg),
  // paytr:  (cfg) => new PaytrProvider(cfg),
  // param:  (cfg) => new ParamProvider(cfg),
};

let cachedProvider: BasePaymentProvider | null = null;
let cachedAt = 0;
const TTL = 60 * 1000;

/** Aktif POS provider — DB'deki credential'a göre. Cache'li (60sn). */
export async function getActivePaymentProvider(): Promise<BasePaymentProvider> {
  if (cachedProvider && Date.now() - cachedAt < TTL) return cachedProvider;

  const cred = await getActiveCredential('payment');
  const key  = cred?.provider ?? 'demo';
  const factory = PROVIDER_FACTORY[key] ?? PROVIDER_FACTORY.demo;
  cachedProvider = factory({ ...cred?.credentials, environment: cred?.environment ?? 'sandbox' });
  cachedAt = Date.now();
  return cachedProvider;
}

export function invalidatePaymentProviderCache(): void {
  cachedProvider = null;
  cachedAt = 0;
}

export function setActivePaymentProvider(provider: BasePaymentProvider): void {
  cachedProvider = provider;
  cachedAt = Date.now();
}

export { BasePaymentProvider, DemoPaymentProvider };
