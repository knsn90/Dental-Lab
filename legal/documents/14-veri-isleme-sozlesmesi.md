# SIMAN — Veri İşleme Sözleşmesi (DPA)

**Data Processing Agreement**
**Sürüm:** 1.0 · **Yürürlük:** 23 Temmuz 2026

> Bu DPA, SIMAN’ı kullanan **laboratuvar/klinik/hekim (Veri Sorumlusu)** ile
> **SIMAN işletmecisi (Veri İşleyen)** arasındaki, hasta ve personel kişisel
> verilerinin işlenmesine ilişkin sözleşmesel çerçeveyi kurar. Ekler, SIMAN’ın
> gerçek teknik uygulamasından (kaynak kodu + canlı şema) türetilmiştir.

---

## Taraflar (Pilot)

- **Veri Sorumlusu (“Sorumlu”):** NEXADENT LABORATUVAR HİZMETLERİ SANAYİ TİCARET
  LİMİTED ŞİRKETİ — VKN 6312098145, Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2,
  Ataşehir/İstanbul; iletişim: nexadentlab@gmail.com.
- **Veri İşleyen (“İşleyen”):** SIMAN — pilot işleteni (kurucu, gerçek kişi).
  Ünvan/ad-soyad ve iletişim: ⟦HUKUK: SIMAN_ISLEYEN⟧. *(SIMAN tüzel kişilik olarak
  kurulunca bu satır SIMAN şirket bilgileriyle güncellenir.)*

> **Pilot yapı uyarısı (hukuk onayı):** Pilotta SIMAN henüz ayrı bir tüzel
> kişilik değildir. İki olası kurgu vardır ve nihai tercih hukukçuya aittir:
> **(A)** SIMAN’ı işleten kurucu, NexaDent’ten **ayrı** bir veri işleyendir → bu
> DPA NexaDent (Sorumlu) ile kurucu (İşleyen) arasında imzalanır. **(B)** SIMAN,
> NexaDent’in kendi bünyesinde kullandığı bir yazılımdır (ayrı işleyen yok) → bu
> durumda asıl veri işleyenler **dış alt-işleyenlerdir** (Supabase, Anthropic vb.,
> EK-C) ve bu DPA, NexaDent tüzel kişiliği kurulu SIMAN ile ileride imzalanacak
> **şablon** olarak hazır tutulur. Her iki kurguda da EK-B (teknik tedbirler) ve
> EK-C (alt-işleyenler) aynen geçerlidir.

## 0. Sorumluluk Yapısı (kod-temelli tespit — önemli)

SIMAN’ın canlı yetki modeli (RLS) incelendiğinde, hasta kişisel verisini içeren
iş emrini (`work_orders`) **üç taraf da** oluşturabilmektedir:

1. **Hekim** — kendi hastası için (`Doctors can create orders`),
2. **Klinik** — kliniğindeki hekim adına (`clinic_admin_insert_clinic_orders`),
3. **Laboratuvar** — kendi kiracısında, ör. telefon/kâğıt sipariş veya Medit
   tarayıcıdan gelen kayıt (`wo_lab_insert`, `medit-webhook`, `inbound-paper-order`).

Bu nedenle sorumluluk **katmanlıdır**:

- **Klinik/hekim**, hasta ile tedavi ilişkisinin ve — sağlık verisi için — açık
  rızanın sahibi olarak, o hastaya ait veriler bakımından **veri sorumlusudur**.
- **Laboratuvar**, kendi üretim, kalite ve fatura kaydı bakımından **ayrıca veri
  sorumlusudur**; hastanın verisini bizzat girdiği hâllerde (kâğıt/telefon sipariş)
  ya kendi adına ya da klinik adına (klinik talimatıyla) işler.
- **SIMAN**, her iki taraf için de **veri işleyendir** ve verileri yalnızca ilgili
  Sorumlu’nun talimatı ve hizmetin sunulması için işler.

Bu DPA, **SIMAN (İşleyen) ile her bir kiracı (Sorumlu)** arasında kurulur. Klinik
ile laboratuvar **arasındaki** ilişki (kimin hangi amaçla sorumlu/işleyen olduğu,
hastaya karşı aydınlatma ve rıza yükümlülüğü) taraflar arası ayrı bir düzenlemeye
tabidir; SIMAN bu ilişkiye taraf değildir ancak teknik olarak (kiracı izolasyonu,
erişim kayıtları, rıza kayıtları) her iki tarafı da destekler.

