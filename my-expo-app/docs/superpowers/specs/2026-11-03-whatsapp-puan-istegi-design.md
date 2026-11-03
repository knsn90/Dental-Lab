# WhatsApp'tan puan isteği — tasarım

**Tarih:** 2026-11-03 · **Yol haritası:** 3. dalga, madde 2'nin ön koşulu ("Değerlendirmeler ekranı" bundan sonra gelir) · **Durum:** onaylandı 2026-11-03; metinler §10 (uygulama planı: `docs/superpowers/plans/2026-11-03-whatsapp-puan-istegi.md`)

## 1. Niyet ve neden

Klinikler teslim edilen işe puan vermiyor. Canlı veri (2026-11-02):

- Puanlama modülü Haziran'dan beri canlı. Bugüne kadar yalnız 6 değerlendirme var, sonuncusu Ağustos'ta.
- Son 3 ayda teslim edilen 33 işin hiçbiri puanlanmadı.

Kullanıcıdan (lab sahibi) öğrenilenler:

- Hekimler geri bildirimi zaten veriyor, ama **WhatsApp'tan** ve **işi hastaya taktıktan birkaç gün sonra**.
- "Sorun var" dendiğinde bugün admin görüyor, hekimle konuşuluyor, gerekirse revizyon yapılıyor.

Puan isteğinin hekime ulaşmamasının üç nedeni bulundu.

1. **Teslim bildirimi hiç gitmiyor.**
   - `notify_order_delivered` tetikleyicisi `work_orders.doctor_id`'yi `profiles.id` sanıyor. Oysa `doctor_id` artık `doctors.id` (bkz. hekim polimorfizmi).
   - Son 3 ayın 33 teslimin hiçbirinde koşul tutmadı. 120 günde "İşinizi değerlendirin" bildirimi sıfır.
2. **Telefonda puan isteği hiç görünmüyor.**
   - Masaüstünde `PendingReviewsCard` klinik ve hekim ana sayfasında var. Teslim edilmiş sipariş açılınca `ReviewModal` kendiliğinden açılıyor.
   - Mobilde `ClinicMobileDashboard` ve `DoctorMobileDashboard` bu kartı içermiyor.
   - `OrderDetailScreenV2` mobilde `OrderDetailMobileHandoff`'a erken dönüyor. `ReviewModal` yalnız masaüstü dalında çiziliyor; kendiliğinden açma efekti çalışıyor ama modal ekranda yok.
3. **İstek yalnız uygulama içinde.**
   - 33 işin yalnız 8'inde hekimin Siman hesabı var.
   - Buna karşılık 33 işin 32'sinde hekimin telefonu kayıtlı (`doctors.phone`).

**Çözüm:** puanı hekimin zaten konuştuğu yerden ve doğru anda istemek. Teslimden birkaç gün sonra hekime, lab'ın WhatsApp numarasından tek dokunuşla cevaplanan bir mesaj gider. Cevap, o işin değerlendirmesi olarak kaydedilir.

## 2. Hedefler

1. Teslimden **N gün sonra** (varsayılan 3, lab ayarı) hekime WhatsApp şablon mesajı gider. Mesajda üç hızlı cevap düğmesi bulunur: **Sorunsuz · Küçük düzeltme · Sorun var**.
2. Düğmeye basılınca `order_reviews`'e o işin değerlendirmesi yazılır. Hekim uygulamaya girmez, şifre gerekmez.
3. **"Sorun var" cevabında:**
   - Lab yöneticilerine anında haber gider: uygulama içi bildirim ve WhatsApp. Bildirim siparişe gider.
   - Hekime kısa bir cevap gider: teşekkür, lab'ın iletişime geçeceği ve isterse sorunu bu mesaja yazabileceği.
   - Hekimin ardından yazdığı serbest metin değerlendirmenin yorumuna eklenir.
4. **"Küçük düzeltme" cevabında:** aynı akış, ama lab'a giden haber yalnız uygulama içinde olur, WhatsApp'tan gitmez. Hekime aynı kısa cevap gider.
5. **"Sorunsuz" cevabında:** hekime kısa bir teşekkür gider. Başka bir şey olmaz.
6. **Bulunan iki hata düzeltilir:**
   - Uygulama içi puan bildirimi hesabı olan hekime ulaşır. Bildirim teslim anında değil, WhatsApp isteğiyle aynı anda gider (bkz. §5.6).
   - Mobilde klinik ve hekim ana sayfasında "değerlendirilecek işler" rozeti görünür. Teslim edilmiş sipariş ekranında "Bu işi değerlendir" kartı ve `ReviewModal` bulunur.

