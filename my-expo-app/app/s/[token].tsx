import { lazyRoute } from '../../core/_lazyRoute';
// app/s/[token].tsx
// Public route — login gerektirmez. Ön ekstre onay bağlantısı (jeton) sayfası.
// LinkPreStatementScreen başka yerde statik import EDİLMEZ (lazyRoute + statik import çakışması).
export default lazyRoute(() => import('../../modules/finance-clinic/screens/LinkPreStatementScreen'), 'LinkPreStatementScreen');
