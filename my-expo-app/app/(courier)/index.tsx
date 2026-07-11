import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/courier/screens/CourierDashboardScreen').then(m => ({ default: m.CourierDashboardScreen })),
);
