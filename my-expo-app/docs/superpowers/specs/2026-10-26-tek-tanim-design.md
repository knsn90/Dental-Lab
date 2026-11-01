# Tek tanım — sayılar her ekranda aynı (2. dalga 2, Y2) — tasarım

**Tarih:** 2026-10-26
**Kaynak:** Denetim raporu `docs/lab-yoneticisi-raporu/00-ozet.md` (Y2), yol haritası `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` (2. dalga 2). Mevcut durumun dosya-satır dökümü iki tarama ajanından (2026-10-26). Özet aşağıda §6'da; ayrıntılı not: oturum not dosyası `tektanim/survey.md` (uygulayıcı yeniden tarayabilir, satır numaraları kayabilir).

## 1. Amaç ve neden

Kullanıcı (lab sahibi) **sabah Özet ekranını açıp "bugün kime ödeme hatırlatayım" kararını veriyor.** Bu karar Özet'teki rakamlara dayanıyor; ama aynı rakam ekrandan ekrana farklı:

- **Geciken sipariş:** 7 ayrı tanım. Bazı ekranlar arşivdeki ve iptal edilmiş siparişleri sayıyor. Üretim Panosu bugün teslim edilecekleri saat 03:00'ten sonra gecikmiş sayıyor. TV dünün tarihiyle kıyaslıyor. Simanty'nin günlük özeti en fazla 5 sayabiliyor.
- **Alacak:** Özet, hatırlatma mesajı, Faturalar ve klinik ekranı farklı hesaplıyor. Taslak faturayı katan da var, katmayan da. Kliniğin avansını düşen de var, düşmeyen de. Avansı olan kliniğe, kendi ekranında borcu sıfır görünürken hatırlatma gidebiliyor.
- **Ciro:** en az 5 tanım. Faturalar taslak ve iptali sayıyor. Rapor varsayılan olarak son 12 ayı gösteriyor. Karlılık fatura tarihi yerine sipariş tarihini kullanıyor. Rapor PDF'i farklı dövizleri toplayıp TRY diye yazıyor.
- **Tahsilat:** en az 5 tanım. "Tahsilat (30g)" kartı tüm zamanı gösteriyor. Admin "Aylık tahsilat" kartı kısmi ödemeleri saymıyor.
- **Sipariş sayıları:** lab mobil özetindeki "Bugün 58 sipariş üretimde" yazısı aslında tüm zamanların toplamı (hâlâ canlıda). "Toplam" üç farklı şeyi gösteriyor. "Acil" çipi teslim edilmiş acil işleri de sayıyor (kullanıcı ekran görüntüsü: Acil 3, üçü de teslim edilmiş).
- **Personel:** 0 / 3 / 4 / 7. Çünkü giriş hesabı, personel kaydı ve aktif/pasif ayrımı karışıyor.

**Başarı:** sabah Özet'te görülen her rakam, ona tıklayınca açılan listede, Faturalar/Cari ekranında, hatırlatma mesajında ve kliniğin kendi ekranında **aynı** çıkar. Her rakam neyi saydığını ve hangi döneme baktığını söyler.

## 2. Kullanıcının kararları (2026-10-26)

1. **Kullanım anı:** "sabah özet ekranında bakıyorum, kime ödeme hatırlatacağıma karar veriyorum".
2. **Alacak = kliniğin gördüğü rakam:** kesilmiş faturalar (taslak ve iptal hariç) − kliniğin dağıtılmamış avansı. Özet, Faturalar, Cari ve hatırlatma mesajı bunu gösterir.
3. **Ciro** = dönemde kesilen faturaların toplamı.
   - Taslak ve iptal hariç, fatura tarihine göre, bugünkü gibi KDV dahil.
   - Döviz döviz ayrı; dövizler birbirine çevrilip toplanmaz.
   - Ekranlar farklı dönem gösterebilir ama dönem kartın üstünde yazar.
   - Karlılık da fatura tarihini kullanır.
