import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/support/screens/SupportScreen'), 'SupportScreen');
