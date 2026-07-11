import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const ChecksScreen = lazyRoute(() => import('../../modules/checks/screens/ChecksScreen'), 'ChecksScreen');

export default function LabChecksRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <ChecksScreen />
    </PermissionGate>
  );
}
