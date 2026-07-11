// /dev/order-detail — V2 handoff Order Detail mockup (public)
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/orders/screens/OrderDetailMockup'), 'OrderDetailMockup');
