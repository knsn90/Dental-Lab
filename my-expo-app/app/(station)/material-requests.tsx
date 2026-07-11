import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/material-requests/screens/TechRequestsScreen').then(m => ({ default: m.TechRequestsScreen })),
);
