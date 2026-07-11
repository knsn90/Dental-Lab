// modules/orders/machines/registry.ts
// integration_kind → adapter constructor mapping.
// Yeni makine entegrasyonu eklerken: adapter'ı yaz, buraya kaydet.

import type { MachineAdapter, MachineKind, AdapterConstructorArgs } from './types';
import { MockMachineAdapter } from './MockMachineAdapter';

type AdapterFactory = (args: AdapterConstructorArgs) => MachineAdapter;

const ADAPTER_FACTORIES: Partial<Record<MachineKind, AdapterFactory>> = {
  mock: (args) => new MockMachineAdapter(args),
  // İleride:
  // medit:           (args) => new MeditAdapter(args),
  // exocad:          (args) => new ExocadAdapter(args),
  // zirkonzahn_m5:   (args) => new ZirkonzahnM5Adapter(args),
  // 3shape:          (args) => new ThreeShapeAdapter(args),
  // generic_ocr:     (args) => new GenericOcrAdapter(args),
};

export function getMachineAdapter(
  integrationKind: string | null | undefined,
  args: AdapterConstructorArgs,
): MachineAdapter | null {
  if (!integrationKind) return null;
  const factory = ADAPTER_FACTORIES[integrationKind as MachineKind];
  if (!factory) {
    console.warn(`[machines] No adapter registered for kind: ${integrationKind}`);
    return null;
  }
  return factory(args);
}

export function isAdapterAvailable(integrationKind: string | null | undefined): boolean {
  if (!integrationKind) return false;
  return ADAPTER_FACTORIES[integrationKind as MachineKind] !== undefined;
}
