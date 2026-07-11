// app/(courier)/delivery/[id].tsx — Kurye teslimat detay route'u
import { lazyRoute } from '../../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../../modules/courier/screens/CourierDeliveryDetailScreen').then(m => ({ default: m.CourierDeliveryDetailScreen })),
);
