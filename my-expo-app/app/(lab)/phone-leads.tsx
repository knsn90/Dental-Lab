// app/(lab)/phone-leads.tsx — menüdeki yetki anahtarıyla aynı kapı (view_customers)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const Screen = lazyRoute(() => import('../../modules/phone-leads/screens/PhoneLeadsScreen'), 'PhoneLeadsScreen');

export default function LabPhoneLeadsRoute() {
  return (
    <PermissionGate requires="view_customers" fallback={<AccessDenied />}>
      <Screen />
    </PermissionGate>
  );
}
