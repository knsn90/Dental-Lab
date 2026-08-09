import React from 'react';
import { FinanceHubScreen } from '../../../modules/finance/screens/FinanceHubScreen';
import { PurchaseInvoiceDetailScreen } from '../../../modules/purchases/screens/PurchaseInvoiceDetailScreen';

/**
 * Derin bağlantı: satın alma faturası tek başına açıldığında da finans
 * kabuğu korunur — kenar çubuğu kaybolmaz.
 */
export default function PurchaseInvoiceRoute() {
  return (
    <FinanceHubScreen
      forceActiveKey="suppliers"
      overrideContent={<PurchaseInvoiceDetailScreen />}
    />
  );
}
