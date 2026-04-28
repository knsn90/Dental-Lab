import { useRouter } from 'expo-router';
import { SettingsScreen } from '../../modules/settings/SettingsScreen';

export default function DoctorSettingsPage() {
  const router = useRouter();
  return (
    <SettingsScreen
      config={{
        panelType: 'doctor',
        panelLabel: 'Hekim',
        defaultAccent: '#0EA5E9',
      }}
      onBack={() => router.back()}
    />
  );
}