4. **Tahsilat** = dönemde gerçekten yatan para, ödeme tarihine göre. Faturaya dağıtılmamış avans da dahil.
5. **Geciken sipariş** = teslim tarihi bugünden önce olan ve henüz teslim edilmemiş sipariş.
   - İptal edilenler, arşivdekiler ve beklemeye alınmışlar (duraklatılmış, `hold_status='on_hold'`) sayılmaz.
   - Üretim Panosu bugün teslim edilecekleri gecikmiş saymaz.
6. **Aktif sipariş** = teslim edilmemiş, iptal ve arşiv hariç; beklemedekiler dahil. Lab mobil "Bugün N sipariş üretimde" yazısı "N aktif sipariş" olur.
7. **"Toplam" tek başına kalmaz;** her toplamın yanında dönemi yazar (örnek: "Bu ay gelen sipariş" = bu ay açılan, iptal hariç).
8. **Bugün sayıları:**
   - Bugün teslim edilecek = teslim tarihi bugün, henüz teslim edilmemiş, iptal ve arşiv hariç.
   - Bugün gelen = bugün açılan.
   - Bugün teslim edilen = gerçekten bugün teslim edilen. Eski siparişte yapılan bir düzenleme bu sayıyı şişirmez.
9. **Personel:** "aktif personel" = Ekip'teki aktif personel kayıtları. Kullanıcılar ekranındaki sayı ayrı bir şeydir (giriş hesabı olanlar) ve orada "hesap" diye adlandırılır.
10. **Sayılar sunucudaki tek hesaptan gelir;** sipariş listeleri en fazla 300 satır çektiği için sayımı ekran yapmaz.
11. **Acil iş = teslim edilmemiş acil iş:** "teslim edilmiş acil işleri göstermemesi lazım". İptal ve arşiv de hariç.
12. **Kuryedeki iş de geciken sayılır** (okuyucu sorusu 5, "Geciken sayılsın"): lab'dan çıkmış ama kliniğe ulaşmamış iş, teslim tarihi geçince geciken sayılır. Bu, "Kuryeye Teslim Edildi" (`teslimata_hazir`), `kurye_bekleniyor` ve `kuryede` durumlarını kapsar. Teslim tarihi, kliniğin işi eline aldığı gündür; "teslim edildi" yalnız `teslim_edildi` durumudur. Canlıda şu an 2 iş bu durumda.

## 3. Benim kararlarım (kullanıcıya bu belgeyle sunuluyor)

- **"Bugün" lab'ın kendi saat diliminde:** `labs.timezone`, boşsa `Europe/Istanbul`. Kullanıcıya "Türkiye saati" dedim; canlıda Tahran saatinde çalışan lab'lar da var (`Asia/Tehran`), Nexadent `Europe/Istanbul`. Veritabanı UTC çalışıyor, `CURRENT_DATE` bu yüzden TR'de 00:00–03:00 arası dünü veriyor. Ekranlardaki `toISOString().slice(0,10)` de aynı hatayı yapıyor.
- **Vadesi geçmiş alacak avanstan sonra:**
  - Kliniğin dağıtılmamış avansı önce vadesi geçmiş tutardan düşer: `greatest(0, vadesi geçmiş − avans)`.
  - Avansı vadesi geçmiş borcu karşılayan klinik "hatırlatılacak" listesine girmez ve otomatik hatırlatma almaz.
  - Avans bugün ana para birimindeki (`clinic_receipts.base_currency`) satırdan düşülüyor (`v_clinic_balance_ccy` böyle); bu kural korunur.
