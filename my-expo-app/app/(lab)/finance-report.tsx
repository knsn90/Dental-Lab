import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const FinanceReportScreen = lazyRoute(() => import('../../modules/finance/screens/FinanceReportScreen'), 'FinanceReportScreen');

export default function LabFinanceReportRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <FinanceReportScreen />
    </PermissionGate>
  );
}
