import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/hr/screens/HRHubScreen'), 'HRHubScreen');
