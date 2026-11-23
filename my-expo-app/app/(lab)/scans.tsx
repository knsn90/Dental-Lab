// app/(lab)/scans.tsx — menüdeki yetki anahtarıyla aynı kapı (view_scan_appointments)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const Screen = lazyRoute(() => import('../../modules/scans/screens/ScanAppointmentsScreen'), 'ScanAppointmentsScreen');

export default function LabScansRoute() {
  return (
    <PermissionGate requires="view_scan_appointments" fallback={<AccessDenied />}>
      <Screen />
    </PermissionGate>
  );
}
