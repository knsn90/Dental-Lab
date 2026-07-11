import React from 'react';
import { lazyRoute } from '../../core/_lazyRoute';
import { PermissionGate } from '../../core/ui/PermissionGate';
import { AccessDenied } from '../../core/ui/AccessDenied';

const StockScreen = lazyRoute(() => import('../../modules/stock/screens/StockScreen'), 'StockScreen');

// Lab paneli — saffron accent
export default function LabStockScreen() {
  return (
    <PermissionGate requires="view_stock" fallback={<AccessDenied />}>
      <StockScreen accentColor="#F5C24B" />
    </PermissionGate>
  );
}
