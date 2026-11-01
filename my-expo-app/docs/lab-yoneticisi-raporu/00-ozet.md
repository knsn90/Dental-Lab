# Siman — lab yöneticisi denetimi: birleşik rapor

> 24 Ekim 2026 · NexaDent canlı admin hesabı, yalnız okuma · masaüstü (1440 px) + telefon (375 px) · klinik, hekim, teknisyen ve kurye panelleri koddan.
> Beş inceleme birleştirildi. Ayrıntılı raporlar:
> - [1 · Sipariş ve üretim](1-siparis-uretim.md)
> - [2 · Finans](2-finans.md)
> - [3 · Klinik ilişkileri ve iletişim](3-klinik-iletisim.md)
> - [4 · Lojistik, stok ve yönetim](4-lojistik-stok-yonetim.md)
> - [5 · Gezinme ve bulunabilirlik](5-gezinme-bulunabilirlik.md)
>
> Doğrulama etiketleri:
> - **DOĞRULANDI:** canlı veritabanında ya da kodda ayrıca kontrol edildi.
> - **canlı:** ajan ekranda gördü.
> - **kod:** yalnız kaynak koddan çıkarıldı.

## Genel hüküm

Siman'ın çekirdeği bir lab'ın işini görüyor ve bazı yerlerde rakiplerinden ileride:

- sipariş detayı ve 3D görüntüleyici;
- e-fatura (toplu, bağlama, gelen e-fatura → alış);
- alacak yaşlandırması;
- otomatik stok tüketimi;
- klinik kayıt ve onay akışı.

Bugün bir lab yöneticisini en çok üç şey zorlar:

1. **Rakamlara güvenilmiyor.** Aynı "geciken", "toplam sipariş", "bu ayın cirosu" her ekranda farklı.
2. **Aradığını bulamıyor.** Üstteki arama kutusu çalışmıyor; aynı iş birkaç yere dağılmış. Telefon tarayıcısında menünün yarısına ulaşılamıyor.
3. **Lab'ın gününü yöneten bilgi eksik.** Teslim tarihi listede yok, prova takibi yok, sipariş geçmişi siparişin içinde değil.

Ayrıca bir güvenlik açığı ve bir para hatası doğrulandı; bunlar en önce kapanmalı.

## Öncelik listesi

### KRİTİK: hemen

