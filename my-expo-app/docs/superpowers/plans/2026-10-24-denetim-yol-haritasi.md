# Denetim düzeltmeleri: yol haritası

**Kaynak:** `docs/lab-yoneticisi-raporu/00-ozet.md` ve beş alan raporu (24 Ekim 2026).
**Bu belge:** neyin hangi sırayla yapılacağı. 1. dalganın uygulanabilir görevleri `2026-10-24-denetim-dalga-1.md` dosyasında. 2. ve 3. dalga, sırası gelince kendi ayrıntılı planını alır.

## Temel kural: çalışan sistemi bozmadan, aşama aşama

Kullanıcı kuralı: "çalışan sistemi bozmadan aşama aşama düzeltmeleri yapmak ve eksikleri eklemek".

1. **Küçük, bağımsız adımlar.** Her görev tek başına yayınlanabilir ve geri alınabilir. Bir görev doğrulanmadan bir sonrakine geçilmez.
2. **Eklemeli değişiklik.** Eksik bir özellik eklenirken mevcut akış değişmez; yeni sütun, çip ya da sekme eklenir, eski davranış korunur. Davranışı değişen her yer görevde açıkça yazılı. Ortak bir bileşen değişiyorsa (birden çok paneli etkiliyorsa) bu da görevde yazılı.
3. **Veritabanı değişikliği beş adımda yapılır.** Biri atlanırsa uygulanmaz.
   1. Canlı tanım kaydedilir.
   2. Geri alma betiği hazırlanır.
   3. Değişiklik, rol rol, geri alınan bir işlemde denenir.
   4. Kullanıcı onay verir.
   5. Değişiklik uygulanır ve canlıda hemen doğrulanır.
4. **Her görevin sonunda dört kontrol.**
   - `tsc` 0 hata.
   - İlgili testler yeşil.
   - Ekran açık ve koyu temada, masaüstünde ve telefonda kontrol edilir.
   - Dört dil sözlüğü eşit kalır.
5. **Yayın küçük paketlerle yapılır.**
   - Kullanıcı "deploy" demeden yayın yok.
   - Her yayından sonra canlı kontrol yapılır.
   - Sorun çıkarsa Vercel'de bir önceki sürüme dönülür. Veritabanı değişikliğinde geri alma betiği çalıştırılır.
6. **Canlı veriye dokunulmaz.** Testler saf yardımcılarla ve geri alınan işlemlerle yapılır. Canlı hesapta deneme kaydı açılmaz.

## Dalgalar

### 1. dalga: küçük emek, büyük etki
Ayrıntı: `2026-10-24-denetim-dalga-1.md`. Dört paket hâlinde ilerler; her paketten sonra yayın ve canlı kontrol yapılır.

| Paket | Görev | Rapor no | Risk |
|---|---|---|---|
| 1 · Güvenlik | Maaş, bordro, avans ve prim tablolarının okuma kuralları (A1) · personel satırları (A2) · avans talepleri (A3) | K1 | Veritabanı; adım adım, onaylı |
| 2 · Para ve mobil | Ekstre açılış/kapanış bakiyesi · mobil "Tüm Menü" · mükerrer alış faturası uyarısı | K2, K3, K4 | Yalnız ekran |
| 3 · Günlük kullanım | Sipariş listesi: teslim sütunu, Bugün/Yarın çipleri, Özet'ten filtreli geçiş · otomatik "okundu"nun kaldırılması · pasife almaya onay penceresi | Y3, Y4, (lojistik/klinik) | Ekran davranışı |
| 4 · Dil ve KVKK | Türkçe büyük harf ve yazım hataları, eksik çeviriler · TV panosu ve kuryede hasta adının baş harfe çevrilmesi | (dil), (KVKK) | Yalnız ekran |

