// Tam ekran harita — şu an mevcut CourierTrackingScreen'i mount eder.
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/courier/CourierTrackingScreen').then(m => ({ default: (m as any).CourierTrackingScreen ?? (m as any).default })),
);
