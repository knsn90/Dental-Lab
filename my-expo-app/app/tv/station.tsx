import { lazyRoute } from '../../core/_lazyRoute';
// Teknisyen İSTASYON KİOSK (TV, D-pad): iş listesi → detay → Başla/Tamamla + dosyalar.
export default lazyRoute(() => import('../../modules/tv/StationKioskScreen').then(m => ({ default: m.StationKioskScreen })));
