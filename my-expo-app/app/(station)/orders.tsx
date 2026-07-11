import { lazyRoute } from '../../core/_lazyRoute';

// Teknisyen istasyon paneli — sipariş listesi (view_orders yetkili teknisyene).
// OrdersListScreenV2 panelGroup'u '(station)' algılar → lab verisi + station-içi navigasyon.
// Teknisyen (role: technician) için ekran otomatik read-only (yönetici aksiyonları gizli).
export default lazyRoute(() => import('../../modules/orders/screens/OrdersListScreenV2'), 'OrdersListScreenV2');
