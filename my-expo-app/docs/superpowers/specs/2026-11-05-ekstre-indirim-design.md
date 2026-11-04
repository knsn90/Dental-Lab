# Ekstre indirimi ve fatura altı indirim — tasarım

**Tarih:** 2026-11-05 · **Durum:** taslak, kurucu kontrolünden geçti; kullanıcı onayı bekliyor

Görsel taslak: konuşmada çizilen üç seçenekten **A (ayrı satır)** seçildi. Belge ile taslak çelişirse belge geçerlidir. Taslaktaki rakamlar örnektir.

---

## 1. Neden

Lab bir kliniğe dönem ekstresini gönderdi. Klinik sonradan o dönem için indirim istedi. Sistemde gönderilmiş bir ekstreye indirim uygulamanın yolu yok.

Bugün indirim yalnız faturanın içinde, kalem kalem var (`invoice_items.discount_type / discount_value / net_total`). Bütün döneme ya da bütün faturaya tek seferde verilen bir indirim yok.

Bu iş üç şey kuruyor:

1. **Ekstre indirimi.** Kliniğin borcundan düşen ayrı bir kayıt. Faturaların tutarı ve KDV'si değişmez. Ekstrede tahsilat gibi kendi satırı olur.
2. **Fatura altı indirim.** Özellikle toplu faturada, faturanın kendisine yüzde ya da tutar indirim. Fatura indirimli çıkar.
3. **Kliniğin genel indirim oranı.** Klinikler ekranında kliniğe girilen oran, o kliniğin özel fiyat listesinde fiyatı tanımlı olmayan hizmetlere uygulanır. Fatura satırında katalog fiyatı, indirim yüzdesi ve net tutar görünür (§7). Bu parça fiyatlamaya aittir; ilk ikisinden bağımsız yapılıp yayınlanabilir.

İlk ikisine ortak olarak ekstreye bir **İndirim** sütunu gelir. Liste ayarından bu sütunun yüzde mi tutar mı göstereceği seçilir.

## 2. Kim kullanır

- **İndirim veren:** lab tarafında kliniğe tahsilat girebilen kullanıcı. Ekstre indirimi ve fatura altı indirim aynı yetkiye bağlanır. *(Benim kararım: yeni bir yetki anahtarı açmak yerine tahsilatla aynı kapı. Ayrı bir yetki gerekirse sonra eklenir.)*
- **Gören:** klinik ve hekim kendi panelindeki ekstrede indirim satırını salt okunur görür. Ekstreyi kim görüyorsa indirimi de o görür.

## 3. Hedefler

- Gönderilmiş bir ekstreye, faturaların tutarına dokunmadan sonradan indirim uygulanabilir.
- Klinik indirimli tutarı ödediğinde o dönemin faturaları *Ödendi* olur. Hiçbir fatura indirim yüzünden açık ya da gecikmiş kalmaz.
- Lab paneli ve klinik paneli aynı bakiyeyi gösterir; iki ekstre birbirini tutar.
- Toplu fatura keserken bütün faturaya tek indirim verilebilir. Fatura PDF'i ve e-fatura indirimli çıkar.
- İndirim raporlara doğru yansır: ciroyu düşürür, tahsilat sayılmaz, gecikmiş borcu ve hatırlatma tutarını azaltır.
- Kliniğe girilen genel indirim oranı gerçekten fiyata yansır. Bugün kaydediliyor ama hiçbir yere uygulanmıyor.

## 4. Hedef dışı ve anti-hedefler

**Hedef dışı:**
- Kesilmiş ya da e-fatura olarak gönderilmiş bir faturanın tutarını değiştirmek.
- Ekstre indirimiyle KDV'yi düşürmek. Faturalar değişmediği için devlete ödenen KDV de değişmez (kullanıcı kararı).
- İade faturası, fiyat farkı faturası gibi resmi belge üretmek. Ekstre indirimi, lab ile klinik arasındaki cari hesapta bir kayıttır. Resmi muhasebe belgesi gerekiyorsa o ayrı bir iştir.
- Mevcut kalem kalem indirimi değiştirmek. Olduğu gibi kalır.
- Fiyat listesindeki hizmet bazlı klinik özel fiyatı (`clinic_price_overrides.custom_price` ve `discount_percent`). Bunlar aynen geçerli kalır; genel oran yalnız bunların tanımlı olmadığı hizmetlere uygulanır.
- Var olan siparişlerin ve faturaların fiyatını genel orana göre yeniden hesaplamak.
- Keşifte görülen ama bu işe ait olmayan mevcut hatalar (§12.9). Ayrı ele alınır.

**Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır):**
- Bir indirimin bakiyeden iki kez düşmesi. Örnek: indirimli faturanın İndirim sütunundaki değerinin bakiyeden ayrıca düşülmesi.
- İndirimin herhangi bir yerde tahsilat, kasa hareketi, banka hesabı hareketi ya da makbuz olarak görünmesi.
- Kliniğin bakiyesi sıfırken faturalarından birinin açık, gecikmiş ya da hatırlatılır görünmesi.
- Lab paneli ile klinik panelinin aynı ekstre için farklı bakiye göstermesi.
- Tedarikçi ekstresinin değişmesi.

## 5. Ekstre indirimi

### 5.1 Kayıt

Yeni bir kayıt türü. Her kayıt şunları tutar:

