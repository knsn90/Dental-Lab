# Bekleme: unutulan başlangıç ve bitiş sonradan düzeltilir, pano hatırlatır (denetim yol haritası 2. dalga, madde 13)

Tarih: 2026-11-01 · Durum: açıklama konuşmada onaylandı, belge onayı bekliyor

## 1. Niyet

Yol haritasındaki madde 13 "en erken 5 iş günü kuralı lab ayarına ve iş tipine bağlansın" diyordu. Kullanıcıyla konuşunca asıl sorunun başka olduğu çıktı:

- "bir parça gelmesi lazım oluyor veya revizeler isteniyor tekrar tekrar tasarım yapılıyor onay verene kadar hekim ama süre dolmuş oluyor"
- Sorun lab içinde görünüyor: "iş geciken listesine düşüyor".
- "beklet düğmesini unutuyoruz genelde"; devam ettirmek de "bazen" unutuluyor.
- "asıl sorun bekleme meselesiydi, 5 gün kuralı kalsın". **"En erken 5 iş günü" kuralı olduğu gibi kalır; bu işin konusu değildir.**

Yani lab, hekim ya da klinik kaynaklı bir beklemeyi (eksik parça, tasarım revizyonu, hekim onayı) uygulamaya işlemeyi unutuyor. Teslim tarihi işlemeye devam ediyor, iş "Geciken" listesine düşüyor ve liste lab'ın gerçek gecikmesini göstermez hâle geliyor.

**Çözümün ilkesi:** doğru anda birinin hatırlamasına güvenilmez. Unutulan bekleme sonradan, gününe göre eksiksiz düzeltilebilir ve pano bekleyen işleri her gün gösterir.

**Kapsam:** Siman'ı kullanan bütün lablar.

## 2. Bugünkü durum (canlıdan okundu, 2026-11-01)

**Bekletme (sipariş detayı → "İşi beklet")**
- `hold_order(p_order, p_reason, p_category, p_responsible)`:
  - `work_orders.hold_status='on_hold'`, `hold_category`, `hold_responsible`, `hold_started_at=now()` yazar.
  - `work_order_holds` tablosuna bir satır açar.
  - Yetki kontrolü: siparişin lab'ı `get_my_lab_id()` olmalı.
- Kategoriler (`modules/orders/holdCategories.ts`):
  - Hekim/klinik kaynaklı: eksik dosya/tarama, eksik parça/model, hekim onayı bekleniyor, diğer (hekim/klinik).
  - Lab kaynaklı: malzeme bekleniyor, diğer (lab içi).
  - Sistem kategorisi `client_prova`: yalnız prova akışı açar ve kapatır.
- Beklemedeki iş "Geciken" sayılmaz (`core/metrics/orderDefs.ts`, `isOverdueOrder`). Bu yüzden gecikmiş bir işe sonradan "Beklet" basılınca iş listeden hemen çıkar.
- Hekim/klinik kaynaklı beklemede hekime ve klinik kullanıcılarına uygulama içi bildirim gider (`modules/orders/holdApi.ts`, istemciden).

**Devam ettirme**
- `resume_order(p_order)` uzatma gün sayısını `round((now() − hold_started_at) / 1 gün)` diye hesaplar.
- Hekim/klinik kaynaklı beklemede `delivery_date`'i bu kadar ileri kaydırır; lab kaynaklıda tarih kaymaz.
- Bekleme satırını `ended_at=now()` ve `extended_days` ile kapatır.
- Prova beklemesini reddeder.
- Devam ettirmede bildirim gitmez.

**Sorunun mekanizması**
- Bekleme düğmeye basıldığı anda başlamış sayılıyor. Geç basılırsa (iş zaten gecikmişken) devam ettirmedeki uzatma kısa kalıyor. Tarih yine geçmişte kaldığı için iş "Geciken" listesine geri düşüyor.
- Devam ettirmek unutulursa iş üretimde ilerliyor ama "beklemede" kalıyor. Aşama başlatma ve tamamlama bekleme durumuna bakmıyor (`start_stage_simple`, `complete_stage_simple`). Paralel çalışma gerçek olduğu için bu davranış doğru ve değişmeyecek.

**Kullanım (son 90 gün, tek canlı lab)**
- 49 siparişin 2'sinde bekletme kullanılmış.
- Uygulama içi tasarım onayı akışı (`request_design_approval`) hiç kullanılmamış. Revizyonlar uygulama dışında yürüyor.

**Mobil:** 1024px altındaki sipariş detayında (`OrderDetailMobileHandoff`) "İşi beklet" ve "Devam ettir" düğmeleri yok. Telefon ve tablette bekletme yapılamıyor.

## 3. Hedefler, hedef dışı, yapılmaması gerekenler

