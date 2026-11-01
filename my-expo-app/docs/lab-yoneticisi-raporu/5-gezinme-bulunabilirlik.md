# Gezinme ve bulunabilirlik (uygulamanın tamamı): lab yöneticisi gözüyle

> Denetim: 24 Ekim 2026, siman.app, NexaDent lab'ının canlı **admin** hesabı. Hiçbir kayıt oluşturulmadı ya da değiştirilmedi.
> Masaüstü 1440x900 ve telefon (375x812, mobil Chrome öykünmesi) görünümleri kullanıldı. Tema ve dil değiştirilmedi. Çeviri durumu koddan örneklendi.

---

## Menü haritası

### Masaüstü (admin paneli)

**Sol menü:** 14 madde, tek bir "Çalışma alanı" başlığı altında düz liste. Üstte "Yeni sipariş" düğmesi var.

| # | Menü maddesi | Açılan ekran ve iç menüsü |
|---|---|---|
| 1 | Özet | Pano: Üretim % · Aktif · Bugün · Geciken rozetleri, Canlı vaka, Üye trendi, Teslim oranı, "Hızlı işlem: Yeni sipariş", Bu hafta, Bekleyen aksiyonlar, Son siparişler, Finansal özet, İş tipi ve statü dağılımı |
| 2 | Siparişler | Durum şeridi: Tümü · Planlama · Üretim · KK · Hazır · Teslim. Çipler: Manuel · Acil · Geciken · Arşiv. Sağda büyüteç (arama), sıralama ve görünüm düğmeleri |
| 3 | Onaylar | Sekmeler: Hekim Kayıtları · Tasarım Onayları · Malzeme Talepleri · İptal Talepleri · Değişiklik Talepleri |
| 4 | Sağlık Kurumları | Sekmeler: Tümü · Muayenehane · Klinik · Poliklinik · Hastane · Laboratuvar · Hekimler · Yöneticiler · Bağlantılar. Sağda hızlı işlemler: Yeni Kurum · Hekim Ekle · İş emri formu yazdır · Bağlantı davet kodu |
| 5 | Ekip | İç menü: Ekip · Personel · Yetkinlikler · İzin & Devam · Performans · Dosyalar |
| 6 | Stok ve Depo | Başlık "Stok & Depo". İç menü: Dashboard · Ürünler · Hareketler · Sipariş & Tahmin · Analiz · Maliyet · Malzeme Talepleri · Kurulum |
| 7 | Üretim Panosu | Canlı istasyon panosu: atanmamış ve geciken işler |
| 8 | Kurye Takip | Teslimatlar (Yolda / Teslim Edildi) ve harita. Kargo (Shipink) gönderileri de burada. |
| 9 | Finans | Varsayılan sekme Karlılık. **Sık kullanılan:** Fiyat Listesi. **Analiz:** Karlılık · Personel Verim · Bütçe · Rapor. **Hesaplar:** Faturalar · Sağlık Kurumları · Ödeme Onayları · Tedarikçiler · Çek/Senet. **Operasyon:** Giderler (içinde "Gelen e-Fatura" ve "Satın Alma" düğmeleri) · Maaşlar · Avans Talepleri · Prim Motoru · Kasa/Banka |
| 10 | Destek | "Üretim destek merkezi · Vakaları yönet" talep kutusu |
| 11 | WhatsApp Destek | WhatsApp sohbet kutusu |
| 12 | Telefon Talepleri | Telefon asistanının kaydettiği talepler |
| 13 | Mesajlar | Sayfa açılmaz, açılır pencere (sipariş sohbetleri) açılır |
| 14 | Ayarlar | Varsayılan sekme Profil. **Hesap:** Profil · Bildirimler · Genel · Giriş Kodum. **Organizasyon:** Kullanıcılar · Yetkiler · Çalışma Saatleri · QR Check-in · Tabletler. **Operasyon:** İstasyonlar · Finans Ayarları · Entegrasyonlar. **Sistem:** Loglar. **Gelişmiş:** İş Akışları |

