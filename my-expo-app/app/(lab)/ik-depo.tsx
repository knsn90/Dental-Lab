import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const HRHubScreen = lazyRoute(() => import('../../modules/hr/screens/HRHubScreen'), 'HRHubScreen');

export default function LabIkDepoRoute() {
  return (
    <PermissionGate requires="view_team" fallback={<AccessDenied />}>
      <HRHubScreen />
    </PermissionGate>
  );
}
