import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const FinanceHubScreen = lazyRoute(() => import('../../modules/finance/screens/FinanceHubScreen'), 'FinanceHubScreen');

export default function LabFinanceRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <FinanceHubScreen />
    </PermissionGate>
  );
}
