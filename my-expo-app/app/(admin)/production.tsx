// app/(admin)/production.tsx — Canlı Üretim Panosu (stage kanban)
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/station/screens/ProductionKanbanScreen'), 'ProductionKanbanScreen');
