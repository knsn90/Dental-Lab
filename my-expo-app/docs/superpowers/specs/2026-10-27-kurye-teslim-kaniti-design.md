# Kurye teslim kanıtı (2. dalga 5) — tasarım

**Tarih:** 2026-10-27
**Kaynak:**
- Yol haritası `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` (2. dalga 5).
- Denetim raporu `docs/lab-yoneticisi-raporu/4-lojistik-stok-yonetim.md` ve `00-ozet.md`.
- Kullanıcıyla beyin fırtınası (2026-10-27).
- Mevcut durum taraması ve canlı şema kontrolü (bölüm 8).
- Onaylı etkileşimli prototip: `docs/superpowers/specs/2026-10-27-kurye-teslim-kaniti-prototip.html`. Tarayıcıda açılır. Üstteki seçiciyle "Kurye ekranı" ve "Siparişte" görünümleri, ikincil seçicilerle durumlar denenir.

## 1. Amaç ve neden

Lab yöneticisinin anlattığı olay: "Klinik teslim almadık dedi, elimizde kanıt yoktu."

Kanıt olarak üç şeyden birinin yeteceğini söyledi: imza, kod ya da fotoğraf. Kodun zor olacağını kendisi belirtti ve şunu seçti: "alıcının ad soyadı, imzası alınırsa daha sağlıklı olur". Alınamazsa fotoğraf yeterli olacak, ama fotoğraf her teslimde zorunlu.

Denetim raporunun tespitleri:
- Kurye teslim ekranındaki "Fotoğraf çek" ve "İmza al" düğmeleri hiçbir şey yapmıyor. "İmza al" telefonda hiç görünmüyor.
- "Teslim et" hiçbir şey sormadan teslimi kapatıyor.
- "Tara" ile paket okutulup "Vakayı aç" denince "Teslimat bulunamadı" çıkıyor. QR sipariş kimliğini veriyor, açılan sayfa teslimat kimliği bekliyor.

**Başarı:** Klinik "teslim almadık" dediğinde lab, siparişin Lojistik kartından kimin, ne zaman teslim aldığını, imzasını ve paketin bırakıldığı yerin fotoğrafını gösterebilir. Klinik bu bilgiyi teslim bildiriminde de görür, itiraz baştan önlenir.

## 2. Hedefler, hedef dışı, kaçınılacaklar

**Hedefler**
- Kendi kuryenin her teslimi fotoğraflı olur. Kliniğe teslimlerde teslim alanın adı ve imzası da alınır.
- BanaBiKurye kanıt veriyorsa aynı yerde gösterilir.
- Yönetici gerektiğinde teslimi gerekçeli olarak kanıtsız kapatabilir.
- "Tara" düğmesi doğru teslimatı açar.

**Hedef dışı** (kullanıcı onayladı)
- Teslim kodu (OTP). Kullanıcı vazgeçti.
- Kargo (Shipink) ve elden teslimler.
- Daha önce teslim edilmiş siparişler için geriye dönük kanıt. BanaBiKurye'nin geçmiş 45 teslimi de dahil.
- Teslim anında konum kaydı.
- Kurye paketi teslim alırken ("Paketi aldım") kanıt istemek.

**Kaçınılacaklar** (çalışsa da başarısızlık sayılır)
- Kanıt zorunluluğunun yalnız ekranda olması. Kurye bugün kendi teslimat satırını doğrudan güncelleyebiliyor (bölüm 8). Zorunluluk veritabanında da uygulanmalı, yoksa eski bir uygulama sürümü ya da doğrudan istek kanıtı atlar.
- Çalışan teslim akışlarını bozmak. Prova otomatiği, otomatik taslak fatura, sipariş kapanışı, BanaBiKurye ve Shipink akışları aynen çalışmalı.
- Kuryeye ek onay pencereleri. Kanıt penceresinin kendisi onaydır; ayrıca "Emin misiniz?" sorulmaz.
- Kanıtın teslimden sonra değiştirilebilmesi. Kanıt, teslim kapandıktan sonra kurye ya da klinik tarafından değiştirilemez ve silinemez.

