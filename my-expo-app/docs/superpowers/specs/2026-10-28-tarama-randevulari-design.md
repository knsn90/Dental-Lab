# Tarama randevuları (ağız içi tarama + fotogrametri) — tasarım

**Tarih:** 2026-10-28
**Kaynak:**
- Kullanıcıyla beyin fırtınası (2026-10-28).
- Canlı şema ve kod taraması (bölüm 7).
- Ekran tasarımı bu belgeden SONRA ayrıca konuşulacak (kullanıcı: "önce planlamayı yap sonra tasarım tarafını konuşalım"). Bölüm 5 yalnız neyin nerede olduğunu söyler, görünüşü değil.

## 1. Amaç ve neden

Lab'lar kliniklere iki yerinde hizmet veriyor: **ağız içi tarama** (Nexadent: Medit i900 Mobility) ve **fotogrametri** (Nexadent: T-Marker). Lab'dan bir teknisyen cihazla kliniğe gider, tarama yaklaşık 1–2 saat sürer. Randevular telefonla verilir ve hiçbir yerde kayıtlı değildir.

Kullanıcının anlattığı gerçek olaylar:
- "Hekim telefonla aradı, yarın tarama var gelebilir misiniz akşam saatlerinde dedi. Biz de hemen geliriz dedik, sonra unutuldu, saati vs."
- "Cuma gününe, kaç gün sonrası için başka kliniğe randevu verildi ama kayıt tutulmadığı için unutuldu."
- "Sonra da kayıt tutamadık, kime hangi taramayı yaptık diye."

Taramadan sonra üç şeyden biri olur: tarama mevcut bir siparişe bağlanır, yeni sipariş açılır ya da sipariş olmadan yalnız tarama hizmeti olarak kapanır. Tarama hizmetleri fiyat listesinden faturalanır, ama siparişe dönerse ücretsiz sayılabilir. Bu karar lab'dan lab'a değişir.

**Başarı:**
- Telefonda verilen her randevu kayda girer, kimin aldığı da yazılır.
- Admin ve lab yöneticisi her sabah o günün, her akşam ertesi günün programını kimseye sormadan alır.
- Randevu verirken sistem uygun saatleri önerir. Yetişilemeyecek ya da çakışan bir saat seçilirse uyarır.
- Yapılan her tarama ya bir siparişe bağlanır ya da ayrı kalem olarak faturalanır. Hiçbiri unutulmaz.

## 2. Hedefler, hedef dışı, kaçınılacaklar

**Hedefler**
- **Randevu kaydı:** klinik, hizmet(ler), tarih-saat, süre, teknisyen, cihaz.
- **Lab'a özel ayarlar:** cihazlar ve tarama hizmetleri her lab'da kendi tanımlanır.
- **Akıllı zamanlama:** uygun saat önerisi, ayrıca yol, çakışma ve çalışma saati uyarıları.
- **Tarama sonrası karar:** siparişe bağla, yeni sipariş aç ya da yalnız tarama olarak kapat.
- **Lab'a özel ücret kuralı:** her hizmette "siparişe dönerse ücretsiz" açık ya da kapalı.
- **Faturalama:** ücretli tarama siparişin faturasına girer; siparişe dönmeyen tarama kliniğe ayrı taslak faturayla gider.
- **Takvim:** Özet sayfasında randevu takvimi.
- **Hatırlatmalar:**
  - Admin ve lab yöneticisine sabah bugünün, akşam yarının programı.
  - Teknisyene yalnız kendi programı.

**Hedef dışı (ilk aşama)**
- **Medit Link entegrasyonu.** Dosyalar bugünkü gibi elle indirilip Siman'a yüklenir.
- **Kliniğin ya da hekimin kendisinin randevu istemesi veya randevuyu görmesi.**
- **Kliniğe hatırlatma mesajı.**
- **Rota optimizasyonu.** Bir günün tüm randevularını yeniden sıralamak bu işin kapsamında değil; sistem yalnız tek randevu için saat önerir.

**Kaçınılacaklar** (çalışsa da başarısızlık sayılır)
- **Engelleyen uyarılar.** Kullanıcı: "uyarı versin". Çakışma ve yol uyarısı kaydı asla engellemez.
- **Unutulan karar.** "Karar bekliyor" durumundaki tarama sessizce kaybolmamalı. Kendiliğinden kapanmaz, sabah bildiriminde görünür.
- **Taramanın iki kez faturalanması.** Aynı tarama hem siparişin faturasına hem ayrı faturaya giremez. Karar değişirse önceki fatura kalemi geri alınır (bkz. 4.8).
- **Boş program bildirimi.** Program boşsa bildirim gitmez.
- **Uydurma yol süresi.** Tahmini süreyle Google süresi ayırt edilmeden gösterilmez; tahmin olduğu ekranda yazar.

## 3. Kullanıcının kararları (2026-10-28)

1. **Hizmetler:** iki tür var, ağız içi tarama ve fotogrametri. Her lab kendi hizmetlerini ve cihazlarını tanımlar ("her labda farklılık gösterebilir").
2. **Ücret lab'ın kararı:** "ücret yansıtıp yansıtmamak labın kararına kalsın". Siparişe dönen taramanın ücretli olup olmayacağı hizmet türü bazında ayarlanır.
3. **Siparişe bağlanan ücretli tarama** o siparişin faturasına eklenir. **Siparişe dönmeyen tarama** kliniğe ayrı kalem olarak faturalanır.
4. **Teknisyen gider:** randevuya bir teknisyen atanır.
5. **Cihaz çakışması uyarı verir, engellemez:** "uyarı versin çünkü nexadentte tek cihaz var. hatta cihazlarda tanımlanabilir, 1'den fazla cihazı olan lab'lar bölüştürebilir". Cihaz randevuda seçilir.
6. **Süre:** "yaklaşık 1-2 saat sürüyor".
7. **Dosyalar:** Medit Link'e yükleniyor. Entegrasyon yok; dosyalar indirilip Siman'a elle yüklenir.
8. **Akıllı zamanlama:**
   - Kullanıcı: "kliniğin lab ile mesafesi. iki tarama aynı klinikteyse. ya da arka arkaya olan randevularda kliniklerin birbirinden mesafesine göre akıllı zamanlama yapılabilir."
   - Ardından: "uygun saatleri önersin, yetişilemezse de uyarsın".
