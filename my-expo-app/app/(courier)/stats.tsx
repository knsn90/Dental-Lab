import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/courier/screens/CourierStatsScreen').then(m => ({ default: m.CourierStatsScreen })),
);
