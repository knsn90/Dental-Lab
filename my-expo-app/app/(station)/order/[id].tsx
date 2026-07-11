import { lazyRoute } from '../../../core/_lazyRoute';

// Teknisyen istasyon paneli — sipariş detayı (view_orders yetkili teknisyene).
export default lazyRoute(() => import('../../../modules/orders/screens/OrderDetailScreenV2'), 'OrderDetailScreenV2');
