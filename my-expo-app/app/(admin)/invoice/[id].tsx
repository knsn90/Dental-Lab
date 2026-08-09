import React from 'react';
import { FinanceHubScreen } from '../../../modules/finance/screens/FinanceHubScreen';
import { InvoiceDetailScreen } from '../../../modules/invoices/screens/InvoiceDetailScreen';

/**
 * Derin bağlantı: fatura tek başına açıldığında da finans kabuğu korunur —
 * kenar çubuğu kaybolmaz, kullanıcı bağlamdan kopmaz. (Ekstre rotası da
 * aynı kalıbı kullanıyor.)
 */
export default function InvoiceRoute() {
  return (
    <FinanceHubScreen
      forceActiveKey="invoices"
      overrideContent={<InvoiceDetailScreen />}
    />
  );
}
