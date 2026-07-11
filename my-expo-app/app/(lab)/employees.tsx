import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/employees/screens/EmployeesScreen'), 'EmployeesScreen');
