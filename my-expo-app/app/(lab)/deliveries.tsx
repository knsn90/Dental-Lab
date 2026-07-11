import { lazyRoute } from '../../core/_lazyRoute';
// app/(lab)/deliveries.tsx
export default lazyRoute(() => import('../../modules/delivery/screens/DeliveryListScreen'), 'DeliveryListScreen');