**Üst sağ çubuk:** "Ara..." kutusu (çalışmıyor, aşağıya bakın), Destek ikonu (yeni talep), bildirim zili (99+), mesaj ikonu, profil menüsü (Profil · Platform · Tema · Çıkış).
**Kısayollar:** Ctrl+K komut paleti ("Ne yapmak istiyorsunuz?") yalnız 14 menü başlığını listeler. Sağ altta Simanty (yapay zekâ asistanı) düğmesi.
**Özet sayfasındaki kısayollar:** Geciken ve Planlanacak rozetleri, kartların köşesindeki ↗ okları, Bekleyen aksiyonlar satırları (siparişe ya da faturaya gider), Son siparişler tablosu ve "Tümünü Gör", Finansal özet (Finans'a gider), "Yeni sipariş oluştur · Başla".

### Telefon (admin paneli, mobil tarayıcı)

- **Alt çubuk:** Özet · Siparişler · Onaylar · Mesajlar · ••• (Tüm Menü). Yanında "+" düğmesi (yeni iş emri). Yalnız etkin sekmenin adı yazılı, diğerleri yalnız ikon.
- **Üst sağ:** QR tara · Mesajlar · Bildirim (99+) · Profil. **Arama düğmesi yok.**
- **Tüm Menü ("Sık kullanılmayan ekranlar"):** Sağlık Kurumları · Kurye Takip · Finans · Ekip · Stok ve Depo · Telefon Talepleri · Ayarlar.
- **Mobilde hiç ulaşılamayanlar:** Üretim Panosu, Destek, WhatsApp Destek.
- **Özet kartları:** "BUGÜN 58 SİPARİŞ · Yeni iş emri oluştur", Canlı üretim halkası, Onay bekleyen, Aktif sipariş, son mesajlar, Bu hafta, Son siparişler.

### Masaüstü ile mobil tutarlı mı?

Kısmen tutarlı. Ana adlar aynı, ama mobilde 3 menü maddesi ve arama yok. Aynı lab'ın **lab paneli** (lab personeli girişi) ile **admin paneli** de birbirinden farklı:

- Lab panelinde ana sayfanın adı "Bugün", admin'de "Özet".
- Lab panelinde Fiyat Listesi ve İş Akışları kenar çubuğunda duruyor, admin'de Finans'ın ve Ayarlar'ın içinde.
- Lab panelinin mobil alt çubuğunda "Ara" sekmesi ve "Manuel Inbox" var, admin'de ikisi de yok.

---

## Kısa hüküm

Menünün ana iskeleti bir lab yöneticisine tanıdık geliyor (Siparişler, Onaylar, Kurumlar, Ekip, Stok, Finans, Ayarlar) ve sık işlerin çoğu iki tıkta bulunuyor. Ama üç şey ilk günümü zorlaştırırdı:

- Arama kutusu çalışmıyor.
- Telefon tarayıcısında "Tüm Menü" ekranın dışında açılıyor.
- Özet sayfasındaki sayılar ve kısayollar, gittikleri ekranla tutarlı değil.

Bugünkü haliyle her şeyi bulurum, ama ancak birkaç kez yanlış kapıyı çaldıktan sonra.

## Artılar

- **Yeni iş emri her yerden tek tık.** Kenar çubuğundaki düğme, Özet'teki "Başla" kartı ve mobildeki "+" aynı 4 adımlı sihirbazı açıyor. Gün içinde en sık yaptığım iş en kolay yerde. (ekran: /new-order)
- **Bölümler kendi iç menüsüyle düzenli.** Finans, Ayarlar, Ekip ve Stok sol tarafta gruplu bir iç menü taşıyor, seçilen sekme adrese yazılıyor (?tab=invoices gibi). Sayfayı yenileyince ya da bağlantıyı bir çalışana atınca aynı sekme açılıyor.
- **"Bekleyen aksiyonlar" kartı.** Özet'te "Teslime hazırla · sipariş no" ve "Tahsilat yap · fatura no · 97 gün vadesi geçti" satırları doğrudan ilgili siparişe ya da faturaya götürüyor. Sabah ilk bakacağım liste bu. (dosya: app/(admin)/index.tsx)
- **Sipariş detayında "neredeyim" belli.** Başlıkta sipariş no, altında "Siparişler › klinik" izi var, sol menüde Siparişler vurgulu kalıyor.
- **Siparişler ekranının filtre şeridi işe yarıyor.** Planlama, Üretim, KK, Hazır, Teslim sekmeleri sayılarıyla duruyor, Acil, Geciken, Arşiv ve Manuel çipleri tek tık.
- **Alacak yaşlandırması tek ekranda.** Finans → Sağlık Kurumları ekranında vadesi var, 1-30, 31-60 ve 61+ gün kırılımı kurum ve döviz bazında tek bakışta görünüyor.
- **Bazı boş ekranlar yol gösteriyor.** WhatsApp Destek, botun nereden açılacağını tam yolu yazarak söylüyor (Ayarlar → Entegrasyonlar → WhatsApp → Sohbet botu). Onaylar ekranı "yeni kayıt geldiğinde burada görünür" diyor. Stok panosu "17 kalemde minimum seviye yok, bu kalemler asla kritik görünmez" diye dürüstçe uyarıyor.
- **Ana menü adları dört dilde çevrili.** nav.items anahtarları tr, en, de ve fa'da eksiksiz.
- **Simanty asistanı "beni götür" ve "sipariş ara" araçlarına sahip** (koddan: modules/denty/tools.ts → goturBeni, siparisAra). Doğal dille "faturalara git" demek, bugün çalışan tek genel arama.

## Eksiler

- **[KRİTİK] Telefon tarayıcısında "Tüm Menü" görünmüyor.** Özet ya da Siparişler ekranında ••• simgesine basınca ekran bulanıklaşıyor ama menü kartı görünür alanda çıkmıyor, sayfanın en altında açılıyor. Kurye ya da sahadaki bir yönetici Finans, Ekip, Stok, Ayarlar ve Kurye Takip ekranlarına telefondan ulaşamaz: ekran donmuş sanır. Onaylar gibi belge kaydırması kapalı ekranlarda menü doğru yerde açılıyor; sorun yalnız belge kaydırmalı ekranlarda çıkıyor. İki ekranda tekrar ürettim.
  - Muhtemel neden: menü `position:absolute` ile çiziliyor, belge kaydırması açıkken (documentScroll) kapsayıcı sayfa boyu uzuyor.
  - PWA ve native uygulamada belge kaydırması kapalı olduğu için bu sorun büyük ihtimalle yok; ben yalnız mobil tarayıcı öykünmesinde denedim.
  - Dosyalar: core/ui/mobile/MoreMenuSheet.tsx (StyleSheet.absoluteFillObject, `bottom: cardBottom`), core/ui/mobile/documentScroll.ts.
- **[YÜKSEK] Üst çubuktaki "Ara..." kutusu ölü.** Yazıp Enter'a bastım, hiçbir şey olmadı. Kutu `onSearchSubmit` bekliyor ama hiçbir panel yerleşimi bu bağlantıyı vermiyor. En görünür arama aracı her panelde süs.
  - Dosyalar: core/layout/PatternsShell.tsx (onSearchSubmit), app/(admin)/_layout.tsx.
- **[YÜKSEK] Komut paleti yalnız 14 menü başlığını arıyor.** Ctrl+K ile açılan palete "NEX" yazdım, sipariş çıkmadı. "fatura", "kargo" ve "fiyat" de sonuç vermedi; Faturalar, Tedarikçiler, Fiyat Listesi, Loglar gibi iç sayfalar listede yok. Sipariş no, hasta, klinik ya da fatura no ile arama yok. Mobil admin'de ise hiçbir arama girişi yok.
  - Kodda arama düğmesi bileşeni (SearchAboveFab) yazılmış ama hiçbir yerde kullanılmıyor. Lab paneline arama listesi (searchItems) verilmiş, admin'e verilmemiş.
  - Dosyalar: core/ui/CommandPalette.tsx, core/ui/mobile/PillTabBar.tsx.
- **[YÜKSEK] Özet'teki rozetler filtreyi taşımıyor ve sayılar ekranlar arasında tutmuyor.**
  - "GECİKEN 2" rozeti Siparişler'i "Tümü 58" ile açıyor. Orada Geciken çipi **1** diyor, Üretim Panosu **2** diyor. Özet arşivlenmiş işleri de sayıyor, liste saymıyor.
  - "Planlanacak" rozeti `?status=alindi` gönderiyor ama sipariş listesi adresteki parametreyi hiç okumuyor.
  - Mobil Özet'te "BUGÜN 58 SİPARİŞ" yazıyor; 58 bugünün değil, toplam sipariş sayısı.
  - Masaüstü canlı kart "Alındı 3 · Üretimde 1", mobil kart "Alındı 0 · Üretimde 2" gösteriyor.
  - Hangi sayıya güveneceğimi bilemem.
  - Dosyalar: app/(admin)/index.tsx (overdue sayımı, AlertPillX onPress), modules/orders/screens/OrdersListScreenV2.tsx (useLocalSearchParams yok), modules/admin/components/AdminMobileDashboard.tsx (admin.cta.ordersToday + liveTotal).
- **[YÜKSEK] "Bugün ne teslim edilecek?" sorusunun cevabı yok.**
  - Özet'teki "BUGÜN" rozeti bugün açılan siparişi sayıyor, bugün teslim edilecekleri değil.
  - Siparişler listesinde (masaüstü ve mobil) teslim tarihi sütunu yok, yalnız oluşturma tarihi var. Teslim tarihine göre sıralanabiliyor ama tarih görünmüyor.
  - Lab'ın günü teslim tarihine göre döner. Bugün bunu kâğıttan takip ederdim.
  - Dosya: modules/orders/screens/OrdersListScreenV2.tsx (sütunlar Hasta · Vaka · Hekim · Oluşturma · Durum).
- **[YÜKSEK] Aynı iş birden çok yerde, bazen farklı adla duruyor.**
  - "Sağlık Kurumları" hem sol menüde (kurum kartları) hem Finans'ın içinde (bakiyeler) var.
  - Teknisyen performansı hem Ekip → Performans'ta hem Finans → Personel Verim'de.
  - Maaş ve avans bilgisi Ekip özetinde, maaş ve avans ekranları ise Finans'ta.
  - Malzeme Talepleri hem Onaylar'da hem Stok'ta.
  - Ödeme bildirimi onayı Finans → Ödeme Onayları'nda; Onaylar menüsünde yok.
  - Klinik kaydı onayı Onaylar → Hekim Kayıtları'nda; var olan kliniğin bağlanma isteği ise Sağlık Kurumları → Bağlantılar'da.
  - Çalışma saatleri hem Ayarlar → Genel'de hem Ayarlar → Çalışma Saatleri'nde.
  - Hesaplar Ayarlar → Kullanıcılar'da, personel kartları Ekip'te.
- **[YÜKSEK] Ekip menüsündeki kişi sayıları birbirini tutmuyor.** Açılış sekmesi "0 aktif personel · Personel bulunamadı" diyor. Aynı menüde Personel sekmesi 3 kişi, İzin & Devam 4, Yetkinlikler ve Performans 7 kişi gösteriyor. "Personel" adlı sekme aslında istasyon yetkilerini gösteriyor. İlk gün bu ekranı açan yönetici "ekibim kaybolmuş" sanır.
  - Ekran: /ik-depo.
- **[ORTA] Sol menü 14 maddelik düz liste.** Kodda bölüm başlıkları tanımlı (İş Yönetimi, Müşteriler, Ekip, Depo, Üretim, Teslimat, Finans, Yardım, Sistem), ama kabuk bunları hiç çizmiyor; tek başlık "Çalışma alanı". İletişimle ilgili dört madde (Destek, WhatsApp Destek, Telefon Talepleri, Mesajlar) arka arkaya diziliyor.
  - Dosya: core/layout/PatternsShell.tsx (sectionLabel kullanılmıyor; DesktopShell.tsx kullanıyordu).
- **[ORTA] Bölüm girişleri yanlış sekmede açılıyor.**
  - Ayarlar kişisel Profil'de açılıyor. Lab adı, logo ve fatura künyesi "Genel" sekmesinde ve sekmenin alt yazısı "Dil, saat dilimi, format". Logoyu ararken Genel'i açmayı düşünmem.
  - Aynı Genel ekranında hem "Ayarlar otomatik kaydedilir" yazısı hem bir "Kaydet" düğmesi var.
  - Finans, Karlılık sekmesinde açılıyor; maliyet verisi eksikken "%97,1 marj · Mükemmel" gösteriyor. Bir yöneticinin Finans'a ilk girişteki sorusu "kim ne kadar borçlu, bu ay ne tahsil ettim".
  - Dosyalar: modules/settings/screens/SettingsHubScreen.tsx, modules/finance/screens/FinanceHubScreen.tsx.
- **[ORTA] Mobil menü eksik ve yanlış etiketli.** Üretim Panosu, Destek ve WhatsApp Destek telefonda hiç yok. "Tüm Menü" alt başlığı "Sık kullanılmayan ekranlar" diyor, oysa Finans ve Sağlık Kurumları bir yönetici için en sık kullanılan ekranlar arasında. Alt çubukta yalnız etkin sekmenin adı yazılı; onay ve mesaj ikonlarını ilk gün tahmin etmek zorundayım.
  - Dosya: app/(admin)/_layout.tsx (MORE_ITEMS, PILL_TABS).
- **[ORTA] Rozetler ve bildirimler yönlendirmede güvenilmez.**
  - Onaylar rozeti İptal ve Değişiklik taleplerini ve klinik bağlantı isteklerini saymıyor; ekranda sekmesi olan bir bekleyen iş için rozet yanmayabilir.
  - Bildirim zili sürekli 99+ gösteriyor ve bildirim geçmişi sayfası yok, yalnız açılır pencere var. Gerçek uyarıyı gürültüden ayıramam.
  - Stok rozeti kritik ürün listesine değil, Stok panosuna gidiyor.
  - Dosyalar: core/hooks/usePendingApprovals.ts, core/ui/NotificationPopover.tsx.
- **[ORTA] Bazı adlar lab dilinde değil, yazılımcı dilinde.**
  - "Dashboard" (Stok), "Loglar" (aktivite kaydı), "SLA", "PROD" (Entegrasyonlar), "Sidebar Markası", "Personel ve stage yetkileri", "tracking no" (Kurye arama kutusu), "Manuel Inbox" (lab paneli), "Kurulum".
  - "Kurye Takip" adı kargo gönderilerini de kapsadığını belli etmiyor; kargoyu ararken önce başka yere bakardım.
  - "Destek" sayfası bir talep kutusu, ama kimin kime yazdığı (lab'ın kendi ekibi mi, Siman mı) ekranda açık değil.
- **[ORTA] Gezinirken yanlış tık riski.** Liste satırlarında doğrudan geri alınamaz düğmeler duruyor:
  - Sağlık Kurumları satırında çöp kutusu.
  - Ayarlar → Kullanıcılar'da her satırda Aktif anahtarı ve sil düğmesi.
  - Finans → Sağlık Kurumları'nda her satırda "Hatırlat" (müşteriye mesaj gönderir).
  - Gezinme ile eylem aynı satırda; yeni bir çalışanın yanlışlıkla bir kliniğe hatırlatma göndermesi kolay.
- **[DÜŞÜK] Küçük dil ve tutarlılık hataları.**
  - Menüde "Stok ve Depo", sayfa başlığında "Stok & Depo".
  - "Vadesi Gecen" (Geçen olmalı).
  - Fatura durumları "KESILDI" diye yazılıyor; JS `toUpperCase()` Türkçe İ'yi bozuyor ve çeviri sözlüğünü de atlıyor (modules/invoices/screens/InvoicesListScreen.tsx:700, 755).
  - "Rol bazli erisim yonetimi" Türkçe karaktersiz yazılmış (SettingsHubScreen.tsx).
  - Stok ekranında "Tumu", "Uretim", "Diger", "Dis Basi" yazıyor (modules/stock/screens/StockScreen.tsx).
  - Faturalar sekmesinde "Toplu e-Fatura" hem sekme hem düğme olarak duruyor.
- **[DÜŞÜK] Duyurulan kısayollar çalışmıyor.**
  - "Yeni sipariş oluştur (⌘N)" ipucu var ama ⌘N için kod yok (ayrıca tarayıcıda ⌘N zaten yeni pencere açar).
  - ⌘K yalnız arama kutusunun üzerine gelince çıkan ipucunda yazıyor. Benim denememde Ctrl+K açtı, ⌘K açmadı; bu tarayıcı paneline özgü olabilir.
  - Sipariş detayındaki "Siparişler" izi tıklanınca listeye değil, bir önceki ekrana dönüyor (Faturalar'dan geldiysem Faturalar'a).

## Kullanım kolaylığı ve bulunabilirlik

Görev testi. Her görevde Özet'ten başladım ve yalnız menü, arama ve kısayol kullandım. Aksi yazılmadıkça masaüstü.

| Görev | Nerede buldum | Tık | İlk denemede? | Not |
|---|---|---|---|---|
| Yeni iş emri aç (kaydetmeden) | Kenar çubuğu "Yeni sipariş" (ya da Özet → Başla) | 1 | Evet | 4 adımlı sihirbaz, iyi |
| Geciken işler | Özet "GECİKEN" rozeti → Siparişler → Geciken çipi | 2 | Hayır | Rozet filtresiz açıyor; 2 ↔ 1 sayı farkı |
| Bugün teslim edilecekler | **Bulamadım** | – | Hayır | "BUGÜN" rozeti açılan sipariş; listede teslim tarihi yok. Yalnız "Bekleyen aksiyonlar" 3 günlük kısmi liste veriyor |
| Bir kliniğin borcu | Finans → (iç menü) Sağlık Kurumları | 2 | Hayır | Önce sol menüdeki Sağlık Kurumları'na gittim; orada bakiye yok |
| Vadesi geçmiş alacaklar | Finans → Sağlık Kurumları (yaşlandırma) ya da Faturalar → "Vadesi Gecen" | 2-3 | Kısmen | Özet'teki "Bekleyen aksiyonlar" ilk 2 tanesini gösteriyor |
| Taslak faturalar | Finans → Faturalar → Taslak | 3 | Evet | Finans açılınca Karlılık'a düşüyor, bir tık fazla |
| e-Fatura durumu | Finans → Faturalar (satır etiketi, "e-Faturasız" sekmesi); bağlantı: Ayarlar → Entegrasyonlar | 2-3 | Kısmen | Gönderim durumu ile bağlantı durumu ayrı yerlerde |
| Bu ayki giderler | Finans → Giderler → Filtre → Bu ay | 4 | Hayır | Varsayılan tüm zamanlar; dönem seçimi çekmecede gizli |
| Fiyat listesi | Finans → Fiyat Listesi | 2 | Hayır | Önce Ayarlar'a baktım; lab panelinde kenar çubuğunda, admin'de değil |
| Kritik stok | Stok ve Depo (pano: Kritik) | 1 | Evet | – |
| Tedarikçiler | Finans → Tedarikçiler | 2 | Hayır | Önce Stok'a baktım. Kod yorumu "Ayarlar'da" diyor, orada da yok |
| Kurye takibi | Kurye Takip | 1 | Evet | – |
| Kargo gönderileri | Kurye Takip (kargo da burada) | 1 | Hayır | Ad kargoyu çağrıştırmıyor; kurye/kargo filtresi yok |
| Personel izinleri | Ekip → İzin & Devam | 2 | Evet | Ekip açılışı "0 personel" diyerek yanılttı |
| Teknisyen performansı | Ekip → Performans (ya da Finans → Personel Verim) | 2 | Evet | İki yerde, iki farklı adla |
| Kullanıcı yetkileri | Ayarlar → Yetkiler | 2 | Hayır | Önce Ekip → Yetkinlikler ve Personel'e gittim |
| Entegrasyon ayarları | Ayarlar → Entegrasyonlar | 2 | Evet | Alt yazı "e-Fatura & POS" diyor; kurye ve WhatsApp da burada |
| Aktivite kaydı | Ayarlar → Loglar | 2 | Hayır | "Loglar" adı; palete "aktivite" yazınca sonuç yok |
| Lab bilgileri / logo | Ayarlar → Genel (aşağı kaydır) | 2+ | Hayır | Ayarlar Profil'de açılıyor; Genel'in alt yazısı yanıltıcı |
| Klinik başvuru onayları | Onaylar → Hekim Kayıtları | 1-2 | Kısmen | Var olan kliniğin bağlanma isteği ayrı yerde (Sağlık Kurumları → Bağlantılar) |
| Kliniğin "ödedim" bildirimi | Finans → Ödeme Onayları | 2 | Hayır | Önce Onaylar'da aradım |
| Mesajlar (açmadan) | Kenar çubuğu Mesajlar / üst çubuk ikonu | 1 | Evet | Sayfa değil açılır pencere; mobilde üç yerde |
| Destek / yardım | Kenar çubuğu Destek, üst çubuk Destek ikonu | 1 | Kısmen | Kılavuz ya da SSS yok; Simanty'nin "Yardım" önerisi tek yardım kaynağı |
| Bir siparişi numarasıyla bul | Siparişler → büyüteç → yaz | 2-3 | Hayır | Önce üstteki "Ara..." kutusunu denedim (ölü), sonra Ctrl+K (sipariş aramıyor) |
| Mobil: Finans'a git (tarayıcı, Özet'ten) | **Bulamadım** (ilk denemede) | – | Hayır | ••• ekranı bulanıklaştırıyor, menü görünmüyor; aşağı kaydırınca çıkıyor |
| Mobil: Üretim Panosu | **Bulamadım** | – | Hayır | Mobil menüde yok, mobilde arama yok |

**Bulamadıklarım:**

- Bugün ya da yarın teslim edilecek işlerin net listesi.
- Üst arama kutusuyla herhangi bir kayıt (kutu çalışmıyor).
- Telefonda Üretim Panosu, Destek ve WhatsApp Destek.
- Telefon tarayıcısında, Özet ve Siparişler'den "Tüm Menü".
- Bildirim geçmişi sayfası.
- Kullanım kılavuzu ya da yardım merkezi.

**Arama ve kısayollar:**

- Gerçekten çalışan tek genel arama Simanty asistanında (koddan; test etmedim).
- Siparişler ekranında büyüteç simgesinin arkasında yerel bir arama var (sipariş no, hasta, hekim, iş tipi). Mobilde bu arama kutusu açık duruyor, masaüstünde simgeye gizli.
- Kurye Takip, Sağlık Kurumları, Faturalar, Giderler ve Telefon Talepleri ekranlarının kendi arama kutuları var.

**Ana sayfa günün özetini veriyor mu?** Kısmen. Üretim, aktif, geciken, bekleyen aksiyonlar ve vadesi geçen tahsilat görünüyor. Bugünkü teslimler, kurye çıkışları ve onay bekleyenler (masaüstünde) yok. Sayılar diğer ekranlarla tutmadığı için güven veremiyor.

**Yönlendirme ipuçları:**

- Masaüstünde sayfa başlığı ve sol menü vurgusu her ekranda doğru. Sipariş detayında iz var.
- İç menülü bölümlerde (Finans, Ayarlar, Ekip, Stok) başlık üç kez tekrar ediyor: sayfa başlığı "Ekip", iç menüde "Ekip", içerik başlığı "Ekip".
- Boş ekranların çoğu ne olacağını söylüyor (Onaylar, WhatsApp Destek). Ekip → "Personel bulunamadı" ise yanlış bilgi veriyor.

## Öneriler

- **[KRİTİK · küçük]** "Tüm Menü"yü mobil tarayıcıda görünür alana sabitleyin: web'de `position: fixed` kullanın ya da menüyü belge kaydırmasının dışındaki bir katmana taşıyın. Telefondan Finans, Ekip, Stok ve Ayarlar yeniden ulaşılır olur.
- **[YÜKSEK · orta]** Üstteki arama kutusunu gerçek bir genel aramaya bağlayın: sipariş no, hasta, klinik, hekim, fatura no ve menü ile iç sayfa adları. Komut paletine iç sekmeleri (Faturalar, Giderler, Tedarikçiler, Fiyat Listesi, Loglar, Yetkiler…) ve eş anlamlıları ekleyin ("cari" → Sağlık Kurumları bakiyeleri, "aktivite" → Loglar, "kargo" → Kurye Takip). Admin mobiline arama düğmesi koyun; bileşeni (SearchAboveFab) zaten yazılmış. Böylece her işi 1-2 tıkta bulurum.
- **[YÜKSEK · küçük]** Özet rozetlerini filtreli açın: Siparişler adresteki `status`, `overdue` ve `due=today` parametrelerini okusun. Geciken tanımı tek kaynaktan gelsin (arşiv dahil mi, hariç mi). Mobildeki "BUGÜN 58 SİPARİŞ" etiketini düzeltin. Böylece rozete basınca sayının aynısını görürüm.
- **[YÜKSEK · orta]** Siparişler listesine "Teslim" sütunu ve "Bugün / Yarın / Bu hafta teslim" çiplerini ekleyin. Özet'teki "Bugün" rozetini "Bugün teslim" yapın (ya da ikisini ayrı gösterin). Böylece günün planını uygulamadan yaparım.
- **[YÜKSEK · orta]** Tek iş tek yerde dursun, diğer yerler oraya kısayol olsun. Onaylar'a Ödeme Onayları ve klinik bağlantı isteklerini ekleyin, rozet hepsini saysın. Personel Verim ve Performans tek ekranda birleşsin. Ekip açılış sekmesi gerçek personel sayısını göstersin.
- **[ORTA · küçük]** Kenar çubuğunda tanımlı bölüm başlıklarını çizin: İş · Müşteriler · Üretim ve Teslimat · Finans · Ekip ve Stok · İletişim (Mesajlar, WhatsApp, Telefon, Destek) · Sistem. 14 madde göz taramasında 4-5 bloğa iner.
- **[ORTA · küçük]** Ayarlar'ı lab kimliğiyle açın ("Laboratuvar" sekmesi: ad, logo, fatura künyesi), Profil'i profil menüsüne bırakın. Finans'ı "Alacaklar / Özet" ile açın.
- **[ORTA · küçük]** Mobil menüye Üretim Panosu, Destek ve WhatsApp Destek'i ekleyin. "Sık kullanılmayan ekranlar" alt başlığını kaldırın. Alt çubukta etiketleri gösterin (en azından ilk kullanımda).
- **[ORTA · küçük]** Lab dili sözlüğü: Dashboard → Genel Bakış, Loglar → Aktivite Kaydı, Kurye Takip → Kurye ve Kargo, SLA ve PROD → açık Türkçe. Lab paneli ile admin panelinin menü adlarını ve sırasını eşitleyin.
- **[ORTA · orta]** Bildirim geçmişi sayfası ve okunmamış bildirimleri kategoriye göre filtreleme ekleyin. 99+ sürekli kalırsa rozet anlamını yitirir.
- **[ORTA · küçük]** Satır içi geri alınamaz düğmeleri (sil, pasifleştir, Hatırlat) "•••" eylem menüsüne alın.
- **[DÜŞÜK · küçük]** Çevirisi eksik Ayarlar maddelerini auto.{en,de,fa}.json'a ekleyin ("Tabletler", "Finans Ayarları", "Kiosk cihaz yönetimi", "Para birimi, KDV, kur, ödeme hatırlatmaları"); İngilizce, Almanca ve Farsça arayüzde bunlar Türkçe kalıyor. Fatura durumunda önce çevirip sonra `toLocaleUpperCase` kullanın. "Vadesi Gecen" ve "Rol bazli erisim yonetimi" yazımlarını düzeltin. ⌘N ipucunu kaldırın ya da kısayolu ekleyin.

## Rakiplerde/sektörde gördüklerim

- Kullandığım lab yazılımlarında üst çubuktaki arama, vaka numarası, hasta, hekim ve fatura numarasını aynı kutuda arar. Lab'da günde onlarca kez "şu hastanın işi nerede" diye telefon gelir; bu kutu en çok kullanılan özelliktir.
- Bir "Teslim takvimi / Bugün çıkacaklar" görünümü (gün ve kurye bazında) standarttır. Sabah toplantısı o ekranla yapılır.
- Müşteri (klinik) kartı tek yerdir: iletişim, hekimler, açık işler, cari bakiye ve ekstre aynı kartta sekme sekme durur. Burada kurum kartı ile bakiye ayrı menülerde.

## Göremediklerim

- Bildirim panelini ve okunmamış mesajları açmadım. Rozetlerin nereye gittiğini koddan çıkardım (NotificationPopover action_url'e gidiyor).
- Simanty asistanına soru göndermedim; "götür beni" ve "sipariş ara" yeteneklerini yalnız koddan okudum.
- "Tüm Menü" hatasını yalnız mobil tarayıcı öykünmesinde gördüm. PWA (ana ekrana eklenmiş) ve native iOS/Android'de belge kaydırması kapalı olduğu için büyük ihtimalle yok, ama cihazda doğrulanmalı.
- ⌘K'nin çalışmaması kullandığım tarayıcı paneline özgü olabilir; Ctrl+K çalıştı.
- Yalnız admin rolüyle gezindim. Lab, klinik, hekim, teknisyen ve kurye menülerini koddan karşılaştırdım.
- Koyu temaya ve başka dillere geçmedim (tercihler hesaba kaydediliyor). Çeviri eksiklerini sözlük dosyalarından örnekledim.
- Bir ekranda sıralama penceresi açıkken arka plandaki liste içinden görünüyordu. Bu bir animasyon anı da olabilir; doğrulamadım.
