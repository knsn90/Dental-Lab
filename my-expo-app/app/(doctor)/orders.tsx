import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/orders/screens/OrdersListScreenV2'), 'OrdersListScreenV2');
