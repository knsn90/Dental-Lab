import { lazyRoute } from '../../core/_lazyRoute';
const SuppliersScreen = lazyRoute(() => import('../../modules/suppliers/screens/SuppliersScreen'), 'SuppliersScreen');

// Lab paneli — mavi accent
export default function LabSuppliersScreen() {
  return <SuppliersScreen accentColor="#2563EB" />;
}
