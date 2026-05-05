/**
 * PermissionGate — Conditional rendering based on RBAC permissions
 *
 * Usage:
 *   <PermissionGate requires="view_cost">
 *     <CostCard />
 *   </PermissionGate>
 *
 *   <PermissionGate requiresAny={['view_orders', 'create_orders']} fallback={<NoAccess />}>
 *     <OrdersList />
 *   </PermissionGate>
 */
import React from 'react';
import { usePermissions, PermissionKey } from '../hooks/usePermissions';

interface PermissionGateProps {
  /** Single permission required */
  requires?: PermissionKey;
  /** Any of these permissions is sufficient */
  requiresAny?: PermissionKey[];
  /** All of these permissions are required */
  requiresAll?: PermissionKey[];
  /** What to render if permission denied (default: nothing) */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  requires,
  requiresAny,
  requiresAll,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { can, canAny, canAll, loaded } = usePermissions();

  // While loading, show nothing (avoid flash of forbidden content)
  if (!loaded) return null;

  let allowed = true;

  if (requires) {
    allowed = can(requires);
  } else if (requiresAny) {
    allowed = canAny(...requiresAny);
  } else if (requiresAll) {
    allowed = canAll(...requiresAll);
  }

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