- **Lab toplam alacağı** = kliniklerin **pozitif** bakiyelerinin toplamı (döviz başına). Bir kliniğin fazla avansı başka kliniğin borcunu kapatmaz; avans fazlası olan klinikler ayrıca "avans fazlası" olarak gösterilebilir (uygulayıcıya bırakıldı: göstermek zorunlu değil).
- **Taslaklar kaybolmaz:** her teslimde otomatik taslak fatura açıldığı için taslak sayısı büyük olabilir. Ciro ve alacaktan çıkan taslaklar, Faturalar ekranında ayrı bir "Kesilmeyi bekleyen (taslak)" kartında görünür. Bu kart eklemeli; mevcut kartların yerini almaz.
- **Dövize çevrilmiş toplam gerekiyorsa saklı kurla hesaplanır:** `amount_base` ya da `total × rate_at_time`, aynı satırlardan. Canlı kurla (`fn_to_base`, istemci `rateToBase`) hesaplanan "toplam" ciro/tahsilat/alacak için kullanılmaz. Rapor'un birleşik şeridi bugün canlı kurla; bu rakam değişebilir.
- **Karlılık dönemi = fatura tarihi:**
  - Dönemin cirosu, o dönemde kesilen faturalardır.
  - Maliyetler, o faturalara bağlı siparişlerin maliyetleridir (gelir-gider eşleşmesi). Henüz faturası kesilmemiş siparişin maliyeti, faturası kesildiği döneme düşer.
  - Toplu faturanın gelirini kalem bazında siparişlere dağıtmak bu işin kapsamında DEĞİL (yol haritası 2. dalga 12). Toplam ciro doğru olur; sipariş/hekim kırılımı bugünkü bağla (`invoices.work_order_id`, `invoice_orders`) kalır, kırılımın toplamı ciro kartıyla tutmayabilir. Bu fark ekranda tek satırla açıklanır.
- **"Bugün teslim edilen" kaynağı `work_orders.delivered_at`:**
  - Canlıda teslim edilmiş 59 siparişin 28'inde bu alan boş.
  - Uygulayıcı önce hangi teslim yollarının alanı yazmadığını bulup onarır. Sonra eski satırları durum geçmişinden (teslime geçiş zamanı) bir kerelik doldurur. Bu bir veri değişikliği; kullanıcı onayı gerekir.
  - Doldurulamayanlar "bugün teslim edilen"e girmez.
- **Acil çipi ve sekmeler:**
  - Acil sayısı ve çipin varsayılan süzgeci yalnız açık acil işleri gösterir.
  - Kullanıcı "Teslim" sekmesini açıkça seçip Acil çipine basarsa çip o sekmenin içinde daraltır. Böylece teslim edilmiş acil işler geçmişte aranabilir kalır.
- **Sayım fonksiyonları çağıranın yetkisiyle çalışır** (SECURITY INVOKER; rol görünürlüğü paketi, `project_role_visibility`):
  - Teknisyen kendi işlerini, finans yetkisi olmayan finans rakamı görmez.
  - Bugünkü `dashboard_pipeline_counts` sahip yetkisiyle (DEFINER) çalışıyor. Teknisyene tüm lab'ın durum sayılarını veriyor ve arşivi saymaktan dışlamıyor; yerine geçen fonksiyon bu iki sorunu da taşımaz.
- **Personel kartı:**
  - Admin Özet'teki "Lab kullanıcı" kartı "Aktif personel" olur (`employees.is_active`).
  - Personel listesini görme yetkisi olmayan kullanıcıya kart gösterilmez. RLS ona yalnız kendi satırını verdiği için yoksa 1 görünürdü.
- **Alacak iki çift hâlinde eşleşir** (okuyucu sorusu 1):
  - **Bakiye:** Cari satırı, kliniğin kendi ekranındaki bakiye ve hatırlatma mesajındaki "Açık borç" aynıdır (avans düşülmüş).
  - **Vadesi geçmiş:** Özet'teki "hatırlatılacak" listesi ile hatırlatmanın kime gideceği aynı kurala uyar.
  - Tek fatura için gönderilen hatırlatma o faturanın kalanını yazar; avans fatura düzeyinde düşülmez.
  - Otomatik hatırlatmanın "en az N gün gecikmiş" (`payment_reminder_min_days_overdue`) kuralı değişmez (hedef dışı: zamanlama). Özet listesi net vadesi geçmiş alacağı olan tüm klinikleri gösterir.
