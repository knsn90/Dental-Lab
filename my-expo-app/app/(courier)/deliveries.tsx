// Teslimatlarım — Aktif (sıradaki+taşınan) / Tamamlanan (geçmiş) sekmeli liste.
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/courier/screens/CourierDeliveriesScreen').then(m => ({ default: m.CourierDeliveriesScreen })),
);
