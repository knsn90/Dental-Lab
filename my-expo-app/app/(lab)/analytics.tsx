import { lazyRoute } from '../../core/_lazyRoute';
// app/(lab)/analytics.tsx
export default lazyRoute(() => import('../../modules/station/screens/AnalyticsScreen'), 'AnalyticsScreen');
