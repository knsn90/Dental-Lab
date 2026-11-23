// app/(lab)/clinics.tsx — menüdeki yetki anahtarıyla aynı kapı (view_customers)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const ClinicsScreen = lazyRoute(() => import('../../modules/clinics/screens/ClinicsScreen'));

export default function LabClinicsPage() {
  return (
    <PermissionGate requires="view_customers" fallback={<AccessDenied />}>
      <ClinicsScreen />
    </PermissionGate>
  );
}