| # | Sorun | Neden kritik | Emek | Durum |
|---|---|---|---|---|
| K1 | **Maaş ve personel verisi lab'daki herkese açık.** `salary_payments` okuması ve `employees` tablosundaki her işlem (okuma, yazma, silme; `base_salary` dahil) yalnız "aynı lab" şartına bağlı. Teknisyen ya da kurye API'den herkesin maaşını okuyabilir, personel kaydını değiştirip silebilir. | KVKK, iç huzur, veri bütünlüğü | küçük (RLS migration) | DOĞRULANDI (canlı politika; bu lab'da 9 hesap etkileniyor) |
| K2 | **Dönem filtreli ekstrede açılış bakiyesi hep 0 basılıyor**, kapanış bakiyesi yalnız dönem hareketlerinden hesaplanıyor. Kliniğe ay sonu yanlış borç gider. Klinik panelindeki ekstre doğru hesaplıyor. | Para ve mutabakat | küçük | DOĞRULANDI (`modules/invoices/buildStatementHtml.ts:188`) |
| K3 | **Telefon tarayıcısında "Tüm Menü" (•••) ekranın dışında açılıyor.** Finans, Ekip, Stok, Ayarlar ve Kurye Takip telefondan fiilen ulaşılamıyor. Sorun Özet ve Siparişler ekranlarında çıkıyor. | Mobil kullanılamaz | küçük | canlı (öykünme, 2 kez; PWA'da olmayabilir) |
| K4 | **Alış faturasında mükerrer kayıt engeli yok.** Aynı tedarikçi, aynı fatura no, aynı gün, aynı tutar iki kez borca girmiş görünüyor; sistem uyarmıyor. | Fazla ödeme | küçük | canlı (gerçekten mükerrer mi doğrulanmadı) |
| K5 | **Prova takibi yok.** Provada olan ya da provadan dönen işler için durum, filtre veya ekran bulunmuyor. Hazır bir `ProvaSection` bileşeni var, hiçbir yerde kullanılmıyor. | Metal/porselen işlerin yarısı görünmez; sahte "geciken" sayısı | orta | canlı + kod |

### YÜKSEK: birden çok incelemenin ortak bulgusu

| # | Sorun | Kaç inceleme | Emek |
|---|---|---|---|
| Y1 | **Üstteki "Ara..." kutusu hiçbir şey yapmıyor** (`onSearchSubmit` hiçbir panelde bağlı değil). Ctrl+K yalnız 14 menü adını arıyor; mobil admin'de arama yok. Hazır `SearchAboveFab` bileşeni kullanılmıyor. | 5/5 | orta |
| Y2 | **Sayılar ekrandan ekrana tutmuyor.** Örnekler: geciken Özet 2, liste 1, pano 2; toplam sipariş 58 / 60; mobil "BUGÜN 58 SİPARİŞ" aslında toplam sipariş sayısı; ciro Faturalar, Rapor ve Karlılık'ta üç farklı rakam; personel 0 / 3 / 4 / 7. Tek tanım ve tek kaynak gerekiyor; arşiv, taslak ve iptal hariç tutulmalı. | 4/5 | orta |
| Y3 | **Teslim tarihi sipariş listesinde yok.** "Bugün ya da yarın teslim" listesi de yok. Özet rozetleri filtre taşımıyor: "Geciken" filtresiz liste açıyor, `?status=` okunmuyor. | 3/5 | küçük |
| Y4 | **Mesajlar'ı ya da bir siparişi açmak mesajları herkes için "okundu" yapıyor.** Pencere en yeni sohbeti kendiliğinden seçiyor ve okundu bilgisi hekime de yansıyor. | 3/5 | küçük |
| Y5 | **Pencere genişliği telefon ile masaüstü arasında değişince menü tıklaması beyaz ekran veriyor** (`reading 'find'`). Tablet çevirince ya da pencereyi büyütünce olur. | 2/5 | orta |
| Y6 | **Aynı iş birden çok yerde, bazen farklı adla duruyor.** Örnekler: "Sağlık Kurumları" (kart / bakiye), Performans / Personel Verim, Onaylar ↔ Ödeme Onayları ↔ Bağlantı istekleri, Tedarikçiler Finans'ta, lab bilgileri "Genel"de. | 4/5 | orta |

### YÜKSEK: alan bazlı

**Sipariş ve üretim**
- **Sipariş geçmişi siparişin içinde değil.** Yalnız Ayarlar → Loglar'da, son ~1000 kayıt içinde aranıyor. Detayda tanımlı ama kullanılmayan bir `ActivityFeed` bileşeni var.
- **Aşamada atanan kişi gösteriliyor, işi tamamlayan değil.** Süreler 0 olduğu halde performans skoru 50-68 arası çıkıyor; prim ve performans kararı bu veriye dayanamaz.
- **Teslim tarihi en erken 5 iş günü sonrası seçilebiliyor.** Kural sabit; iş tipine ya da lab ayarına bağlı değil ve lab personeline de uygulanıyor.
- **Teslim edilmiş siparişte yanlış düğmeler görünüyor:** Kuryeye Gönder, Hekim Onayı. Mobilde "Kalan 4g" ve işe yaramayan Duraklat düğmesi var.
- **Arşivlenmiş sipariş Üretim Panosu'nda "Otomatik ata" düğmesiyle duruyor.**

**Finans**
- **Kasa/Banka modülü tahsilat ve giderden kopuk.** Kasa hareketleri yalnız elle giriliyor; bu lab'da tanımlı hesap da yok.
- **Karlılık ekranı yanıltıcı.** İşçilik 0 iken "%97 · Mükemmel" diyor. Toplu faturada gelirin tamamı ilk siparişe yazılıyor.
- **Muhasebeciye veri vermek zor.** Fatura listesinde tarih filtresi yok. "Excel" aslında CSV indiriyor ve dosyada para birimi, KDV ve ETTN sütunu yok.
- **Luca'da iptal edilen e-fatura gözden kaçıyor.** Karşılığı Siman'da "Kesildi" kalıyor ve bakiyede sayılıyor; red/hata için ayrı filtre yok.
- **Özet'teki "Bu Ay Tahsilat" gerçek tahsilatı göstermiyor.** Rapordaki gelirin KDV dahil olduğu da migration dosyasından çıkarıldı, canlıda doğrulanmadı.

**Klinik ilişkileri**
- **Klinik kartında iş ilişkisi yok:** sipariş, bakiye, son sipariş, puan ve yazışma görünmüyor. Sipariş ve mesaj aramaları klinik adını aramıyor.
- **Var olan müşteriyi platforma almak çift kayıt üretiyor.** Davet koduyla gelen klinik için her seferinde yeni kurum açılıyor. "Yetkili Girişi"nde şifreyi lab belirliyor.
- **İletişim dört yere dağılmış:** sipariş sohbeti, Siman dışındaki WhatsApp, telefon talepleri ve destek. Hiçbiri klinik kaydına bağlı değil. İki destek talebi ~4 aydır "Yeni" durumunda.
- **Değerlendirmeleri toplu gösteren bir ekran yok.** "En çok iş gönderen" ve "sessizleşen müşteri" raporu da yok.

**Lojistik, stok, yönetim**
- **Kuryede teslim kanıtı yok.** Foto ve İmza düğmeleri bir şey yapmıyor. "Tara" ile paket okutunca "Teslimat bulunamadı" ekranı geliyor (koddan).
- **Shipink kargo durumu kendiliğinden güncellenmiyor;** her gönderi elle sorgulanıyor.
- **Geçmiş çok kısa.** Kurye listesi son 100 gönderiyi, Loglar son 1000 kaydı gösteriyor; tarih filtresi ve dışa aktarma yok.
- **Stok rakamına güvenilemiyor.** 127 aşamada tüketim kaydı girilmemiş; makul olmayan miktarlar için uyarı yok.
- **Kullanıcıyı ya da kliniği pasife alma onaysız, tek tık.** Klinik tarafında sunucu hatası da kontrol edilmiyor.

### ORTA / DÜŞÜK: hızlı kazançlar

- **KVKK:**
  - TV panosunda hastanın tam adı büyük puntoyla yazıyor.
  - Kurye hastanın tam adını görüyor.
  - Etiket ve kargo fişi doğru yapıyor; yalnız baş harf basıyor.
- **Dil:**
  - Türkçe büyük harf hataları: "KESILDI", "ÖDENDI", "Vadesi Gecen".
  - Türkçe karaktersiz metinler: "Gunluk tuketim", "Tumu", "Rol bazli erisim yonetimi".
  - Ek hatası: "Üretimde'a geç".
  - Diğer dillerde Türkçe kalanlar: "Tabletler", "Finans Ayarları", "Fiziksel ölçü", değerlendirme kriterleri.
  - Yazılımcı jargonu: Dashboard, Loglar, SLA, PROD, CASCADE.
- **Menü:**
  - Kodda tanımlı bölüm başlıkları ekrana çizilmiyor; 14 madde düz liste.
  - Ayarlar kişisel Profil'de, Finans Karlılık'ta açılıyor.
  - Telefon menüsünde Üretim Panosu, Destek ve WhatsApp Destek yok.
  - Telefon menüsünün başlığı "Sık kullanılmayan ekranlar", oysa Finans ve Kurumlar bir yöneticinin en sık açtığı ekranlar arasında.
- **Güvenli tıklama:** silme, pasife alma ve "Hatırlat" gibi geri alınamaz düğmeler liste satırında çıplak duruyor.
- **Küçük ama günlük:**
  - Lab IBAN'ı fatura ve ekstrede yok.
  - Telefon numaralarına dokunup aranamıyor.
  - Hasta soyadı ve yaşı zorunlu.
  - Fatura detayının kendi adresi yok; bağlantısı paylaşılamıyor.
  - Fiyat listesine toplu zam yapılamıyor.

## Güçlü yanlar (korunmalı)

- **Sipariş detayı tek ekranda.** 3D görüntüleyici tarayıcıda çalışıyor; ölçüm, kapanış ve X-ray var. İş emri etiketi A4/A5/A6 seçenekli ve KVKK uyumlu.
- **"İşi beklet" adil.** Müşteri kaynaklı beklemede teslim tarihi öteleniyor, lab haksız yere "gecikmiş" sayılmıyor. Revizyonlar lab ve hekim kaynaklı diye ayrılıyor.
- **e-Fatura güçlü.** Listede durum rozeti, toplu e-fatura, Luca'da kesileni bağlama, gönderim öncesi eksik kontrolü ve gelen e-fatura → alış dönüşümü var.
- **Alacak tarafı sağlam.** Klinik bakiyesinde yaşlandırma ve döviz ayrımı var. Tek fişte çok dövizli tahsilat yapılabiliyor; teslimde taslak fatura otomatik açılıyor.
- **Stok dürüst ve akıllı.** Malzeme formülle otomatik düşüyor, tükenme tarihi tahmin ediliyor. Ekran eksik veriyi açıkça söylüyor ("17 kalemde minimum yok").
- **Klinik tarafı iyi düşünülmüş.** Siteden kayıt ve onay akışı çalışıyor. Sihirbaz kliniğe özel fiyatı gösteriyor, implant markası ve dijital dosyayı zorunlu tutuyor. Değerlendirme formu gerçek bir kalite kontrolü. Klinik ekstresi ve "Kartla öde" var.
- **Kurye ve yönetim derli toplu.** Kendi kuryeler ve BanaBiKurye tek canlı haritada; kurye ücreti otomatik gidere düşüyor. Entegrasyonlar tek ekranda; 84 kalemlik rol ve kullanıcı bazlı yetki sistemi var.

## Önerilen sıra

**1. dalga: küçük emek, büyük etki (1-2 gün)**
- K1 maaş ve personel güvenlik kuralları. Migration olduğu için önce onay alınacak.
- K2 ekstre açılış bakiyesi.
- K3 mobil Tüm Menü.
- K4 mükerrer alış faturası uyarısı.
- Y3: sipariş listesine "Teslim" sütunu, "Bugün / Yarın teslim" çipleri, Özet rozetlerinin filtreli açılması, mobilde "BUGÜN 58" etiketinin düzeltilmesi.
- Y4: otomatik "okundu"nun kaldırılması.
- Pasife almaya onay penceresi.
- Dil ve "KESILDI" düzeltmeleri.
- TV panosunda ve kuryede hasta adının baş harfe çevrilmesi.

**2. dalga: orta emek**
- Y1 gerçek genel arama.
- Y2 tek "geciken / ciro / alacak" tanımı.
- Sipariş içinde "Geçmiş" sekmesi.
- K5 prova takibi.
- Kurye teslim kanıtı ve "Tara" düzeltmesi.
- Shipink durumunun otomatik güncellenmesi.
- Muhasebeci dışa aktarımı.
- Kasa/banka bağlantısı.
- Y5 genişlik değişince çökme.

**3. dalga: büyük**
- Klinik "müşteri kartı" (CRM) ve müşteri analizi raporu.
- Değerlendirmeler ekranı.
- İletişimin kliniğe bağlanması.
- Tek "Onaylar" kutusu.
- Menünün bölüm başlıklarıyla yeniden düzenlenmesi.

## Denetim sırasında not edilenler

- Ajanlar hiçbir kayıt oluşturmadı ve değiştirmedi; aynı saatlerdeki değişiklikleri kullanıcı kendisi yaptığını doğruladı.
- İki ajan Mesajlar'ı bir kez açtı ve en yeni sohbet kendiliğinden seçildi. O sırada okunmamış rozeti 0'dı, bu yüzden veri değişmemiş olmalı. Davranışın kendisi bulgu olarak listede (Y4).
- Yalnız admin rolüyle gezildi. Koyu tema ve diğer diller tercih değiştirilmeden, koddan ve sözlüklerden değerlendirildi.