9. **Karar:** taramanın siparişe bağlanması, yeni sipariş açılması ya da yalnız tarama olarak kapanması kararını **admin ya da yönetici** verir.
10. **Hatırlatma:** admin ve lab yöneticisine her sabah o günün, her akşam yarının tarama programı gider.
11. **Takvim:** Özet sayfasında randevu takvimi olur.
12. **Birden çok hasta:** "aynı ziyarette birden fazla hasta taranabiliyor". Bu yüzden karar ve faturalama hasta başınadır (bkz. 4.1, 4.7, 4.8).
13. **Kapsam kararları:** bölüm 1–2'deki geri okumalar ("evet doğru") olduğu gibi onaylandı. Bu belgede "(benim kararım)" diye işaretlenen her şey kullanıcının değil benimdir; bölüm 6'da toplu listelenir.

## 4. Kurallar

### 4.1 Randevu kaydı

**İki düzey var** (kullanıcı: "aynı ziyarette birden fazla hasta taranabiliyor"):
- **Randevu:** bir kliniğe yapılan tek ziyaret. Bir zaman bloğu, bir teknisyen ve ziyarette kullanılacak cihazlar bunu tanımlar. Çakışma ve yol kontrolleri bu düzeyde yapılır.
- **Tarama:** ziyarette taranan her hasta için bir satır. Hasta adı, o hastaya uygulanan hizmet(ler), siparişe bağlantı, karar, fiyat ve dosyalar bu düzeydedir.

Aynı ziyarette taranan hastalar ayrı randevu açılmadan tek randevunun altında durur. Böylece aynı klinikte sahte çakışma uyarısı oluşmaz.

**Randevu: zorunlu alanlar**
- Klinik.
- Tarih ve başlangıç saati.
- En az bir tarama hizmeti. Ziyarette iki hizmet birden olabilir (benim kararım). Hizmet randevu düzeyinde de seçilir, çünkü hangi cihaz türünün gerektiğini o belirler.
- Teknisyen.

**Randevu: isteğe bağlı alanlar**
- Hekim.
- Not.
- Cihaz, hizmet başına bir tane.

**Taramalar (hasta satırları)** (benim kararlarım)
- Randevu verilirken hasta biliniyorsa satır eklenir; bilinmiyorsa liste boş kalabilir.
- "Tarama yapıldı" denirken en az bir tarama satırı ve her satırda hasta adı **zorunludur**. Bu, "kime hangi taramayı yaptık" sorusunun cevabıdır.
- Her satırda hasta adı, hizmet(ler) ve not bulunur. Satırın hizmetleri randevunun hizmetleri arasından seçilir.
- Satır siparişe önceden bağlanabilir: iş baştan belliyse karar anında bu sipariş hazır seçili gelir.
- Satır sayısının üst sınırı yoktur.

**Beklenen sonuç** (kullanıcı, 2026-10-28, uygulama sırasında): randevu verilirken "Bu tarama sonunda ne olacak?" sorulur: mevcut siparişe bağlanacak (sipariş isteğe bağlı seçilir) / yeni sipariş açılacak / yalnız tarama / belli değil (varsayılan). Kesin karar değildir; karar penceresinde varsayılan olarak hazır gelir. Sütunlar `scan_appointments.intent`, `intended_order_id` (migration 20261028145000).

**Süre:** varsayılan 90 dakikadır ve randevuda değiştirilebilir. Varsayılan lab ayarından gelir. Hasta sayısı arttıkça süre kendiliğinden uzamaz; randevuyu veren kişi süreyi elle ayarlar (benim kararım).

**Otomatik yazılanlar**
- Randevuyu oluşturan kişi ve oluşturma zamanı.
- Kaynak: telefon, WhatsApp, yüz yüze ya da diğer. Kullanıcı seçer; varsayılan telefondur (benim kararım).

**Erteleme:** başka güne ya da saate almak ayrı bir durum değildir; kaydın tarih ve saati değişir. Eski tarih geçmişte kalır (bkz. 4.10).

### 4.2 Durumlar

**Randevu:**
```
planlandi ──"Tarama yapıldı"──▶ yapildi ──(tüm taramalar kararlı)──▶ kapandi
    │
    └──"İptal"──▶ iptal
```

**Tarama** (hasta satırı; randevu `yapildi` olunca oluşan ya da önceden eklenmiş satırlar):
```
karar_bekliyor ──karar──▶ kapandi (siparise_baglandi | yeni_siparis | yalniz_tarama)
```

**Durum bağları**
- Randevu, tüm tarama satırlarında karar verilince kendiliğinden `kapandi` olur.
- Bir satırın kararı geri alınınca randevu yeniden `yapildi` durumuna döner.
- "Karar bekliyor" sayıları ve listeleri **tarama satırı** sayar, randevu saymaz.

**Kim neyi yapar**
- "Tarama yapıldı": atanan teknisyen, admin ve yönetici. İsteğe bağlı kısa bir not eklenebilir. Hasta satırları bu adımda tamamlanır (bkz. 4.1).
- Hasta satırı ekleme ve düzeltme, karar verilmeden önce: teknisyen, admin ve yönetici.
- Karar: yalnız admin ve yönetici (kullanıcı kararı 9). Her satır için ayrı verilir.