- lab, klinik
- para birimi: ekstrenin para birimi
- tarih: ekstrede görüneceği gün
- dönem başlangıcı ve bitişi: indirimin hangi dönem için verildiği. **Her iki türde de zorunludur.** Yüzdenin dayanağı ve dağıtım bu dönemden çıkar.
- tür: `percent` ya da `fixed`
- girilen değer: yüzde ya da tutar
- hesaplanan indirim tutarı: kayıt anında hesaplanıp saklanır, sonradan yeniden hesaplanmaz
- dayanak: yüzdenin uygulandığı tutar, KDV dahil (§5.3). Kayıt anındaki değeriyle saklanır.
- ana para birimi karşılığı (`amount_base`) ve kullanılan kur: çoklu döviz kuralları neyse o
- belge numarası: `İND-<sıra>`, lab başına artan
- açıklama
- oluşturan kullanıcı ve oluşturma zamanı

**Ad çakışması:** `clinic_discounts` adı dolu (023_finance_extras, kliniğe indirim oranı; bkz. §12.9). Yeni kayıt başka bir ad alır.

### 5.2 Faturalara dağıtım (nakit dışı kapama)

Bakiyenin tutarlı kalması için indirim, tahsilattaki dağıtım mantığıyla faturalara dağıtılır. Faturaların tutarı değişmez; yalnız ödenmiş kısmı artar.

- **Dağıtım sırası:** dönemdeki, indirimin para birimindeki *kesilmiş* faturaların açık kısımlarına, vadesi en eski olandan başlayarak. Bu sıra tahsilat dağıtımıyla (`_receipt_alloc_plan`) aynıdır.
- **Durum güncelleme:** her dağıtım payı faturanın ödenmiş tutarına eklenir. Fatura durumu bugünkü kuralla güncellenir (*Kısmi ödendi* / *Ödendi*).
- **Kalan kısım:** dönem faturaları zaten ödenmişse dağıtılamayan kısım kalır. Bu kısım kliniğin alacağı olur ve avans gibi bakiyeden düşer; sonraki faturalardan düşülür (kullanıcı kararı).
  - Bu alacak sonradan bir faturaya *ödeme olarak uygulandığında* da tahsilat sayılmaz.
- **E-fatura durumu:** ekstre indirimi faturaya dokunmadığı için e-faturası gönderilmiş faturalara da dağıtılabilir. *(Benim kararım. Kullanıcı "e-faturası kesilmiş faturaya indirim yapılmaz" dedi; bunu faturanın tutarını değiştirmek olarak okudum. Ayrı kayıt faturayı değiştirmez.)*
- **Pay sahibi fatura iptal edilirse:** o faturadaki indirim payı kliniğin alacağına geçer, sonraki faturalardan düşülür (kullanıcı kararı). Ekstre satırı kaydedilen tutarı göstermeye devam eder ve bakiye kartlarıyla aynı sonucu verir.
  - Fatura iş iptal edildiği için yeniden kesilmeyecekse kliniğe hak etmediği bir alacak kalır. Lab kullanıcısı bu durumda indirimi silip doğru tutarla yeniden ekler. *(Benim notum; otomatik bir ayrım yapılmaz.)*
- **Pay sahibi faturanın toplamı sonradan düşerse** (ör. e-fatura gönderilmeden KDV oranı değiştirilirse) ve pay faturanın yeni açık kısmını aşarsa, aşan kısım aynı kuralla kliniğin alacağına geçer. *(Benim kararım; iptal kuralıyla aynı.)*
- **Silme:** indirim silinince dağıtım payları ve alacağa geçen kısım geri alınır. Faturaların durumu yeniden hesaplanır.
- **Görünmeyeceği yerler:** dağıtım payları hiçbir tahsilat listesinde, tahsilat toplamında, ödeme yöntemi kırılımında, kasa hareketinde, banka hesabında ya da makbuzda görünmez.
  - Bu kayıtlar bir ödeme yöntemi taşıyorsa, bu yöntem tahsilattan ayrılır (ör. `indirim`).
  - Kasa senkronu (`_cash_sync`) yalnız `nakit` için çalıştığından indirim kasaya girmez. Kurucu bunu doğrular.
- **Fatura ekranındaki görünüm:** faturanın kendi ekranında ödeme geçmişinde bu pay, "Ekstre indirimi İND-n" olarak tahsilattan ayrı görünür.

Depolama yolu kurucunun seçimidir. İki yol var:

- *Yol 1:* yeni bir indirim tablosu. Dağıtım payları `payments`'a `indirim` yöntemli satırlar olarak yazılır ve indirim kaydına bağlanır; `receipt_id` buna örnektir.
- *Yol 2:* `clinic_receipts`'e bir tür alanı eklenir. Tüm dağıtım ve alacak altyapısı yeniden kullanılır; tahsilat, kasa, hesap ve makbuz yollarından indirim türü dışlanır.

Hangi yol seçilirse seçilsin, yukarıdaki "görünmez" kuralı ve §5.6 korunur.

### 5.3 Giriş

Lab'ın klinik ekstresi ekranında **"Tahsilat ekle" düğmesinin yanına "İndirim ekle" düğmesi** gelir. Klinik panelinde (`selfView`) bu düğme görünmez. Pencere ekranın ortasında açılır, arkası bulanıktır.

Alanlar:
- **Dönem:** ekranda seçili tarih aralığı önerilir; değiştirilebilir.
- **Tür:** Yüzde | Tutar.
- **Değer**
- **Hesaplanan indirim:** salt okunur önizleme. Şunları gösterir: dönemin fatura toplamı, indirim tutarı, faturalara dağıtılacak kısım, alacağa kalacak kısım, yeni bakiye.
- **Tarih:** önerilen değer dönemin son günüdür. Böylece indirim, kliniğe gönderilmiş o dönemin ekstresinde görünür.
- **Açıklama:** önerilen metin "<Ay Yıl> dönemi indirimi".

