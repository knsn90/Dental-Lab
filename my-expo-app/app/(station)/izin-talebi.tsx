import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/leave-requests/screens/TechLeaveRequestsScreen').then(m => ({ default: m.TechLeaveRequestsScreen })),
);