**Hedefler**
1. Unutulan bekleme **başlangıcı** sonradan girilebilir ("ne zamandan beri bekliyor?").
2. Unutulan bekleme **bitişi** sonradan girilebilir ("parça / onay ne zaman geldi?").
3. Teslim tarihi gerçekte beklenen gün kadar kayar; iş gerçekçi bir tarihle "Geciken" listesinin dışında kalır.
4. "Geciken" listesindeki bir işe tek dokunuşla "hekimi bekliyor" denebilir.
5. Ana sayfa panosu bekleyen işleri gösterir ve uzun bekleyenleri hatırlatır. Kullanıcı: lab'da her gün ilk bakılan yer "ana sayfadaki pano".
6. Bekletme ve devam ettirme telefon ile tablette de yapılabilir.

**Hedef dışı**
- "En erken 5 iş günü" kuralı (sipariş girerken seçilebilen en erken tarih) değişmez.
- Aşama hareketiyle beklemenin kendiliğinden bitmesi yok (bkz. Kaçınılacaklar).
- Uygulama içi tasarım onayı akışı ve prova akışı değişmez.
- Devam ettirmede hekime yeni bildirim gönderilmez (bugünkü gibi).
- Uzatma takvim günüyle yapılır, iş günü hesabı yok (bugünkü gibi).
- Kapanmış bir beklemenin tarihleri sonradan düzeltilemez; teslim edilmiş işe geriye dönük bitiş girilemez.

**Kaçınılacaklar**
- Hekim veya parça beklerken başka aşamada çalışmak beklemeyi kapatmamalı. Kullanıcı: "bazen başka aşamalarda çalışıyoruz".
- Bugün tarih girmeden bekletip devam ettiren kullanıcının akışı gereksiz uzamamalı. Tarihler her zaman "bugün" ile dolu gelir.
  - Bekletme penceresi zaten var; tarih alanı ek dokunuş gerektirmez.
  - Devam ettirme bugün tek dokunuştur; artık küçük bir pencere açılır ve tek "Devam ettir" onayı ister. Bu bir dokunuşluk fark bilinçlidir: tarih sorusu tam da unutulan bitişin düzeltildiği andır.
- Prova beklemesine dokunulmamalı.
- Lab kaynaklı bekleme teslim tarihini kaydırmamalı (bugünkü kural).

## 4. Davranış

### 4.1 Bekletirken: "Ne zamandan beri bekliyor?"
- Bekletme penceresine bir tarih alanı eklenir. Varsayılan bugündür; geçmiş bir gün seçilebilir.
- **Sınırlar:**
  - Siparişin açıldığı günden önce olamaz.
  - Gelecek gün olamaz.
  - Aynı siparişin önceki beklemesinin (prova dahil) bittiği günden önce olamaz. Aynı günler iki kez sayılıp teslim tarihi iki kez kaydırılmasın diye.
  - Sunucu da bu sınırları reddeder; hata düğmenin yanında, sınır gününü söyleyerek görünür.
- Geçmiş bir gün seçilirse bekleme o günün başından başlamış sayılır (lab saat dilimi).
- Hekim/klinik kaynaklı beklemede hekime giden bildirim bugünkü gibi gider. Geriye dönük girilmişse de gider.

### 4.2 Devam ettirirken: "Parça / onay ne zaman geldi?"
- Devam ettirme küçük bir pencere açar ve iki gün gösterir:
  - **Başlangıç:** açık beklemenin başlangıç günüyle dolu gelir. Daha erken bir güne çekilebilir; 4.1'in sınırları geçerlidir. Böylece "bugün" diye bekletilip sonradan daha erken başladığı anlaşılan bekleme, devam ettirirken düzeltilir. Ayrı bir düzeltme ekranı yoktur.
  - **Bitiş ("parça / onay ne zaman geldi?"):** varsayılan bugündür.
- **Bitiş sınırları:**
  - Başlangıçtan önce olamaz.
  - Gelecek gün olamaz.
- **Uzatma** = bitiş günü − başlangıç günü, lab'ın takvim günüyle.
  - Örnek: teslim 20 Ekim, bekleme 18 Ekim, bitiş 25 Ekim → uzatma 7 gün, yeni teslim 27 Ekim.
  - Hekim/klinik kaynaklıda teslim tarihi kayar; lab kaynaklıda kaymaz.
- Bekleme kaydının (`work_order_holds`) başlangıcı ve bitişi seçilen günleri yansıtır. Sipariş Geçmişi bunları doğru gösterir.
- Prova beklemesinde devam ettirme bugünkü gibi reddedilir.
- **Bilinen sınır (kabul edildi):** prova klinikteyken başka bir bekleme geçmiş bir bitiş günüyle devam ettirilirse, prova akışı provayı bugünden yeniden bekletir. Aradaki günler teslim tarihine eklenmez. Prova koduna dokunmamak için bu nadir durum kabul edildi.