### 2. dalga: orta emek (her biri ayrı plan)
**İlk sıradakiler (güvenlik; Paket 1 bağımsız incelemesinden, 2026-10-24):**
0a. ~~**Profildeki maaş alanı (`profiles.monthly_salary`).**~~ — BİTTİ 2026-10-25 (10. madde ve `tc_no` ile birlikte): maaş tek kaynak `employee_compensation`; migrations 20261025100000/101000/102000 CANLI, web + edge yayında. Spec/plan: `docs/superpowers/specs/2026-10-25-maas-tek-kaynak-design.md`, `plans/2026-10-25-maas-tek-kaynak.md`. 5 hesapta dolu. Lab içinde herkes okuyabiliyor; `clinic_admin_view_lab_users` kuralıyla bağlı kliniklerin yöneticileri de okuyabiliyor (lab dışı sızıntı, doğrulandı).
   - Çözüm: maaşı profilden ayrı, yetkiye bağlı bir tabloya ya da RPC'ye taşımak. Ayarlar → Kullanıcılar ekranı (`LabUsersManagement.tsx:333`) ve admin-create-user edge fonksiyonu da güncellenir.
   - Aşağıdaki 10. madde (`employees.base_salary`) ile birlikte tek planda yapılır. `tc_no` da aynı kapsama alınır.
0b. ~~**Kardeş İK tabloları.**~~ — BİTTİ 2026-10-25 (20261025110000/111000/112000 CANLI + HRScreen yayında). Spec/plan: `specs/2026-10-25-ik-tablolari-erisim-design.md`, `plans/2026-10-25-ik-tablolari-erisim.md`. Kuralları yalnız "aynı lab" şartına bakıyor, FOR ALL. Görev 3'teki "kendi talebini onaylama" açığının benzeri:
   - `employee_leaves`: kendi iznini onaylayabiliyor.
   - Diğerleri: `employee_attendance`, `payroll_settings`, `performance_rules`, `employee_performance`, `employee_documents`.
   - `bonus_runs` okuma lab-geneli; `salary_adjustments` lab müdürüne açık.
0c. ~~**Küçük güvenlik notları.**~~ — BİTTİ 2026-10-25 (20261025120000 CANLI): kârlılık 5 fonksiyon yetkiye bağlandı (lab kontrolü zaten vardı; asıl açık lab içi yetkisizlik), performans hesaplama fonksiyonlarına lab+maaş yetkisi, avans talebinde onay alanları korundu; performance_bonuses kendi satırı değişmedi. Yan bulgu: `calculate_employee_performance` olmayan `orders` tablosuna bakıyor (bozuk, istemcide kullanılmıyor).
   - `ear_update`: personel, kendi bekleyen talebinin diğer sütunlarını değiştirebiliyor; "onaylandı"ya çekemiyor.
   - `performance_bonuses`: kendi satırı `payroll_id`'ye bağlı.
   - `calculate_performance_bonuses` / `calculate_employee_performance`: lab kontrolü yok.
   - `profitability_summary.total_labor`: dar tarih aralığında kişi bazlı maaş ödemesi seçilebiliyor.

