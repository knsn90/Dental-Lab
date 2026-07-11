import { lazyRoute } from '../../core/_lazyRoute';
// app/(station)/profile.tsx
// Teknisyen profil sayfası — diğer panellerle aynı ProfileScreen.
export default lazyRoute(() => import('../../modules/profile/screens/ProfileScreen'), 'ProfileScreen');
