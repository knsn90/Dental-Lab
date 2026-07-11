import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/profile/screens/ProfileScreen'), 'ProfileScreen');
