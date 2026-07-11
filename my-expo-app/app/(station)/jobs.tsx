import { lazyRoute } from '../../core/_lazyRoute';
// app/(station)/jobs.tsx
// Teknisyen iş listesi (OperatorScreen) — atanmış aktif aşamalar.
export default lazyRoute(() => import('../../modules/orders/screens/OperatorScreen'), 'OperatorScreen');
