// Liste — şu an Dashboard'daki listeyi yeniden render eder.
// İleride filtre / sort / arama için ayrı bir screen yazılabilir.
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(
  () => import('../../modules/courier/screens/CourierDashboardScreen').then(m => ({ default: m.CourierDashboardScreen })),
);
