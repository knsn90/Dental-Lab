/**
 * Payment Provider Registry
 *
 * Yeni provider eklediğinde:
 *   PROVIDERS['iyzico'] = new IyzicoProvider(config);
 */
import { BasePaymentProvider } from './BaseProvider';
import { DemoPaymentProvider } from './DemoProvider';

let activeProvider: BasePaymentProvider | null = null;

export function getActivePaymentProvider(): BasePaymentProvider {
  if (!activeProvider) {
    activeProvider = new DemoPaymentProvider();
  }
  return activeProvider;
}

export function setActivePaymentProvider(provider: BasePaymentProvider): void {
  activeProvider = provider;
}

export { BasePaymentProvider, DemoPaymentProvider };