### 4.3 "Geciken" listesinde tek dokunuşla "Hekimi bekliyor"
- Lab tarafındaki sipariş listesinde gecikmiş her işin bir "Hekimi bekliyor" eylemi olur. "Geciken" çipi açıkken de, karışık listede gecikmiş satırda da çıkar.
- Panodaki dikkat listesinde görünen gecikmiş işlerde de aynı eylem bulunur.
- Eylem 4.1'deki bekletme penceresini açar:
  - Yalnız hekim/klinik kaynaklı kategoriler gösterilir.
  - "Ne zamandan beri" alanı öne çıkar; geç fark edilen bir beklemede asıl gerekli bilgi budur.
- Kaydedilince iş hemen "Geciken"den çıkar, "Beklemede" görünür.

### 4.4 Panoda bekleyen işler
- **Hangi panolar:** "Geciken" gösteren iki ana sayfa da değişir:
  - Lab paneli `/(lab)`: `LabDashboardScreen`, lab personeli ve müdür.
  - Yönetici paneli `/(admin)`: `app/(admin)/index.tsx`, lab sahibi.
  - İkisinin mobil karşılıkları da değişir (`LabMobileDashboard`, `AdminMobileDashboard`). Mobilde rozet satırı ve dikkat listesi yok. Orada geciken sayısının yanına "Beklemede" sayısı, "geciken" listesine de 3 günü aşan bekleyen işler eklenir.
  - Hekim, klinik ve istasyon panoları değişmez.
- Masaüstünde "Geciken" rozetinin yanına aynı ölçüde bir **"Beklemede"** rozeti gelir.
  - Prova dışındaki beklemedeki işleri sayar.
  - Dokununca sipariş listesi yalnız bu işlerle açılır.
- Dikkat listesinde 3 günü aşan bekleyen işler görünür. Satırda sipariş numarası, bekleme nedeni ve süre ("5 gündür") yazar.
- Satırdan tek dokunuşla "Devam ettir" yapılır; 4.2'deki pencere açılır.
- Beklemedeki her işin yanında, listede ve detayda, bekleme süresi görünür.

### 4.5 Mobil
- Sipariş detayının mobil görünümüne "İşi beklet" ve "Devam ettir" eklenir. Pencereler 4.1 ve 4.2'yle aynıdır.
- Panodaki ve listedeki eylemler telefonda da çalışır.
- Sipariş listesi ekranı hekim, klinik ve istasyonla ortaktır. "Hekimi bekliyor" eylemi yalnız lab ve yönetici panellerinde görünür.

### 4.6 Beklemedeyken teslim edilen iş
- Bugün: iş beklemedeyken teslim edilirse teslim akışı siparişteki bekleme alanlarını temizliyor. Ama bekleme kaydı (`work_order_holds`) açık kalıyor ve Sipariş Geçmişi bunu sonsuza dek "beklemede" gösteriyor. Teslim tarihi de kaymıyor.
- Yeni: teslim anında açık bekleme kaydı teslim zamanıyla kapanır ve **teslim tarihi kaydırılmaz**.
  - Gerekçe: parçanın ya da onayın ne zaman geldiği bilinmiyor. Otomatik uzatma, geç teslimi zamanında gösterir; zamanında teslim oranı ve teknisyen performansı haksız yere iyileşir.
- Teslimden sonra geriye dönük bitiş girilemez. Unutulan devam ettirmeyi teslimden önce yakalamak panodaki hatırlatmanın işidir (4.4).
- Teslim fonksiyonlarının (`update_delivery_status`, BanaBiKurye senkronu) davranışı değişmez. Kapanış, bekleme alanlarının temizlenmesine bağlı ayrı ve küçük bir adımla yapılır; yöntemi kurucu seçer. Prova beklemesi dahil her açık kayıt kapanır.

### 4.7 Sonradan girilen tarihler görünür
- Geriye dönük bir gün herkesin bekletebildiği bir işte teslim tarihini kaydırır ve işi "Geciken"den çıkarır. Bu yüzden iz bırakır.
- Sipariş Geçmişi'nde başlangıcı ya da bitişi sonradan girilmiş bekleme "sonradan girildi" notuyla görünür. Notta kimin girdiği ve hangi gün girildiği yazar.
- Başlangıç için `work_order_holds.created_at` ile `started_at` karşılaştırması yeterli. Bitişin kayıt anı için ek bir alan ya da etkinlik kaydı gerekir; yöntemi kurucu seçer.

## 5. Kısıtlar