- **Çok lab'lı klinik** (canlıda 4 aktif üyelik): kliniğin kendi finans ekranı bugün çalıştığı bütün lab'ları topluyor (çoklu-lab "finans süzgeci" açık maddesi).
  - Lab başına süzgeç bu işin kapsamında DEĞİL.
  - Eşleşme ölçütü tek lab'lı kliniklerde aranır. Çok lab'lı klinikte kliniğin toplamı, lab'ların rakamlarının toplamıdır.
- **Kliniği olmayan, yalnız hekime kesilmiş fatura:** canlıda 0. Olursa borçlu hekimdir; lab alacağına girer, hatırlatma kapsamı dışında kalır (bugünkü gibi).
- **Revizyon ve devam siparişi:**
  - Açık oldukça her satır Aktif, Geciken ve Acil'e girer. Bunlar gerçek açık iştir ve kendi teslim tarihleri var; liste onları iç içe gösterse de sayılırlar.
  - "Bu ay gelen"e girmezler, çünkü yeni sipariş değiller. Devam siparişi zaten KPI dışı (`project_order_continuation`).
  - Canlıda şu an açık olan 0.
- **Klinik bazlı liste her iki Özet'te:** Admin ve Lab Özet aynı klinik bazlı vadesi geçmiş listesini alır. Sahip sabah Admin Özet'i açıyor (önizlemede doğrulandı).
- **Küçük düzeltmeler:**
  - Üretim Panosu'nun acil rozeti `is_rush` okuyor; bu alanı hiçbir istemci yazmıyor. `is_urgent`'e geçer.
  - `invoices.total_amount`, `total`'ın GENERATED kopyası (canlıda doğrulandı); hata değil.
- **Her değişen rakamın açıklaması var:** kart başlığında dönem yazar ("Bu ay", "Bugün", "Tüm açık"). Tanım tek cümleyle site genelindeki `GlassTooltip` balonunda durur. Yeni metinler tr, en, de ve fa dillerinde aynı anda eklenir.

## 4. Tanımlar (tek kaynak)

Uygulayıcı bunları **bir kez** yazar: sunucuda SQL, ekranda bunun aynası olan saf TypeScript yardımcıları. Bütün ekranlar bu tek yerden okur.

| Tanım | Kural |
|---|---|
| `lab_today` | `(now() at time zone coalesce(labs.timezone,'Europe/Istanbul'))::date` |
| Arşiv | `is_archived = true` (canlıda `archived_at` ile tutarlı, 2 kayıt) |
| Açık sipariş (aktif) | `status not in ('teslim_edildi','iptal')` ve arşiv değil |
| Geciken sipariş | açık + `delivery_date < lab_today` + `hold_status is distinct from 'on_hold'` |
| Acil iş | açık + `is_urgent` |
| Bugün teslim edilecek | açık + `delivery_date = lab_today` |
| Bugün gelen | `created_at` lab saatinde bugün, iptal hariç |
| Bu ay gelen | `created_at` lab saatinde bu ay, iptal hariç |
| Bugün teslim edilen | `delivered_at` lab saatinde bugün |
| Kesilmiş fatura | `status in ('kesildi','kismi_odendi','odendi')` (taslak ve iptal hariç) |
| Ciro (dönem) | kesilmiş faturaların `total` toplamı, `issue_date` dönemde, döviz başına |
| Tahsilat (dönem) | makbuz satırları (`clinic_receipt_lines.amount`, `currency`), `clinic_receipts.receipt_date` dönemde + makbuza bağlı olmayan ödemeler (`payments.receipt_id is null`: `amount`, `currency`, `payment_date` dönemde). Avansın sonradan faturaya dağıtılması (`apply_clinic_credit`, `payment_date` = dağıtım günü) tahsilat değildir; para makbuz gününde sayılmıştır (okuyucu sorusu 3). |
| Klinik alacağı | döviz başına: kesilmiş faturaların `total − paid_amount` toplamı − avans (yalnız ana para birimi satırında) |
| Vadesi geçmiş alacak | döviz başına: kesilmiş, ödenmemiş, `due_date < lab_today` faturaların kalanı; ana para birimi satırında `greatest(0, bu − avans)` |
| Lab alacağı | kliniklerin pozitif alacaklarının toplamı, döviz başına |
| Aktif personel | `employees.is_active` |
| Hesap (kullanıcı) | giriş hesabı olan profiller (Kullanıcılar ekranı) |