**İptal**
- Yalnız `planlandi` durumundan yapılabilir.
- İptal nedeni zorunludur. Seçenekler: "Hasta gelmedi", "Klinik iptal etti", "Lab iptal etti", "Diğer" (benim kararım).
- İptal edilen randevu ücretlendirilmez.

**Geri al**
- "Tarama yapıldı" yanlışlıkla basıldıysa, hiçbir satırda karar verilmemişse geri alınabilir.
- Verilmiş bir satır kararı değiştirilebilir. Fatura etkisi 4.8'deki kurala göre geri alınır.
- Kararı geri alınan satır `karar_bekliyor` durumuna döner.

**İşaretlenmemiş randevu** (benim kararım)
- Saati geçtiği hâlde hâlâ `planlandi` olan randevu kendiliğinden durum değiştirmez. Sistem taramanın yapılıp yapılmadığını bilemez.
- Sabah bildiriminde "İşaretlenmemiş N randevu" satırı çıkar.
- Karar bekleyenler listesinin başında ayrı bir grup olarak durur. Oradan "Tarama yapıldı" denir ya da nedeniyle iptal edilir, ör. "Hasta gelmedi".

**Sipariş statüsü:** yeni sipariş statüsü eklenmez. Randevu ayrı bir kayıttır; sipariş durum makinesi, kanban ve KPI'lar etkilenmez.

### 4.3 Cihazlar ve hizmetler

**Cihazlar:** lab'ın mevcut demirbaş tablosu `equipment` kullanılır.
- Bir demirbaş "tarama cihazı" olarak işaretlenir ve hangi hizmet türüne ait olduğu seçilir: `intraoral` ya da `photogrammetry`.
- Ayrı bir cihaz kaydı açılmaz; aynı cihaz iki yerde tanımlanmasın diye (benim kararım).
- Builder, `equipment` tablosu bu işe uymuyorsa nedenini yazarak ayrı tablo önerebilir.

**Hizmetler:** lab'ın fiyat listesi `lab_services` kullanılır. Nexadent'te "Intraoral Tarama hizmeti" ve "Photogrammetri Hizmeti" zaten tanımlı (birim "Seans"). Hizmete iki alan eklenir:
- **Tarama türü:** boş (tarama hizmeti değil), `intraoral` ya da `photogrammetry`. Randevu formu yalnız tarama türü dolu hizmetleri listeler.
- **"Siparişe dönerse ücretsiz":** açık ya da kapalı. Varsayılan açıktır (benim kararım).
  - Kullanıcı ilk konuşmada ağız içi taramanın ücretsiz, fotogrametrinin ise "herhalde ücretli" olduğunu söyledi.
  - Bu yüzden lab ilk kurulumda bu ayarı her hizmet için kendisi seçer.

**Cihazsız lab:** hiç tarama cihazı tanımlamamış bir lab da randevu alabilir. Cihaz alanı boş kalır ve cihaz çakışması denetlenmez.

### 4.4 Çakışma ve yol uyarıları (engellemez)

Randevu kaydedilirken ya da saati değiştirilirken aşağıdaki kontroller yapılır. Her biri sarı bir uyarı satırı olarak görünür ve kayıt yine de yapılır.

**Kontroller**
1. **Teknisyen çakışması:** aynı teknisyenin zaman aralığı kesişen başka bir `planlandi` randevusu var.
2. **Cihaz çakışması:** aynı cihazın zaman aralığı kesişen başka bir `planlandi` randevusu var.
3. **Yetişilemez, önceki randevudan:** aynı teknisyenin o günkü önceki randevusu biter, üstüne o klinikten bu kliniğe yol süresi eklenir; sonuç bu randevunun başlangıcından geç.
4. **Yetişilemez, sonraki randevuya:** bu randevu biter, üstüne buradan sonraki kliniğe yol süresi eklenir; sonuç sonraki randevunun başlangıcından geç.
5. **Günün ilk randevusu:** lab'ın tarama saatleri başlar, üstüne lab'dan kliniğe yol süresi eklenir; sonuç başlangıçtan geç (benim kararım).
6. **Tarama saatleri dışında:** randevu lab'ın tarama saatleri dışına taşıyor.

**Kurallar**
- Uyarı metni kaç dakika açık olduğunu söyler, ör. "Önceki randevudan yola 35 dk gerekiyor, 20 dk açık".
- **Aynı klinikte arka arkaya iki randevu:** aralarındaki yol süresi 0 sayılır.
- Teknisyenin randevular arasında lab'a döndüğü varsayılmaz. Doğrudan bir klinikten diğerine gider (benim kararım).
- **Yol payı:** yol süresine her geçişte sabit bir hazırlık payı eklenir. Varsayılan 10 dakikadır ve lab ayarından değişir (benim kararım: cihazı kurma ve toplama süresi).

### 4.5 Uygun saat önerisi

**Girdi:** klinik, hizmet(ler), tarih, süre ve isteğe bağlı bir tercih aralığı. Aralık hazır seçeneklerden ("sabah", "öğle", "akşam") seçilir ya da elle girilir; hazır aralıkların saatleri benim kararım, lab ayarına gerek yok.

**Çıktı:** en fazla 5 başlangıç saati önerisi (benim kararım). Her öneride:
- Saat.
- Teknisyen.
- Cihaz.
- Bu öneri için hesaplanan yol süreleri: önceki ve sonraki geçiş, tahmini mi Google mı olduğu belirtilerek.

