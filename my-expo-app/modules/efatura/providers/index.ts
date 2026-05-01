/**
 * Provider Registry
 *
 * - DB'deki provider_credentials tablosundan aktif sağlayıcıyı okur
 * - Cache TTL: 60 sn (kullanıcı entegratörü değiştirince hızlı yansır)
 * - Yeni provider eklemek için PROVIDER_FACTORY map'ine kaydet
 */
import { BaseEFaturaProvider } from './BaseProvider';
import { DemoProvider } from './DemoProvider';
import { getActiveCredential } from '../../integrations/api';

type Factory = (cfg: any) => BaseEFaturaProvider;

const PROVIDER_FACTORY: Record<string, Factory> = {
  demo: (cfg) => new DemoProvider(cfg),
  // Yeni eklenecekler:
  // nilvera: (cfg) => new NilveraProvider(cfg),
  // efinans: (cfg) => new EfinansProvider(cfg),
  // foriba:  (cfg) => new ForibaProvider(cfg),
};

let cachedProvider: BaseEFaturaProvider | null = null;
let cachedAt = 0;
const TTL = 60 * 1000;

/** Aktif provider — DB'deki credential'a göre. Cache'li (60sn). */
export async function getActiveProvider(): Promise<BaseEFaturaProvider> {
  if (cachedProvider && Date.now() - cachedAt < TTL) return cachedProvider;

  const cred = await getActiveCredential('efatura');
  const key  = cred?.provider ?? 'demo';
  const factory = PROVIDER_FACTORY[key] ?? PROVIDER_FACTORY.demo;
  cachedProvider = factory({ ...cred?.credentials, environment: cred?.environment ?? 'sandbox' });
  cachedAt = Date.now();
  return cachedProvider;
}

/** Cache'i geçersiz kıl (Ayarlar > Entegrasyonlar'da değişiklik sonrası) */
export function invalidateProviderCache(): void {
  cachedProvider = null;
  cachedAt = 0;
}

/** Manuel override (test amacıyla) */
export function setActiveProvider(provider: BaseEFaturaProvider): void {
  cachedProvider = provider;
  cachedAt = Date.now();
}

export { BaseEFaturaProvider, DemoProvider };
