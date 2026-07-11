// app/(admin)/workflows.tsx — Üretim Akışı Stüdyosu (görsel workflow builder)
import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/triage/screens/WorkflowStudioScreen'), 'WorkflowStudioScreen');