**Uygun saat koşulları**
- Lab'ın tarama saatleri içinde kalır.
- 15 dakikalık adımlarla aranır (benim kararım).
- Teknisyenin ve cihazın o aralıkta başka randevusu yoktur. Hizmet bir cihaz türü gerektiriyorsa, o türden boş en az bir cihaz bulunur.
- Teknisyenin önceki ve sonraki randevularıyla yol açısından yetişilebilirdir (4.4'teki kontroller 3, 4 ve 5 temiz).

**Sıralama** (benim kararım)
1. Tercih aralığına uyanlar önce gelir.
2. Ardından en az boşta bekleme ve yol süresi olanlar gelir. Böylece aynı bölgedeki randevular yan yana toplanır.
3. Teknisyenler arasında yük dengelenir: o gün daha az randevusu olan teknisyen öne geçer.

**Boş sonuç:** uygun saat yoksa öneri listesi boş kalır ve "Bu gün için uygun saat bulunamadı" yazar. Kullanıcı yine de elle saat girip uyarılarla kaydedebilir.

**Teknisyen havuzu:** öneri lab'ın tüm aktif teknisyenleri arasından seçer. Lab, randevuya gidebilecek teknisyenleri işaretleyebilir. Hiç işaret yoksa tüm teknisyenler havuzdadır (benim kararım).

### 4.6 Yol süresi kaynağı

**Birincil kaynak: Google Maps.**
- Trafik dahil sürüş süresi, lab'ın mevcut "maps" sağlayıcı anahtarıyla hesaplanır. Bu, kurye haritasının kullandığı anahtardır (`get_maps_browser_key` RPC).
- Bu anahtar bir **tarayıcı anahtarıdır**. Hesap web istemcide Google Maps JS SDK ile yapılır (Distance Matrix ya da Routes).
- Sunucu tarafında hesap gerekirse ayrı ve kısıtsız bir anahtar gerekir. Builder bunu ilk aşamada açmaz.

**Yedek: kaba tahmin.**
- Anahtar yoksa, native'deysek ya da adres koordinata çevrilemediyse kuş uçuşu mesafeden tahmin yapılır.
- Formül: kuş uçuşu mesafe × 1,4 yol katsayısı ÷ 30 km/sa şehir içi hız, en az 10 dakika (değerler benim kararım).
- Ekranda "tahmini" etiketiyle görünür.
- Hiç koordinat yoksa yol kontrolü yapılmaz ve uyarıda "Klinik konumu bilinmiyor, yol süresi hesaplanmadı" yazar.

**Koordinatlar**
- **Klinikler:** `clinics` tablosunda bugün koordinat yok. Kliniğe enlem, boylam ve "koordinatın çıkarıldığı adresin özeti" alanları eklenir.
  - Koordinat ilk ihtiyaçta bir kez Google Geocoder ile çıkarılır.
  - Adres değişince özet tutmaz ve koordinat yeniden çıkarılır.
  - `clinics.address` bugün karışık durumda: düz metin, JSON ya da boş. Geocoder'a verilecek tek satırlık adresi builder bu üç biçimden üretir.
- **Lab:** `labs.location_lat/lng` alanları zaten var (devam kontrolü için). Boşsa lab adresinden aynı yolla çıkarılır.

**Önbellek:** iki nokta arasındaki süre saat dilimine göre (sabah, öğle, akşam) önbelleğe alınır. Böylece aynı çift için tekrar tekrar Google'a gidilmez. Önbelleğin süresi ve yeri builder'a bırakılmıştır.

### 4.7 Tarama sonrası karar

Karar **her tarama satırı (hasta) için ayrı** verilir. Aynı ziyaretteki bir hasta siparişe bağlanırken bir diğeri yalnız tarama olarak kapanabilir. Admin ya da yönetici her satır için üç yoldan birini seçer.

1. **Mevcut siparişe bağla.**
   - Seçim listesi o kliniğin iptal edilmemiş siparişlerini gösterir, en yenisi üstte. Satırda ön bağlantı varsa o sipariş seçili gelir.
   - Hasta adı eşleşen siparişler listenin başına alınır (benim kararım).
   - Bir sipariş birden çok tarama satırına bağlanabilir; ör. aynı hastanın iki ayrı ziyareti.
   - Teslim edilmiş siparişler de seçilebilir (benim kararım: tarama bazen eski bir işin devamıdır).
2. **Yeni sipariş aç.**
   - Mevcut yeni-sipariş sihirbazı açılır. Klinik ve hekim randevudan, hasta adı tarama satırından dolu gelir.
   - Sipariş kaydedilince o tarama satırı ona bağlanır.
   - Sihirbaz kaydetmeden kapatılırsa karar verilmemiş sayılır.
3. **Yalnız tarama olarak kapat.**

Karar kaydedilince satır `kapandi` olur. Kararı kimin, ne zaman verdiği kaydedilir. Fatura etkisi 4.8'deki kurala göre işler.

**Toplu karar** (benim kararım): karar ekranında birden çok satır seçilip "Yalnız tarama olarak kapat" tek seferde uygulanabilir. Siparişe bağlama ve yeni sipariş satır satır yapılır.

**Bağlı sipariş iptal edilirse** (benim kararım)
- Tarama yeniden `karar_bekliyor` durumuna döner ve sabah bildiriminde görünür. Böylece ücretsiz sayılmış bir tarama sessizce kaybolmaz.
- Kendiliğinden fatura açılmaz; kararı yine admin ya da yönetici verir.
- Sipariş durumunu dinleyen bir tetikleyici gerekir. Bu tetikleyici siparişin iptalini **asla** engellemez.

### 4.8 Faturalama

**Birim:** faturalamanın birimi **tarama satırı × hizmet**tir. Aynı ziyarette taranan her hasta, kendisine uygulanan her hizmet için ayrı ücretlendirilir (katalogdaki birim "Seans"). Ziyaretin kendisi için ayrıca ücret alınmaz (benim kararım).

**Fiyat**
- Fiyat, sipariş kalemleriyle aynı yoldan çözülür: `resolve_item_price` önce kliniğe özel fiyata, sonra aktif kampanyaya, en son katalog fiyatına bakar. Kliniğin anlaşmalı bir tarama fiyatı varsa o uygulanır.
- Çözülen fiyat ve para birimi **karar anında** randevuya kopyalanır.
- Fiyat listesi sonradan değişse de kapanmış taramanın tutarı değişmez.

**Kliniğin faturalama düzeni** (benim kararım). Kullanıcının "ayrı kalem olarak faturalanır" sözü kliniğin mevcut düzenine göre uygulanır:
- Lab her klinik için zaten `clinics.billing_mode` seçmiş durumda: `per_order` (her teslime ayrı fatura) ya da `monthly_bulk` (aylık toplu; varsayılan).
- **`per_order` klinik:** aşağıdaki tablodaki "taslak fatura" kuralı geçerlidir.
- **`monthly_bulk` klinik:** siparişe dönmeyen tarama hemen faturalanmaz. "Faturalanmamış taramalar" havuzuna girer.
  - Aylık otomatik fatura (`fn_generate_monthly_invoices`) ve elle toplu fatura (`create_bulk_invoice`) bu havuzu da okur.
  - Tarama, kliniğin aylık faturasına ayrı bir satır olarak girer.
- **Siparişe bağlı ücretli tarama, sipariş hangi yoldan faturalanırsa onunla gider.** Bu üç yolu da kapsar: `create_invoice_from_order`, `create_bulk_invoice`, aylık cron.
- Sabit ₺ yazılmaz; para birimi kaydın kendi para birimidir (proje kuralı).

**Karara göre fatura etkisi**

| Karar | "Siparişe dönerse ücretsiz" | Fatura etkisi |
|---|---|---|
| Siparişe bağla / yeni sipariş | açık | Fatura kalemi yok. Randevuda "Ücretsiz — siparişe dönüştü" yazar (benim kararım: faturada 0 satırı göstermemek). |
| Siparişe bağla / yeni sipariş | kapalı | Tarama satırı o siparişin faturasına girer (aşağıdaki ayrıntılara bak). |
| Yalnız tarama | önemsiz | `per_order` klinik: kliniğe hemen **taslak** fatura açılır; her hizmet bir satır, açıklama hizmet adı ve tarama tarihi. Toplu kararda aynı ziyaretin satırları tek taslak faturada toplanır (benim kararım). `monthly_bulk` klinik: aylık faturaya satır olarak girer (yukarıya bak). |

**Ücretli tarama siparişin faturasına nasıl girer**
- **Sipariş henüz faturalanmadıysa:** satır, sipariş teslim edilince oluşan taslak faturaya eklenir. Bunu `create_invoice_from_order` yapar.
  - Tarama satırı acil ek ücret hesabından **sonra** eklenir. Böylece taramaya acil ek ücreti uygulanmaz.
- **Siparişin taslak faturası zaten varsa:** satır o taslağa eklenir.
- **Siparişin faturası kesilmişse** (taslak değilse): kesilmiş fatura değiştirilmez. Tarama kliniğe ayrı bir taslak faturayla gider; açıklamada sipariş numarası yazar.
- **Para birimi farklıysa:** tarama hizmetinin para birimi siparişin fatura para biriminden farklıysa, sessiz kur çevrimi yapılmaz. Tarama ayrı taslak faturayla gider (benim kararım).

**Taslak faturalar ve iki kez faturalama**
- Taslak faturalar bakiyeye girmez. Lab gözden geçirip keser (mevcut davranış).
- **İki kez faturalama yok:**
  - Bir tarama satırının her hizmeti en fazla bir fatura satırına bağlanır. `invoice_items` satırından randevuya geri bağ kurulur; mekanizma builder'a bırakılmıştır.
  - Karar değişirse önceki satır yalnız bulunduğu fatura hâlâ **taslaksa** silinir.
  - Kesilmiş bir faturadaki satır silinmez. Karar değişikliği reddedilir ve kullanıcıya "Bu tarama kesilmiş bir faturada; önce faturayı iptal edin" denir.

### 4.9 Dosyalar

**Siparişe bağlanmamış tarama:** dosyalar **tarama satırına** (hastaya) yüklenir. Özel bucket, yol `<lab_id>/<randevu_id>/<tarama_id>/…` (benim kararım).

**Siparişe bağlanan tarama:** randevuya yüklenmiş dosyalar siparişin **Ekler** bölümünde de görünür. Sohbet eklerinin Ekler'de göründüğü düzenin benzeri kullanılır (bkz. `project_chat_files_in_attachments`). Dosyanın kopyalanıp kopyalanmayacağı builder'a bırakılmıştır.

**Okuma yetkisi**
- Dosyaları lab'ın randevuyu görebilen kullanıcıları görür.
- Siparişe bağlanınca dosyalar, bugün lab'ın siparişe elle yüklediği tarama dosyalarıyla aynı görünürlüğe sahip olur. Yani siparişi görebilen klinik ve hekim de görür (benim kararım: lab bugün bu dosyaları zaten siparişe yüklüyor).
- **Randevu kaydının kendisini klinik ve hekim görmez** (bkz. 4.12). Buna saat, teknisyen, not ve iptal nedeni dahildir.

### 4.10 Geçmiş ve kayıt

Şu olaylar merkezi `log_activity()` ile kaydedilir:
- Oluşturma, saat ya da tarih değişikliği, teknisyen ya da cihaz değişikliği.
- "Tarama yapıldı", geri alma, iptal.
- Karar ve karar değişikliği.

Böylece "kime hangi taramayı yaptık" sorusu her zaman cevaplanır.

Siparişe bağlanan taramanın olayları **Sipariş Geçmişi**'nde de görünür (`order_history`), ama **yalnız lab kullanıcılarına**. Sipariş Geçmişi klinik ve hekime de açık olduğu için bu satırlar onların rol süzgecinde gizlenir (benim kararım, 4.12 ile tutarlı).

### 4.11 Bildirimler

**Günlük program**
- **Alıcılar:** admin ve lab yöneticisi. Tanım `fn_daily_order_watch` ile aynı: `user_type='admin'` ya da (`user_type='lab'` ve `role='manager'`).
- **Sabah:** bugünün programı. "Karar bekleyen N tarama" satırı da eklenir.
- **Akşam:** yarının programı.
- **Her satırda:** saat, klinik, hizmet, teknisyen, cihaz ve biliniyorsa hasta sayısı. Hasta adı **yazılmaz** (benim kararım: bildirim kanalları WhatsApp ve e-posta da içeriyor, KVKK).
- **Saatler:** varsayılan 08:00 ve 18:00, lab'ın kendi saat diliminde (`labs.timezone`). Lab ayarından değiştirilebilir.
- **Program boşsa** o kişiye o bildirim gitmez. Sabah bildiriminde karar bekleyen tarama varsa yalnız o satırla gider.

**Teknisyen**
- Aynı saatlerde yalnız kendi randevularını alır.
- Kendisine randevu eklenince, değişince ya da iptal edilince uygulama içi bildirim gelir (benim kararım: bu anlık bildirimler yalnız uygulama içi; gürültü kuralı, bkz. `project_lab_notification_noise`).

**Kanallar**
- Günlük sipariş özetiyle aynı yayın düzeni: uygulama içi bildirim satırı, ayrıca e-posta, push ve WhatsApp kanal fonksiyonlarına `pg_net` ile istek.
- Kişi tercihi (`notification_prefs`) kanal fonksiyonlarında süzülür.
- Yeni bir bildirim türü anahtarı eklenir, ör. `scan_schedule`, böylece kişi bunu ayrıca kapatabilir.
- WhatsApp için Meta şablonu gerekiyorsa ve hazır değilse, ilk aşamada WhatsApp kanalı bu bildirimde atlanır.

**Zamanlama**
- `cron` her saat başı çalışır. Yerel saati ayarlanan saate denk gelen lab'lar için gönderir (benim kararım: lab'lar farklı saat dilimlerinde olabilir).
- Aynı gün aynı türden ikinci gönderim olmaz.

