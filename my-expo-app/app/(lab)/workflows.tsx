// app/(lab)/workflows.tsx — menüdeki yetki anahtarıyla aynı kapı (view_production)
import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const Screen = lazyRoute(() => import('../../modules/triage/screens/WorkflowStudioScreen'), 'WorkflowStudioScreen');

export default function LabWorkflowsRoute() {
  return (
    <PermissionGate requires="view_production" fallback={<AccessDenied />}>
      <Screen />
    </PermissionGate>
  );
}
