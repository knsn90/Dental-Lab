import { lazyRoute } from '../../core/_lazyRoute';
const ClinicsScreen = lazyRoute(() => import('../../modules/clinics/screens/ClinicsScreen'));
export default function LabClinicsPage() {
  return <ClinicsScreen />;
}
