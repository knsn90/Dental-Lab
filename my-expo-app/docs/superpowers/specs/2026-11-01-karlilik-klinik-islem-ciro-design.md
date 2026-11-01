# Karlılık ekranı: dönem kârı + klinik ve işlem bazında ciro (denetim yol haritası 2. dalga, madde 12)

Tarih: 2026-11-01 · Durum: açıklama onaylandı ("evet uygun, iki liste kaldırılabilir"), KDV kararı alındı ("KDV hariç olsun"), belge onayı bekliyor

## 1. Niyet

Lab yöneticisi Karlılık ekranına **fiyat kararı** vermek için bakıyor. Kendi sözleriyle:

- "hangi klinik ne kadar karlı olmuş hangi işlemler karlı olmuş ona baktım"
- "fiyatı değiştiririm, o kliniğe özel fiyat veririm. değiştirmeye de bilirim"

Konuşma sırasında kullanıcı kliniğe, hekime ya da işe kâr bölmeyi bilinçli olarak reddetti:

- "kliniklerin bıraktıkları ciroyu yazmak karlılığı kliniğe göre hekime göre ve ya iş başına hesaplamaktan daha mantıklı olur. karlılıklar döneme göre toplam hesaplanır"

**Gerekçe:** işçilik ve sabit gider o ayın iş miktarına bölünürse birim maliyet hacimle dalgalanır. Kullanıcının örneği: Ocak'ta 200 üye, Şubat'ta 800 üye. Aynı klinik aynı fiyatla bir ay zararda, ertesi ay kârda görünür. Ekran fiyatı değil ayın yoğunluğunu ölçmüş olur.

**Sonuç:**
- Kâr yalnız **dönem toplamı** olarak gösterilir.
- Klinik ve işlem kırılımları **ciro** gösterir.

**Kapsam:** yalnız Nexadent değil, Siman'ı kullanan **bütün lablar** ("tek bizim labı düşünme bu bütün lab lara hitab edecek").

**Bugünkü ekranın sorunları:**
- "Doktor Bazlı Kârlılık" ve "En Kârlı/En Zararlı 5 Sipariş" listeleri yalnız malzemeyi düşüyor. Bu yüzden %70–100 marj gösteriyorlar. Aynı ekranda dönem marjı Ekim'de yaklaşık %−0,5. İki bilgi birbiriyle çelişiyor.
- Toplu faturanın geliri ilk siparişe yazılıyor. Bu yüzden kırılımlar ciro kartıyla tutmuyor; ekrandaki dipnot da bunu itiraf ediyor.
- Dönemde maaş girilmemişse işçilik 0 sayılıyor ve marj "Mükemmel" görünüyor. Bu, denetimdeki [YÜKSEK] bulgu: `docs/lab-yoneticisi-raporu/2-finans.md:32`.

## 2. Hedefler, hedef dışı, yapılmaması gerekenler

### Hedefler

1. **Dönem kârı KDV hariç ciroyla hesaplanır** (kullanıcı kararı: "KDV hariç olsun", ayrıntı §6).
   - Hero'nun yapısı aynı kalır: net kâr, marj, Gelir/Maliyet/İşçilik/Materyal kutucukları ve maliyet dağılımı.
   - Değişen tek şey gelirdir: fatura `total`'i yerine KDV hariç `subtotal` kullanılır. Maliyet tarafı (malzeme, işçilik, genel gider) aynen kalır.
   - Gelir kutucuğu ve kâr başlığı "KDV hariç" olduğunu açıkça yazar. Finans özetindeki ciro KDV dahil kalır; iki ekran farklı rakam gösterdiği için etiket şarttır.
2. **Eksik gider uyarısı.**
   - Dönemde işçilik 0 ise hero'da uyarı görünür: "Bu dönem işçilik girilmemiş — kâr olduğundan yüksek görünüyor".
   - Aynı durumda marj etiketi ("Mükemmel / İyi / Düşük / Risk") gösterilmez; marj yüzdesi görünmeye devam eder.
   - *Benim kararım:* genel gider de 0 ise aynı uyarıya "genel gider" eklenir. Mantık aynı: girilmemiş gider kârı şişirir.
