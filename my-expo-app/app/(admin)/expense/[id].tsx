import React from 'react';
import { FinanceHubScreen } from '../../../modules/finance/screens/FinanceHubScreen';
import { ExpenseDetailScreen } from '../../../modules/expenses/screens/ExpenseDetailScreen';

/**
 * Derin bağlantı: gider detayı tek başına açıldığında da finans kabuğu
 * korunur — kenar çubuğu kaybolmaz.
 */
export default function ExpenseRoute() {
  return (
    <FinanceHubScreen
      forceActiveKey="expenses"
      overrideContent={<ExpenseDetailScreen />}
    />
  );
}