- **Veritabanı değişikliği beş adımda yapılır:**
  1. Canlı tanım `.before.txt`'ye kaydedilir.
  2. `.down.sql` hazırlanır.
  3. Değişiklik rol rol, geri alınan bir işlemde denenir.
  4. Kullanıcı onay verir.
  5. Değişiklik uygulanır ve canlıda hemen ölçülür.
- **Fonksiyon imzası:** `hold_order` ve `resume_order`'a parametre eklemek yeni bir aşırı yükleme (overload) yaratır. Eski imzalar kaldırılıp yerine tek imza konmalıdır; eski çağrılar varsayılan değerlerle aynı sonucu vermelidir. Projede aynı tuzak `start_stage_simple`'da yaşandı.
- **Geriye uyum:** tarih verilmeden çağrılınca `hold_order` ve `resume_order` "bugün" varsayar ve bugünkü gibi çalışır. Tek bilinçli fark uzatma hesabıdır: artık her durumda takvim günü farkı kullanılır (bkz. Benim kararlarım 3).
- **Yetki:** bugünkü gibi `get_my_lab_id()`. Geriye dönük tarihi, bugün bekletebilen herkes girebilir.
- **Dil:** dört dil birlikte (tr, en, de, fa).
- **Arayüz:**
  - Popup ortada açılır.
  - Düğmelerde ipucu (tooltip) vardır.
  - Hata düğmenin yanında görünür.
  - Koyu temada token kullanılır; açık tema değişmez.
  - Mobilde eylemler tek satır olur.
  - Para biçimlendirme gerekirse `(Number(n)||0)`.
- **Ortak bileşenler:** panodaki rozet sırası ve sipariş listesi satırı birden çok paneli etkiliyorsa bu ayrıca açıklanır.
- **Kontroller:** `tsc` 0 hata, mevcut test takımı yeşil. Saf yardımcıların (gün farkı, sınır kontrolü) testleri olur.

## 6. Kurucuya bırakılanlar

- Tarih alanının bileşeni (mevcut tarih seçicilerden biri) ve pencerelerin düzeni.
- "Hekimi bekliyor" eyleminin satırdaki yeri (satır sonu düğmesi ya da ••• menüsü). Mevcut liste desenine uyulur.
- Sipariş listesinde "Beklemede" süzgecinin adresi (ör. `?filter=hold`) ve çip olarak görünüp görünmeyeceği.
- `hold_started_at` ve `ended_at` için geriye dönük günün saat karşılığı. Kural: lab saat diliminde o günün başı ve gün farkı doğru çıkmalı.
- Panodaki dikkat listesinde kaç bekleyen işin gösterileceği ve "+n daha" satırı.

## 7. Benim kararlarım (kullanıcı itiraz edebilir)

1. "Uzun bekleme" eşiği 3 gün; ileride lab ayarı olabilir.
2. Geriye dönük girilen hekim/klinik kaynaklı beklemede de hekime bildirim gider (bugünkü davranış).
3. Uzatma her durumda lab'ın takvim günü farkıyla hesaplanır (bitiş günü − başlangıç günü). Bugünkü saat bazlı yuvarlama (`round(saat/24)`) yalnız uç durumda farklı sonuç verir; örneğin akşam başlayıp ertesi sabah biten bekleme bugün 0, yeni kuralla 1 gün sayılır. Kullanıcıya anlatması kolay olduğu için ("18'inde başladı, 25'inde bitti → 7 gün") tek kural seçildi. Son 90 günde yalnız 2 bekleme var; etkisi ihmal edilebilir.
4. Mobil sipariş detayına bekletme ve devam ettirme eklenir (bugün yok; unutmanın bir sebebi olabilir).
5. Panodaki "Beklemede" rozeti prova beklemelerini saymaz; provanın kendi göstergesi var.
6. "Hekimi bekliyor" eylemi yalnız hekim/klinik kaynaklı kategorileri gösterir; lab kaynaklı bekletme sipariş detayından yapılır.
7. İki ana sayfa da değişir: lab paneli ve yönetici paneli, masaüstü ve mobil. Hekim, klinik ve istasyon panoları değişmez (4.4).
8. Beklemedeyken teslim edilen işte bekleme kaydı teslimde kapanır, teslim tarihi kaydırılmaz (4.6).
9. Yeni bekleme, aynı siparişin önceki beklemesinin bittiği günden önce başlayamaz (4.1).
10. Açık beklemenin başlangıcı devam ettirirken düzeltilir. Kapanmış beklemelerin tarihleri düzeltilemez (4.2).
11. Devam ettirme tek dokunuştan küçük bir onay penceresine döner (3, Kaçınılacaklar).
12. Sonradan girilen tarihler Sipariş Geçmişi'nde kim ve ne zaman bilgisiyle işaretlenir (4.7).
13. Prova klinikteyken geçmiş bitiş günüyle devam ettirmedeki küçük gün kaybı kabul edildi (4.2).