Kurallar:
- **Yüzde dayanağı:** dönemdeki *kesilmiş* faturaların KDV dahil toplamı, ekstrenin para biriminde, **eksi bu döneme daha önce girilmiş indirimler**. Taslak ve iptal faturalar sayılmaz.
- **Aynı döneme birden fazla indirim:** izin verilir. Dönemleri çakışan indirimler (ör. Ekim ve 4. çeyrek) de aynı döneme girilmiş sayılır. Üst sınır toplamdır: bütün indirimler birlikte dönemin fatura toplamını aşamaz. *(Benim kararım: toplam indirim fatura toplamını geçemezse ciro eksiye düşmez ve klinik hiç ödemediği bir para için alacaklı olmaz.)*
- Değer 0'dan büyük olmalı. Yüzde 100'ü, tutar kalan dayanağı aşamaz.
- Önizleme, daha önce girilmiş indirimleri ayrı bir satırda gösterir.
- Dönemde kesilmiş fatura yoksa indirim girilemez.
- Doğrulama hatası düğmenin yanında görünür; yalnız toast yetmez.
- Kayıt tek bir sunucu işlemidir. Kayıt, dağıtım ve aktivite kaydı birlikte yazılır ya da hiçbiri yazılmaz. Çift tıklamaya karşı idempotency anahtarı kullanılır, tahsilattaki gibi.

### 5.4 Ekstrede görünüm

- Kendi satırıdır, tarih sırasına girer. Satır türü bugünkü `'invoice' | 'payment'` yanına yeni bir tür olarak eklenir.
- Belge sütununda `İND-n`, açıklama sütununda kaydın açıklaması yazar.
- Borç ve Alacak boş kalır. Tutar yalnız **İndirim** sütununda görünür. Yürüyen bakiye indirim kadar düşer.
- Dağıtım payları ekstrede ayrıca satır olmaz; makbuza bağlı ödemelerde olduğu gibi atlanır.
- Liste ayarında "tahsilat satırları" kapalıysa da indirim satırları **görünür kalır**, çünkü bakiyeyi değiştirirler.
- Üstteki özet kartları ("Ödenen" gibi) indirimi tahsilata katmaz.
- **KDV'li görünüm** (liste ayarında KDV ayrı gösterildiğinde): indirim satırının KDV hariç ve KDV sütunları boş kalır; tutar yalnız İndirim sütununda görünür. Alttaki KDV dökümü değişmez, çünkü faturaların KDV'si değişmedi.
- Mobilde satır kartı bir "İndirim" etiketi taşır; tahsilat kartından ayırt edilir.
- En alttaki dökümde ayrı bir "İndirimler" satırı bulunur. Yeri: fatura toplamı ile bakiye arasında.
- PDF ve Excel aynı satırı ve sütunu içerir.
  - Ortak cari PDF şablonu (`buildCariStatementHtml`) tedarikçi ekstresiyle paylaşılır. İndirim sütunu bu şablona KDV'de olduğu gibi *yalnız istenince* açılan bir seçenek olarak eklenir; tedarikçi ekstresi değişmez.
  - Excel'deki sabit "Fatura" / "Tahsilat" etiketlerine "İndirim" eklenir.
- Klinik ve hekim paneli aynı `ClinicStatementScreen`'i kullanır. İndirim satırını salt okunur görmeleri için yeni kayda klinik okuma politikası (RLS) eklenir; bugünkü `clinic_view_own_receipts` buna örnektir.

### 5.5 Silme

- Lab kullanıcısı indirimi silebilir. Silmeden önce onay penceresi çıkar.
- Düzenleme yoktur; yanlış girilen indirim silinip yeniden eklenir. *(Benim kararım: tutar, kur ve dağıtım kayıt anında yapıldığı için düzenleme yerine sil-ekle daha az hata üretir.)*
- Ekleme ve silme aktivite kaydına yazılır (`log_activity`): kim, ne zaman, hangi klinik, ne kadar. Ödeme ekleme tetikleyicisi (`trg_log_payment_recorded`) dağıtım paylarını "tahsilat kaydedildi" diye yazmaz.

### 5.6 Raporlara etkisi

Kullanıcının onayladığı kurallar: ciroyu düşürür, tahsilat sayılmaz, gecikmiş borcu ve hatırlatma tutarını azaltır.

- **Bakiye ve gecikmiş borç** (`v_clinic_balance`, `v_clinic_balance_ccy`):
  - Dağıtılan kısım faturaların ödenmiş tutarı üzerinden kendiliğinden düşer.
  - Dağıtılamayan kısım (alacak) avans gibi her iki görünümde `balance`'tan ve `overdue_net`'ten düşer.
  - Yeni alt sorgu `clinic_id` yanında `lab_id` ile de eşleşir (bkz. §12.9; bugün gerekmiyor ama zarar vermez).
  - Bu görünümleri okuyan ekranlar, Denty ve hatırlatmalar kendiliğinden doğru olur.
- **Ödeme hatırlatma:**
  - Klinik bazlı tutar ve "kime" kararı (`_reminder_amounts`, `_clinics_to_remind`) görünümlerden gelir; kendiliğinden düşer.
  - Fatura bazlı hatırlatma `total − paid_amount` okur; dağıtım sayesinde kapanan faturalar hatırlatılmaz.