## 3. Kullanıcının kararları (2026-10-27)

1. **Fotoğraf her teslimde zorunlu.** Kurye fotoğraf çekmeden teslimi kapatamaz.
2. **Kliniğe teslimde** teslim alanın adı soyadı ve imzası alınır.
3. **İmza alınamazsa** (resepsiyon boş, kimse imzalamıyor) kurye "İmza alınamadı" der ve nedenini seçer. Teslim yine kapanır, kanıt fotoğraf olur.
4. **Lab'a teslimde** (klinikten ya da dışarıdan gelen paket) yalnız fotoğraf istenir. Kullanıcı: "lab'da sadece fotoğraf yeterli".
5. **Görünürlük:**
   - Kanıt siparişin içinde durur. Lab ve klinik siparişte görür.
   - Klinik "teslim edildi" bildiriminde teslim alanın adını ve saati görür.
   - Fotoğraf ve imza bildirimde gösterilmez.
6. **BanaBiKurye:** "BanaBiKurye kanıt veriyorsa onu siparişte göster." Kanıt yoksa siparişte "BanaBiKurye bu teslim için kanıt göndermedi" yazar.
7. **Yönetici kanıtsız kapatabilir, ama nedenini yazmak zorunda.**
   - Siparişte "Kanıtsız kapatıldı · yöneticinin adı · neden" görünür. Klinik de nedeniyle birlikte görür.
   - Kurye kanıtsız kapatamaz.
8. **"Tara":** QR'dan sipariş bulunur, o siparişte bu kuryeye atanmış, kapanmamış teslimat açılır. Yoksa "Bu siparişte size atanmış açık teslimat yok" denir.
9. **Tasarım** `/apple-design` ilkelerine uyar. Prototipteki hareket ve davranış onaylı (bölüm 6).
10. **Okuyucu sorularına cevaplar:**
    - Aynı ziyarette birden çok paket: "Tek kanıt hepsine" (4.5b).
    - Kuryelerin kullandığı uygulama: "İkisi de / bilmiyorum"; kapı ayrı ve onaylı bir adımda açılır (7.5).
    - BanaBiKurye kontrolü: onaylandı ve yapıldı (4.5).

## 4. Davranış kuralları

### 4.1 Hangi teslimde ne istenir

Kural yalnız kendi kuryeyle yapılan teslimlerde (`mode = 'internal'`) geçerli.

| Teslimin yönü (`direction`) | Fotoğraf | Ad soyad + imza |
|---|---|---|
| `lab_to_clinic` (lab → klinik) | zorunlu | zorunlu; ya da "İmza alınamadı" + neden |
| `clinic_to_lab` (klinik → lab) | zorunlu | sorulmaz |
| `lab_to_other` (lab → dış taraf: tedarikçiye iade, belge…) | zorunlu | sorulmaz *(benim kararım)* |
| `other_to_lab` (dış taraf → lab) | zorunlu | sorulmaz *(benim kararım)* |

Kuralın özü: kliniğe teslimde kliniğin kabulü alınır, diğer bütün teslimlerde fotoğraf yeterlidir. İtiraz sorunu kliniklerle yaşandı. Dış taraflara kendi kuryeyle bugüne kadar hiç gönderi yapılmamış (bölüm 8).

**Siparişsiz gönderiler** (`work_order_id` boş; tedarikçiye iade gibi):
- Aynı kural geçerli.
- Siparişleri olmadığı için kanıt, lab'ın teslimat detay ekranında (`DeliveryDetailScreen`) gösterilir.
- Bugün `update_delivery_status` siparişsiz teslimatta "delivery not found" hatası veriyor; kurye bu gönderileri uygulamadan kapatamıyor. Kanıtlı teslim fonksiyonu siparişsiz teslimatı da kapatabilmeli.

Diğer modlar:
- **BanaBiKurye ve Shipink** (`mode = 'external'`): uygulamada kanıt adımı yok. Kanıt sağlayıcıdan gelir (4.5).
- **Elden teslim:** teslimat kaydı olmadığı için bu işin dışında.

### 4.2 "İmza alınamadı"

