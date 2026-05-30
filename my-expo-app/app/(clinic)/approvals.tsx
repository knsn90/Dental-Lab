import { useColorThemeStore } from '../../core/store/colorThemeStore';
import { ApprovalsScreen } from '../../modules/orders/screens/ApprovalsScreen';

export default function ClinicApprovalsPage() {
  const { getTheme } = useColorThemeStore();
  const accentColor = getTheme('clinic_admin').primary ?? '#6BA888';
  return <ApprovalsScreen accentColor={accentColor} />;
}
