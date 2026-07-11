import { lazyRoute } from '../../core/_lazyRoute';
// app/(station)/settings.tsx
// Teknisyen ayarlar — diğer panellerle aynı SettingsHubScreen
// (Profil + Bildirimler + Genel sekmeleri, sol sidebar'lı).
export default lazyRoute(() => import('../../modules/settings/screens/SettingsHubScreen'), 'SettingsHubScreen');