- Kurye anahtarı açınca imza alanı devre dışı kalır. Hazır nedenlerden biri seçilir: "Resepsiyonda kimse yoktu", "İmzalamak istemedi", "Paket kapıya bırakıldı", "Diğer". "Diğer" seçilirse kısa bir not zorunludur. *(Nedenler benim önerim; kullanıcı prototipte gördü, itiraz etmedi.)*
- Ad soyad bu durumda isteğe bağlıdır. Yazıldıysa kaydedilir.

### 4.3 Kanıt kapısı

Kendi kuryeyle yapılan bir teslimin durumu `teslim_edildi`'ye geçerken şu koşullar aranır:
- Fotoğraf yüklenmiş olmalı.
- Kliniğe teslimde (`lab_to_clinic`) ad soyad ve imza alınmış olmalı, ya da "İmza alınamadı" nedeni seçilmiş olmalı.
- Bu koşulların yerine geçebilecek tek şey yöneticinin gerekçeli kanıtsız kapatmasıdır (4.4).

Kapı veritabanında, durum değişiminin her yolunda uygulanır. Bugün durumu değiştiren yollar:
- `update_delivery_status` fonksiyonu,
- kurye ve yöneticinin tabloya doğrudan güncellemesi,
- eski `modules/delivery/api.ts` doğrudan güncellemesi.

Kapıdan dönen hata mesajları Türkçe yazılır ve autoT sözlüğüne dört dilde eklenir. Prova işinde de aynı yol izlendi (`i18n_errs`).

Kanıt teslim kapandıktan sonra değişmez:
- Kurye, klinik ya da istemci fotoğrafı, imzayı, adı veya nedeni değiştiremez.
- Dosya alanında da kanıtı silemez ya da üzerine yazamaz.
- Yalnız BanaBiKurye kopyalama işi sunucu tarafında yazabilir (4.5).

### 4.4 Yöneticinin kanıtsız kapatması

**Kim:** `update_delivery_status`'un bugünkü yönetici kuralıyla aynı kişiler. Yani aynı lab'ın `user_type = 'lab'` ve rolü `manager`/`admin` olanları, `user_type = 'admin'` olanlar ve platform yöneticisi.

**Nasıl:**
- Pencere "Kanıtsız kapat" başlığıyla açılır ve neden yazmak zorunludur. Prototipte en az 6 karakter.
- Kaydedilenler: neden, kapatan kişi ve saat.
- Siparişte şu satır görünür: "Kanıtsız kapatıldı · Yönetici: <ad> · Neden: <metin>".

**Kurye yetkisi:** Kurye kanıtsız kapatma alanlarını yazamaz. Kapı bunu da reddeder.

**Ekrandaki yerler:** Bugün yöneticinin teslim edildi dediği her yer, kendi kurye teslimatlarında bu pencereyi açar:
- `OrderDetailScreenV2.tsx` 1437 ve 2365.
- `StageWorkflowTimeline.tsx:435`.
- `modules/delivery/screens/DeliveryDetailScreen.tsx` (lab teslimat detayı).

Dış teslimatlarda (BanaBiKurye, Shipink) bu ekranlar bugünkü gibi çalışır. `OrderDetailScreenV2.tsx:2405`'teki "Durumu Güncelle" yalnız BanaBiKurye durumunu sorgulayıp uygular; kanıtsız kapatma penceresi orada açılmaz.

