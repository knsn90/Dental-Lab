import React from 'react';
const NewOrderScreen = lazyRoute(() => import('../../modules/orders/screens/NewOrderScreen'), 'NewOrderScreen');
import { lazyRoute } from '../../core/_lazyRoute';

/**
 * Lab paneli — yeni iş emri oluşturma.
 * Panel teması: lab mavi (#2563EB) · Başlık: "Yeni İş Emri".
 */
export default function LabNewOrderRoute() {
  return <NewOrderScreen panel="lab" />;
}
