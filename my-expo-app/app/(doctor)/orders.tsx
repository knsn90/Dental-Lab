// Siparişler EN ÇOK KULLANILAN ekran ve lazy yüklemede takılıyordu:
// chunk 200 dönüp modül hazır olmasına rağmen React askıya alınmış ağacı
// yeniden denemiyor; sayfa "Yükleniyor…"da donuyor, ancak başka bir sayfaya
// gidip dönünce ya da yenilenince açılıyor (ölçüldü). Bu ekranı statik import
// ediyoruz — bedeli entry paketinde ~120 KB, karşılığı hiç açılmama riskinin
// tamamen kalkması. Diğer lazy rotalarda 12 sn'lik güvenlik ağı devrede.
import { OrdersListScreenV2 } from '../../modules/orders/screens/OrdersListScreenV2';
export default OrdersListScreenV2;
