import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/expenses/screens/ExpensesScreen'), 'ExpensesScreen');
