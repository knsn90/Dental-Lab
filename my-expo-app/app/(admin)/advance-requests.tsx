import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/advance-requests/screens/AdvanceRequestsAdminScreen').then(m => ({ default: m.AdvanceRequestsAdminScreen })),
);
