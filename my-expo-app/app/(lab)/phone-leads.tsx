import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/phone-leads/screens/PhoneLeadsScreen'), 'PhoneLeadsScreen');
