// app/(lab)/support.tsx — menüdeki yetki anahtarıyla aynı kapı (view_support)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const Screen = lazyRoute(() => import('../../modules/support/screens/SupportScreen'), 'SupportScreen');

export default function LabSupportRoute() {
  return (
    <PermissionGate requires="view_support" fallback={<AccessDenied />}>
      <Screen />
    </PermissionGate>
  );
}
