import { lazyRoute } from '../../../core/_lazyRoute';
const OrderDetailScreenV2 = lazyRoute(() => import('../../../modules/orders/screens/OrderDetailScreenV2'), 'OrderDetailScreenV2');

export default function DevOrderDetailV2Route() {
  return <OrderDetailScreenV2 />;
}