- **Tahsilat** (`finance_period_metrics` collections, klinik özetindeki "bu ay ödenen" ve benzerleri): indirim ve dağıtım payları sayılmaz.
- **Ciro iki yerde, iki tanımla hesaplanıyor; ikisinden de indirimin tamamı düşülür:**
  - `finance_period_metrics` ciroyu KDV dahil (`total`) sayar. Buradan indirim tutarı düşülür.
  - Karlılık (`profitability_summary`, `profitability_revenue_ccy`, `profitability_by_clinic`) KDV hariç (`subtotal`) sayar. Buradan da indirim tutarının **tamamı** düşülür. KDV payı ayrılmaz: faturaların KDV'si değişmediği için lab devlete KDV'nin tamamını ödemeye devam eder ve gelir kaybı indirimin tamamıdır (kullanıcı kararı).
  - Her ikisinde de düşülen tutar, indirim tarihinin düştüğü döneme yazılır.
- **KDV raporları:** değişmez.
- **Karlılık işlem kırılımı:** ekstre indirimi tek tek hizmetlere dağıtılamaz. Ama işlem kırılımının toplamı dönem cirosuna eşit olmak zorunda; bugün bu yapı gereği böyle (`_profit_revenue_lines`). Bu yüzden işlem kırılımında ayrı bir "Ekstre indirimleri" satırı görünür.
- **Aylık özet** (`v_monthly_finance_summary`): indirim aynı kuralla düşülür.

## 6. Fatura altı indirim

### 6.1 Hesap

- Faturaya fatura düzeyinde tür (`percent` | `fixed`) ve değer alanları eklenir.
- Kalem kalem indirimler aynen kalır. Fatura altı indirim, kalem indirimlerinden sonra kalan toplamdan düşer: `Σ net_total`. `fixed` indirim bu toplamı aşamaz.
- KDV indirimden sonraki tutar üzerinden hesaplanır.
- Sonuç: `subtotal = Σ net_total − fatura altı indirim`, `tax_amount = subtotal × tax_rate`, `total = subtotal + tax_amount`.
- **Toplamı yazan dört yer var; hepsi aynı formülü kullanmalı:**
  - `recalc_invoice_totals`
  - `aa_enforce_invoice_totals` BEFORE UPDATE tetikleyicisi. Bunu atlamak indirimi sessizce siler.
  - `set_invoice_amount_base` (`amount_base = total × kur`)
  - İstemcideki `patchItem` aynası (`hooks/useInvoices.ts`)
- **Yeniden hesaplama:** yüzde indirim, kalem her değiştiğinde yeniden hesaplanır. Acil iş ek ücreti ve tarama ücretleri sonradan kalem ekleyebiliyor; indirim bunlara da uygulanır.
- İndirim öncesi ara toplam gösterim için gerekir. Saklanması ya da hesaplanması kurucunun seçimi.

### 6.2 Giriş ve kilit

- **Toplu fatura oluşturma penceresi** (`BulkInvoiceModal`): "Fatura indirimi" alanı gelir (Yüzde | Tutar + değer). Önizleme indirimli toplamı gösterir. `create_bulk_invoice` buna göre bir parametre alır ya da fatura oluştuktan sonra indirim aynı işlem içinde yazılır.
- **Cari ekranındaki toplu faturalama** (`ClinicBalanceScreen` → `handleBulkBill`): aynı alan bu akışta da sunulur. *(Benim kararım; iki toplu fatura girişi aynı davranmalı.)*
- **Fatura detayı:** fatura *Taslak* durumundayken fatura altı indirim eklenir, değiştirilir ya da kaldırılır.
- **Tek siparişlik faturalar:** aynı ekranı kullandıkları için onlarda da çalışır.
- **Kilit:**
  - Fatura *Taslak* değilse ya da e-fatura ETTN'si varsa indirim kilitlidir. Bu kilit **veritabanında da** uygulanır; bugün kalem düzenleme kilidi yalnız arayüzde var, bu alanda aynı açık bırakılmaz.
  - Kilitli alanın yanında "Kesilmiş faturada indirim değiştirilemez. Ekstreden indirim ekleyebilirsiniz." yazar.
- **Otomatik oluşan faturalar:** teslimde otomatik taslak fatura (`create_invoice_from_order`) ve aylık fatura süpürgesi (`fn_generate_monthly_invoices` → `create_bulk_invoice`) fatura altı indirimi 0 ile oluşturur. Bu akışlarda davranış değişmez.
- **Kliniğin genel oranı bu alanı doldurmaz.** Oran zaten sipariş fiyatına uygulanıyor (§7); ayrıca fatura altına da yazılırsa indirim iki kez düşer. Alan boş açılır. *(Benim kararım; kullanıcının oran için verdiği karardan çıkıyor.)*

### 6.3 Çıktılar

- **Fatura detayı ve fatura PDF'i** (`buildInvoiceHtml`): toplamlar bloğu şu sırayla gösterilir.
  1. Kalem toplamı (indirim öncesi)
  2. Fatura indirimi (yüzdeyse "%10" ile)
  3. Ara toplam
  4. KDV
  5. Genel toplam
  6. Ödenen / Kalan

  Fatura altı indirim 0 ise blok bugünkü gibi kalır.
- **E-fatura (Luca):** Luca belge düzeyinde indirim alanı taşımıyor; yalnız kalem indirimi var.
  - Gönderimde fatura altı indirim kalemlere **orantılı dağıtılır** ve her kalemin `DiscountAmount`'una eklenir. Kuruş farkı en büyük tutarlı kaleme yazılır.
  - Böylece `buildLucaInput`'taki "ödenecek tutar = `invoice.total`" kontrolü geçer.
  - Aynı dağıtım birleştirilmiş gönderimde (`lucaMerge`) ve önizlemede (`EFaturaPreviewModal`, "Toplam iskonto") de kullanılır.
  - Dağıtım saf bir fonksiyondur ve testlidir.
  - Luca canlıya kapalı (`LUCA_PROD_ENABLED=false`); doğrulama test ortamında yapılır.

