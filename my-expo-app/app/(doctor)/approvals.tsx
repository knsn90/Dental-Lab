import { useColorThemeStore } from '../../core/store/colorThemeStore';
import { ApprovalsScreen } from '../../modules/orders/screens/ApprovalsScreen';

export default function DoctorApprovalsPage() {
  const { getTheme } = useColorThemeStore();
  const accentColor = getTheme('doctor').primary ?? '#6BA888';
  return <ApprovalsScreen accentColor={accentColor} />;
}
