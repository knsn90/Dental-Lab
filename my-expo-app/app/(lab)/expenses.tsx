import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const ExpensesScreen = lazyRoute(() => import('../../modules/expenses/screens/ExpensesScreen'), 'ExpensesScreen');

export default function LabExpensesRoute() {
  return (
    <PermissionGate requires="view_financials" fallback={<AccessDenied />}>
      <ExpensesScreen />
    </PermissionGate>
  );
}
