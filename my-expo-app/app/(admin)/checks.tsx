import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/checks/screens/ChecksScreen'), 'ChecksScreen');
