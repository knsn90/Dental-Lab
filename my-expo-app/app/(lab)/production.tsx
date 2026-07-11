import { lazyRoute } from '../../core/_lazyRoute';
// app/(lab)/production.tsx
export default lazyRoute(() => import('../../modules/station/screens/ProductionKanbanScreen'), 'ProductionKanbanScreen');