**Test güvenliği:** gönderim yapan fonksiyonlar denemelerde (probe) **asla** çağrılmaz.

### 4.12 Yetki ve görünürlük

**Lab bazında açma** (benim kararım)
- Özellik lab bazında açılıp kapanır. Mevcut düzen kullanılır: `lab_feature_enabled`, Telefon asistanı modülündeki gibi.
- Varsayılan **kapalıdır**; ilk olarak Nexadent'te açılır.
- Kapalı lab'da takvim kartı, menü, ayarlar ve bildirimler görünmez. Yerinde tarama yapmayan lab'lar hiçbir değişiklik görmez.

**Yeni özellik anahtarı:** `scan_appointments`, `core/store/permissionStore.ts` FEATURES listesinde.
- `view_` takvimi ve randevuları görme yetkisidir. `manage_` ekleme, düzenleme, iptal ve karar yetkisidir.
- Varsayılan olarak admin ve lab yöneticisi tam yetkilidir.
- Karar yetkisi `manage_` yetkisiyle gelir. Kullanıcı kararı 9 bunu admin ve yönetici olarak tarif etti; özel yetki verilen kişi de karar verebilir (benim kararım).

**Teknisyen**
- Yetkisi olmasa da yalnız kendine atanmış randevuları görür ve "Tarama yapıldı" diyebilir.
- Başkalarının randevularını görmez.

