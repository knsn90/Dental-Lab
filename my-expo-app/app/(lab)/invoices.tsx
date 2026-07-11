import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const InvoicesListScreen = lazyRoute(() => import('../../modules/invoices/screens/InvoicesListScreen'), 'InvoicesListScreen');

export default function LabInvoicesRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <InvoicesListScreen />
    </PermissionGate>
  );
}
