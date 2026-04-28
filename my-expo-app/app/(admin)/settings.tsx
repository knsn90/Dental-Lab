import { useRouter } from 'expo-router';
import { SettingsScreen } from '../../modules/settings/SettingsScreen';

export default function AdminSettingsPage() {
  const router = useRouter();
  return (
    <SettingsScreen
      config={{
        panelType: 'admin',
        panelLabel: 'Yönetim',
        defaultAccent: '#0F172A',
      }}
      onBack={() => router.back()}
    />
  );
}
