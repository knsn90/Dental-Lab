import { lazyRoute } from '../../core/_lazyRoute';
const PermissionsScreen = lazyRoute(() => import('../../modules/admin/permissions/PermissionsScreen'), 'PermissionsScreen');

export default function AdminPermissionsPage() {
  return <PermissionsScreen />;
}
