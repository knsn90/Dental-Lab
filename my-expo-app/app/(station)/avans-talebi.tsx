import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/advance-requests/screens/TechAdvanceRequestsScreen').then(m => ({ default: m.TechAdvanceRequestsScreen })),
);