**Klinik ve hekim:** hiçbir şey görmez. Rol whitelist'ine eklenmez (bkz. `project_permissions_role_whitelist`).

**RLS**
- Lab kiracısı (`lab_id` → `labs(id)` FK) kuralı geçerlidir.
- Teknisyen satır süzmesi yalnız atanmış kayıtlara izin verir.

**Öneri hesabı:** öneri için diğer randevuların dolu aralıkları gerekir. Bu yalnız `view_` yetkisi olanlarda çalışır. Teknisyen öneri ekranını görmez.

## 5. Ekranlar (yerleşim; görünüş ayrıca konuşulacak)

1. **Özet sayfası takvimi:** admin Özet ve lab yöneticisinin Özet'i.
   - Günlük ya da haftalık randevu görünümü. Her randevu bir blok: saat, klinik, hizmet, teknisyen.
   - Karar bekleyenler sayısı tıklanabilir.
   - Boş günde yer kaplamayan, sade bir durum.
2. **Randevu formu (yeni ve düzenle):**
   - 4.1'deki alanlar.
   - Klinik, hizmet ve tarih seçilince "Uygun saatler" önerileri; bir öneriye dokununca saat, teknisyen ve cihaz dolar.
   - Uyarı satırları formun altında, kaydet düğmesinin yanında. Hatalar görünür olmalı (bkz. `feedback_visible_action_errors`).
3. **Randevu detayı:**
   - Bilgiler, durum, geçmiş.
   - Tarama satırları (hastalar): her satırda hasta adı, hizmetler, karar durumu, dosyalar.
   - Eylemler: "Tarama yapıldı", "Hasta ekle", "Karar ver", "Ertele", "İptal".
4. **Karar bekleyenler listesi:**
   - Her satır bir hastadır; ziyarete göre gruplanır.
   - Her satırda üç karar eylemi.
   - Birden çok satır seçilerek "Yalnız tarama olarak kapat" toplu uygulanabilir.