> **Hukuki inceleme notu:** Klinik ve laboratuvarın aynı hasta verisi üzerinde
> farklı amaçlarla işlem yapması, somut akışa göre **müşterek (joint) veri
> sorumluluğu** veya **ayrı (independent) veri sorumluluğu** olarak
> nitelenebilir. Nihai niteleme hukuk onayına bırakılmıştır.

## 1. Tanımlar

KVKK ve — uygulanabildiği ölçüde — GDPR’daki tanımlar geçerlidir: “kişisel veri”,
“özel nitelikli kişisel veri”, “işleme”, “veri sorumlusu”, “veri işleyen”,
“alt-işleyen”, “ilgili kişi”, “ihlal”.

## 2. İşlemenin Konusu ve Süresi

- **Konu:** Sorumlu’nun SIMAN üzerinden yürüttüğü diş laboratuvarı iş akışlarının
  (sipariş, üretim, kalite kontrol, teslimat, fatura, iletişim, personel) sunulması.
- **Süre:** Sorumlu’nun SIMAN’ı kullandığı süre boyunca; sona ermede §11 uygulanır.

## 3. İşlemenin Niteliği ve Amacı

İşleyen, kişisel verileri **yalnızca Sorumlu’nun talimatları** ve SIMAN
hizmetinin sunulması amacıyla işler. İşleyen verileri kendi amaçları için
kullanamaz, satamaz veya reklam/izleme için işleyemez.

## 4. Veri Kategorileri ve İlgili Kişiler (EK-A)

| İlgili kişi | Veri kategorileri |
|---|---|
| Hastalar | Ad, doğum tarihi, uyruk; diş/tedavi bilgileri; **sağlık** (tarama, DICOM, klinik foto, kalite notları) |
| Hekimler/klinik personeli | Kimlik, iletişim, meslek bilgileri |
| Laboratuvar personeli | Özlük, bordro, SGK, izin (hastalık dâhil), mesai ve konum |
| Tedarikçi/kurye irtibatları | Ad, iletişim, banka/IBAN |

## 5. Sorumlu’nun Yükümlülükleri

- İşlenen veriler için **hukuki dayanağı ve — sağlık verileri dâhil — gerekli
  açık rızaları** sağlamak (hastalara aydınlatma dâhil).
- Sisteme yalnızca yetkili kullanıcıları eklemek ve rolleri doğru atamak.
- İlgili kişi taleplerinde birincil muhatap olmak.

## 6. İşleyen’in Yükümlülükleri

İşleyen:

a) Verileri yalnızca Sorumlu’nun belgelenebilir talimatları doğrultusunda işler;
b) İşleme yetkisi verilen kişilerin **gizlilik** yükümlülüğü altında olmasını sağlar;
c) Aşağıdaki teknik ve idari tedbirleri (§7) uygular;
d) Alt-işleyen kullanımı için §8’e uyar;
e) İlgili kişi taleplerinin karşılanmasında Sorumlu’ya makul desteği sağlar (SIMAN
   içi **KVKK / Verilerim** başvuru kanalı ve dışa aktarma araçları dâhil);
f) Veri ihlalinde §9 uyarınca **gecikmeksizin** bildirir;
g) Hizmet sonunda §11 uyarınca verileri iade/imha eder;
h) Sorumlu’ya, bu DPA’ya uyumu gösteren bilgi sağlar.

## 7. Teknik ve İdari Tedbirler (EK-B — gerçek uygulama)

Aşağıdakiler SIMAN’da **fiilen uygulanmaktadır** (kanıt: `03-storage-analysis.md`,
P0 uygulama raporu `10-p0-implementation-summary.md`):

- **Kiracı izolasyonu:** Her tabloda satır-düzeyi güvenlik (RLS); tüm 138 tabloda
  RLS etkin. Görünümler çağıranın RLS’ini uygular (`security_invoker`).
- **Depolama izolasyonu:** Sağlık verisi içeren depolama alanları (iş emri
  fotoğrafları/taramaları, sohbet ekleri, oklüzyon görüntüleri) **özeldir
  (internete kapalı)** ve sipariş-bazlı erişimle sınırlandırılmıştır; dosyalara
  **imzalı, süreli bağlantılarla** erişilir.
