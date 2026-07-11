import { lazyRoute } from '../../core/_lazyRoute';
// app/(lab)/courier.tsx
// Kurye ekranı — lab paneli altında kurye rolündeki kullanıcılara açık
export default lazyRoute(() => import('../../modules/delivery/screens/CourierDeliveryScreen'), 'CourierDeliveryScreen');