`v_clinic_balance_ccy` bugün klinik alacağının en yakın kaynağı. Uygulayıcı onu genişletebilir ya da yerine fonksiyon koyabilir; `CURRENT_DATE` kullanan her yer `lab_today`'e geçer.

## 5. Hedefler, hedef dışı, istenmeyen sonuçlar

**Hedefler:**
- §4'teki tanımların tek sunucu kaynağı ve tek istemci aynası.
- Aşağıdaki ekranların bu kaynağa bağlanması.
- Kullanıcının sabah kararının (kime hatırlatma) Özet'ten tek bakışta verilebilmesi.

**Hedef dışı:**
- Özet ekranlarının görsel yeniden tasarımı. Rakamın kaynağı ve etiketi değişir, kart yerleşimi değişmez.
- Yeni rapor eklemek.
- Toplu fatura gelirinin siparişlere dağıtılması (2. dalga 12).
- Hatırlatma kanalları, zamanlaması ve şablonları. Yalnız tutar ve "kime" hesabı değişir.
- Avans dağıtma mantığı.
- KDV politikası.
- Liste sayfalaması (yalnız sayımların listeye bağımlılığı kalkar).

**İstenmeyen sonuçlar** (teknik olarak çalışsa bile başarısızlık sayılır):
- Bir rakamın açıklamasız değişmesi.
- Özet ile tıklanınca açılan liste arasında fark.
- Yetkisi olmayana yeni bir finans rakamı görünmesi.
- Ekran açılışının belirgin yavaşlaması.
- Dövizlerin sessizce toplanması.
- Teslim edilmiş işin "acil" ya da "geciken" görünmesi.

## 6. Kapsam: hangi yer hangi tanıma geçer

Mevcut durumun dökümünden (satırlar 2026-10-26 itibarıyla):

**Sipariş sayıları**
- **Lab Özet** (`modules/dashboard/screens/LabDashboardScreen.tsx`, masaüstü + `LabMobileDashboard.tsx`): geciken, aktif ("Bugün 58" hatası), bugün teslim edilecek, bugün biten (`updated_at` yerine `delivered_at`), "Toplam vaka" (dönem etiketi).
- **Admin Özet** (`app/(admin)/index.tsx` + `AdminMobileDashboard.tsx`):
  - geciken (bugün arşiv dahil ve 6 ay penceresiyle sayıyor), `totalOrders`, "Aktif" (bugün `total − teslim`), durum dağılımı (bugün 5 statü);
  - "Bugün" (bugün oluşturulanı UTC sayıyor), mobil "BUGÜN N TESLİM" (commitlenmemiş düzeltme var; birlikte ele alınır).
- **Siparişler** (`modules/orders/screens/OrdersListScreenV2.tsx`, `lib/listParams.ts`):
  - Geciken çipi, Acil çipi (`:476`, `:445`; `listParams.ts:35`), Bugün/Yarın çıkacak, Tümü.
  - Sayılar sunucudan gelir; süzgeç satırları aynı aynayı kullanır.
