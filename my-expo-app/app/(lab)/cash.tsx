import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const CashScreen = lazyRoute(() => import('../../modules/cash/screens/CashScreen'), 'CashScreen');

export default function LabCashRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <CashScreen />
    </PermissionGate>
  );
}
