# Klinik Müşteri Kartı + En Çok İş Gönderenler Widget'ı — Tasarım

Tarih: 2026-11-12 · Durum: taslak (kullanıcı onayı bekliyor) · 3. dalga madde 1

## Niyet ve neden

Lab yöneticisi bir kliniğe **nasıl davranacağına** karar verirken (gerçek örnek: çok sipariş
veren ama geç ödeyen bir klinik indirim istedi, yönetici vermek istemedi) şu soruların
cevabını tek bakışta görmek istiyor:

- Bizimle ne kadar iş yaptı? (sipariş sayısı, toplam **üye**)
- Bize ne kadar ciro getirdi?
- Bize ne kadar borcu var, ödemeleri geciktiriyor mu?

Bugün bu rakamlar dağınık: üye İş İstatistikleri'nde (ay ay), ciro Karlılık raporunda, borç
cari/ekstrede. Kullanıcı geç ödemeyi "finans bölümünden" öğrendi. Klinik detay sayfası yok.

## Hedefler

1. **Klinik özet şeridi (4 rakam)** — liste kartlarında, sayfadan çıkmadan:
   toplam üye · ciro · borç (vadesi geçmişse uyarılı) · son sipariş tarihi.
2. **Klinik özet penceresi (popup)** — ortada açılan modal; tam bilgi.
3. **En çok iş gönderenler widget'ı** — Özet sayfasında ilk 5 klinik sıralama tablosu.

### Görüneceği yerler (kullanıcı kararı)

| Yer | Ne görünür |
|---|---|
| Sağlık Kurumları sayfası (`ClinicsScreen`, lab + admin) | Her klinik kartında 4 rakamlık şerit; karta/şeride tıklayınca popup |
| Kullanıcılar sayfası (lab `LabUsersManagement`, admin `AdminUsersScreen`) | Kliniğe bağlı kullanıcıların kartlarında aynı bilgi (aşağıda "builder'a kalan" notu) |
| Sipariş detayı (masaüstü V2 + mobil handoff) | Klinik adına tıklayınca popup; sayfadan çıkılmaz |
| Özet sayfası widget'ı | Klinik satırına tıklayınca aynı popup *(benim kararım)* |

### Popup içeriği

- Başlık: klinik adı (+ logo varsa).
- **Bu ay / Tüm zamanlar** geçişi (aşağıdaki tüm rakamlar seçilen döneme göre; borç dönemsizdir).
- Sipariş sayısı · toplam üye (+ varsa çene/adet ayrı: "47 üye · 4 çene · 2 adet") · ciro (KDV hariç).
- Borç: güncel bakiye, vadesi geçen tutar, en eski gecikmiş faturanın kaç gündür beklediği,
  30/60/90+ yaş kırılımı.
- Son sipariş tarihi (ve kaç gün önce).
- Puan: ortalama yıldız + değerlendirme sayısı; hiç yoksa "—".
- Son yazışmalar: o kliniğin siparişlerindeki son 3 sipariş-içi mesaj (kısa önizleme, tarih).
- Bağlantılar: "Ekstre" (`/statement/[clinicId]`), "İş İstatistikleri" (klinik filtresi seçili).

### Widget

- Özet sayfasında kart: "En çok iş gönderenler" — ilk 5 klinik, sıra tablosu.
- Dönem geçişi: **Bu ay / Tüm zamanlar**.
- Sıralama geçişi: **Üye** (yalnız üye sayısı) / **Puan** (ciro + üye birleşik).
- **Ödeme durumu sıralamayı ETKİLEMEZ** (kullanıcı kararı). Vadesi geçmiş borcu olan
  kliniğin adının yanında küçük uyarı işareti + tooltip ("Vadesi geçmiş · N gün")
  *(benim önerim — kullanıcıya bildirildi)*.

## Hedef dışı (non-goals)

- Yeni "ortalama kaç gün geç ödüyor" ölçüsü — tahsilat kaydı çok az (60 kesilmiş faturaya 2
  tahsilat), ölçü güvenilmez olur. Gecikme = vadesi geçen tutar + en eski gecikme günü.
- WhatsApp yazışmaları — `whatsapp_sessions` kliniğe bağlı değil (yalnız telefon).
- Telefon/destek kaydının kliniğe bağlanması (3. dalga madde 3, ayrı iş).
- Klinik/hekim panellerinde gösterim — bu bilgi yalnız LAB tarafı içindir.
- İndirim/vade kararını otomatikleştirme; kart yalnız bilgi verir.