### 6.4 Ekstrede görünüm

- İndirimli faturanın ekstredeki borcu indirimli tutardır (`total`).
- Faturanın İndirim sütununa bilgi olarak o faturanın toplam indirimi yazar: kalem indirimleri + fatura altı indirim. Bu değer bakiyeden ikinci kez düşmez.
- Sütun başlığındaki ipucu (GlassTooltip) bunu açıklar.

### 6.5 Raporlara etkisi

- Ciro, Karlılık, tahsilat ve gecikmiş borç `subtotal` / `total` / `paid_amount` üzerinden yürüdüğü için fatura altı indirime kendiliğinden uyar. Kurucu bunu doğrular.
- **İstisna, Karlılık işlem kırılımı:** `_profit_revenue_lines` kalemleri `net_total` ile okur ve `subtotal − Σ kalem` farkını "Kalemsiz fatura" satırına yazar. Fatura altı indirim bu yüzden eksi bir "Kalemsiz fatura" satırı olarak görünürdü.
  - Bunun yerine indirim, işlem kırılımında kalemlere orantılı dağıtılır. E-faturadaki dağıtımla aynı fonksiyon ya da aynı kural kullanılır.
  - Böylece hizmet başına ortalama fiyat gerçek fiyatı gösterir.

## 7. Kliniğin genel indirim oranı

Klinikler ekranında kliniğe girilen oran (`clinic_discounts.discount_rate`) bugün kaydediliyor ama hiçbir yere uygulanmıyor. Kullanıcı kararı: oran o kliniğin özel fiyat listesine uygulanır; kliniğin faturaları zaten bu listeden gelir.

### 7.1 Kural

- Oran, kliniğin özel fiyat listesinde **kendi fiyatı ya da yüzdesi tanımlı olmayan** hizmetlere uygulanır: `katalog fiyatı × (1 − oran)` (kullanıcı kararı).
- Pazarlıkla tanımlanmış hizmet fiyatları (`clinic_price_overrides.custom_price`) ve hizmet bazlı yüzdeler (`discount_percent`) aynen kalır; genel oran bunların üstüne eklenmez.
- **Öncelik sırası:** hizmetin özel fiyatı → hizmetin özel yüzdesi → kliniğin genel oranı → kampanya (`promotions`) → katalog. *(Benim kararım: kliniğe özel olan, genel kampanyadan önce gelir. Canlıda kampanya kaydı yok.)*
- Fiyat bugün olduğu gibi kalem siparişe eklenirken belirlenir. Oran **yalnız yeni eklenen kalemlere** uygulanır; var olan siparişler ve faturalar yeniden hesaplanmaz. Oranın değiştirilmesi de yalnız sonraki kalemleri etkiler.
- Oran yüzdedir, para biriminden bağımsızdır.
- Toplu faturadaki fatura altı indirim alanı bu oranla dolmaz (§6.2).

### 7.2 Fiyatın çözüldüğü yerler — hepsi aynı kuralı kullanmalı

- Veritabanı: `resolve_item_price`. Bunu çağıranlar: yeni sipariş ekranı, tarama ücreti (`modules/scans/api.ts`, tarama faturalama migration'ları), WhatsApp'tan gelen sipariş (`whatsapp-webhook`).
- İstemci: `NewOrderScreen` kliniğin özel listesini kendisi de okuyup fiyat haritası kuruyor (`clinic_price_overrides`). Bu harita da genel oranı uygular.
- Hekim/klinik panelinden açılan siparişte istemci `clinic_discounts`'u okuyamıyor (bugünkü RLS yalnız lab'a izin veriyor). Oran bu yolda da doğru uygulanmalı: ya kliniğe kendi satırını okuma izni verilir ya da fiyat yalnız sunucudan alınır. Seçim kurucunun.
- `resolve_item_price` paylaşılan bir veritabanı fonksiyonu; değişikliği §11'deki onaylı veritabanı yoluyla yapılır.

### 7.3 Faturada görünüm

- Genel orandan fiyat alan kalemin fatura satırında **katalog fiyatı, indirim yüzdesi ve net tutar** görünür. Fatura kalemlerinde kalem indirimi alanları zaten var (`invoice_items.discount_type = 'percent'`, `discount_value`, `net_total`); bu satırlar onları kullanır.
- Bunun için sipariş kaleminin, fiyat belirlenirken katalog fiyatını ve uygulanan oranı hatırlaması gerekir (bugün yalnız net `price` saklanıyor). Saklama biçimi kurucunun.
- Net tutar, oran doğrudan fiyata yansısaydı çıkacak tutarla kuruşu kuruşuna aynıdır. Ciro, karlılık ve bakiye net tutar üzerinden yürüdüğü için değişmez.
- Fatura PDF'i ve e-fatura kalem indirimini zaten taşıyor; ek iş beklenmez, kurucu doğrular.
- Hizmet bazlı özel yüzdeden (`discount_percent`) fiyat alan kalemler bugünkü gibi net fiyatla görünür. *(Benim kararım: kapsamı kullanıcının istediği oranla sınırlı tuttum; aynı görünüm sonra onlara da açılabilir.)*

### 7.4 Ekranlar

- **Klinikler ekranı, indirim penceresi:** "Bu oran yeni fatura oluştururken otomatik uygulanır." cümlesi şuna değişir: "Bu oran, kliniğe özel fiyatı olmayan hizmetlerde yeni siparişlere uygulanır."
- **Fiyat listesi, kliniğin özel listesi:** kendi fiyatı olmayan hizmetler genel orandan çıkan fiyatla ve "Genel indirim %X" işaretiyle görünür. Böylece kullanıcı siparişte çıkacak fiyatı listede görür. *(Benim kararım.)*
- Kaydetme hatası 2026-11-05'te düzeltildi (`onConflict` artık `(lab_id, clinic_id)`; §12.9).