5. **Teknisyen "Randevularım":** istasyon ya da teknisyen paneli. Bugün ve yaklaşan randevular, "Tarama yapıldı" düğmesi, kliniğin adresi ve harita bağlantısı.
6. **Ayarlar:**
   - Demirbaşlarda "tarama cihazı" işareti ve tür.
   - Fiyat listesinde "tarama türü" ve "siparişe dönerse ücretsiz".
   - Tarama ayarları: tarama saatleri, varsayılan süre, yol payı, bildirim saatleri, teknisyen havuzu.
7. **Sipariş detayı:** siparişe bağlı taramalar küçük bir satırla görünür ve tıklanınca randevu açılır.

Tüm yeni yüzeyler için kurallar: tr, en, de ve fa aynı anda; koyu tema; popup'lar `useInkUI().modalOverlay`; her düğmede GlassTooltip; mobilde popup ortada.

## 6. Benim kararlarım ve builder'a bırakılanlar

**Benim kararlarım** (kullanıcı kontrol etsin)
1. Tek randevuda iki hizmet olabilir.
2. Tarama satırı (hasta) baştan bir siparişe bağlanabilir.
3. Varsayılan süre 90 dakikadır ve lab ayarından gelir.
4. Kaynak alanı var: telefon, WhatsApp, yüz yüze, diğer.
5. İptal nedeni zorunludur, sabit seçeneklerle.
6. Cihazlar `equipment` tablosunda işaretlenir; ayrı tablo açılmaz.
7. "Siparişe dönerse ücretsiz" varsayılanı açıktır; lab her hizmette ayarlar.
8. Günün ilk randevusunda lab'dan yol kontrol edilir. Teknisyen randevular arasında lab'a dönmez.
9. Her geçişte 10 dakikalık yol payı vardır, lab ayarından değişir.
10. Öneri 15 dakikalık adımla aranır, en fazla 5 öneri gösterilir. Sıralama: tercih aralığı, sonra en az boşta bekleme, sonra teknisyen yük dengesi.
11. Kaba tahmin formülü: kuş uçuşu × 1,4 ÷ 30 km/sa, en az 10 dakika.
12. Teslim edilmiş siparişe de bağlanabilir.
13. Ücretsiz taramada fatura satırı yazılmaz.
14. Para birimi farklıysa ya da sipariş faturası kesilmişse tarama ayrı taslak faturayla gider.
15. Siparişe bağlı taramanın dosyaları siparişin Ekler'inde görünür.
16. Bildirimlerde hasta adı yazılmaz.
17. Teknisyene anlık bildirimler yalnız uygulama içidir.
18. `cron` saat başı çalışır ve lab'ın yerel saatine göre gönderir.
19. `manage_` yetkisi olan herkes karar verebilir.
20. Tarama fiyatı `resolve_item_price` ile çözülür: kliniğe özel fiyat, sonra kampanya, sonra katalog.
21. Siparişe dönmeyen tarama kliniğin faturalama düzenine uyar: `per_order` klinikte hemen taslak fatura; `monthly_bulk` klinikte aylık faturaya satır.
22. Saati geçmiş ama işaretlenmemiş randevu kendiliğinden durum değiştirmez. Sabah bildiriminde ve karar listesinin başında görünür.
23. Bağlı sipariş iptal edilirse tarama yeniden "karar bekliyor" olur.
24. Siparişe bağlı taramanın dosyalarını siparişi gören klinik ve hekim de görür. Randevu kaydını ve Sipariş Geçmişi'ndeki tarama satırlarını görmez.
25. Özellik lab bazında açılır; varsayılan kapalı, ilk Nexadent.
26. Model iki düzeylidir: randevu (ziyaret) ve tarama satırı (hasta). Karar, fiyat, fatura ve dosyalar satır düzeyindedir. Çakışma ve yol kontrolü randevu düzeyindedir.
27. "Tarama yapıldı" denirken en az bir hasta satırı ve her satırda hasta adı zorunludur.
28. Hasta sayısı arttıkça süre kendiliğinden uzamaz.
29. Her hasta, kendisine uygulanan her hizmet için ayrı ücretlendirilir; ziyaretin kendisine ayrıca ücret yok.
30. "Yalnız tarama" kararı toplu verilebilir. `per_order` klinikte aynı ziyaretin satırları tek taslak faturada toplanır.
31. Siparişe bağlarken hasta adı eşleşen siparişler listenin başına gelir.

**Builder'a bırakılanlar**
- Tablo ve sütun adları.
- Fatura satırı ile randevu arasındaki geri bağın mekanizması.
- Yol süresi önbelleğinin yeri ve süresi.
- Google'da Distance Matrix mi Routes API mı kullanılacağı.
- Dosyanın siparişe kopyalanıp kopyalanmayacağı ya da yalnız gösterileceği.
- `create_invoice_from_order` değişikliğinin biçimi. Önce **canlı** tanım `pg_get_functiondef` ile alınır; migration dosyası eski olabilir.
- Teknisyen "Randevularım"ın hangi panelde ve hangi sekmede duracağı. Tasarım konuşmasında netleşir.

**Önerilen sıra** (her faz kendi başına çalışır ve yayınlanabilir)
1. **Şema ve kayıt:** tablo, durumlar, RLS, yetki anahtarı; cihaz ve hizmet işaretleri; basit liste ve form; geçmiş kaydı.
2. **Akıllı zamanlama:** koordinat çıkarma, yol süresi, uyarılar, öneriler.
3. **Karar ve faturalama.**
4. **Bildirimler:** cron ve yayın.
5. **Özet takvimi ve teknisyen ekranı.** Tasarım konuşmasından sonra.

## 7. Mevcut durum (2026-10-28 canlı tarama)

