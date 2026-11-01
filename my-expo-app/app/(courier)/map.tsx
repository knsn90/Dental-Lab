// Tam ekran harita — kurye YALNIZ kendi teslimatlarını görür (courierId ile scope;
// eskiden CourierTrackingScreen filtresiz açılıp tüm kuryelerin işlerini gösteriyordu).
import { lazyRoute } from '../../core/_lazyRoute';
import { useAuthStore } from '../../core/store/authStore';
import { DS } from '../../core/theme/dsTokens';
import { MOBILE_PANEL_THEMES } from '../../core/theme/mobileDesignTokens';

const TrackingScreen = lazyRoute(
  () => import('../../modules/courier/CourierTrackingScreen').then(m => ({ default: (m as any).CourierTrackingScreen ?? (m as any).default })),
);

export default function CourierMapRoute() {
  const profile = useAuthStore(s => s.profile);
  return (
    <TrackingScreen
      accent={DS.tech.primary}
      // Sayfa zemini panelin bgPage'i (#F5F9FD) — DS.tech.bg (#EAF2FA) bir
      // "soft fill" tokenıdır; kabuk bgPage kullandığı için iki farklı mavi
      // çıkıyor ve harita paneli zeminden kopuk görünüyordu.
      pageBg={MOBILE_PANEL_THEMES.teknisyen.bgPage}
      routePrefix="/(courier)"
      courierId={profile?.id}
    />
  );
}
