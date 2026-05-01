/**
 * Provider Registry
 *
 * Yeni bir entegratör eklediğinde buraya kaydet:
 *   PROVIDERS['nilvera'] = new NilveraProvider(config);
 *
 * Aktif provider, lab.efatura_provider veya ortam değişkeninden seçilir.
 */
import { BaseEFaturaProvider } from './BaseProvider';
import { DemoProvider } from './DemoProvider';

let activeProvider: BaseEFaturaProvider | null = null;

/** Şu an aktif provider'ı döner. Yoksa Demo'yu kullanır. */
export function getActiveProvider(): BaseEFaturaProvider {
  if (!activeProvider) {
    activeProvider = new DemoProvider();
  }
  return activeProvider;
}

/** Provider'ı runtime'da değiştir (lab ayarları sayfasından çağrılır) */
export function setActiveProvider(provider: BaseEFaturaProvider): void {
  activeProvider = provider;
}

export { BaseEFaturaProvider, DemoProvider };
