import { lazyRoute } from '../../core/_lazyRoute';
const SuppliersScreen = lazyRoute(() => import('../../modules/suppliers/screens/SuppliersScreen'), 'SuppliersScreen');

// Yönetim paneli — coral accent
export default function AdminSuppliersScreen() {
  return <SuppliersScreen accentColor="#4771AB" />;
}
