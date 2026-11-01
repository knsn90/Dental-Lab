# Rol bazlı görünürlük — güvenlik paketi (genel arama yan bulguları) — tasarım

**Tarih:** 2026-10-25
**Kaynak:** Genel arama son incelemesi (`.superpowers/sdd/2026-10-25-genel-arama/progress.md`, Final Ruling satırları) ve 2026-10-25 canlı kural incelemesi. Önceki benzer iş: 0b İK tabloları (`specs/2026-10-25-ik-tablolari-erisim-design.md`).

## 1. Amaç ve neden

Bugün hangi kaydın kime görüneceğini çoğu yerde **yalnız ekran** belirliyor; veritabanı kuralları (RLS) "aynı lab'da mısın" diye bakıyor. Sorgu yazabilen her oturum (tarayıcı konsolu, Simanty'nin veri okuma aracı, ileride eklenecek her ekran) ekranın gizlediğini okuyabiliyor:

- **Faturalar ve para kayıtları (lab):** `invoices` okuma + **ekleme/değiştirme/silme**, `invoice_items`, `invoice_orders`, `payments` okuma, `payment_submissions`, `payment_intents`/`payment_attempts`, `payment_reminders` — lab'daki herkese (teknisyen, kurye dahil) açık. Ekranlar Finans'ı `view_financials` ile gizliyor.
- **Faturalar (klinik):** Klinik yöneticisinin kullanıcı ekranındaki "Finansal kayıtları görüntüle" (`billing_view`) yetkisi hiçbir yerde uygulanmıyor; kliniğe bağlı her hekim/sekreter fatura, bakiye ve tahsilatları görüyor.
- **Teknisyen:** `work_orders` ve `order_stages` okuma kuralı lab'ın **tüm** siparişlerini açıyor; Siparişler ekranı istemcide süzüyor.
- **Kurye:** `work_orders` ve `deliveries` okuma kuralı lab'ın tüm siparişlerini ve teslimatlarını açıyor.
- **Kâr hesabı:** `calculate_order_profit` (SECURITY DEFINER) lab ya da yetki kontrolü yapmıyor; teknisyenin açtığı sipariş detayından çağrılıyor (0c'deki `can_view_lab_profit` dışında kalmış).

Başarı: her rol veritabanında da yalnız işinin gerektirdiğini görür; bugün çalışan akışlar (istasyon işleri, teslimat, taslak fatura, e-fatura, ödeme) bozulmaz.

## 2. Kullanıcının kararları (2026-10-25)

1. **Teknisyen yalnız kendi işini görür.**
2. **Kurye fatura tutarlarını görmez.**
3. **Klinikte faturaları ve bakiyeyi yalnız klinik yöneticisi ve yetki verilen sekreter görür.**
4. **Kliniğinde yönetici ya da sekreter yoksa hekim kendi kliniğinin faturalarını görür.** (Canlı: 10 hekim hesabının 1'i böyle; 7'si kliniğe bağlı değil.)
5. **Kurye yalnız kendi teslimatlarını (ve onların siparişlerini) görür.**
6. Kapsam ve sıra (aşağıdaki §4) onaylandı: "onayla, planı yaz ve kendin uygula".
7. **Teknisyen atanmamış işi okutup alabilir** (inceleyici sorusu; "Evet, okutup alabilsin"): kendi işlerine ek olarak sırası gelmiş ama kimseye atanmamış aşaması olan siparişleri görür; başkasına atanmış işleri görmez.
8. **Tutar içeren ödeme hatırlatmaları da kurala uyar** ("Evet, kurala uysun"): klinikte yalnız faturayı görebilen (`can_view_clinic_billing`) alıcılar; lab'daki kopya yalnız finans yetkisi olana.

## 3. Benim kararlarım (özet onaylandı)

- **"Kendi işi" (teknisyen):** `work_orders.assigned_to = ben` **veya** siparişin bir aşaması `order_stages.technician_id = ben` **veya** siparişi teknisyen açtı (sipariş açma yetkisi olan teknisyen; yoksa `insert().select()` geri okuması düşer) **veya** siparişin, `start_stage_simple`'ın teknisyene başlatma izni verdiği atanmamış (`technician_id is null`) ve sırası gelmiş bir aşaması var (karar 7; koşul fonksiyonla birebir — uygulayıcı canlı tanımdan alır). İstasyonun İşlerim, geçmiş, istatistik ve TV istasyon ekranı aşama atamasıyla çalışıyor; yalnız sipariş ataması alınırsa bozulurlar. Sohbet gelen kutusu bugün zaten bu kuralı kullanıyor (`modules/orders/chatApi.ts`).
- **Teknisyenin aşamaları:** kendi işi olan siparişlerin **tüm** aşamalarını görür (iş akışı zaman çizelgesi için gerekli), başka siparişlerin aşamalarını görmez.
- **Lab tarafı finans yetkisi:** okuma = `has_permission('view_financials') or has_permission('view_finance') or has_permission('manage_finance')` (genel aramadaki kontrolle aynı; menü `view_financials` kullanıyor, istemci `view_finance`'e genişletiyor). Yazma = `has_permission('manage_invoices') or has_permission('manage_finance')`. Canlıda bu anahtarlar yalnız `admin` rolünde; `lab_manager`, `technician`, `courier` rollerinde yok, lab'a özel yetki seti yok.
- **Klinik tarafı kural (tek kaynak):** yeni SQL yardımcısı `can_view_clinic_billing(p_clinic uuid)`: `clinic_admin` → evet; `clinic_secretary` → `clinic_permissions.billing_view` (yoksa varsayılan **evet**); `doctor` → yalnız o klinikte **aktif** `clinic_admin`/`clinic_secretary` yoksa (ya da `clinic_permissions.billing_view` açıkça true ise — bugün 0). İstemci aynı kararı bu fonksiyondan sorar (yeni RPC, istemcide yeniden hesaplanmaz; bkz. hafıza `feedback_permission_alias_expansion`). Çoklu-lab klinik yolları (`my_clinic_ids()`) da aynı yardımcıdan geçer.
- **Tahsilat ve bakiye de faturayla aynı kurala bağlanır** (fatura gizliyken bakiye görünmesin): `payments`, `invoice_items`, `payment_submissions`, `payment_reminders` klinik tarafı kuralları; `v_clinic_balance(_ccy)` invoker olduğu için kendiliğinden uyar.
- **Ekran tarafı (klinik/hekim paneli), yetkisi olmayana:** Finans menü öğesi, özet ekranın bakiye kartı, ödeme hatırlatma penceresi (`PaymentReminderGate`) ve Simanty `cariDurum` aracı gizlenir/kapanır. Fatura detay adresine doğrudan gidilirse kayıt gelmez (boş/izin yok durumu, çökme değil).
- **Ekran tarafı (lab), finans yetkisi olmayana:** lab özet ekranındaki geciken faturalar / faturalanmamış işler kartı gösterilmez (bugün `LabDashboardScreen.tsx:1318-1330` herkese istek atıyor).
- **Siparişe bağlı veriler (D, E):** `order_items` (fiyatlar), ekler/depo dosyaları, sipariş mesajları, `order_implant_parts`, `order_scan_annotations` ve `_order_party_role` (DEFINER, bugün her lab kullanıcısına 'lab' döner) aynı "kendi işi" kuralına bağlanır; yoksa sipariş kimliğini bilen başkasının hasta dosyalarını okur. Mümkünse tek yardımcı (`can_see_work_order(uuid)`) üzerinden.
- **Yöneticisiz klinik yedeği (karar 4):** "yönetici ya da sekreter var" = faturayı görebilen biri var (aktif `clinic_admin` ya da `billing_view` açık aktif `clinic_secretary`). Yalnız yetkisi kapalı sekreter varsa hekim görür — faturayı kimsenin göremediği klinik kalmaz.
- **Ödeme hatırlatma alıcıları (karar 8):** `_send_payment_reminder_core` (canlı cron) klinik alıcılarını `can_view_clinic_billing` ile, lab "yönetici kopyası" alıcılarını finans yetkisiyle süzer; gönderim mantığı ve kanallar değişmez.
- **Kurye:** `deliveries` okuma → `courier_id = ben`; `work_orders` okuma → yalnız kendi teslimatlarının siparişleri (`deliveries.work_order_id`). Lab tarafı (müdür, yönetici) değişmez. Kuryenin okuttuğu başka bir kutu "bulunamadı" verir (kabul).
- **Lab müdürü ve yönetici:** sipariş, aşama ve teslimat görünürlüğü değişmez (lab'ın tümü).
- **Kâr:** `calculate_order_profit` → siparişin lab'ı `get_my_lab_id()` ve `can_view_lab_profit(lab)`; değilse `forbidden`/boş (0c deseni). İstemci reddi sessiz karşılar (detayda kâr bölümü gizli).

## 4. Kapsam ve sıra (her biri ayrı veritabanı adımı, ayrı onay, ayrı geri alma)

| # | Paket | Neden bu sırada |
|---|---|---|
| A | Lab tarafı finans tabloları: okuma finans yetkisi, yazma fatura yönetimi yetkisi | En geniş açık: teknisyen/kurye faturayı **silebiliyor** |
| B | `calculate_order_profit` kontrolü | Küçük, bağımsız |
| C | Klinik tarafı `billing_view` + istemci gizleme + ödeme hatırlatma alıcıları | Kullanıcı kararı 3, 4, 8 |
| D | Teknisyen: `work_orders` + `order_stages` + siparişe bağlı veriler okuma + Siparişler/arama hizası (`global_search` teknisyen koşulu aynı kurala) | En çok ekranı etkileyen; dikkatli ekran denemesi |
| E | Kurye: `deliveries` + `work_orders` + siparişe bağlı veriler okuma | D ile aynı desen |

Kapsam dışı: `purchase_invoices` / tedarikçi (zaten `manage_purchase_invoices`), `salary_payments` (0a/0b'de kapandı), `platform_invoices` (platform), Simanty'nin genel `readData` beyaz listesi (RLS'e tabi; bu paket RLS'i düzeltince kendiliğinden daralır), `has_permission`'ın `user_permissions` kişisel istisnalarını yok sayması (ayrı not).

## 5. Hedefler, hedef olmayanlar, yapılmaması gerekenler

**Hedefler:** Yukarıdaki kurallar veritabanında; her rol için rol rol geri alınan denemeyle KIRMIZI→YEŞİL kanıt; ekranların yetkisiz kişiye ölü/boş kart göstermemesi.

**Yapılmaması gerekenler (olursa iş başarısız):**
- Teslimde otomatik taslak fatura (`trg_auto_draft_invoice_on_delivery`, DEFINER), toplu fatura, e-fatura (`efatura-luca`), ödeme (`payments-charge`), WhatsApp/e-posta bildirimleri, günlük sipariş takibi, ödeme hatırlatma cron'u bozulmamalı (DEFINER/servis rolü — doğrulanır).
- İstasyonun İşlerim / geçmiş / istatistik / TV istasyon / sipariş detayı / aşama başlat-bitir akışları teknisyenin **kendi** işlerinde aynen çalışmalı.
- Kuryenin teslimat listesi, detay, harita, durum güncelleme akışı kendi teslimatlarında aynen çalışmalı.
- Klinik yöneticisi ve yetkili sekreter için finans ekranları ve ödeme bildirimi aynen çalışmalı; yöneticisiz klinikteki hekim için de.
- Lab müdürünün sipariş/üretim/teslimat görünümü değişmemeli.
- Hasta adları ve tutarlar çıktılara yazılmaz (KVKK); denemeler yalnız sayı yazar.

## 6. Doğrulama ölçütleri (rol rol, geri alınan işlem, gerçek kimlikler)

Nexadent lab `243ef1db…`: sahip `f6817e96…`, müdür `8ce19a0e…`, teknisyen `5ab98f51…` (aşama/sipariş ataması işlem içinde geçici yapılır), kurye (canlıda 1 kurye hesabı; işlem içinde geçici teslimat atanır), klinik yöneticisi `560e1377…`, hekim `747ae960…`, yöneticisiz klinikteki hekim (sorguyla bulunur).

| Paket | Kim | Deneme | Beklenen |
|---|---|---|---|
| A | Sahip | fatura/kalem/tahsilat okuma, fatura güncelleme | geçer (önceki sayılar) |
| A | Müdür, teknisyen, kurye | aynı okumalar | 0 satır |
| A | Müdür, teknisyen, kurye | fatura ekle/güncelle/sil | 42501 ya da 0 satır |
| A | Teknisyen siparişi teslim eder (DEFINER yol) | taslak fatura oluşur | geçer |
| B | Teknisyen, müdür | `calculate_order_profit` | forbidden/boş; sahip geçer |
| C | Klinik yöneticisi | kendi kliniğinin faturası/tahsilatı/bakiyesi | görür |
| C | Yöneticili klinikteki hekim | aynı | 0 |
| C | Yöneticisiz klinikteki hekim | aynı | görür |
| C | Sekreter `billing_view` false (işlem içinde) | aynı | 0 |
| C | Yalnız yetkisi kapalı sekreteri olan klinikteki hekim | aynı | görür |
| C | Ödeme hatırlatma (geri alınan, gönderimsiz alıcı hesabı) | alıcı listesi | yalnız yetkili klinik kullanıcıları + finans yetkili lab kullanıcısı |
| D | Teknisyen | kendi (sipariş ya da aşama ataması) siparişi + aşamaları | görür |
| D | Teknisyen | başka sipariş / aşama / o siparişin kalemleri, ekleri, mesajları | 0 |
| D | Teknisyen | atanmamış, sırası gelmiş aşamalı sipariş | görür; `start_stage_simple` ile alır |
| D | Sipariş açma yetkili teknisyen | sipariş açar | geri okuma geçer |
| D | Müdür | tüm lab siparişleri | önceki sayı |
| E | Kurye | kendi teslimatı + siparişi | görür; başka teslimat/sipariş 0 |
| Her paket | Geri alma sonrası | | KIRMIZI davranış geri |

Ek: `tsc` 0; dört dil sözlüğü eşit; istemci değişikliklerinde açık+koyu, masaüstü+telefon ekran kontrolü (canlı veri, kaydetmeden); D ve E için istasyon/kurye ekranları teknisyen/kurye bakışıyla açılamıyorsa (oturum yok) DB ölçümü + kod okuması yeterli sayılır, bu ledger'a yazılır.

## 7. Uygulayıcıya bırakılanlar

- Kural adları; mevcut kuralların yerine mi, RESTRICTIVE ek kural olarak mı (tercih: mevcut PERMISSIVE kuralı daraltmak; RESTRICTIVE `tenant_guard` dokunulmaz).
- Teknisyen kuralında RLS döngüsünden kaçınma (`work_orders` ↔ `order_stages` birbirini okuyor; gerekirse SECURITY DEFINER yardımcı, bkz. hafıza `project_rls_policy_cycle`).
- Klinik yardımcısının performansı (satır başı alt sorgu yerine `(select …)` önbelleği).
- Yeni metinler (ör. "Bu kaydı görme yetkiniz yok") dört dilde.
