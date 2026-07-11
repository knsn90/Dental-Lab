import { lazyRoute } from '../../core/_lazyRoute';
export default lazyRoute(() => import('../../modules/admin/users/LabUsersManagement'), 'LabUsersManagement');
