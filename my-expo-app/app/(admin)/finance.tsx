import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/finance/screens/FinanceHubScreen'), 'FinanceHubScreen');