- **Kimlik doğrulama:** E-posta/parola + e-posta/SMS OTP; parolalar sağlayıcı
  tarafında karma (bcrypt) olarak tutulur.
- **Şifreleme:** Aktarımda TLS; saklamada platform-düzeyi disk şifreleme.
- **Rıza yönetimi:** Sürümlü, değiştirilemez (append-only) rıza kaydı.
- **Yetki ayrımı:** Rol bazlı izinler; platform yöneticisi işlemleri denetim
  kaydına yazılır.

> **Geliştirme aşamasındaki tedbirler (Sorumlu’ya şeffaflık için):** Otomatik
> saklama/imha işleri (R-05), silme akışının tüm tablolara/depolamaya
> genişletilmesi (R-06), OTP’lerin karma saklanması (R-15) ve e-posta QR
> hizmetinin (QRServer) kaldırılması (R-16) yol haritasındadır. Ayrıntı:
> `08-remediation-roadmap.md`, `17-dogrulama-matrisi.md`.

## 8. Alt-İşleyenler (EK-C — gerçek liste)

Sorumlu, aşağıdaki alt-işleyenlerin kullanımına genel olarak **onay verir**.
Liste, SIMAN kaynak kodundaki gerçek entegrasyonlardır (bkz.
`04-third-party-data-flow.md`). Yeni bir alt-işleyen eklenmeden önce Sorumlu
bilgilendirilir ve itiraz hakkı tanınır.

| Alt-işleyen | İşlev | Yurt dışı |
|---|---|---|
| Supabase | Barındırma, veritabanı, depolama, kimlik doğrulama | ⟦HUKUK: SUPABASE_BOLGE⟧ |
| Anthropic | Yapay zekâ / belge okuma | Evet |
| Resend | E-posta | Evet |
| Expo (Apple/Google) | Push bildirimi | Evet |
| Twilio / Meta | WhatsApp | Evet |
| NetGSM · İleti Merkezi · Mutlucell | SMS | Hayır |
| Nilvera (→ GİB) | e-Fatura | Hayır |
| iyzico | Ödeme | Hayır |
| BanaBiKurye (+ Google Places) | Kurye/adres | Kısmen (Google: evet) |
| Brandfetch · Clearbit · Google | Logo/favicon | Evet |
| QRServer | E-posta QR (kaldırılacak) | Evet |
| Medit | Tarayıcı entegrasyonu | Evet |
| Vercel | Web barındırma | Evet |

## 9. Veri İhlali Bildirimi

İşleyen, kişisel veri ihlalini öğrenmesinden itibaren **gecikmeksizin** ve makul
sürede Sorumlu’ya bildirir; ihlalin niteliği, etkilenen veri/ilgili kişi
kategorileri, olası sonuçlar ve alınan/alınacak önlemler hakkında bilgi verir.
Sorumlu, KVKK m.12 ve Kurul kararları uyarınca Kurul’a ve ilgili kişilere bildirim
yükümlülüklerini yerine getirir.

## 10. Yurt Dışına Aktarım

§8’de yurt dışı olarak işaretlenen alt-işleyenlere aktarım, Sorumlu tarafından
ilgili kişilerden alınan **açık rızaya** ve/veya KVKK m.9’daki diğer mekanizmalara
dayanır. SIMAN, açık rıza kayıtlarını (`user_consents`) İşleyen tarafında tutarak
Sorumlu’ya ispat desteği sağlar.

## 11. Sözleşmenin Sona Ermesi

Hizmet sona erdiğinde İşleyen, Sorumlu’nun tercihine göre kişisel verileri iade
eder veya imha eder; yasal saklama yükümlülüğü bulunan veriler (mali/özlük
kayıtları) ilgili süre boyunca kimliksizleştirilerek saklanabilir.

## 12. Denetim

İşleyen, bu DPA’ya uyumu gösteren makul bilgi ve belgeleri Sorumlu’ya sağlar;
tarafların mutabık kalacağı sıklık ve kapsamda denetimlere makul ölçüde imkân
tanır.

## 13. Muhtelif

Bu DPA, Kullanım Koşulları’nın ayrılmaz parçasıdır. Çelişki hâlinde kişisel veri
işleme bakımından bu DPA önceliklidir. Uygulanacak hukuk: **Türkiye Cumhuriyeti**.

---

**Sürüm 1.0 · Yürürlük: 23 Temmuz 2026**
