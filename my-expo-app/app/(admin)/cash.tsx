import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/cash/screens/CashScreen'), 'CashScreen');
