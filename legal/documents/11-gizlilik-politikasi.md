# SIMAN — Gizlilik Politikası

**Sürüm:** 2.0
**Yürürlük tarihi:** 23 Temmuz 2026
**Önceki sürüm:** 1.0 (17 Temmuz 2026)

> Bu metnin her maddesi, SIMAN kaynak kodu, canlı veritabanı şeması (Supabase
> `kjwjxqfdsxkxgcgophdy`) ve 01–10 numaralı iç inceleme raporlarındaki
> doğrulanmış bulgulara dayanır. Kanıt eşlemesi için bkz. `17-dogrulama-matrisi.md`.

---

## 1. Veri Sorumlusu ve İletişim

Bu Gizlilik Politikası, **Siman** uygulaması (“**Uygulama**”, `siman.app` ve
`app.nexadentlab.com`) bakımından geçerlidir.

> **Pilot dönemi (kuruluş öncesi):** SIMAN henüz tüzel kişilik olarak
> kurulmamıştır. Pilot, tek laboratuvarla (**NexaDent**) yürütülmektedir. Bu
> dönemde **veri sorumlusu NexaDent**, **veri işleyen SIMAN’dır** (pilot işleteni
> gerçek kişi/kurucu). SIMAN kurulup çok-kiracılı hâle geçtiğinde bu bölüm sürüm
> yükseltilerek güncellenir (o aşamada her laboratuvar kendi verisinin sorumlusu,
> SIMAN ortak veri işleyen olur).

- **Veri sorumlusu (pilot):** NEXADENT LABORATUVAR HİZMETLERİ SANAYİ TİCARET LİMİTED ŞİRKETİ *(NexaDent’in resmi ünvanı)*
- **Adres:** Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir/İstanbul
- **MERSİS / VKN:** ⟦HUKUK: MERSIS⟧ / 6312098145
- **KVKK başvuru:** nexadentlab@gmail.com · **KEP:** ⟦HUKUK: KEP⟧
- **Veri işleyen (pilot):** SIMAN — pilot işleteni (kurucu); iletişim:
  nexadentlab@gmail.com

### Veri sorumlusu / veri işleyen ayrımı

SIMAN, tasarımı gereği çok-kiracılı (multi-tenant) bir B2B hizmettir; rol dağılımı
işleme ve döneme göre şöyledir:

| Veri | Veri sorumlusu | SIMAN’ın rolü |
|---|---|---|
| Hastalara ait iş emri verileri (ad, doğum tarihi, diş/tedavi, tarama, fotoğraf) | **NexaDent** (pilot); genelde veriyi giren laboratuvar/klinik/hekim | **Veri işleyen** |
| Kullanıcı hesabı, kimlik doğrulama, faturalandırma verileri | **NexaDent** (pilot işleteni); kuruluş sonrası **SIMAN** | **Veri işleyen** (pilot) |
| Personel (bordro, izin, mesai) verileri | İlgili **laboratuvar** (işveren) | **Veri işleyen** |

Bu ayrımın sözleşmesel çerçevesi **Veri İşleme Sözleşmesi (DPA)** ile kurulur
(bkz. `14-veri-isleme-sozlesmesi.md`). Pilotta bu, **NexaDent ↔ SIMAN** arasında
imzalanır.

---

## 2. İşlediğimiz Kişisel Veriler

Aşağıdaki kategoriler kaynak koddaki gerçek alanlardan çıkarılmıştır
(bkz. `01-data-inventory.md`).