## 8. İndirim sütunu ve liste ayarı

- **Liste ayarı:** lab ekstresindeki "Liste ayarı" penceresine yeni bir seçenek gelir: "İndirim gösterimi: Yüzde | Tutar".
  - Varsayılan *Tutar*. *(Benim kararım: bakiyeyle doğrudan karşılaştırılabildiği için.)*
  - Ayar mevcut ekstre ayarlarıyla aynı yerde ve biçimde saklanır (`siman_statement_prefs_v1`, kullanıcıya özel, cihazda). Eski kayıtlı ayarlar yeni anahtarın varsayılanıyla açılır.
- **Yüzde gösterimi:**
  - Ekstre indirimi satırında: kayıttaki yüzde. Tutarla girilmişse `indirim / dayanak × 100`.
  - Fatura satırında: `toplam indirim / indirim öncesi brüt × 100`. Brüt = kalemlerin `total` toplamı.
  - Bir ondalıkla yazılır.
- **Tutar gösterimi:** indirim tutarı, ekstrenin para biriminde, eksi işaretiyle.
- **Sütunun görünürlüğü:** sütun, görüntülenen dönemde en az bir indirim (indirim satırı ya da indirimli fatura) varsa görünür, yoksa gizlenir. *(Benim kararım: indirimsiz kliniklerde boş sütun tabloyu sıkıştırmasın.)*
- Ekran, PDF ve Excel aynı ayarı kullanır.
- **Klinik paneli:** ekstrede ayar yok (bugün de yok). Orada sütun *Tutar* gösterir.

## 9. Tasarım kuralları

Uygulamanın kendi kuralları geçerlidir (`my-expo-app/CLAUDE.md`):

- **Diller:** dört dil birlikte (tr, en, de, fa).
- **Koyu tema:** aynı anda yapılır; beyaz butonlar `U.plainBtn`.
- **Pencereler:** ekranın ortasında açılır, arka plan `U.modalOverlay` ile bulanıktır.
- **İpuçları:** GlassTooltip kullanılır.
- **Kenar boşluğu:** `PAGE_PADDING`.
- **Para:** para birimi tabana bağlıdır, sabit ₺ yazılmaz. Para formatlayıcıları defansiftir: `(Number(n)||0)`.
- **İkonlar:** yalnız `core/ui/icons`.
- **Ortak kod:** paylaşılan kod (ortak cari PDF şablonu) yalnız açıkça istenince açılan bir seçenekle değişir.

## 10. Metinler (öneri, onaya sunulur)

| Yer | Metin |
|---|---|
| Ekstre düğmesi | İndirim ekle |
| Pencere başlığı | Ekstre indirimi |
| Alanlar | Dönem · İndirim türü · Yüzde · Tutar · Hesaplanan indirim · Tarih · Açıklama |
| Önizleme | Dönemin fatura toplamı · Bu döneme önceki indirimler · Faturalara dağıtılacak · Alacağa kalacak · Yeni bakiye |
| Kaydet | İndirimi kaydet |
| Hata: değer | İndirim 0'dan büyük olmalı. |
| Hata: üst sınır | Bu döneme verilen indirimlerin toplamı dönemin fatura toplamını aşamaz. |
| Hata: dönem | Bu dönemde kesilmiş fatura yok. |
| Satır etiketi | Dönem indirimi |
| Fatura ödeme geçmişi | Ekstre indirimi |
| Sütun | İndirim |
| Sütun ipucu | Faturadaki indirim tutara zaten yansımıştır; bakiyeden ayrıca düşülmez. Ekstre indirimleri kendi satırında bakiyeyi düşürür. |
| Döküm satırı | İndirimler |
| Liste ayarı | İndirim gösterimi · Yüzde · Tutar |
| Silme onayı | Bu indirim silinsin mi? Kliniğin bakiyesi indirim kadar artar ve faturalardaki indirim payları geri alınır. |
| Fatura alanı | Fatura indirimi |
| Fatura kilidi | Kesilmiş faturada indirim değiştirilemez. Ekstreden indirim ekleyebilirsiniz. |
| Klinik indirim penceresi | Bu oran, kliniğe özel fiyatı olmayan hizmetlerde yeni siparişlere uygulanır. |
| Fiyat listesi işareti | Genel indirim %X |

## 11. Kısıtlar

- **Yeni tablo:** RLS ile açılır. `lab_id` FK'sı `labs`'a gider; mevcut tenant guard'larına uyulur. Klinik ve hekim yalnız kendi kayıtlarını okur, yazamaz. Yazma yalnız SECURITY DEFINER RPC'ler üzerinden yapılır ve lab yetkisi orada denetlenir.
- **Veritabanı değişiklikleri:**
  - Her biri için `.before.txt`, `supabase/rollbacks/` altında `.down.sql` ve geri alınan bir deneme sorgusu hazırlanır.
  - Uygulamadan önce kullanıcıdan açık onay alınır.
  - Denemede bildirim/mesaj gönderen fonksiyonlar çağrılmaz.
  - Canlı görünümler değiştirilmeden önce `pg_get_viewdef` ile yedeklenir.
