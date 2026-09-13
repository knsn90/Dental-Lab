// Tam ekran harita — kurye YALNIZ kendi teslimatlarını görür (courierId ile scope;
// eskiden CourierTrackingScreen filtresiz açılıp tüm kuryelerin işlerini gösteriyordu).
import { lazyRoute } from '../../core/_lazyRoute';
import { useAuthStore } from '../../core/store/authStore';
import { DS } from '../../core/theme/dsTokens';

const TrackingScreen = lazyRoute(
  () => import('../../modules/courier/CourierTrackingScreen').then(m => ({ default: (m as any).CourierTrackingScreen ?? (m as any).default })),
);

export default function CourierMapRoute() {
  const profile = useAuthStore(s => s.profile);
  return (
    <TrackingScreen
      accent={DS.tech.primary}
      pageBg={DS.tech.bg}
      routePrefix="/(courier)"
      courierId={profile?.id}
    />
  );
}
