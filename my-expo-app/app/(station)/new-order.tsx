import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';

const NewOrderScreen = lazyRoute(() => import('../../modules/orders/screens/NewOrderScreen'), 'NewOrderScreen');

/**
 * Teknisyen istasyon paneli — yeni iş emri.
 * Sadece `manage_orders` yetkisi verilen teknisyenler erişir (nav koşullu).
 * Teknisyen bir lab kullanıcısı olduğundan lab akışı (klinik + hekim seçimli) kullanılır.
 */
export default function StationNewOrderRoute() {
  return <NewOrderScreen panel="station" />;
}