- **Bakiye tek kaynak:** bakiye, gecikmiş borç, hatırlatma tutarı ve ciro bugün hangi görünüm ve fonksiyonlardan geliyorsa indirim oralara eklenir. İstemcide yeni bir bakiye hesabı kurulmaz. Mevcut istemci yedekleri (`billed − paid`) indirim dağıtımını ödenmiş tutar üzerinden zaten görür; ama "Ödenen" gibi tahsilat özetleri indirimi dışlamalıdır.
- **Kilitli faturalar:** kesilmiş ya da e-fatura olarak gönderilmiş faturalar hiçbir yoldan değişmez.
- **Para bütünlüğü:** mevcut korumalar (`payments_financial_guard`: aynı para birimi, fazla ödeme yok) dağıtım paylarına da uygulanır.
- **Doğrulama:** `tsc` 0 hata. Saf hesaplar (yüzde/tutar, dağıtım planı, Luca kalem dağıtımı, gösterim, genel oranla fiyat çözümü) `node --test` ile test edilir.
- **Paylaşılan fiyat fonksiyonu:** `resolve_item_price` sipariş, tarama ve WhatsApp siparişlerinde kullanılıyor. Değişiklikten önce kullanıcıya etkisi anlatılır ve onay alınır (CLAUDE.md değişiklik kuralı). Genel oranı olmayan klinikte her yolun sonucu bit bit aynı kalmalı.
- **Yayın:** yalnız kullanıcı "deploy" dediğinde yapılır. Edge fonksiyonu yayını (efatura-luca) ayrıca onay ister.

## 12. Koddaki dokunma noktaları (keşif, 2026-11-05)

Fonksiyon ve görünümlerin en güncel tanımı, onları en son yeniden tanımlayan migration'dadır.

1. **Bakiye görünümleri:** `v_clinic_balance`, `v_clinic_balance_ccy`, `lab_receivables_summary()` — `20261026100000_tek_tanim_katmani.sql`.
   - Avans = makbuzun dağıtılmamış kısmı (`total_base − allocated_base`).
   - `_ccy` görünümü faturalara INNER JOIN yapar; faturası olmayan para biriminde alacak görünmez.
2. **Tahsilat altyapısı:**
   - `payments`: `invoice_id` NOT NULL, `amount > 0`, `receipt_id`, `payments_financial_guard`.
   - Makbuz tabloları: `clinic_receipts`, `clinic_receipt_lines`.
   - Makbuz RPC'leri: `record_clinic_receipt`, `_receipt_alloc_plan`, `preview_clinic_receipt`, `alloc_receipt_to_invoices`, `update_/delete_clinic_receipt`, `apply_clinic_credit`.
   - Ödeme durumu tetikleyicisi: `recalc_invoice_payment_state` (021).
   - Kasa: `_cash_sync` (`20261029090000`).
3. **Lab ekstresi** (`modules/invoices/screens/ClinicStatementScreen.tsx`):
   - Satırları `buildStatementLines` (`buildStatementHtml.ts`) üretir. Makbuz satırları `lib/receiptStatement.ts` ile eklenir. Satır türü `'invoice'|'payment'`.
   - Ayarlar: `lib/statementPrefs.ts`, `hooks/useStatementPrefs.ts`, `components/StatementPrefsModal.tsx`.
   - KDV: `lib/statementVat.ts`, `components/StatementVatSummary.tsx`.
   - Çıktılar: Excel `exportExcel` (istemci CSV); PDF `buildCariStatementHtml` (tedarikçiyle ortak).
   - Tahsilat penceresi: `ClinicReceiptModal`.
4. **Klinik paneli:** `finance-clinic/screens/FinanceHubScreen.tsx`, aynı ekranı `selfView` ile açar. `finance-clinic/screens/StatementScreen.tsx` ve `export.ts` ölü görünüyor; dokunulmaz.
5. **Fatura toplamları ve toplu fatura:**
   - Toplamı yazanlar: `recalc_invoice_totals`, `aa_enforce_invoice_totals` (`20260913140000`), `set_invoice_amount_base` (`20261031090000`), istemci `patchItem`.
   - Toplu fatura: `create_bulk_invoice` (`20261028146000`). Çağıranlar: `BulkInvoiceModal` (InvoicesListScreen) ve `handleBulkBill` (ClinicBalanceScreen).
   - Detay ve çıktı: `InvoiceDetailScreen.tsx`, `buildInvoiceHtml.ts`.
6. **E-fatura:** `supabase/functions/efatura-luca/index.ts`, `_shared/lucaInvoice.ts` (`buildLucaInput`, toplam kontrolü), `_shared/luca.ts` (`computeTotals`), `_shared/lucaMerge.ts`, `EFaturaPreviewModal`.
7. **Ciro ve karlılık:**
   - `finance_period_metrics` — ciro KDV dahil.
   - `profitability_summary`, `profitability_revenue_ccy` — KDV hariç (`20261101120000`).
   - `_profit_revenue_lines` (`20261101130000`).
   - `profitability_by_clinic`, `profitability_by_service` (`20261101121000`).
   - `v_monthly_finance_summary` (`20261026140000`).
