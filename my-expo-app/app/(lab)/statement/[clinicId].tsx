import React from 'react';
import { FinanceHubScreen } from '../../../modules/finance/screens/FinanceHubScreen';
import { ClinicStatementScreen } from '../../../modules/invoices/screens/ClinicStatementScreen';

export default function StatementRoute() {
  return (
    <FinanceHubScreen
      forceActiveKey="clinic_balance"
      overrideContent={<ClinicStatementScreen />}
    />
  );
}
