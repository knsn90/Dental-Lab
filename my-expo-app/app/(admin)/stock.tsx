import { lazyRoute } from '../../core/_lazyRoute';
const StockScreen = lazyRoute(() => import('../../modules/stock/screens/StockScreen'), 'StockScreen');
// Yönetim paneli — coral accent
export default function AdminStockScreen() {
  return <StockScreen accentColor="#002A5C" />;
}
