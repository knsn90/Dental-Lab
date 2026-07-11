import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/approvals/AdminApprovalsScreen'), 'AdminApprovalsScreen');
