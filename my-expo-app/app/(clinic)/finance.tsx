import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/finance-clinic/screens/FinanceHubScreen').then(m => ({ default: m.ClinicFinanceHubScreen })),
);
