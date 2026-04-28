import { useRouter } from 'expo-router';
import { SettingsScreen } from '../../modules/settings/SettingsScreen';

export default function ClinicSettingsPage() {
  const router = useRouter();
  return (
    <SettingsScreen
      config={{
        panelType: 'clinic_admin',
        panelLabel: 'Klinik Yönetimi',
        defaultAccent: '#0369A1',
      }}
      onBack={() => router.back()}
    />
  );
}