## 3. Hedef olmayanlar (bu işte yapılmaz)

- **Değerlendirmeler ekranı:** ortalama, klinik kırılımı, düşük puan listesi. Yol haritasında sıradaki iş; bu tasarımın verisini kullanacak.
- Revizyonun kendiliğinden açılması. Kullanıcı: önce konuşuluyor. Revizyon bugünkü elle akışla açılır (`create_revision_order`).
- Cevapsız isteğe hatırlatma mesajı. Tek istek gider; cevap gelmezse süresi dolar.
- WhatsApp üzerinden boyut puanları (uyum, oklüzyon vb.). Ayrıntılı form uygulamada kalır.
- E-posta kanalı.
- Türkçe dışında şablon. Hekimler Türkçe konuşuyor; mevcut müşteri şablonları da yalnız `tr`.
- Eski teslimler için geriye dönük istek.

## 4. Kaçınılacaklar (çalışsa bile başarısızlık sayılır)

- **Hekimi mesaja boğmak.** Bir hekime günde en fazla 1 puan isteği gider. Birden fazla iş birikirse sonraki günlere yayılır.
- **Geçmiş teslimler için toplu mesaj patlaması.** Özellik açıldığı andan önce teslim edilen işlere istek gitmez.
- **Sohbet botu kapalıyken botun konuşmaya başlaması.** Varsayılan `chat_bot` kapalı (Coexistence; lab gelen mesajları telefondaki WhatsApp Business'tan yanıtlıyor). Bu davranış korunur. Yalnız bizim puan şablonumuza verilen düğme cevapları ve "sorun" cevabından sonraki tek not yakalanır. Diğer her mesaja bugünkü gibi hiç dokunulmaz.
- **WhatsApp puanının yanlış kişiye "sizin puanınız" gibi görünmesi.** Kaynağı ve kimin verdiği açık tutulur (§5.2).
- **Lab ayarı kapalıyken tek bir mesajın bile gitmesi.**

## 5. Kararlar

### 5.1 Ne zaman, kime

- **Zaman:** istek, teslimden itibaren lab gününe göre N. günde gider: `delivered_at` lab saat diliminde gün olarak + N. N varsayılan 3, 1–14 arası.
- **Gönderim penceresi:** lab saatiyle Pazartesi–Cumartesi 10:00–18:00. Pencere dışında düşen istek bir sonraki pencereye kalır.
- **Alıcı, hekim önce** (kullanıcı onayı 2026-11-03). "Hastaya nasıl oturdu?" sorusunu işi takan hekim cevaplayabilir; kurum hattına çoğu zaman asistan bakar. Sıra:
  1. Hesabı olan hekimin `profiles.whatsapp_phone` alanı. Bu, kişinin bilerek girdiği numara; 2026-09-22 kararıyla her zaman korunur.
  2. `doctors.phone`. `doctors` tablosunda `whatsapp_phone` yok; yeni sütun açılmaz.
  3. Kliniğin `clinics.whatsapp_phone` alanı, o da yoksa `clinics.phone`.
  4. Hiçbiri yoksa WhatsApp adımı atlanır; uygulama içi istek yine gider (§5.6).
  - Bu sıra yalnız puan isteği içindir. Diğer sipariş bildirimleri 2026-09-22'deki "kurum hattı önce" sırasıyla gitmeye devam eder.
- **Sıklık sınırı:** aynı telefon numarasına günde en fazla 1 puan isteği gider. Sıradaki iş ertesi gün gider. Aynı günün işleri arasında en eski teslim önce gider.
- **İstek gitmez:**
  - işe zaten bir değerlendirme verilmişse (kim verirse versin),
  - iş artık `teslim_edildi` değilse,
  - teslim, lab'ın özelliği açtığı andan önceyse,
  - hekim için WhatsApp puan isteği kapatılmışsa (§5.7).
- **Süre:** cevapsız istek 7 gün sonra "süresi doldu" olur. Hatırlatma gitmez. Süresi dolmuş bir isteğin düğmesine sonradan basılırsa yine kaydedilir; kayıp cevap istemiyoruz.
- **Kuyrukta kalan istek:** sıklık sınırı yüzünden `due_on`'dan sonraki 7 gün içinde gönderilemeyen istek `skipped` olur, hiç gönderilmez. Haftalar sonra "nasıl oturdu?" diye sormak anlamsız. (Benim kararım.)
- **Revizyon ve devam siparişleri dahil.** "Sorun var" sonrası açılan revizyon teslim edilince aynı soru tekrar sorulur: düzeltmenin oturup oturmadığını öğrenmek değerli. Spam'i günlük sınır engeller. (Benim kararım.)

### 5.2 Puanın kaydı

- **Düğme → puan:** Sorunsuz = 5, Küçük düzeltme = 3, Sorun var = 1. Bu puan `overall`'a yazılır. Boyut puanları boş kalır.
  - Bu puan bugünkü gibi `report_technician_ratings` üzerinden teknisyen performansına yansır. Bu bilinçli bir karar.
- **`order_reviews` şu an WhatsApp kaydını taşıyamıyor:** `rater_id NOT NULL DEFAULT auth.uid()` ve `UNIQUE (work_order_id, rater_id)`. Hesapsız hekimin profili yok. Tabloya eklenecekler (yalnız ekleme):
  - **`source`:** `'app' | 'whatsapp'`, varsayılan `'app'`. Mevcut satırlar `'app'` olur.
  - **`rater_doctor_id`:** `doctors.id`'ye bağlanır, boş olabilir.
  - **`rater_id` boş olabilir.** Hekimin hesabı varsa (`profiles.doctor_id = doctors.id`) `rater_id` o profil olur. Böylece hekim uygulamada "değerlendirdiniz" görür ve ayrıntılı formla düzenleyebilir. Hesabı yoksa `rater_id` boş kalır.
  - **İş başına tek değerlendirme** (`work_order_id` tekil). Bugünkü `(work_order_id, rater_id)` tekilliğinin yerini alır. Canlıdaki 6 satır 6 ayrı işte; çakışma yok. (Benim kararım.) Gerekçe: aynı iş iki kez puanlanırsa teknisyen skorunda iki kez sayılır, oysa iş bir kez yapıldı.
- **Hekim iki kez basarsa:** son basılan düğme geçerli olur; aynı satır güncellenir. Lab'a giden haber yalnız durum **kötüleşirse** tekrar gider (Sorunsuz → Sorun var gibi).
- **Uygulama tarafı tek satırı paylaşır.** İstek (rozet, kendiliğinden açılan pencere) yalnız işin **hiç değerlendirmesi yoksa** çıkar. WhatsApp'tan puanlanmış işi açan hekim (hesaplı) ya da klinik kullanıcısı aynı satırı `ReviewModal`'da görür ve tamamlayabilir: boyut puanı, yorum, foto. İkinci satır açılmaz. Bu, RLS güncelleme kuralının o işin hekim/klinik tarafına açılmasını gerektirir (bugün yalnız `rater_id = auth.uid()`). (Benim kararım.)
- **Kaynak gösterimi:** lab tarafında "WhatsApp · hekim" ya da mesaj klinik hattına gittiyse "WhatsApp · klinik hattı" yazar. Değerlendirmeyi gösteren her yer (`OrderReviewsSection`, sipariş geçmişi, `report_technician_ratings`) boş `rater_id`'ye dayanıklı olur.

### 5.3 İstek kaydı (yeni tablo)

Her işin puan isteği kendi satırında tutulur. Yaklaşık alanlar:

- `work_order_id` (tekil), `lab_id`, `doctor_id`, `phone_to`
- `due_on`, `sent_at`, `wamid`
- `status`: `queued / sent / answered / failed / expired / skipped`
- `answer`, `answered_at`
- `note_until`: sorundan sonra yorum bekleme penceresi

Bu tablo üç işe yarar: sıklık sınırını uygulamak, düğme cevabını işe bağlamak, ileride "istek → cevap oranı"nı ölçmek.

- RLS açık. İstemci yazamaz; yalnız sunucu fonksiyonları yazar.
- Lab yöneticisi kendi lab'ının satırlarını okuyabilir (`feedback_new_table_rls`).
- Gönderim kaydı (wamid, hata) **yalnız bu tabloda** tutulur. Mevcut `whatsapp_notifications.user_id` NOT NULL ve profile bağlı; hesapsız hekime gönderim oraya yazılamaz, canlı tablo da değiştirilmez. (Benim kararım.) Lab'a giden `is_sorunu_lab` gönderimleri ise mevcut yoldan gittiği için orada kaydolur.
- **Satır her teslim için oluşur**, WhatsApp kapalı ya da telefon olmasa bile. Uygulama içi istek bu satırın `due_on` gününde gider (§5.6). WhatsApp adımı kapalıysa ya da numara yoksa o adım atlanmış olarak işaretlenir.

### 5.4 Gönderim

- Zamanlanmış bir veritabanı görevi (pg_cron, saatlik, gönderim penceresinde) şunları yapar:
  - teslimleri tarar,
  - istek satırlarını oluşturur ve sıklık sınırına göre seçer,
  - gönderimi bir edge fonksiyonuna devreder.
- Mevcut `send-whatsapp-meta` yalnız `notifications` satırından ve profil alıcısından çalışıyor. Hesapsız hekime gönderebilmek için doğrudan telefon + şablon + iş alan bir yol gerekir: ya bu fonksiyona ek bir mod ya da ayrı bir fonksiyon (kurucunun kararı).
- Lab'ın aktif `whatsapp-cloud` kimlik bilgisi ve telefon normalizasyonu (`normalizePhoneTR`) mevcut koddan aynen kullanılır.
- **Düğme yükü:** şablon gönderilirken her hızlı cevap düğmesine `payload` verilir: `review:<istek_id>:<5|3|1>`. Cevap bu yükten işe bağlanır; mesaj metnine ya da sıraya bakılmaz.
- **Şablon (hekime):**
  - Ad `is_degerlendirme`, kategori UTILITY olarak başvurulur.
  - Değişkenler: hasta adı, sipariş no, iş türü.
  - Örnek metin: "{hasta} hastanızın {sipariş no} numaralı {iş türü} işi birkaç gün önce teslim edildi. Hastaya nasıl oturdu?" ve üç düğme.
  - Hasta adı, onaylı mevcut müşteri şablonlarında da var. Alıcı tedaviyi yapan hekim. (Benim kararım: tutarlılık için hasta adı kalsın.)
- **Şablon (lab'a, yalnız "Sorun var"):**
  - Ad `is_sorunu_lab`, kategori UTILITY.
  - Değişkenler: sipariş no, hekim, iş türü.
  - Alıcılar: mevcut `yeni_siparis_lab` ile aynı lab yöneticisi kümesi.
- Her iki şablon da Meta onayı ister. Onay gelene kadar özellik lab ayarında kapalı durur. Lab şablonu gecikirse lab'a haber yalnız uygulama içi gider.

### 5.5 Gelen cevap (whatsapp-webhook)

- Düğme cevapları Meta'dan `type: 'button'` mesajı olarak gelir (`button.payload`, `button.text`, `context.id`). Bugünkü işleyici yalnız `interactive` cevapları tanıyor (`interactiveId`), bu türü görmüyor.
- **Yakalama, `chat_bot` kontrolünden ÖNCE yapılır.** Yalnız şu iki durum yakalanır:
  1. yükü `review:` ile başlayan düğme cevabı,
  2. o numaraya ait istekte `note_until` henüz dolmamışken gelen **ilk** düz metin mesajı.
  - Bunların dışındaki her mesaj bugünkü yoldan geçer. Bot kapalıysa hiç dokunulmaz.
- **Düğmeden sonra:**
  1. Değerlendirme kaydedilir (§5.2) ve istek `answered` olur.
  2. Hekime şablonsuz kısa yanıt gider. Hekim yeni yazdığı için 24 saatlik oturum penceresi açık; şablon gerekmez.
  3. "Sorun var" ya da "Küçük düzeltme" ise `note_until = şimdi + 24 saat` olur ve lab'a haber gider (§5.6).
- **Not:** pencere içindeki ilk düz metin, değerlendirmenin `comment` alanına eklenir ve pencere kapanır. Hekime ayrıca cevap gitmez. Coexistence açık olduğu için lab mesajı telefonunda zaten görür; siparişte de görünür olur.
- Medya (fotoğraf) bu sürümde yoruma bağlanmaz. Bugünkü yolundan geçer.

### 5.6 Lab'a haber ve uygulama içi bildirimler

- **"Sorun var":**
  - Lab yöneticilerine uygulama içi bildirim gider. Başlık "Hekim sorun bildirdi", bağlantı `/order/<id>`.
  - `is_sorunu_lab` WhatsApp şablonu da gider.
- **"Küçük düzeltme":** yalnız uygulama içi bildirim gider. Başlık "Hekim küçük düzeltme istedi".
- **Kategori seçimi:** `trg_whatsapp_meta_notify` `delivery`, `new_order` ve `approval` kategorilerinde müşteriye WhatsApp şablonu gönderiyor. Yeni bildirimler bu kümenin **dışında** kalan bir kategoriyle yazılır; aksi hâlde hekime yanlış şablon ("siparişiniz kuryede") gider.
- **E-posta:** bildirimler mevcut yardımcı üzerinden yazılırsa e-posta da tetiklenir (filtre opt-out). Bu yüzden:
  - "Sorun var" lab yöneticilerine e-postayla da gider. Aksiyon gerektiriyor; lab bildirim kuralı "mail yalnız aksiyon/özet" ile uyumlu.
  - "Küçük düzeltme" ve hekime giden "İşinizi değerlendirin" e-posta göndermez.
  - Mekanizmayı kurucu seçer. (Benim kararım.)
- **Hesabı olan hekime uygulama içi istek:**
  - "İşinizi değerlendirin" bildirimi `due_on` gününde gider, teslim anında değil. Hekim ya da klinik hesabı olan herkese gider ve WhatsApp ayarından **bağımsızdır**. Bu yüzden Meta onayını beklemeden yayınlanabilir.
  - Yalnız bu işin yayın tarihinden sonra teslim edilen işler için gider; eski teslimlere toplu bildirim yağmaz.
  - Aynı ayrı kategori kuralı geçerli.
  - `notify_order_delivered` tetikleyicisinin teslim anındaki işi sona erer. Bu bugün çalışan bir özelliği kaldırmak değil: tetikleyici hiç ateşlemiyor (bkz. §1).
- **Mobil:**
  - `ClinicMobileDashboard` ve `DoctorMobileDashboard`'a bekleyen değerlendirmeler girişi eklenir (masaüstündeki `PendingReviewsCard` karşılığı).
  - `OrderDetailMobileHandoff`'ta teslim edilmiş işte hekim/klinik için "Bu işi değerlendir" kartı bulunur ve `ReviewModal` mobilde de çizilir.
  - Yalnız hekim/klinik oturumunu etkiler; lab panellerinin mobil görünümü değişmez.
- **`listMyPendingReviews` düzeltmesi:**
  - Bugün "bu kullanıcının puanlamadığı" son 50 teslimi döndürüyor; klinik kullanıcısına tarih sınırı olmadan eski teslimleri de gösteriyor.
  - Yeni kural: **hiç değerlendirmesi olmayan** ve **son 30 gün** içinde teslim edilen işler.

### 5.7 Ayarlar

- **Lab ayarı:** "WhatsApp'tan puan iste" (açık/kapalı, varsayılan kapalı) ve "Teslimden kaç gün sonra" (varsayılan 3).
  - Yeri: Ayarlar → Entegrasyonlar → WhatsApp.
  - Açıldığı an kaydedilir; bu andan önceki teslimlere istek gitmez.
  - Lab'ın aktif WhatsApp bağlantısı yoksa ayar kapalı ve açıklamalı görünür.
- **Hekim bazında kapatma:** hekim kartında "WhatsApp puan isteği gönderme" anahtarı (varsayılan gönder). Hekim şikâyet ederse lab tek dokunuşla kapatır.

## 6. Kısıtlar

- **Veritabanı değişiklikleri** (yeni tablo, `order_reviews` sütunları, tetikleyici, cron) proje kuralına göre uygulanır: canlı tanımın `.before.txt` kopyası, `.down.sql`, geri alınan deneme ve kullanıcının "Onaylıyorum, uygula" onayı.
  - Denemelerde gönderici fonksiyonlar çağrılmaz.
- **Edge fonksiyon:** `supabase functions deploy` (bkz. edge function deploy notu). `whatsapp-webhook` değişikliği bugünkü botlu ve botsuz davranışı birebir korumalı.
- **Arayüz:**
  - Yeni metinler tr/en/de/fa aynı anda eklenir.
  - Yeni yüzeyler koyu temada doğru görünür.
  - Popup'lar `U.modalOverlay` kullanır, düğmelerde `GlassTooltip` bulunur, hata düğmenin yanında görünür.
  - Kod `tsc` 0 hata ve yeşil test takımıyla teslim edilir.
- **Yayın:** web yayını yalnız kullanıcı "deploy" deyince. Meta şablon onayı bizim elimizde değil; genelde saatler ile birkaç gün sürer.
- **KVKK:** kullanıcıya verilen raporlarda kişi adı ve tutar yazılmaz.

## 7. Riskler

- **Meta kategorisi.** Meta "nasıl oldu?" türü şablonları MARKETING'e çevirebilir. O zaman ücret artar ve bazı alıcılarda pazarlama sınırları devreye girer. Şablon UTILITY olarak, siparişe bağlı ve işlem odaklı metinle başvurulur. Reddedilirse metin değiştirilip yeniden başvurulur.
- **Coexistence ve echo.** Bizim gönderdiğimiz yanıtlar echo olarak geri gelir. Mevcut wamid ayrımı bunları "insan yazdı" sanmamalı; gönderilen wamid'ler bugünkü gibi kaydedilir.
- **Teknisyen performansı.** "Küçük düzeltme" = 3 puan teknisyen skorunu düşürür. Bu bilinçli bir karar; ileride ayar gerekebilir.

## 8. Başarı ölçüsü

Özellik açıldıktan sonra teslim edilen işlerin teslimden sonraki 14 gün içinde değerlendirme alma oranı. Bugün bu oran sıfır. Ölçü yeni istek tablosundan okunur ve Değerlendirmeler ekranında gösterilir.

## 9. Kurucuya bırakılanlar

- Gönderimin `send-whatsapp-meta`'ya mod olarak mı yoksa ayrı fonksiyon olarak mı yazılacağı.
- Cron sıklığı (saatlik önerilir) ve SQL fonksiyonlarının adları.
- İstek tablosunun tam sütunları ve indeksleri; `order_reviews` için tekillik kuralının biçimi.
- Hekime giden kısa yanıtların ve bildirim başlıklarının son metni (şablon metni Meta'ya gitmeden kullanıcıya gösterilir).
- Mobil kart ve rozetin görsel ayrıntısı (mevcut masaüstü dilinden ve item 14'ün kapalı sipariş görünümünden türetilir).

## 10. Onaylanan metinler (kullanıcı onayı 2026-11-03)

Değişken adları ve düğme sırası koda bağlıdır; metin değişse bile bunlar sabit kalır.

| Ad | Metin |
|---|---|
| Şablon `is_degerlendirme` (UTILITY, `tr`) gövde | `Merhaba, {{hasta_adi}} hastanızın {{siparis_no}} numaralı {{is_turu}} işi birkaç gün önce teslim edildi. Hastaya nasıl oturdu?` |
| `is_degerlendirme` düğmeleri (Hızlı cevap, sıra sabit) | `Sorunsuz` (5) · `Küçük düzeltme` (3) · `Sorun var` (1) |
| Şablon `is_sorunu_lab` (UTILITY, `tr`) gövde | `Sorun bildirimi: {{hekim}}, {{siparis_no}} numaralı {{is_turu}} işinde sorun olduğunu bildirdi. Ayrıntılar Siman'da siparişin sayfasında.` |
| Hekime yanıt (Sorunsuz) | `Teşekkür ederiz. Cevabınızı {lab} ekibine ilettik.` |
| Hekime yanıt (Küçük düzeltme / Sorun var) | `Teşekkür ederiz, cevabınızı {lab} ekibine ilettik. Ekip sizinle iletişime geçecek. İsterseniz sorunu kısaca bu mesaja yazın; siparişe eklenir.` |
| Uygulama içi, hekim/klinik | başlık `İşinizi değerlendirin`, gövde `<hasta adı ya da sipariş no> · <iş türü>` |
| Uygulama içi, lab (Sorun var) | başlık `Hekim sorun bildirdi`, gövde `<sipariş no> · <hekim adı> · <iş türü>` |
| Uygulama içi, lab (Küçük düzeltme) | başlık `Hekim küçük düzeltme istedi`, gövde aynı biçim |
| E-posta kategori etiketi | `review_problem` → `Hekim Geri Bildirimi`, renk `#DC2626` |
