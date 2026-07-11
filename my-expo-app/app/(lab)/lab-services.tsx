import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/services/screens/ServicesScreen'), 'ServicesScreen');
