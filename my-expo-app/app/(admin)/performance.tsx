import { lazyRoute } from '../../core/_lazyRoute';
const PerformanceScreen = lazyRoute(() => import('../../modules/performance/screens/PerformanceScreen'), 'PerformanceScreen');

export default function AdminPerformancePage() {
  return <PerformanceScreen />;
}
