/**
 * usePermissions — Convenience hook for RBAC permission checks
 *
 * Usage:
 *   const { can, canAny } = usePermissions();
 *   if (!can('view_orders')) return <NoAccess />;
 *   {can('view_cost') && <CostCard />}
 */
import { useEffect } from 'react';
import { usePermissionStore, PermissionKey } from '../store/permissionStore';
import { useAuthStore } from '../store/authStore';

export function usePermissions() {
  const session = useAuthStore(s => s.session);
  const { can, canAny, canAll, loaded, loading, fetchPermissions, clear } = usePermissionStore();

  // Auto-fetch when session exists but permissions not loaded
  useEffect(() => {
    if (session && !loaded && !loading) {
      fetchPermissions();
    }
    if (!session) {
      clear();
    }
  }, [session, loaded, loading]);

  return { can, canAny, canAll, loaded, loading, refetch: fetchPermissions };
}

/**
 * Standalone can() — for use outside React components (e.g. in callbacks)
 */
export function can(key: PermissionKey): boolean {
  return usePermissionStore.getState().can(key);
}

export type { PermissionKey };