## Anti-hedefler (çalışsa bile başarısızlık sayılır)

- Kartın gösterdiği üye sayısı İş İstatistikleri / Üye Trendi'yle **farklı** çıkması.
- Kartın gösterdiği ciro Karlılık raporuyla farklı çıkması; dövizlerin toplanması.
- Hekime/kliniğe kendi siparişinde bu popup'ın açılması (para/borç bilgisi sızar).
- Liste sayfalarının (53 klinik) belirgin yavaşlaması.
- Popup'ın sayfadan çıkarması (yönlendirme yerine modal olmalı).

## Kısıtlar

### Tek tanım (değişmez)

- **Üye/çene/adet:** Üye Trendi ile aynı kural — iptal ve dişsiz hariç,
  `resolveUnitForWorkType → memberBucketOf → serviceUnitQty` (core/util/serviceUnits),
  hizmet adı → birim eşlemi trim + `tr-TR` küçük harf. Parite testi yazılmalı.
- **Ciro:** Karlılık ile aynı — `profitability_by_clinic` tanımı (invoice `subtotal`,
  KDV hariç, iptal/taslak hariç; o fonksiyon neyi sayıyorsa o). Para birimi başına ayrı
  gösterilir, **dövizler toplanmaz** (memory: baz para birimi kuralı).
- **Borç:** `v_clinic_balance_ccy` (bakiye, `overdue_net`, aging, `oldest_overdue_date`),
  döviz başına.
- **Puan:** `order_reviews` — Değerlendirmeler ekranıyla aynı ortalama.
- **Ay:** yerel ay (lab saat dilimi), takvim **miladi**.
- **Klinik ↔ sipariş:** sipariş `doctor_id` → `doctors.clinic_id` (İş İstatistikleri ile
  aynı eşleme).

### Yetki ve güvenlik

- Yalnız lab paneli (lab + admin) kullanıcıları görür. Sipariş detayı ekranı hekim/klinik
  panelleriyle paylaşılıyor — klinik adı yalnız lab tarafında tıklanabilir olmalı.
- Ciro ve borç para bilgisidir: finans yetkisi olmayan lab kullanıcısında (mevcut
  `permissionStore` yetki kontrolü) bu iki alan gizlenir, kalanlar görünür *(benim kararım)*.
- Yeni RPC/view gerekirse: tenant `lab_id` filtresi zorunlu, RLS-baypas view'larda
  `lab_id` kontrolü (memory: view tenant sızıntısı). DB değişikliği 5 adım kuralıyla
  (.before.txt, .down.sql, geri alınan probe, açık onay, uygula+ölç).
- KVKK: hasta verisi gösterilmez; yazışma önizlemesinde hasta adı geçiyorsa olduğu gibi
  kalır (mevcut sohbet kutusu zaten gösteriyor) — yeni hasta alanı eklenmez.

### Tasarım kuralları (CLAUDE.md)

- 4 dil birlikte (tr/en/de/fa); dental "üye" = en unit / de Einheit / fa واحد.
- Koyu tema aynı anda; `useInkUI` / `useMobileTokens`.
- Popup: `U.modalOverlay` + `U.modalCard` (ortalanmış, bulanık arka plan), mobilde de ortada.
- İkonlar yalnız `core/ui/icons`; tooltip `GlassTooltip`; renkli sol kenarlı kart YOK.
- Sayfa kenarı `PAGE_PADDING`; beyaz butonlar `U.plainBtn`; geri `NavyBackButtonX`.
- Eylem hatası butonun yanında görünür.
- Sağlık Kurumları ekranı lab ve admin'de ORTAK: değişiklik iki panelde birden görünür
  (kullanıcı ikisini de istedi).

## Kullanıcının verdiği kararlar

- Kart amacı: kliniğe nasıl davranılacağına karar vermek (indirim vb.).
- Görüneceği yerler: Sağlık Kurumları, Kullanıcılar, sipariş içi popup.
- Liste kartlarında 4 rakam yeterli; tamamı popup'ta.
- Widget: bu ay + tüm zamanlar, ilk 5, üye sıralaması + ciro+üye puanı.
- Ödeme durumu puanı düşürmez.