| Kategori | Veriler | Özel nitelikli? |
|---|---|---|
| **Kimlik** | Ad-soyad, T.C. kimlik no, doğum tarihi, cinsiyet, uyruk, diploma no, uzmanlık, avatar/profil fotoğrafı | T.C. kimlik no ve cinsiyet: evet |
| **İletişim** | E-posta, telefon, WhatsApp numarası, adres, şehir | Hayır |
| **Sağlık (hasta)** | İş emrine bağlı hasta adı, doğum tarihi, uyruk; diş numaraları, iş tipi, renk (Vita), model/ölçü tipi; 3D ağız-içi tarama dosyaları (STL/PLY/OBJ), DICOM görüntüleri, klinik fotoğraflar, prova/kalite-kontrol notları | **Evet (sağlık)** |
| **İçerik** | Sipariş sohbet mesajları, destek mesajları, dosya ekleri, sesli notlar | Duruma göre |
| **Finansal** | Fatura, cari hesap, ödeme kayıtları, VKN, banka/IBAN (tedarikçi/kasa). **Kart/banka kartı verisi Uygulamada saklanmaz** | Hayır |
| **Personel** | Maaş, SGK primleri, avans, izin (yıllık/**hastalık**), mesai giriş-çıkış saatleri ve — kullanıldığında — **giriş-çıkış konumu (enlem/boylam)**, İK belgeleri | İzin/İK belgeleri: sağlık içerebilir |
| **İşlem güvenliği** | Kullanıcı kimliği, oturum kayıtları, **IP adresi**, cihaz/tarayıcı bilgisi (user-agent), bildirim (push) jetonu | Hayır |

**İzleme/reklam yok (doğrulanmıştır):** Uygulamada reklam, izleme (tracking),
analitik veya oturum-kaydı (session replay) amaçlı hiçbir üçüncü taraf yazılımı
**bulunmaz** (kod taramasında Sentry, Firebase, Google Analytics, PostHog,
Mixpanel, Amplitude, Segment vb. tespit edilmemiştir). Verileriniz reklam/izleme
için kullanılmaz veya üçüncü taraflara satılmaz.

---

## 3. İşleme Amaçları ve Hukuki Sebepler

| Amaç | Hukuki sebep (KVKK m.5–6) |
|---|---|
| Hesap oluşturma, kimlik doğrulama, oturum yönetimi | Sözleşmenin ifası |
| Sipariş oluşturma, üretim takibi, kalite kontrol, teslimat | Sözleşmenin ifası; hasta sağlık verileri için **açık rıza** |
| Fatura, cari hesap, e-Fatura düzenleme | Hukuki yükümlülük |
| Uygulama-içi/push/e-posta bildirimleri | Meşru menfaat |
| WhatsApp / SMS bildirimleri | **Açık rıza** |
| Yapay zekâ asistanı ve belge okuma (§5) | **Açık rıza** |
| Personel özlük, bordro, mesai/konum takibi | Hukuki yükümlülük; meşru menfaat |
| Bilgi güvenliği, kayıt tutma, denetim, hata çözümü | Meşru menfaat; hukuki yükümlülük |

Sağlık gibi **özel nitelikli** kişisel veriler ile **yurt dışı aktarım**
gerektiren işlemlerde açık rızanız alınır ve kaydedilir (Uygulama, rıza
kayıtlarını sürüm bilgisiyle birlikte tutar — bkz. §9). Açık rızayı dilediğiniz
zaman geri çekebilirsiniz.

---

## 4. Kişisel Verilerin Aktarıldığı Taraflar (İşleyenler)

Hizmeti sunmak için verileri, yalnızca ilgili işlemin gerektirdiği ölçüde,
aşağıdaki hizmet sağlayıcılarla paylaşırız. **YURT DIŞI** etiketli sağlayıcılara
aktarım KVKK m.9 uyarınca açık rızaya dayanır. Bu liste kaynak koddaki gerçek
entegrasyonlardan çıkarılmıştır (bkz. `04-third-party-data-flow.md`).

| Sağlayıcı | Amaç | Aktarılan veri | Konum |
|---|---|---|---|
| **Supabase** | Barındırma, veritabanı, kimlik doğrulama, dosya depolama | Tüm veriler | ⟦HUKUK: SUPABASE_BOLGE⟧ · muhtemelen **YURT DIŞI** |
| **Anthropic (Claude)** | Yapay zekâ asistanı; iş emri/reçete/fiş/fatura okuma (OCR) | Sohbet içeriği, ilgili kayıtlar, belge/fotoğraf görüntüleri — **hasta adı dâhil olabilir** | ABD · **YURT DIŞI** |
| **Resend** | E-posta bildirimleri | E-posta adresi, bildirim içeriği | **YURT DIŞI** |
| **Expo** (→ Apple APNs / Google FCM) | Mobil push bildirimleri | Push jetonu, bildirim başlığı/gövdesi | **YURT DIŞI** |
| **Twilio → WhatsApp/Meta** | WhatsApp bildirimleri | Telefon numarası, şablon değişkenleri | **YURT DIŞI** |
| **NetGSM · İleti Merkezi · Mutlucell** | SMS ile tek kullanımlık kod / bildirim | Telefon numarası, mesaj | Türkiye |
| **Nilvera → GİB** | Yasal e-Fatura düzenleme | Fatura verileri, VKN/TCKN, ünvan, adres | Türkiye |
| **iyzico** | Kart ile ödeme (kart verisi bize iletilmez) | Ödeme tutarı, alıcı referansı | Türkiye |
| **BanaBiKurye** | Kurye ile teslimat | Alıcı/hekim adı ve telefonu, klinik adı ve adresi | Türkiye |
| **Google Places** | Teslimat adresini çözümleme | Adres metni | **YURT DIŞI** |
| **Google Fonts** | Web’de yazı tipi | Ziyaretçi IP’si | **YURT DIŞI** |
| **Brandfetch · Clearbit · Google Favicon** | Klinik logosu bulma | Klinik adı / alan adı | **YURT DIŞI** |
| **QRServer (goqr.me)** | E-postadaki QR kod görseli | Bağlantı, alıcı IP’si (*kaldırılması planlanıyor — bkz. §11*) | **YURT DIŞI** |
| **Medit** | Ağız-içi tarayıcı entegrasyonu (gelen) | Hasta adı, tarama dosyaları | **YURT DIŞI** |
| **Vercel** | Web barındırma / CDN | Web ziyaretçisi IP’si, user-agent | **YURT DIŞI** |
| **TCMB** | Döviz kuru (kişisel veri aktarılmaz) | — | Türkiye |

---

## 5. Yapay Zekâ ile İşleme

Uygulamadaki yapay zekâ özellikleri **Anthropic’in Claude modelini**
(`claude-sonnet-4-5`, `api.anthropic.com`) kullanır. Ayrıntılı metin için bkz.
`16-ai-veri-isleme-politikasi.md`. Özetle:

> Yapay zekâ özellikleri **yalnızca kullanıcı tarafından başlatılan işlemler
> sırasında** çalışır. Aşağıdaki dört özellik verinin Claude’a aktarılmasına yol
> açabilir:
>
> 1. **Denty/Simanty asistanı** — sorduğunuz soru, bulunduğunuz ekran bağlamı ve
>    (yetkiniz dâhilinde) ilgili kayıtlar (sipariş, fatura, klinik, hasta adı vb.)
>    yanıtı üretmek için Claude’a gönderilir.
> 2. **İş emri okuma** — el yazısı laboratuvar iş emri fotoğrafı/PDF’i (hasta adı
>    dâhil) yapılandırılmış veriye çevrilmek üzere gönderilir.
> 3. **Reçete / fotoğraf / fiş / fatura okuma (OCR)** — yüklediğiniz görsel
>    belgeler ilgili alanların çıkarılması için gönderilir.
> 4. **Sipariş oluşturma/düzenleme** — asistan aracılığıyla girdiğiniz hasta ve
>    sipariş bilgileri işlenir; **veri yazan işlemler yalnızca sizin onayınızla**
>    gerçekleşir.
>
> Bu veriler **yalnızca ilgili işlemi yerine getirmek** amacıyla kullanılır.
> Anthropic, ticari koşulları uyarınca API girdilerini model eğitiminde kullanmaz.
> Bu işleme **açık rızaya** tabidir; rızayı vermez veya geri çekerseniz yapay zekâ
> özellikleri sizin için devre dışı bırakılabilir.

---

## 6. Yurt Dışına Aktarım

§4’te **YURT DIŞI** olarak işaretlenen sağlayıcılar (özellikle Anthropic, Resend,
Expo, Twilio/Meta, Google, Vercel, Medit ve — bölgesine göre — Supabase) verileri
Türkiye dışında işleyebilir. Bu aktarımlar KVKK m.9 kapsamında **açık rızanıza**
dayanır. Uygulamayı kullanmadan önce bu aktarıma ilişkin rızanız alınır ve
kaydedilir; rızayı geri çekmeniz hâlinde ilgili yurt dışı işleme durdurulur veya
o özellik sizin için kapatılır (aktarım bazı temel altyapı hizmetleri için
hizmetin verilebilmesinin ön koşulu olabilir; bu durumda bilgilendirilirsiniz).

---

## 7. Saklama Süreleri

Verileri, işleme amacının gerektirdiği ve ilgili mevzuatın öngördüğü süre boyunca
saklarız. Kategori bazında saklama politikamız:

| Veri | Saklama süresi | Dayanak |
|---|---|---|
| Fatura, ödeme, mali kayıtlar | **10 yıl** | VUK / TTK |
| Bordro, SGK, özlük kayıtları | İş ve sosyal güvenlik mevzuatının öngördüğü süre (genel olarak 10 yıl) | 4857 / 5510 |
| İş emri ve üretim içeriği (hasta verileri dâhil) | Hizmet ilişkisi + ilgili laboratuvarın (veri sorumlusu) belirlediği süre | Sözleşme / meşru menfaat |
| Oturum, IP ve güvenlik/işlem kayıtları | Bilgi güvenliği amacıyla makul süre (öneri 1–2 yıl) | Meşru menfaat / 5651 |
| Konum (mesai) kayıtları | İş ilişkisi süresi + kısa arşiv | Meşru menfaat |
| Tek kullanımlık kodlar (OTP) | Kısa süreli (dakikalar) | Sözleşme |
| Yedekler | Yedek döngüsü süresince | Bilgi güvenliği |

Saklama süresi dolan veriler silinir, yok edilir veya anonim hâle getirilir.
Kişisel Verileri Saklama ve İmha Politikamız ayrıca yürürlüktedir.

> **Uygulama notu (yalnızca iç izleme — kamuya açık metinde yer almaz):** Bu
> saklama takviminin **otomatik uygulanması** (periyodik silme işleri, yedek
> yaşam döngüsü) henüz devrede değildir; R-05 kapsamında geliştirme aşamasındadır.
> Bkz. `17-dogrulama-matrisi.md`.

---

## 8. Veri Saklama ve Hesap Silme

Hesabınızı Uygulama içinden **Profil → Hesabımı Sil** yoluyla kapatabilirsiniz.
Hesap silindiğinde profiliniz, giriş bilgileriniz ve iletişim bilgileriniz silinir.

Ancak; sipariş, fatura, finans kayıtları ile bunlara bağlı üretim içerikleri,
**yasal saklama yükümlülükleri** ve çoğu durumda bu verilerin **veri sorumlusu
olan ilgili laboratuvarın** hakları gereği, **kimliksizleştirilerek veya ilgili
laboratuvarın sorumluluğunda** saklanmaya devam edebilir. Bu nedenle bir
**hastanın** verisinin silinmesi talebi öncelikle verinin sorumlusu olan
laboratuvara/kliniğe yöneltilmelidir; SIMAN bu talebi işleyen sıfatıyla destekler.

> Silme işleminin mevcut kapsamı ve genişletme planı için bkz.
> `17-dogrulama-matrisi.md` (R-06).

---

## 9. Açık Rıza Kayıtları

Uygulama, verdiğiniz açık rızaları **sürüm bilgisiyle birlikte** kalıcı ve
değiştirilemez (append-only) bir kayıt olarak tutar (`user_consents`). Her rıza
kaydı; rıza türünü (gizlilik politikası, kullanım koşulları, yapay zekâ,
WhatsApp/SMS, yurt dışı aktarım), onay/ret durumunu, gösterilen doküman sürümünü
ve zaman bilgisini içerir. Rızayı geri çekmeniz yeni bir kayıt olarak işlenir;
geçmiş kayıtlar silinmez. Bu, KVKK ve GDPR’ın “rızanın ispatı” gereğini karşılar.

---

## 10. Haklarınız (KVKK m.11 & GDPR)

Kişisel verileriniz bakımından; işlenip işlenmediğini öğrenme, bilgi talep etme,
işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt
içinde/dışında aktarıldığı üçüncü kişileri bilme, eksik/yanlış işlenmişse
düzeltilmesini, KVKK’daki şartlar çerçevesinde silinmesini/yok edilmesini,
düzeltme/silme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini, otomatik
sistemlerle analiz sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve zarara
uğramanız hâlinde giderilmesini talep etme haklarına sahipsiniz. Ayrıca verdiğiniz
açık rızayı dilediğiniz zaman geri çekebilirsiniz.

**Başvuru:** Uygulama içinden **Profil → KVKK / Verilerim** ekranından başvuru
oluşturabilir veya nexadentlab@gmail.com adresine yazabilirsiniz. Başvurunuz en geç
**30 gün** içinde sonuçlandırılır. Sonuçtan memnun kalmazsanız **Kişisel Verileri
Koruma Kurulu**’na şikâyette bulunma hakkınız saklıdır.

---

## 11. Güvenlik

- Veriler aktarım (TLS) ve saklama sırasında şifrelenir.
- Erişim; satır-düzeyi güvenlik (RLS), rol bazlı yetkiler ve **kiracı (tenant)
  izolasyonu** ile sınırlandırılır. Veritabanındaki tüm tablolarda RLS etkindir.
- Dosyalara erişim **imzalı ve süreli bağlantılarla** sağlanır; sağlık verisi
  içeren depolama alanları internete kapalıdır (özel).
- İyileştirme çalışmalarımız süreklidir; e-postadaki QR kod hizmeti (QRServer)
  gibi üçüncü-taraf bağımlılıkların kaldırılması da bu kapsamdadır.

---

## 12. Çocuklar

Uygulama işletmelere yöneliktir ve doğrudan 18 yaşından küçüklere hitap etmez.
Hasta verileri arasında çocuk hastalara ait veriler bulunabilir; bunların
işlenmesi ilgili klinik/hekim tarafından alınan onama dayanır.

---

## 13. Değişiklikler

Bu politikayı zaman zaman güncelleyebiliriz. Her sürüm bir sürüm numarası ve
yürürlük tarihi taşır; önemli değişiklikleri Uygulama üzerinden bildiririz ve
gerektiğinde yeniden açık rıza alırız.

---

**Sürüm 2.0 · Yürürlük: 23 Temmuz 2026**
Ayrıca bkz. `12-kvkk-aydinlatma-metni.md`, `13-kullanim-kosullari.md`,
`15-cerez-politikasi.md`, `16-ai-veri-isleme-politikasi.md`.
