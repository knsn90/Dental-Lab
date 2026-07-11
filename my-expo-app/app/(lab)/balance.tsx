import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/invoices/screens/ClinicBalanceScreen'), 'ClinicBalanceScreen');