## Benim kararlarım (kullanıcı kontrol edebilir)

- **Birleşik puan:** dönem içinde `0.5 × (üye / en yüksek üye) + 0.5 × (ciro_baz / en yüksek
  ciro_baz)`, 0–100'e ölçeklenir. Ciro karşılaştırması için `revenue_base` (baz para birimi,
  fatura anındaki kur) kullanılır — yalnız sıralama için; ekranda ciro yine döviz başına.
- Widget satırına tıklama → popup.
- Geç ödeyen işareti (sıralamayı değiştirmez).
- Finans yetkisi olmayan lab kullanıcısında ciro/borç gizli.
- "Son yazışmalar" = sipariş-içi mesajlar (order chat), son 3.

## Builder kontrolünden sonra netleşenler (benim kararlarım)

- **"Bu ay" çapası — her rakam kendi kaynak ekranının çapasını kullanır:** üye ve sipariş
  sayısı İş İstatistikleri ile aynı (sipariş `created_at`, yerel ay); ciro Karlılık raporu
  neyi kullanıyorsa o (`profitability_by_clinic` olduğu gibi). Amaç her rakamın kendi kaynak
  ekranıyla birebir tutması; iki çapanın farklı olması kabul (devam eden iş bu ay üye sayar,
  cirosu teslim/fatura ayında görünür). Popup'ta küçük not: "Ciro fatura tarihine göre".
- **Liste şeridi her zaman TÜM ZAMANLAR'dır** (toplam üye, toplam ciro); borç güncel;
  son sipariş tarihi. Dönem geçişi yalnız popup'ta ve widget'ta.
- **Ekstre indirimleri:** ciro Karlılık gibi NET (indirim satırları dahil); birleşik puan da
  net ciroyu kullanır; indirim satırları sipariş sayısına girmez.
- **Hangi siparişler:** İş İstatistikleri ne sayıyorsa o (devam/revizyon siparişleri dahil,
  iptal ve dişsiz hariç). Kliniğe bağlanamayan siparişler hiçbir kliniğe yazılmaz (widget'ta
  da görünmez). Hekimin tek `clinic_id`'si esas alınır.
- **Kim görür:** yalnız `(lab)` ve `(admin)` panelleri. İstasyon (teknisyen), kurye, hekim,
  klinik panellerinde klinik adı düz metin kalır. Finans yetkisi = mevcut `permissionStore`'da
  finans/fatura görüntüleme yetkisi (builder gerçek anahtarı kodda bulur); yoksa ciro ve borç
  "—" yerine hiç gösterilmez, kalan rakamlar görünür.
- **Birden çok döviz:** şeritte en büyük tutarlı döviz + "+N" rozeti; rozetin tooltip'i
  bütün dövizleri listeler. Popup'ta her döviz ayrı satır. Hiçbir yerde dövizler toplanmaz.
- **Yazışma önizlemesi:** sohbet ekranında lab'ın gördüğü mesajlar aynen; mesajda bir
  görünürlük/iç-not bayrağı varsa (builder kodda kontrol eder) mevcut sohbet ekranının
  kuralına uyulur — popup yeni bir görünürlük açmaz.

## Builder'a kalanlar

- Veri katmanı: tek toplu RPC mi, istemcide toplama mı (İş İstatistikleri gibi), yoksa
  karışık. Şart: liste sayfası 53 klinik için tek/az istekle yüklenir; birim kuralı TS'deki
  tek kaynaktan gelir (DB'de kopyalanırsa parite testi zorunlu).
- Kullanıcılar sayfasında şeridin tam yeri: Klinik sekmesinde kullanıcılar zaten klinik
  başına gruplu (grup başlığı var) — şerit grup başlığına konup her kullanıcı kartında
  tekrar edilmeyebilir; hekim kartlarında klinik adı tıklanınca popup açılır. Builder
  tekrar etmeyen, kalabalık yapmayan yeri seçer.
- Mobil sipariş handoff'una `clinicId` prop'u eklenmesi.
- Önbellek/tazeleme stratejisi (popup her açılışta taze mi, oturum boyu önbellekli mi).
- Boş/yükleniyor/hata durumlarının görünümü.
- Mobil admin özetinde (AdminMobileDashboard) widget'ın kompakt hali.