3. **Klinik bazında ciro.**
   - Sütunlar: klinik adı, dönemde faturalanan sipariş sayısı, ciro ve toplam ciro içindeki pay (%).
   - Sıralama: cirosu büyükten küçüğe.
   - *Benim kararım:* ciro, hero'daki Gelir kutucuğu gibi **döviz döviz** yazılır (₺ ve € ayrı satırlar). Sıralama ve pay yüzdesi ana para birimi karşılığıyla hesaplanır. Böylece klinik satırlarının döviz toplamları hero'daki döviz dilimlerine ekranda da birebir eşit olur.
   - "Yabancı döviz" kararı labın **ana para birimine** göre verilir. Bugünkü kodda sabit `'TRY'` karşılaştırması var; yeni kodda bu kullanılmaz.
   - Kliniğe dokununca o kliniğin **hekimleri** altında açılır. Her hekimin cirosu ve klinik içindeki payı görünür.
4. **İşlem bazında ciro.**
   - Sütunlar: işlem adı (hizmet listesindeki ad), miktar + birim (hizmetin kendi birimi: diş, çene, vaka…), ciro, ortalama birim fiyat (ciro ÷ miktar) ve liste fiyatı.
   - Ortalama birim fiyat liste fiyatının altındaysa fark yüzde olarak gösterilir. Böylece özel fiyatların/indirimlerin etkisi kâr hesabı yapılmadan görünür.
5. **Toplu fatura doğru dağılır.**
   - Faturanın cirosu, fatura kalemlerine net tutarları oranında dağıtılır. İşlem ve hekim kırılımları kalem üzerinden hesaplanır.
   - Klinik zaten faturadadır, dağıtım gerekmez.
   - Ekrandaki "Toplu faturanın geliri ilk siparişe yazılır…" dipnotu kalkar.
6. **Toplamlar tutar.** Üç eşitlik her zaman sağlanır:
   - Klinik satırlarının ciro toplamı = hero'daki gelir (ana para birimi).
   - İşlem satırlarının ciro toplamı = aynı gelir.
   - Bir kliniğin hekim satırlarının toplamı = o kliniğin cirosu.
7. **Kaldırılan listeler** (kullanıcı onayı: "iki liste kaldırılabilir"):
   - "En Kârlı 5 Sipariş" ve "En Zararlı 5 Sipariş".
   - "Doktor Bazlı Kârlılık" ve dipnotu. Hekim bilgisi klinik satırının altına taşınır.
8. **Kalan bölümler:** "Teknisyen Malzeme Verimi" ve "Materyal Fire Raporu" aynen kalır.

### Bütün lablar için davranış

Bunlar Nexadent'te bugün görünmeyen ama platformdaki diğer lablarda olan ya da olacak durumlar:

