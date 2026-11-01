import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/scans/screens/MyScanAppointmentsScreen'), 'MyScanAppointmentsScreen');
