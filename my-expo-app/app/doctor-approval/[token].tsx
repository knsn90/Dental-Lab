import { lazyRoute } from '../../core/_lazyRoute';
// app/doctor-approval/[token].tsx
// Public route — login gerektirmez, token ile pending tasarım onay sayfasını açar.
export default lazyRoute(() => import('../../modules/orders/screens/DoctorApprovalScreen'), 'DoctorApprovalScreen');