| Durum | Davranış |
|---|---|
| Hizmetin liste fiyatı yok (bugün 5 labın 2'sinde hiç yok) | Liste fiyatı ve fark sütunu "—"; ortalama birim fiyat yine gösterilir |
| Hizmetler farklı dövizde (bugün 3 farklı döviz var) | Liste fiyatı her kalemde o faturanın dövizine ve kuruna çevrilir (§3) |
| Farklı birimler (Adet, Çene, Seans, Üye, Vaka…) | Miktar hizmetin kendi birimiyle yazılır; birim yoksa yalnız sayı |
| Sipariş kalemi hizmet listesine bağlı değil ve adı da eşleşmiyor | "Diğer" satırında toplanır; payı görünür |
| Faturanın hiç kalemi yok (Nexadent'te 65 faturanın 5'i) | Ciro klinik listesine girer. İşlem listesinde "Kalemsiz fatura" satırına yazılır. Hekim §3'teki sıraya göre bulunur |
| Faturada klinik yok | Satır hekimin adıyla açılır; hekim de yoksa "Kliniksiz" |
| Dönemde kesilmiş fatura yok | Klinik/işlem listeleri yerine kısa açıklama: ciro kesilen faturalardan hesaplanır, bu dönemde kesilmiş fatura yok |

### Hedef dışı

- Klinik, hekim, işlem ya da sipariş bazında **kâr veya marj**. Kullanıcı reddetti; gerekçe §1'de.
- İşçiliği/sabit gideri birime dağıtmak: 12 aylık ortalama oran, emek ağırlığı, hizmet listesine "emek" alanı. Bunlar konuşuldu ve kâr kırılımı kalkınca gereksiz kaldı.
- Ekrandan fiyat değiştirmek. Kliniğe özel fiyat Fiyat Listesi'nde zaten var (`clinic_price_overrides`).
  - Benim önerimdi: klinik satırından o kliniğin özel fiyatlarına tek tıkla geçiş. Kullanıcı onaylamadı, bu işe girmez.
- Sipariş detayındaki kâr kartı (`calculate_order_profit`). Faturadan değil `work_orders.sale_price`'tan hesaplıyor, toplu fatura sorunu yok. Dokunulmaz.
- Artık çağrılmayacak eski RPC'leri silmek: `profitability_top_orders`, `profitability_by_doctor`, `profitability_by_doctor_revenue_ccy`.
  - *Benim kararım:* veritabanında kalırlar. İstemci çağırmayı bırakır; geri alma kolay kalır. Silme ayrı bir temizlik işidir.

### Yapılmaması gerekenler

- Kırılım toplamı hero'daki gelirden **farklı olmamalı**. Fark yuvarlama kuruşu dışında hata sayılır.
- Bir labın kullanıcısı başka labın klinik/işlem cirosunu **görmemeli**. Mevcut RPC'lerdeki `assert_my_lab` + `can_view_lab_profit` kapısı yeni hesaplarda da şarttır.
- Finans yetkisi olmayan rol (teknisyen, kurye, hekim, klinik) bu verileri **alamamalı**.
- Yeni listelerde **hasta adı** gösterilmemeli. Kırılımlar klinik/hekim/işlem düzeyindedir.
- Hero'da gelirden başka rakam **değişmemeli**. Malzeme, işçilik, genel gider bugünkü `profitability_summary` ile aynı kalır; kâr ve marj yalnız gelir KDV hariç olduğu için değişir.
- KDV hariç kararı Karlılık ekranının dışına **taşmamalı**. `finance_period_metrics`, Finans özeti ve `core/metrics` tanımları KDV dahil kalır.

## 3. Tanımlar

Dönem ve fatura seçimi bugünkü `profitability_summary` / `profitability_revenue_ccy` ile aynıdır. Gelir KDV hariçtir (§6).

- **Dönem:** faturanın `issue_date`'i.
- **Sayılan fatura:** `status IN ('kesildi','kismi_odendi','odendi')` (taslak ve iptal hariç).
- **Fatura cirosu, KDV hariç:**
  - Orijinal dövizde: `subtotal`.
  - Ana para biriminde: `subtotal × rate_at_time`. `rate_at_time` boşsa `amount_base ÷ total` oranı; o da yoksa 1.
  - Canlıda doğrulandı (2026-11-01, kesilmiş 65 faturanın hepsi):
    - `total = subtotal + tax_amount`
    - `subtotal = Σ invoice_items.net_total`
    - `amount_base = total × rate_at_time`
- **Kalem payı:**
  - Kalemin KDV hariç cirosu kendi `net_total`'idir; ana para birimine faturanın kuruyla çevrilir. `subtotal` kalemlerin toplamı olduğundan dağıtım bölme gerektirmez.
  - `net_total` boşsa `total` kullanılır. Kalem toplamı `subtotal`'den farklı çıkan faturada fark "Kalemsiz fatura" satırına yazılır; böylece toplam her zaman tutar.
  - Hiç kalemi olmayan faturanın cirosu "Kalemsiz fatura" olarak kalır.
- **İşlem eşleşmesi, sırayla:**
  1. `invoice_items.order_item_id → order_items.service_id`
  2. Yoksa `order_items.name`, aynı labın `lab_services.name`'i ile büyük/küçük harf duyarsız tam eşleşme.
  3. Yoksa "Diğer".
  - Nexadent'te 89 sipariş kaleminin 80'i 1. ve 2. adımla eşleşiyor.
  - **Sipariş kalemine bağlı olmayan fatura kalemleri** (`order_item_id` boş): sipariş kalemi olmayan siparişte `work_type`'tan üretilen satır, "Acil Ek Ücret" satırı ve elle eklenen satırlar. Nexadent'te 86 kalemin 12'si böyle.
    - *Benim kararım:* açıklamanın başındaki "[sipariş no]" öneki atılır, kalan metin aynı kurala göre (büyük/küçük harf duyarsız tam ad) `lab_services` ile eşleştirilir. Eşleşmezse "Diğer".
    - Şema değişikliği (`invoice_items.work_order_id`) yapılmaz. Bu iş yalnız okuyan hesaplardır.
- **Miktar:** fatura kalemindeki `quantity` (faturalanan miktar).
- **Ortalama birim fiyat ve liste fiyatı karşılaştırması:**
  - *Benim kararım:* kur kaymasından sahte "liste altı" çıkmasın diye liste fiyatı **her kalem için o faturanın para birimine ve kuruna** çevrilir. Kur, faturanın `rate_at_time`'ıdır; hizmet farklı dövizdeyse önce fatura tarihindeki kurla fatura dövizine geçilir.
  - Fark yüzdesi = 1 − Σ(kalem tutarı) ÷ Σ(miktar × o kaleme çevrilmiş liste fiyatı). Liste fiyatı olmayan kalemler bu orana girmez.
  - Karşılaştırma iki tarafta da aynı vergi tabanıyla yapılır (bkz. §6 KDV).
- **Hekim, sırayla:**
  1. `order_items.work_order_id → work_orders.doctor_id`
  2. Yoksa, fatura **en fazla bir** siparişe bağlıysa: o siparişin hekimi. Bağ `invoices.work_order_id` ya da `invoice_orders`'ta tek satırdır. Sipariş yoksa `invoices.doctor_id`.
  3. Yoksa (birden çok siparişli toplu fatura) "Hekim belirtilmemiş".
  - *Benim kararım:* birden çok siparişli faturada `invoices.doctor_id` kullanılmaz. Toplu faturada `create_bulk_invoice` buraya ilk siparişin hekimini yazıyor; kullanılırsa "ilk sipariş hepsini alır" hatası hekim satırında geri gelir.
  - Ad, mevcut desenle `COALESCE(profiles.full_name, doctors.full_name)` (doctor_id polimorfizmi).
- **Klinik:** `invoices.clinic_id → clinics.name`. Nexadent'te kesilmiş faturaların hepsinde klinik dolu.
- **Klinik sipariş sayısı:** kliniğin dönem faturalarına bağlı tekil siparişler. Doğrudan bağ (`invoices.work_order_id`) ve toplu fatura bağı (`invoice_orders`) birlikte sayılır; summary'deki `per_wo` mantığı.
- **Eksik işçilik:** summary'nin döndürdüğü `total_labor = 0`. Eksik genel gider: `total_overhead = 0`.

## 4. Kısıtlar

- **Veritabanı değişikliği** yeni RPC ya da RPC değişikliği demektir. Projenin protokolü uygulanır:
  1. Canlı tanım yedeği (`.before.txt`).
  2. `.down.sql`.
  3. Geri alınan prova: ÖNCE/SONRA/GERİ ALMA, gerçek rol ile.
  4. Kullanıcıdan açık "Onaylıyorum, uygula".
  5. Uygula, sonra canlıda ölç.
- Yeni RPC'ler `SECURITY DEFINER` olacaksa `assert_my_lab` + `can_view_lab_profit` kapısı ve `SET search_path` şarttır.
- **i18n:** her yeni metin tr + en + de + fa aynı anda eklenir; otomatik sözlükler eşit kalır.
- **Koyu tema:** her yeni yüzey token'larla (`useMobileTokens` / `useInkUI`) yapılır; açık tema bit-bit korunur.
- Her yeni ikon-buton GlassTooltip alır. Para biçimlendirme `(Number(n)||0)` deseniyle yapılır.
- **Mobil ve masaüstü:** ekranın bugünkü `MobileTableX` kalıbı sürdürülür. Mobilde satır tek satır kalır; taşan bilgi alt satıra iner.
- **Ekran önbelleği:** `profit_screen_v4` anahtarı kullanılıyor. Şekil değiştiği için sürüm artırılır, eski önbellek bir an bile eski listeleri göstermemelidir.
- `npx tsc --noEmit --incremental false` 0 hata; `bash scratchpad/kasa/verify.sh` yeşil.
- Deploy yalnız kullanıcı "deploy" deyince yapılır.

## 5. Bugünkü durum (Nexadent, 2026-11-01, yalnız sayılar)

- Kesilmiş fatura 65; bunların 5'i kalemsiz. Birden fazla siparişli kesilmiş toplu fatura yok.
- Fatura kalemi 86; 74'ü bir sipariş kalemine bağlı.
- Sipariş kalemi 89; 12'si `service_id` ile, 68'i ad eşleşmesiyle hizmete bağlanıyor.
- Hizmet 71; 59'unun liste fiyatı var. Kliniğe özel fiyat 443 kayıt, 34 klinik.
- Ekim dönemi: işçilik girilmiş. Maliyetin yaklaşık %58'i işçilik, %29'u genel gider, %13'ü malzeme.

## 6. KDV — karar: KDV hariç

Bugünkü tek tanımda ciro **KDV dahildir** (`core/metrics/metricHints.ts`: "Dönemde kesilen faturaların toplamı (KDV dahil)"). Dönem kârı da bu ciroyla hesaplanıyor.

Canlıda ölçülenler (2026-11-01):
- Lab varsayılan KDV oranları %10 ve %20.
- Nexadent'in kesilmiş 65 faturasının 44'ünde KDV var. KDV toplam cironun yaklaşık %8,7'si.
- Giderlerde KDV ayrı tutulmuyor.

Bunun iki sonucu var:
- Liste fiyatı KDV hariçtir. Ciro KDV dahil bölünürse ortalama birim fiyat liste fiyatından yaklaşık bir KDV oranı yukarıda çıkar ve KDV'den küçük indirimler görünmez olur.
- Dönem kârı devlete ödenecek KDV'yi gelir sayıyor.

**Karar (kullanıcı, 2026-11-01):** "KDV hariç olsun".

Bu kararın kapsamı:
- Karlılık ekranında dönem kârı, Gelir kutucuğu, klinik/hekim/işlem cirosu ve ortalama birim fiyat KDV hariçtir. Liste fiyatı da KDV hariç olduğundan karşılaştırma aynı tabanda yapılır.
- Bu, canlı `profitability_summary` ve `profitability_revenue_ccy` RPC'lerinin gelir tanımını değiştirmek demektir. İkisini yalnız bu ekran çağırıyor (2026-11-01 grep). Değişiklik §4'teki veritabanı protokolüyle yapılır.
- Bilinen sınır: giderlerde KDV ayrı tutulmadığı için gider tarafı KDV dahil kalır, indirilecek KDV düşülmez. Bu, kârı hafifçe düşük gösterir (temkinli yön). Gider KDV'si ayrı bir işin konusudur.

## 7. Kurucuya bırakılanlar

- RPC sayısı ve dönüş şekli: tek RPC'de klinik+hekim satırları mı, ayrı RPC'ler mi; döviz dilimleri ayrı mı.
- Klinik açılır satırının görsel/etkileşim ayrıntısı; mobilde hekim satırlarının yerleşimi.
- Klinik ve işlem listelerinin aynı anda mı (masaüstünde yan yana) yoksa sekmeyle mi gösterileceği. Kullanıcı taslakta sekmeli tabloyu (A) tıkladı ama düzen seçimini açıkça söylemedi.
- "Diğer" satırına dokununca içindeki kalem adlarının gösterilip gösterilmeyeceği.
- Test kapsamı: saf dağıtım/eşleşme yardımcıları için `node --test`, RPC'ler için geri alınan prova.