- **Üretim Panosu** (`useKanbanData.ts`, `ProductionKanbanScreen.tsx`, `v_active_orders_kanban`): geciken (saat değil gün kıyası), arşiv hariç.
- **TV** (`modules/tv/api.ts`): geciken (bugün dünün tarihiyle kıyaslıyor), KPI.
- **Günlük özet e-postası** (`fn_daily_order_watch`): arşiv hariç, `lab_today`.
- **Simanty:**
  - `useSuggestionStats.ts` (FINAL_STATUSES'ta olmayan statüler var);
  - `tools.ts` günlük özet (`limit(5)` ile sayıyor).
- **Diğer:**
  - DesktopShell sağ panel, NotificationPopover, istasyon Analytics;
  - klinik ve hekim özetleri (geciken/aktif), `DoctorOrdersMobile`.
- **Çelişen yardımcılar tek yardımcıya bağlanır ya da kaldırılır:** `modules/orders/constants.ts` `isOrderOverdue`, `constants/status.ts` `isOverdue`, `core/utils/dates.ts` `isOverdue`, `listParams.ts` `matchesDueFlag`, Simanty `FINAL_STATUSES`, ekranlardaki yerel `todayStr()`.

**Finans**
- **Admin Özet:** "Aylık tahsilat" (bugün ödenmiş faturaların `total`'ını `created_at` ile topluyor; yüzde hesabı dövizleri topluyor), vadesi geçmiş fatura listesi.
- **Lab Özet:** finans aksiyon kartı (vadesi geçmiş faturalar).
  - Kullanıcının asıl ekranı: **klinik bazında vadesi geçmiş alacak**, hatırlatmaya giden rakamla aynı.
  - Bugün fatura bazında listeleniyor. Klinik bazında gruplanması bu kararın gereği; yerleşimi uygulayıcı kart içinde çözer.
- **Faturalar** (`InvoicesListScreen.tsx`, `invoices/api.ts` `fetchInvoiceStats`):
  - kartlar: "Bu Ay Kesilen", "Tahsilat (30g)", "Toplam bakiye", "Vadesi Geçen";
  - Vadesi Geçen süzgeci;
  - istatistik sorgusu sayfalamasız tüm faturaları çekiyor, sunucu toplamına geçer.
- **Rapor** (`FinanceReportScreen.tsx`):
  - kartlar, hero (yalnız ilk dövizi gösteriyor), birleşik şerit;
  - PDF (taslak dahil, aylık satırlarda dövizleri topluyor), "Hatırlatma" sekmesi (`v_upcoming_due_invoices` taslak dahil).
- **Karlılık** (`ProfitabilityScreen.tsx`, `profitability_*` fonksiyonları): §3'teki dönem kuralı.
- **Cari:**
  - lab cari listesi (`v_clinic_balance_ccy`), klinik ekstresi KPI'ları (`ClinicStatementScreen.tsx`; avans düşmüyor);
  - klinik tarafı genel bakış ve ekstre (`modules/finance-clinic/api.ts`; ekstre taslağı borç satırı yapıyor).
- **Hatırlatma (veritabanı):**
  - `_send_payment_reminder_core`, `send_payment_reminder` (iki sürüm), `send_payment_reminders_bulk`, `run_auto_payment_reminders` (cron);
  - `my_payment_reminder`, `my_open_balance_by_currency`;
  - Simanty `accountBalance`.
  - Tutar ve "kime" kararı vadesi geçmiş alacak tanımına geçer (avans düşülmüş).

**Personel**
- Admin Özet "Lab kullanıcı" → "Aktif personel".
- Kullanıcılar ekranı sayısı → "hesap".
- Ekip, Maaş ve Avans ekranlarında "Personel" tanımla tutarlı.

## 7. Kısıtlar

- **Çalışan sistemi bozmadan, aşama aşama** (`feedback_safe_incremental_fixes`).
  - Her paket tek başına yayınlanır ve geri alınır.
  - Veritabanı değişikliği beş adımda yapılır: canlı tanım, geri alma betiği, rol rol geri alınan deneme, onay, uygulama ve canlı doğrulama.
- **Önerilen paket sırası** (uygulayıcı plan aşamasında inceltebilir):
  1. Tanım katmanı: SQL + istemci aynası, ekranlara dokunmadan.
  2. Özet ekranları: kullanıcının sabah kararı.
  3. Hatırlatma tutarları.
  4. Sipariş sayıları: liste, pano, TV, Simanty, e-posta, diğer.
  5. Finans ekranları: Faturalar, Rapor, Karlılık, Cari.
  6. Personel etiketleri.
- **Rol görünürlüğü korunur:**
  - Sayım fonksiyonları INVOKER.
  - Finans rakamları `lab_can_view_finance()` ve klinikte `can_view_clinic_billing()` arkasında.
  - Yeni DEFINER fonksiyon yazılırsa rol adı yerine bu yardımcılar kullanılır (`project_role_visibility`).
- **Katı döviz kuralı:** döviz başına göster, sessizce toplama. Sabit ₺ yazma; `useBaseCurrency()` / kaydın dövizi (`project_money_base_currency`).
- **Para biçimlendirme defansif:** `(Number(n)||0)`.
- **Dört dil aynı anda.** `auto.{en,de,fa}.json` eşit kalır. `${n} X` kalıbında `autoT`.
- **Koyu tema token'larla.**
- **Doğrulama:** `tsc --noEmit --incremental false` 0 hata; test paketi yeşil.
- **Canlı veride deneme kaydı açılmaz;** denemeler geri alınan işlemlerde yapılır.
- **Yayın yalnız kullanıcı "deploy" deyince.**
- **KVKK:** çıktılarda hasta/kişi adı ve tutar yazılmaz; sayılar yeterli.

## 8. Uygulayıcıya bırakılanlar

- SQL katmanının biçimi: tek `jsonb` döndüren fonksiyon, ayrı fonksiyonlar ya da görünüm + fonksiyon. Satır bazında kullanılabilen yüklem fonksiyonları (ör. siparişin "geciken" olup olmadığı) listeler için de gerekirse.
- İstemci aynasının yeri (ör. `core/metrics/`) ve testleri. Saf fonksiyonlar node testleriyle (`.test.mts`, göreli import sorunu nedeniyle bağımlılıklar parametre), SQL ile aynı sonucu verdiğinin örnek satırlarla gösterilmesi.
- Ekran başına sunucu sayımı mı (HEAD count / RPC), yoksa tek özet RPC'si mi.
- Önbellekler (Özet'in 1 saatlik localStorage önbelleği, Rapor önbelleği) tanım değişince eski rakamı göstermemeli; anahtar sürümü ya da benzeri.
- "Avans fazlası" satırının gösterilip gösterilmeyeceği.
- `delivered_at` yazımının hangi yollarda eksik olduğu ve geri doldurma yöntemi (onaylı).

## 9. Kabul ölçütü

- Canlıda aynı anda alınan değerler eşit olmalı:
  - **Geciken:** Admin Özet, Lab Özet, Siparişler "Geciken" çipi ve açtığı liste, Üretim Panosu, TV.
  - **Acil:** Özet ve Siparişler. Teslim edilmiş acil iş 0.
  - **Alacak (tek lab'lı bir klinik için):**
    - Bakiye: Cari satırı, kliniğin kendi ekranı ve hatırlatma mesajındaki "Açık borç" eşit.
    - Vadesi geçmiş: Özet'teki "hatırlatılacak" listesinde görünmesi ile hatırlatmanın o kliniğe gitmesi aynı kurala dayanır.
  - **Ciro (aynı dönem için):** Faturalar, Rapor ve Karlılık.
- Doğrulama yöntemleri:
  - Bir SQL karşılaştırma denemesi, her tanımı ekran sorgularının yeni hâliyle yan yana çalıştırır.
  - Saat 00:00–03:00 TR penceresi `lab_today` ile denenir (zaman parametresi verilerek).