1. ~~**Genel arama (Y1).**~~ — BİTTİ 2026-10-25 (20261025140000 + 150000 CANLI, web yayında). Spec/plan: `specs/2026-10-25-genel-arama-design.md`, `plans/2026-10-25-genel-arama.md`. Üst kutu + Ctrl+K + mobil üst çubuk araması (Simanty + üstünü kullandığı için `SearchAboveFab` yerine; kullanıcı kararı) sipariş/klinik/hekim/fatura/sayfa arar; `?clinic=`, `?doctor=`; Siparişler'de klinik adı. Kalan: performans (~700+ siparişte 300 ms), kuryede ölü kutu, istasyon palet listesi. Yan bulgular: `work_orders` RLS teknisyene tüm lab siparişlerini, `invoices` RLS lab'daki herkese faturaları açıyor; klinikte `billing_view` uygulanmıyor.
2. ~~**Tek tanım (Y2).**~~ — BİTTİ 2026-10-26 (DB: 20261026100000/110000/120000/121000/140000/150000/151000 CANLI; ekranlar yayında 2026-10-26). Spec/plan: `specs/2026-10-26-tek-tanim-design.md`, `plans/2026-10-26-tek-tanim.md`. "Geciken", "aktif", "acil", "ciro", "tahsilat", "alacak", "personel" tek tanımdan; sabah Özet'te klinik bazlı "Ödeme hatırlat" listesi (avans düşülmüş, hatırlatmayla aynı tutar).
3. ~~**Sipariş içinde "Geçmiş" sekmesi.**~~ — BİTTİ 2026-10-27 (DB: 20261027100000/110000/120000/130000/131000/140000 CANLI; ekranlar yayında 2026-10-27). Spec/plan: `specs/2026-10-26-siparis-gecmisi-design.md`, `plans/2026-10-26-siparis-gecmisi.md`. `order_history` RPC (rol süzgeçli tek akış), alan/kalem/durum/devir değişiklik kaydı, Loglar sunucu süzgeci + sayfalama, Loglar yalnız sahibe. Son incelemede tenant sızıntısı (başka lab'ın sahte log satırı) bulundu ve kapatıldı; olgu satırları yalnız sunucu yazımı (`activity_logs_trust_stamp`).
4. ~~**Prova takibi (K5).**~~ — BİTTİ 2026-10-27 (DB: 20261027160000/161000/162000/163000/164000/165000 CANLI; ekranlar yayında 2026-10-27, dpl_AbVQxt3yXHDDLaK5txfZKwGEefAZ). Spec/plan: `specs/2026-10-27-prova-takibi-design.md`, `plans/2026-10-27-prova-takibi.md`. Prova = mevcut bekleme yuvasında `client_prova` (yeni statü yok): sayaç durur, dönüşte teslim tarihi klinikte geçen gün kadar kayar; kurye bacağı otomatik işaretler; hasta prova/takma randevuları (hekim önerisi → lab onayı); randevu riski; günlük gecikme/risk bildirimi; sipariş detayında B düzeni Prova popup'ı; sihirbazda randevu satırı; Siparişler'de "Provada" + "Randevu riski" filtreleri ve rozet. Eski `ProvaSection` kaldırıldı.
5. ~~**Kurye teslim kanıtı.**~~ — BİTTİ 2026-10-28 (DB: 20261028100000/101000/102000 CANLI; BanaBiKurye edge fonksiyonları CANLI; ekranlar yayında 2026-10-28, son inceleme düzeltmeleri sonraki yayında; kanıt kapısı 20261028109000 hazır ama UYGULANMADI — kuryelerin uygulama/sürüm kontrolü + onay sonrası; ekranlar web yayınını bekliyor). Spec/plan: `specs/2026-10-27-kurye-teslim-kaniti-design.md`, `plans/2026-10-27-kurye-teslim-kaniti.md`. Fotoğraf her kendi-kurye teslimde zorunlu; kliniğe teslimde ad + imza ya da "İmza alınamadı" nedeni; yönetici gerekçeli kanıtsız kapatır; BanaBiKurye'den ad + varış saati; "Tara" sipariş kimliğinden kuryenin açık teslimatını açar.
6. ~~**Shipink durumunun otomatik güncellenmesi.**~~ — ERTELENDİ 2026-10-28 (kullanıcı: Shipink henüz hiç kullanılmadı; kargo kullanımı başlayınca yeniden ele alınır). Zamanlanmış görevle yapılır; Kurye Takip'te kargo satırında son durum görünür.
7. ~~**Muhasebeci dışa aktarımı.**~~ — KÜÇÜK SÜRÜM 2026-10-28 (kullanıcı: muhasebeciye Luca e-fatura listesi gidiyor, Luca'ya yeni geçildi → küçük sürüm): fatura listesinde "Dönem" çipi (tüm/bu ay/geçen ay/bu yıl/özel, kesim tarihine göre; `modules/invoices/periodRange.ts` + test); "Excel'e Aktar" CSV'ye e-Fatura No, ETTN, VKN, Vergi Dairesi, Para Birimi, KDV Matrahı, KDV %, KDV; dosya adı dönemi taşır. Web yayında 2026-10-28. Muhasebeci somut ek istek getirirse genişletilir.
8. ~~**Kasa/banka bağlantısı.**~~ — NAKİT KASA 2026-10-29 (kullanıcı: "kasada ne kadar nakit olmalı"; banka bakiyesi ve çek listesi kapsam DIŞI): TL + EUR nakit kasası; nakit tahsilat / makbuz satırı / elle gider + maaş-avans kendiliğinden düşer (kurye, alış faturası, düzenli gider düşmez); açılış sayımı = kesim anı, sayım farkı hareketi, bankaya yatırma; ödeme yöntemi 4 formda zorunlu seçim. Spec `specs/2026-10-28-nakit-kasa-design.md`, plan `plans/2026-10-28-nakit-kasa.md`. DB 4 migration CANLI (20261028150000/151000/152000 + inceleme düzeltmesi 20261029090000); web CANLI 2026-10-31.
9. ~~**Ekran genişliği değişince beyaz ekran (Y5).**~~ — BİTTİ 2026-11-01 (web yayında 2026-11-01). Kök neden: 6 panel düzeni 1024px'te `<Slot/>` (stack) ↔ `<Tabs>` arasında navigator değiştiriyor; yeni navigator eskisinin söküm temizliğinden önce çizilip stack durumunu devralıyordu. Rota parametreleri tüketilmiş detay sayfalarında (ör. ekstre) TabRouter `state.history.filter` ile çöküyordu ("Uygulama Hatası"), diğerlerinde sayfa Özet'e düşüyordu. Çözüm `core/layout/useKeepRouteOnShellSwitch.ts`: geçişte bir kare boş çizilir (eski navigator temizlenir), yeni navigator kurulunca son adrese `replace` ile dönülür; saf yardımcılar `shellSwitchHref.ts` (+ test). Önizlemede finans sekmesi ve ekstre detayı iki yönde doğrulandı.
10. ~~**Maaşın personel kartından ayrılması.**~~ — BİTTİ 2026-10-25 (0a ile). K1 sonrası kalan tek açık: personel listesini görme yetkisi olan herkes (lab müdürü; kurye 2026-10-24'te çıkarıldı) `employees.base_salary` alanını görüyor. Maaş ayrı tabloya ya da yetkili RPC'ye taşınır.
11. ~~**Mükerrer alış faturasına veritabanı engeli.**~~ — BİTTİ 2026-10-24 (20261024120000 CANLI; tek çift kullanıcı onayıyla temizlendi, `purchase_invoices_lab_supplier_no_uq` canlıda doğrulandı 2026-11-01).
12. ~~**Karlılık uyarısı ve toplu fatura geliri.**~~ — YENİ KAPSAMLA BİTTİ 2026-11-01 (kullanıcı: siparişe/hekime kâr dağıtmak yerine klinik ve işlem bazında CİRO; kâr yalnız dönem toplamı). Gelir KDV hariç (`profitability_summary` + `profitability_revenue_ccy` `subtotal` okur); yeni RPC'ler `profitability_by_clinic` / `profitability_by_service` (yardımcı `_profit_revenue_lines`: toplu faturada her kalem kendi siparişinin hekimine, kalem toplamı ≠ subtotal farkı "Kalemsiz fatura", liste fiyatı lab hizmetinden); hero'da işçilik/genel gider girilmemiş uyarısı, işçilik yoksa marj etiketi verilmez; "En Kârlı/Zararlı 5 Sipariş" ve "Doktor Bazlı Kârlılık" listeleri kaldırıldı. DB 20261101120000 + 20261101121000 + 20261101130000 (sipariş eşleşmesi: "[sipariş no]" önekli kalem kendi siparişine; çok siparişli faturada bağsız kalem/kalan sipariş sahiplenmez) CANLI 2026-11-01; ekran web yayınını bekliyor. Spec/plan: `specs/2026-11-01-karlilik-klinik-islem-ciro-design.md`, `plans/2026-11-01-karlilik-klinik-islem-ciro.md`.
13. ~~**Teslim tarihi kuralı.**~~ — YENİ KAPSAMLA BİTTİ 2026-11-02 (kullanıcı: asıl sorun bekleme — parça/onay beklenirken süre doluyor, "Beklet" unutuluyor; "5 gün kuralı kalsın"). Bekleme: geriye dönük başlangıç/bitiş (takvim günü; taban sipariş açılış günü veya önceki beklemenin bitişi, tavan bugün), gecikmiş işte tek dokunuşla "Hekimi bekliyor" (listede ••• menüsü + panoda görev satırı), panoda "Beklemede" rozeti ve 3 günü aşan bekleme hatırlatması (Devam ettir), listede "Beklemede" süzgeci, teslimde açık bekleme kendiliğinden kapanır (`end_source`), Sipariş Geçmişi'nde "Sonradan girildi" / "Bekleme teslimde kapandı". 5 iş günü kuralı aynen. Son inceleme: teslim edilmiş/iptal işte "Devam ettir" reddedilir, devamda düzeltilen başlangıcın anı ve kişisi kaydedilir, mobil listede "Beklemede · N gün", yönetici mobilinde Aktif kartı uzun bekleyenleri açar. DB 20261102100000 + 20261102110000 + 20261102120000 CANLI; web CANLI 2026-11-02. Spec/plan: `specs/2026-11-01-bekleme-geriye-donuk-design.md`, `plans/2026-11-02-bekleme-geriye-donuk.md`.
14. ~~**Teslim edilmiş siparişte yanlış düğmelerin gizlenmesi.**~~ — BİTTİ 2026-11-02 (yalnız ekran; web deploy bekliyor). Teslim edilmiş / iptal işte: "Hekim Onayına Gönder" ve "Yeniden planla" kapanır; aşama listesi (masaüstü + mobil ortak `StageWorkflowTimeline`, `readOnly`) salt okunur — ••• menüsü, Tamamla, Kuryeye Gönder, Aşama ekle yok (kullanıcı: "teslim edilen işte aşamalara dokunmuyoruz"). Mobilde "Kalan" sayaçları yerine "Teslim edildi" + teslim günü (2026-10 öncesi 28 kayıtta teslim anı yok → tarih yerine onay işareti), aşama satırı masaüstüyle aynı "X/Y aşama tamamlandı", "Aşama tamam" yalnız yapacak iş varken çizilir, hızlı etiketler gizli. Tanım `closedStateOf` (core/metrics/orderDefs + test). Açık kalan: LOJİSTİK "Kurye çağır" teslimden sonra da açık (kullanıcıya soruldu); "Hızlı işlem · etiket" düğmeleri hiçbir durumda işlev görmüyor.

### 3. dalga: büyük (her biri ayrı tasarım ve plan)
1. Klinik "müşteri kartı": sipariş, bakiye, son sipariş, puan ve yazışma tek kartta. Yanında müşteri analizi raporu: en çok iş gönderenler, sessizleşen müşteriler.
2. Değerlendirmeler ekranı: ortalama, klinik kırılımı, düşük puan uyarısı.
3. İletişimin kliniğe bağlanması: telefon, WhatsApp, destek ve sohbet kliniğin zaman çizelgesinde.
4. Tek "Onaylar" kutusu: izin, avans, malzeme, ödeme bildirimi, bağlantı isteği; rozet hepsini sayar.
5. Menünün yeniden düzenlenmesi: bölüm başlıkları; Ayarlar lab kimliğiyle, Finans özetle açılır; mobil menü tamamlanır.
6. Var olan müşterinin platforma alınması: "mevcut kayıtla eşleştir" adımı ve davet e-postası.

## Karar bekleyenler (kullanıcının)
- ~~**Mükerrer alış faturası**~~ — KARARLANDI (2026-10-24): gerçekten mükerrerdi; kopya temizlendi, `20261024120000_purchase_invoice_unique_no` CANLI (2. dalga 11. madde bitti).
- ~~**Kurye rolünün yetkisi**~~ — KARARLANDI (2026-10-24): kaldırıldı, `20261024130000_courier_no_view_employees` CANLI. Kurye yalnız kendi personel kaydını görür.
- **1. dalga sırası:** önerilen sıra Paket 1 → 2 → 3 → 4. Güvenlik ilk, çünkü açık şu an canlıda.
