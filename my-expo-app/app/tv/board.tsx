import { lazyRoute } from '../../core/_lazyRoute';
// Lab izle-only CANLI PANO (TV duvar ekranı)
export default lazyRoute(() => import('../../modules/tv/BoardScreen').then(m => ({ default: m.BoardScreen })));
