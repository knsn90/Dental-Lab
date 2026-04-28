// app/(admin)/settings.tsx
// Admin Ayarlar — lab paneli ile aynı SettingsHubScreen (Kullanıcılar / QR
// Check-in / İstasyonlar / Genel Ayarlar tab'ları). Sadece panel teması
// "admin" olarak geçiyor.
import { SettingsHubScreen } from '../../modules/settings/screens/SettingsHubScreen';

export default function AdminSettingsPage() {
  return (
    <SettingsHubScreen
      panelType="admin"
      panelLabel="Yönetim"
      defaultAccent="#0F172A"
    />
  );
}