**Kanıt teslimden sonra:**
- Teslim kapandıktan sonra kanıt uygulamadan kimse tarafından değiştirilemez; kurye, klinik ve yönetici dahil.
- Yönetici yanlışlıkla kapanan bir teslimi yeniden açarsa (durum `teslim_edildi`'den çıkar), kurye yeniden kapatırken kanıtı yenileyebilir.
- KVKK silme talebi uygulama dışında, platform yöneticisi tarafından sunucu tarafında karşılanır.
- *(benim kararım)*

### 4.5 BanaBiKurye kanıtı

**Kaynak:** BanaBiKurye, Borzo Business API 1.8 ile aynı altyapıyı kullanıyor (`robot.banabikurye.com/api/business/1.8`). Borzo belgesinde her teslim noktasında şu alanlar var:
- `checkin.recipient_full_name`, `checkin.recipient_position`,
- `place_photo_url` (teslim yerinin fotoğrafı),
- `sign_photo_url` (imza fotoğrafı),
- `courier_visit_datetime`.

**Ne yapılır:**
- Teslim noktası, BanaBiKurye siparişindeki son noktadır.
- BanaBiKurye teslimatı hangi yoldan `teslim_edildi` olursa olsun bu alanlar okunur: callback ya da yöneticinin "Durumu Güncelle" sorgusu. Okuma teslimden ayrı ve sonradan çalışır; teslim işlemini beklemez.
- Fotoğraflar kendi dosya alanımıza kopyalanır, çünkü sağlayıcının bağlantıları kalıcı olmayabilir.
- Teslimat kaydına "kanıt kaynağı: sağlayıcı" olarak yazılır.
- Kaynaklar: önce `banabikurye-callback`'e gelen gövdedeki sipariş nesnesi. Gövdede yoksa, lab'ın kendi BanaBiKurye anahtarıyla (`provider_credentials`) sipariş tek seferlik okunur.

**Kanıt gelmezse:**
- Alanlar boşsa ya da okuma başarısızsa sipariş yine kapanır, kanıt boş kalır.
- Siparişte "BanaBiKurye bu teslim için kanıt göndermedi" yazar.
- Kanıt alma hatası teslimi asla engellemez ve geciktirmez.

**Doğrulama (2026-10-27, kullanıcı onayıyla):** Teslim edilmiş tek bir üretim siparişi yalnız okundu (GET). Sonuç:
- Teslim alanın adı (`checkin.recipient_full_name`) iki noktada da dolu geliyor.
- Varış saati (`courier_visit_datetime`) iki noktada da dolu geliyor.
- Görev (`recipient_position`), yer fotoğrafı (`place_photo_url`) ve imza fotoğrafı (`sign_photo_url`) alanları API'de var ama boş.

Bu yüzden BanaBiKurye kanıtı bugün **teslim alanın adı + varış saati** olarak gösterilir. Fotoğraf ve imza ileride dolu gelirse aynı yerde gösterilir. Kod iki durumu da karşılar, boş olanı göstermez.

Prototipteki "BanaBiKurye · kanıtlı" durumu buna göre güncellendi: fotoğraf ve imza yok, ad ve saat var.

Not: Noktada `checkin_code` (teslim kodu) da var. Kod fikri hedef dışı olduğu için kullanılmaz.

### 4.5b Aynı ziyarette birden çok paket (kullanıcı kararı)

"Tek kanıt hepsine" seçildi:
- Kurye bir teslimatın kanıt penceresini açtığında, aynı varış yerine (aynı klinik) kendisine atanmış ve henüz kapanmamış başka teslimatlar varsa pencerede bir seçenek görünür: "Bu klinikteki N teslimatı birlikte kapat". Varsayılan olarak açıktır.
- Seçenek açıkken tek fotoğraf, tek ad ve tek imza (ya da tek "İmza alınamadı" nedeni) seçili teslimatların hepsine yazılır ve hepsi birlikte kapanır.
- Her siparişin Lojistik kartında aynı kanıt görünür. Bu siparişlerden herhangi birini görebilen kişi kanıt dosyalarını açabilir.
- Kurye seçeneği kapatırsa yalnız açtığı teslimat kapanır.

### 4.6 "Tara" düğmesi

Kurye panelindeki tarayıcı (`app/(courier)/_layout.tsx` → `ScanB6Mobile`) sipariş kimliği döndürür. Kurye düzeninde "Vakayı aç" şöyle çalışır:
- O siparişte bu kuryeye atanmış, durumu `teslim_edildi` ya da `iptal` olmayan teslimatlar aranır.
- Bir tane varsa onun detayı açılır: `/(courier)/delivery/<teslimat kimliği>`.
- Birden çok varsa sırası gelen açılır: önce `yolda`, sonra `teslim_alindi`, sonra `atandi`/`beklemede`; aynı durumdakiler arasında en eski. *(benim kararım)*
- Hiç yoksa tarayıcı açık kalır ve "Bu siparişte size atanmış açık teslimat yok" mesajı gösterilir.

İstasyon panelindeki tarayıcı davranışı değişmez.

### 4.7 Görünürlük ve bildirim

**Kim görür:** Kanıtı, o teslimat satırını bugün okuyabilen herkes görür; dosyalar da aynı kuralla açılır. Bugünkü `deliveries` okuma kuralları:
- lab kullanıcıları,
- atanmış kurye,
- siparişin hekimi (`is_my_doctor_order`),
- kliniğin yönetici ve sekreteri (`deliveries_select_clinic`).

**Nerede görünür:**
- Siparişin Lojistik kartında (`OrderLogisticsCard`) her teslim satırının altında bir kanıt satırı. Kanıt tipine göre üç biçimi var:
  - küçük fotoğraf + imza, teslim alanın adı, kaynak;
  - "İmza alınamadı · neden";
  - "Kanıtsız kapatıldı …".
- Kanıt satırına basınca ortada "Teslim kanıtı" penceresi açılır: büyük fotoğraf, imza (ya da "İmza alınamadı" ve nedeni), teslim alan, saat, kurye. BanaBiKurye kanıtında "Kanıt BanaBiKurye'den geldi" etiketi de görünür.

**Bildirim:**
- Bugün teslimde kliniğin yöneticisine uygulama içi "Sipariş statüsü: Teslim Edildi · #numara" bildirimi gidiyor (`trg_work_order_notify_status`).
- Bu bildirimin metnine teslim alanın adı ve saat (lab saat diliminde) eklenir. İmza alınamadıysa "İmza alınamadı", kanıtsız kapatıldıysa "Kanıtsız kapatıldı" yazar.
- Veritabanına yazılan Türkçe metin "Sabit · değişken" kalıbında olur (autoT önek eşleşmesi).
- BanaBiKurye teslimlerinde bildirim teslim anında gider. Kanıt sağlayıcıdan sonradan geldiği için o anda teslim alanın adı bilinmez; bildirimde yalnız saat yazar. Ad, kanıt geldiğinde siparişte görünür. Bildirim bekletilmez ve ikinci kez gönderilmez. *(benim kararım)*
- Hekime giden "İşinizi değerlendirin" bildirimi değişmez.

## 5. Ekranlar

### 5.1 Kurye

**Teslimat detayı** (`modules/courier/screens/CourierDeliveryDetailScreen.tsx`, `ActionBar`):
- `yolda` durumundaki işe yaramayan "Fotoğraf çek" ve "İmza al" düğmeleri kaldırılır. Yerlerine tek bir "Teslim et" düğmesi gelir.
- "Teslim et" kanıt penceresini açar.
- Bu, işe yaramayan iki düğmenin kaldırılmasıdır, çalışan bir özelliğin değil.

**Kurye panosu** (`CourierDashboardScreen.tsx:304`):
- Kartın üstündeki tek dokunuşla teslim ("BIRAK") artık doğrudan durum değiştirmez, aynı kanıt penceresini açar.
- "Paketi aldım" tek dokunuşla kalır.

**Eski kurye ekranı** (`modules/delivery/screens/CourierDeliveryScreen.tsx`, `app/(lab)/courier.tsx` rotası):
- Teslim adımı aynı kanıt penceresini kullanır.
- Ekranın kendisi kaldırılmaz.

**Kanıt penceresi (yeni, ortak bileşen):**
- Bölümler: Fotoğraf → Teslim alan → İmza → "İmza alınamadı" anahtarı ve nedenler. Lab'a teslimde yalnız Fotoğraf.
- Her bölümün yanında durum etiketi: "Zorunlu", tamamlanınca "Tamam"; imza alınamadıysa "Alınamadı".
- Altta adım çizgisi ve "Teslimi tamamla" düğmesi. Eksik varken düğme soluk durur ve altında neyin eksik olduğu yazar ("Önce fotoğraf çekin" gibi).

**Fotoğraf:**
- Telefonda arka kamera açılır: native'de `expo-image-picker` `launchCameraAsync`, web/PWA'da `<input type="file" accept="image/*" capture="environment">`. Masaüstü tarayıcıda dosya seçici açılır. *(benim kararım; galeriden eski fotoğraf seçilmesini telefonda kamerayla sınırlar)*
- Yükleme öncesinde fotoğraf küçültülür. Web'de tuvalle uzun kenar ~1600 px, JPEG. Native'de `expo-image-picker`'ın kalite ayarıyla.
- Bu iş için yeni native modül eklenmez (`expo-image-manipulator`, `expo-haptics` kurulu değil). *(benim kararım)*
- "Yeniden çek" ile değiştirilebilir.

**İmza:** Web ve native'de parmakla çizilir. Görüntü dosyası olarak saklanır (PNG ya da SVG); her iki platformda gösterilebilmesi yeterli.

### 5.2 Sipariş (lab, klinik, hekim)

- Lojistik kartında kanıt satırı ve kanıt penceresi (4.7).
- Yönetici için kendi kurye teslimatında "Kanıtsız kapat" penceresi (4.4).

**Kurallar** (`CLAUDE.md`):
- Popup arkası `useInkUI().modalOverlay` ile bulanık olur, mobilde de ortada açılır, dar ekranda dolgu 12.
- Her yeni düğmede GlassTooltip olur.
- Düğme satırları tek stil ve tek satırdır.
- Koyu tema aynı anda yapılır.
- Metinler tr, en, de ve fa'ya aynı anda girer.

## 6. Tasarım ilkeleri (`/apple-design`, prototipte onaylı)

**Pencereler**
- Basılan düğmeden ya da küçük resimden büyüyerek açılır, kapanınca aynı yoldan oraya döner.
- Hareket kritik sönümlü bir yaydır (sönüm 1.0, tepki ~0.35 sn), sabit süreli bir animasyon değildir.
- Hareket yarıda kesilebilir: kapanırken yeniden açılırsa olduğu yerden ve o anki hızıyla döner.
- Native'de React Native `Animated.spring` ya da Reanimated ile, web'de aynı yay mantığıyla kurulur. Projedeki prova penceresi de böyle yapıldı (stiffness 320, damping 36).

**Dokunma ve geri bildirim**
- Basış geri bildirimi dokunduğu anda gelir (pointer-down), bırakınca değil.
- Doğrulama satır içindedir: neyin eksik olduğu her an görünür, gönderince değil.
- Eksikken "Teslimi tamamla"ya basılırsa uyarı yazısı kısa bir yayla sallanır.

**Dokunsal titreşim:** Yalnız anlamlı anlarda kullanılır: fotoğraf çekildiğinde, teslim tamamlandığında, eksikle basıldığında. Görsel ile aynı karede tetiklenir. React Native `Vibration` ile; web'de `navigator.vibrate` (destekleyen tarayıcıda).

**İmza**
- Parmağı birebir izler; çizgi kalınlığı hıza göre değişir.
- "Temizle" onay sormaz, 4 saniye "Geri al" sunar.

**Diğer öğeler**
- "İmza alınamadı" iOS tarzı bir anahtardır (Switch).
- Fotoğraf çekilince kısa bir deklanşör ışığı yanar ve fotoğraf yerine oturur.
- Uzun içerikte üst ve alt kenarda sert çizgi yerine solan bir maske görünür.

**Erişilebilirlik:**
- "Hareketi azalt" açıksa kayma ve yay yerine yalnız solma kullanılır.
- "Saydamlığı azalt" açıksa bulanıklık kalkar.
- Saatlerde eşit genişlikli rakamlar kullanılır.

## 7. Veri, dosya ve güvenlik

### 7.1 Teslimat kaydı

Var olan sütunlar kullanılır: `recipient_name`, `recipient_note`, `signature_path` (039'dan beri var, hiç kullanılmamış).

Yeni bilgiler *(adlar önerimdir, inşa eden değiştirebilir)*:
- fotoğraf yolu,
- "İmza alınamadı" nedeni,
- kanıtın kaynağı (`courier` / `provider` / `manager_override`),
- kanıtın alındığı saat,
- BanaBiKurye'den gelen teslim alan görevi,
- yönetici kapatma alanları (neden, kişi, saat).

Bu alanlar mevcut teslim kayıtları için boş kalır (geri doldurma yok).

### 7.2 Yazma yolu

- Kurye kanıtı tek bir sunucu fonksiyonuyla (DEFINER) teslim eder. Fonksiyon şunları yapar:
  - arayanın atanmış kurye olduğunu denetler,
  - fotoğraf ve imza dosyalarının bu teslimatın klasöründe gerçekten var olduğunu doğrular,
  - alanları yazar,
  - durumu bugünkü `update_delivery_status` mantığıyla kapatır: siparişi kapatma, bekleme temizliği, prova ve fatura tetikleyicileri aynen çalışır.
- Yöneticinin kanıtsız kapatması ayrı bir fonksiyondur ve neden zorunludur.
- Kapı (4.3) bunlardan bağımsız olarak tetikleyicide de durur.

### 7.3 Dosya alanı

- Yeni, herkese kapalı bir depolama alanı açılır. Öneri: `delivery-proofs`, yol `<teslimat kimliği>/…`.
- **Yükleme:** Yalnız o teslimatın atanmış kuryesi, teslim kapanmadan önce ve kendi teslimatının klasörüne yükleyebilir.
- **Okuma:** O teslimat satırını okuyabilen herkes (4.7).
- **Değiştirme ve silme:** İstemciye kapalı.
- **Sınırlar:** Dosya boyutu ve türü sınırlanır (yalnız görüntü).
- **Sunucu yazımı:** BanaBiKurye kopyası sunucu tarafında yazılır.

### 7.4 Kişisel veri (KVKK)

- Teslim alanın adı, imzası ve fotoğraf kişisel veridir.
- Fotoğraf yönergesi "paket ve bırakıldığı yer görünsün" der; yüz çekmeyi teşvik etmez.
- Kanıt siparişle birlikte saklanır; sipariş silinince kanıt da silinir.
- **Açık iş:** Aydınlatma metnine teslim kanıtının toplandığı eklenmeli. Mevcut ⟦HUKUK⟧ alanlarıyla birlikte hukukçuya gider; bu işi engellemez.

### 7.5 Yayın sırası

Kapı, istemci yayınlanmadan açılırsa eski uygulama sürümündeki kurye teslimi kapatamaz. Telefondaki uygulama (App Store / TestFlight) kendiliğinden güncellenmez. Kullanıcı kuryelerin hangisini kullandığını bilmiyor ("İkisi de / bilmiyorum"). Bu yüzden sıra şöyledir:
1. Veritabanı alanları, dosya alanı ve fonksiyonlar.
2. İstemci deploy (web). Bu andan itibaren yeni ekran kanıtı zorunlu tutar.
3. Kuryelerin kullandığı uygulama ve sürüm birlikte kontrol edilir. Kaynak örneğin son kurye oturumlarının platform bilgisi; kontrol yöntemi plana bırakılır.
4. Kanıt kapısını açan tetikleyici, ayrı bir migration olarak ve kullanıcı onayıyla uygulanır. Telefon uygulamasını kullanan kurye varsa kapı, yeni sürüm mağazaya çıkıp kuryeler güncelleyene kadar bekler.

İlk üç adım tek başına da işe yarar: yeni ekran kanıtı ister. Kapı yalnız eski sürümlerden ve doğrudan isteklerden gelen boşluğu kapatır.

Her adım projedeki 5 adımlı veritabanı protokolüyle uygulanır: canlı tanım, geri alma dosyası, geri alınan deneme, onay, uygulama.

## 8. Mevcut durum (2026-10-27 taraması)

**Kurye detay ekranı** (`modules/courier/screens/CourierDeliveryDetailScreen.tsx:633-655`):
- `yolda` durumunda "Fotoğraf çek" ve "İmza al" düğmelerinin `onPress`'i yok. "İmza al" yalnız geniş ekranda çiziliyor.
- "Teslim et" doğrudan `updateDeliveryStatus(d.id, 'teslim_edildi')` çağırıyor.

**Kurye panosu:** `CourierDashboardScreen.tsx:304` kart üstünden tek dokunuşla teslim ediyor.

**Eski kurye ekranı** (`modules/delivery/screens/CourierDeliveryScreen.tsx` + `useCourierDelivery`):
- Teslim alanın adını soruyor.
- `modules/delivery/api.ts` ile `deliveries` ve `work_orders`'a doğrudan yazıyor.

**Tarayıcı:** `app/(courier)/_layout.tsx:120` `onOpenOrder(id)` → `/(courier)/delivery/${id}`. `id` sipariş kimliği, rota teslimat kimliği bekliyor.

**`deliveries` tablosu**
- Var olan alanlar: `recipient_name`, `recipient_note`, `signature_path`, `ext_courier_name/phone/photo`.
- Fotoğraf alanı yok.

**`deliveries` yetkileri**
- `authenticated` rolü tabloya tam yetkili.
- `deliveries_update_courier` atanmış kuryeye satırın her sütununu güncelleme izni veriyor.
- `deliveries_write_manager` yöneticiye tüm işlemleri açıyor.
- Okuma kuralları 4.7'de.

**Teslim akışı fonksiyonları**
- `update_delivery_status`: yetki, durum ve tarih değişimi; final teslimde siparişi kapatma ve bekleme temizliği.
- `bbk_apply_delivery_status`: BanaBiKurye durumunu uygular, kanıt almaz.

**BanaBiKurye callback** (`supabase/functions/banabikurye-callback/index.ts`): Gövdeden yalnız sipariş kimliğini ve durumu okuyor, gerisini atıyor.

**Dosya alanı:** Teslim kanıtı için bir alan yok. Mevcut `work-order-photos` alanının kuralları örnek alınabilir.

**Bildirim**
- `trg_work_order_notify_status`: teslimde kliniğin yöneticisine uygulama içi bildirim gönderiyor.
- `notify_order_delivered`: hekime "İşinizi değerlendirin" gönderiyor.
- Teslim için e-posta ya da WhatsApp gitmiyor.

**Teslim sayıları:**
- Teslim edilen: 45 BanaBiKurye, 8 kendi kurye. Yolda: 1 BanaBiKurye. İptal: 6 kendi kurye, 4 BanaBiKurye.
- Yöne göre:
  - Kendi kurye: 14 teslimatın hepsi `lab_to_clinic`.
  - Dış: 38 `lab_to_clinic`, 9 `clinic_to_lab`, 1 `lab_to_other`.
  - Siparişsiz: 2 gönderi, ikisi de dış.
- Aynı kuryenin aynı gün aynı yere birden çok teslimatı: 1 kez.

**Bağımlılıklar:** `expo-image-picker`, `expo-camera`, `react-native-svg` kurulu.

## 9. İnşa edene bırakılanlar ve benim kararlarım

**Benim kararlarım** (kullanıcı gözden geçirecek):
- Dış taraflara ve dış taraflardan teslimlerde yalnız fotoğraf; siparişsiz gönderilerde kanıtın lab teslimat detayında görünmesi (4.1).
- Teslim kapandıktan sonra kanıtın uygulamadan değiştirilememesi; yeniden açılan teslimde yenilenebilmesi (4.4).
- BanaBiKurye bildiriminin ad beklemeden gitmesi (4.7).
- Yeni native modül eklenmemesi (5.1, 6).
- "Tara"da birden çok açık teslimat varsa sıra kuralı.
- Telefonda fotoğrafın yalnız kamerayla çekilmesi; masaüstünde dosya seçici.
- BanaBiKurye fotoğraflarının kendi alanımıza kopyalanması.
- "İmza alınamadı" nedenlerinin listesi.

**İnşa edene bırakılanlar:**
- Sütun ve fonksiyon adları.
- İmzanın dosya biçimi.
- Fotoğraf sıkıştırma ayrıntısı.
- Kanıt penceresinin bileşen yapısı.
- BanaBiKurye kanıtının callback gövdesinden mi yoksa ek okumadan mı alınacağı.
- Test düzeni:
  - kanıt kuralları için saf model ve node testi,
  - kapı, yetki ve dosya kuralları için geri alınan veritabanı denemeleri.
