import React from 'react';
import { FinanceHubScreen } from '../../../modules/finance/screens/FinanceHubScreen';
import { ClinicStatementScreen } from '../../../modules/invoices/screens/ClinicStatementScreen';

/**
 * /statement/[clinicId] → Finans Hub içinde, "Sağlık Kurumları" tab aktif olarak
 * Klinik Hesap Ekstresi'ni render eder. Finans sidebar görünür kalır.
 */
export default function StatementRoute() {
  return (
    <FinanceHubScreen
      forceActiveKey="clinic_balance"
      overrideContent={<ClinicStatementScreen />}
    />
  );
}