**Klinik ve lab**
- `clinics`: `address` (text: düz metin, JSON ya da boş, üçü de var), koordinat **yok**.
- `labs`: `location_lat`, `location_lng`, `location_radius` (devam kontrolü), `timezone`, `address`, `street/district/city`.

**Ayarlar**
- `lab_settings`: `working_hours_start/end` (time) var. Tarama saatlerinin varsayılanı buradan alınabilir.
- Tarama ayarları için yeni sütunlar gerekir.

**Fiyat listesi:** `lab_services` sütunları `name, category, price, currency, unit, price_type, is_active`. Nexadent'te "Intraoral Tarama hizmeti" ve "Photogrammetri Hizmeti" var: EKSPRES HİZMETLER kategorisi, birim "Seans", EUR, fixed.

**Demirbaşlar:** `equipment` sütunları `name, brand, model, serial_number, category, status, assigned_to, station_id`, ayrıca entegrasyon ve canlı durum alanları. Tarama işareti için yeni sütun gerekir.

**Faturalama**
- `invoice_items` sütunları `invoice_id, order_item_id (boş olabilir), description, quantity, unit_price, sort_order, discount_*, net_total`. Siparişsiz serbest satır mümkün.
- `invoices` sütunları `clinic_id, work_order_id (boş olabilir), status ('taslak' …), currency`.
- `create_invoice_from_order(p_work_order_id)` (migration `20260723120000`) sırayla şunları yazar: sipariş kalemleri, kalem yoksa iş türü satırı, sonra acil ek ücret.
- `work_orders_auto_draft_invoice` tetikleyicisi `teslim_edildi` olunca bu fonksiyonu çağırır ve hata teslimatı engellemez.
- `clinics.billing_mode`: `per_order` ya da `monthly_bulk` (varsayılan `monthly_bulk`).
- Aylık toplu fatura cron'u: `fn_generate_monthly_invoices` (migration `20260514180000`).
- Elle toplu fatura: `create_bulk_invoice`, `v_unbilled_work_orders` (`modules/invoices/api.ts`). Bir faturada birden çok sipariş tutan tablo: `invoice_orders`.
- Fiyat çözümü: `resolve_item_price` (migration `20260514160000`). Sırası: kliniğe özel fiyat (`clinic_price_overrides`), kampanya, katalog.

**Lab bazında özellik bayrağı:** `lab_feature_enabled` (migration `20261009120000`, Telefon asistanı).

**Sipariş Geçmişi:** `order_history` (migration `20261027100000`) klinik ve hekime de açık; rol süzgeçli.

**Bildirim ve cron**
- `fn_daily_order_watch()` (migration `20260722120000`): alıcı tanımı, Vault `notify_fn_secret`, `pg_net` ile kanal fonksiyonları, aynı gün tekrar engeli. Yeni bildirim için örnek düzen budur.
- `cron.job`: `daily-order-watch@0 8 * * *`, `prova-watch@10 8 * * *` ve diğerleri. Saat başı çalışan bir iş yok, yalnız `shift-auto-pause` 5 dakikada bir.

**Harita:** `get_maps_browser_key()` RPC (web, kurye haritası `modules/courier/CourierTrackingMap.tsx`). Geri dönüş: `get_active_provider('maps')`.

**İstemci**
- Yetki: `core/store/permissionStore.ts` `FEATURES` (`view_<feature>` / `manage_<feature>`), `useFeaturePerms`.
- Özet ekranları: `app/(admin)/index.tsx` (admin), `modules/dashboard/screens/LabDashboardScreen.tsx` (lab), mobil `modules/dashboard/components/LabMobileDashboard.tsx`.

**Ülke:** `api/geo.js` yalnız ziyaretçinin ülkesini verir; koordinat vermez.

## 8. Proje kısıtları (her görevde geçerli)

- **DB değişiklikleri:** her migration, RLS ya da grant değişikliği önce kullanıcıya açıklanır ve onay alınır.
  - 5 adım: `.before.txt` → `.down.sql` → geri alınan probe ile ÖNCE/SONRA/GERİ ALMA → onay → `supabase db query --linked -f <mutlak yol>` → canlıda ölçüm.
- **Probe güvenliği:** probe'larda gönderim yapan fonksiyonlar çağrılmaz: `_notify_channels`, `fn_daily_order_watch`, `fn_prova_watch`, e-posta göndericileri ve bu işin yeni günlük program fonksiyonu.
- **Yeni tablolar:** RLS açık; gereksiz `authenticated` yetkileri REVOKE edilir; `lab_id` → `labs(id)` FK.
- **i18n:** her yeni metin tr, en, de ve fa'da aynı anda yazılır. `auto.{en,de,fa}.json` eşit kalır. DB'ye yazılan Türkçe metinler "Sabit · değişken" biçimindedir.
- **Arayüz:**
  - Koyu tema token'larla.
  - Popup `useInkUI().modalOverlay` ile, mobilde de ortada.
  - Her yeni düğmede GlassTooltip.
  - Düğme satırları tek satır; sığmazsa "•••".
- **Para:** para formatlayıcıları `Number(n)||0` ile defansif. Finansta sabit ₺ yazılmaz.
- **Lazy rota:** `lazyRoute` ile yüklenen modül ana paketteki bir ekrandan statik import edilmez.
- **Doğrulama:** `npx tsc --noEmit --incremental false` 0 hata; test paketi `bash scratchpad/search/suite.sh` yeşil.
- **Yayın:** kullanıcı "deploy" demeden yayın yapılmaz. Canlı hesapta kaydet, gönder ya da onayla düğmelerine basılmaz.
- **KVKK:** çıktılarda kişi adı ve para tutarı gösterilmez. Bildirimlerde hasta adı olmaz.