8. **Hatırlatma:** `_reminder_amounts`, `_clinics_to_remind`, `my_payment_reminder`, `my_open_balance_by_currency`, `v_invoice_reminders`, `run_auto_payment_reminders` (`20261026110000`).
9. **Bu işe ait olmayan, keşifte görülen mevcut sorunlar.** Ayrı ele alınır; bu iş yalnız kendi yeni sorgularında aynı hatayı tekrarlamaz.
   - Bakiye görünümlerindeki avans alt sorguları yalnız `clinic_id` ile süzülüyor, `lab_id` ile süzülmüyor. **2026-11-05 incelendi: sızıntı yok.** Her lab, bağlandığı klinik için kendi `clinics` satırını açıyor (`_clinic_connect`); makbuzun lab'ı klinik satırından alınıyor (`record_clinic_receipt`). Bu yüzden bir `clinic_id` yalnız tek bir lab'a ait. Canlıda da çok-lab'lı klinik satırı, lab'ı uyuşmayan fatura ya da makbuz yok (hepsi 0). Yeni indirim alt sorguları yine de `lab_id` ile eşleşir; bu bedava bir sigorta.
   - `clinic_discounts` (kliniğe indirim oranı): kaydı `onConflict: 'clinic_id'` kullanıyordu, oysa benzersiz anahtar `(lab_id, clinic_id)`. Her kayıt 42P10 ile reddediliyordu; canlıda tablo boş. **2026-11-05 düzeltildi** (`modules/clinics/clinicDiscount.ts`, hata Kaydet'in yanında). Oranın fiyata uygulanması bu işin parçası oldu (§7).
   - Kalem düzenleme kilidi yalnız arayüzde; veritabanı kalemleri yalnız e-fatura ETTN'si olunca kilitliyor.

## 13. Kurucuya kalanlar

- Depolama yolu (§5.2: yeni tablo + `payments` satırları ya da `clinic_receipts` türü), tablo ve sütun adları, RPC imzaları.
- `İND-n` numarasının üretim yöntemi.
- İndirim öncesi ara toplamın faturada saklanması ya da hesaplanması.
- Karlılık işlem kırılımındaki "Ekstre indirimleri" satırının biçimi (§5.6).
- `create_bulk_invoice`'a parametre eklemek mi, aynı işlemde sonradan yazmak mı (§6.2).
- Sipariş kaleminin katalog fiyatını ve uygulanan genel oranı nasıl sakladığı (§7.3).
- Hekim/klinik panelinden açılan siparişte genel oranın nasıl okunacağı: kliniğe okuma izni mi, sunucudan fiyat mı (§7.2).
- Üç parçanın sırası. Genel oran (§7) bağımsızdır, ayrı yayınlanabilir.

## 14. Başarı ölçüsü

Bu konuşmayı başlatan durum bir dakikadan kısa sürede çözülür. Lab kullanıcısı:

1. Kliniğin ekstresini açar ve dönemi seçer.
2. "İndirim ekle" ile yüzde ya da tutar indirim girer.
3. PDF'i yeniden alır. PDF'te indirim satırı ve düşmüş bakiye görünür.

Ardından şunların hepsi doğrudur:
- Klinik kendi panelinde aynı bakiyeyi görür.
- Klinik indirimli tutarı ödediğinde dönemin bütün faturaları *Ödendi* olur.
- Karlılık'ta o dönemin cirosu indirim kadar düşer.
- Tahsilat raporu indirimi içermez.
- Ödeme hatırlatması yeni tutarı kullanır.

Genel oran için: kliniğe %10 girilir. Özel fiyatı olmayan bir hizmetle yeni sipariş açılınca fiyat kataloğun %10 eksiği çıkar. Özel fiyatı olan hizmetin fiyatı değişmez. Faturada o satır katalog fiyatı, %10 ve net tutarla görünür.

## 15. Kullanıcı kararları (bu konuşmada)

- Ekstre indiriminde faturaların tutarı aynı kalır; indirim borçtan düşen ayrı bir kayıttır.
- Ekstrede görünüm: A, yani ayrı satır.
- Ekstre indiriminin ayrıntıları onaylandı: giriş, tarih, yüzde dayanağı, para birimi, PDF/Excel, klinik paneli, silme ve aktivite kaydı.
- Toplu faturada indirim faturanın kendisinde görünür.
- Fatura altı indirimin ayrıntıları onaylandı: taslakta değiştirilebilir, kesilince kilitlenir, kalem indirimlerinden sonra uygulanır, KDV indirimli tutardan hesaplanır, ekstrede sütun yalnız bilgi verir.
- Raporlar: ekstre indirimi ciroyu düşürür, tahsilat sayılmaz, gecikmiş borcu ve hatırlatma tutarını azaltır.
- Ekstre indirimi KDV'yi düşürmez; faturalar ve KDV değişmez, karlılıktan indirimin tamamı düşer. (Faturaların altına dağıtıp KDV'yi düşüren düzen sunuldu; kullanıcı "faturalar aynı kalsın" dedi.)
- Payını taşıyan fatura iptal edilirse pay kliniğin alacağına geçer.
- Dönem faturaları ödenmişse kalan indirim kliniğin alacağı olur, sonraki faturalardan düşer.
- Kliniğin genel indirim oranı özel fiyat listesine uygulanır, yalnız listede kendi fiyatı olmayan hizmetlere. Faturada indirim tutarı görünür.

**Kurucu kontrolünde benim verdiğim kararlar** (yerleri belgede "Benim kararım" diye işaretli):
- Aynı döneme birden fazla indirim girilebilir; üst sınır toplamdır, yüzde kalan tutara uygulanır (§5.3).
- Ekstre indirimi e-faturası gönderilmiş faturalara da dağıtılabilir, çünkü faturayı değiştirmez (§5.2).
- Pay sahibi faturanın toplamı sonradan düşerse aşan pay kliniğin alacağına geçer (§5.2).
- Toplu faturadaki fatura indirimi alanı kliniğin genel oranıyla dolmaz; yoksa indirim iki kez düşer (§6.2).
- Öncelik: özel fiyat → özel yüzde → genel oran → kampanya → katalog (§7.1).
- Faturada indirimli görünüm yalnız genel orandan gelen kalemlerde; hizmet bazlı özel yüzde bugünkü gibi kalır (§7.3).
- Fiyat listesindeki klinik görünümü genel orandan çıkan fiyatı işaretli gösterir (§7.4).
