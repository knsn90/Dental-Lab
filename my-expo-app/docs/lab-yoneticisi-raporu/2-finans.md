# Finans — lab yöneticisi gözüyle

> Değerlendirme: 24 Ekim 2026 · siman.app canlı admin hesabı (yalnız okuma) + kaynak kod.
> Hiçbir kayıt oluşturulmadı, gönderilmedi; tahsilat formu yalnız açılıp "Vazgeç" ile kapatıldı.
> Rapora kişisel veri ve gerçek tutar yazılmadı.

## Kısa hüküm
Alacak takibi ve e-fatura tarafı bugün işimi görür: bir kliniğin borcu, yaşlandırma, vadesi geçenler ve e-faturanın kabul/red durumu iki tıkta önümde. Ama "ay sonunda param nerede" sorusuna güvenle cevap veremiyorum: aynı ayın cirosu üç ekranda üç ayrı rakam, kasa modülü tahsilat ve giderle bağlı değil. Dönem filtreli ekstrede açılış bakiyesi sıfır yazıyor, muhasebeciye verilecek Excel'de de para birimi sütunu yok. Bu eksikler kapanmadan finansı tek başına Siman'a emanet etmem; muhasebeciyle Excel'de ikinci bir kontrol yaparım.

## Artılar
- **Sağlık kurumu bakiye ekranı gerçekten işe yarıyor.** Her kliniğin kesilen, tahsil edilen, bakiye ve gecikmiş tutarı tek satırda, para birimleri ayrı ayrı tutuluyor (euro ile doları toplamıyor). Yaşlandırma çubuğu (vadesi gelmemiş, 1–30, 31–60, 61+ gün) tahsilatçıya kimi önce arayacağını söylüyor. Arama kutusu ve "yalnız gecikmiş" filtresi var. (ekran: Finans → Sağlık Kurumları, dosya: `modules/invoices/screens/ClinicBalanceScreen.tsx`)
- **e-Fatura durumu listede görünüyor.** Fatura listesinde her satırın üstünde "e-Fatura · kabul / gönderildi / red / iptal / hata" rozeti var. Detayda Taslak → Kesildi → Onaylandı adımları, resmi fatura no ve ETTN gösteriliyor. "Siman'da iptal edilemez, Luca'dan yapılır" uyarısı açık yazılmış; yanlışlıkla resmi faturayı bozma riski düşük. (ekran: Faturalar ve fatura detayı, dosya: `modules/invoices/screens/InvoicesListScreen.tsx` `EFaturaBadge`, `modules/efatura/components/EFaturaPanel.tsx`)
- **Toplu e-fatura lab gerçeğine uygun.** Her teslimin kendi iç faturası var, ama ay sonunda bir kliniğe tek resmi e-fatura kesilebiliyor (canlıda 21 iç faturayı kapsayan bir e-fatura gördüm). Luca'da elle kesilmiş faturayı sonradan Siman'a bağlama da düşünülmüş. Göndermeden önce VKN, vergi dairesi ve adres eksikleri gösteriliyor. e-Fatura/e-Arşiv ayrımı GİB mükellef sorgusuyla yapılıyor ve önizleme var. (dosya: `modules/efatura/components/BulkEFaturaModal.tsx`, `modules/efatura/lib/readiness.ts`)
- **Teslimde otomatik taslak fatura.** İş teslim edilince taslak fatura kendiliğinden açılıyor ve taslak, klinik bakiyesine ve ekstreye girmiyor; kontrol edip kesiyorum. Unutulan fatura derdini çözüyor. (dosya: `supabase/migrations/20260723120000_auto_draft_invoice_on_delivery.sql`)
- **Çok dövizli tahsilat.** Tek tahsilat fişine euro, dolar ve TL birlikte girilip kur yazılabiliyor. Paranın hangi faturaya dağıtılacağı kaydetmeden önce sunucudan önizleniyor, makbuz basılabiliyor. Yurt dışı müşterisi olan lab için önemli. (ekran: ekstre → Tahsilat ekle, dosya: `modules/invoices/components/ClinicReceiptModal.tsx`)
- **Gelen e-fatura alışa dönüşüyor, kurye masrafı otomatik gidere yazılıyor.** Tedarikçi faturasını tekrar elle yazmıyorum, kurye masrafları da sipariş numarasıyla gider listesine kendiliğinden düşüyor. (ekran: Giderler → Gelen e-Fatura, "Otomatik")
- **Kliniğin kendisi ödeme bildirebiliyor**, lab "Ödeme Onayları"ndan onaylıyor. Faturadan iyzico ödeme linki üretilebiliyor, vadesi geçenlere e-posta/WhatsApp hatırlatması da gidiyor (otomatik çalışma da var). Tahsilat için telefon trafiğini azaltır.
- **Fiyat listesi kapsamlı.** Kategoriler, klinik bazlı özel fiyat, promosyon, acil ek ücret yüzdesi ve PDF katalog var. Menünün en üstüne "Sık kullanılan" olarak alınmış.
- **Özet ekranı tahsilatı hatırlatıyor.** "Bekleyen aksiyonlar"da "Tahsilat yap · N gün vadesi geçti" kartları var.

## Eksiler
- **[KRİTİK] Dönem filtreli hesap ekstresinde açılış bakiyesi hep 0, kapanış bakiyesi de yalnız o dönemin hareketlerinden hesaplanıyor.** Ay sonunda bir kliniğe "Ekim ekstresi" hazırlayınca belgede önceki aylardan gelen borç görünmüyor ve kapanış bakiyesi gerçek borçtan düşük çıkıyor. Klinik bu belgeyle "borcum bu kadar" der, mutabakat bozulur. Ekrandaki satır bakiyeleri doğru olduğu için tutarsızlık PDF'e kadar fark edilmez. Klinik panelindeki ekstrede açılış bakiyesi doğru hesaplanıyor; lab tarafındaki ekstrede hesaplanmıyor. (ekran: Finans → Sağlık Kurumları → klinik → Filtrele + Yazdır/PDF/Excel, dosya: `modules/invoices/buildStatementHtml.ts` `openingBalance: 0`, `closingBalance: lines.reduce(...)`; karşılaştırma: `modules/finance-clinic/api.ts` ~758–862)
- **[YÜKSEK] "Bu ay ne kadar ciro yaptım?" sorusu üç ekranda üç ayrı cevap alıyor, hiçbiri neye göre hesaplandığını söylemiyor.**
  - Faturalar ekranındaki "Bu ay" kutusu iptal ve taslak faturaları da sayıyor (`modules/invoices/api.ts` `fetchInvoiceStats` → `thisMonth` durum süzmüyor).
  - Rapor ekranı yalnız kesilmiş faturaları sayıyor.
  - Karlılık ekranı "bu ay açılan siparişlerin" faturalarını sayıyor; o yüzden bu üçünün en düşüğü.
  - Toplam alacakta da durum aynı: Faturalar ekranındaki "Toplam bakiye" taslak faturaları içeriyor, Sağlık Kurumları ekranındaki "Toplam alacak" içermiyor. İki rakam farklı çıkıyor.
  - Ben hangisini bankaya, ortağıma, muhasebeciye söyleyeceğim?
  - (dosya: `modules/invoices/api.ts:580-601`, `supabase/migrations/20260730180000_finance_report_exclude_drafts.sql`, `profitability_summary`)
- **[YÜKSEK] Özet ekranındaki "Bu Ay Tahsilat" gerçek tahsilatı göstermiyor.** Yalnız bu ay oluşturulup tamamen ödenmiş faturaların toplamını alıyor. Geçen ayın faturasına bu ay gelen ödeme ya da kısmi ödeme sayılmıyor. Canlıda Faturalar ekranı son 30 günde tahsilat gösterirken Özet "0" diyordu. "Tahsil oranı" yüzdesi de farklı para birimlerini topluyor; kodda bu not düşülmüş. (ekran: Özet → Finansal Özet, dosya: `app/(admin)/index.tsx` `loadFinance` ~1546, oran ~1176)
- **[YÜKSEK] Kasa/Banka modülü tahsilat ve giderlerden kopuk.** Tahsilatta "Nakit/Havale/Kart" seçiliyor, giderde ödeme yöntemi yazılıyor, ama hiçbiri bir kasa ya da banka hesabına hareket olarak düşmüyor. Kasa hareketleri yalnız elle giriliyor. Bu lab'da hiç hesap tanımlı değil, ekranda "Henüz hesap yok" yazıyor; neden hesap açmam gerektiği de söylenmiyor. Sonuç: "kasada ne kadar para var" sorusunun cevabı yok. Olsa da her parayı iki kez girmem gerekirdi. (ekran: Finans → Kasa / Banka, dosya: `modules/cash/api.ts`, `supabase/migrations/024_cash_accounts.sql`; tahsilat RPC'si yalnız `clinic_receipts`'e yazıyor)
- **[YÜKSEK] Karlılık ekranı yanıltıcı derecede iyimser.** Bu ay maaş ödemesi girilmediği için işçilik 0 sayılıyor ve ekran yaklaşık %97 marjla "Mükemmel" diyor. Gerçek bir lab'da bu oran %30–40 bandındadır. "Bu dönem için maaş/işçilik girilmemiş" gibi bir uyarı yok. Toplu faturada da gelirin tamamı ilk siparişe yazılıyor, diğer siparişler 0 gelirli görünüyor; bu yüzden "en kârlı sipariş" ve "hekim bazlı kârlılık" sıralaması bozuluyor. (ekran: Finans → Karlılık, dosya: `modules/finance/screens/ProfitabilityScreen.tsx:311`, `profitability_summary`; toplu fatura `work_order_id = v_first_wo`: `supabase/migrations/20260914210000_sec_fix_bulk_invoice_tenant.sql:133-136`)
- **[YÜKSEK] Rapordaki "Gelir" KDV dahil görünüyor.** Gelir/gider görünümü faturanın genel toplamını (KDV dahil) gelir sayıyor. Ciro ve kâr KDV kadar şişik çıkar, muhasebecinin rakamıyla tutmaz. (dosya: `v_monthly_finance_summary_ccy` — `invoices.total`; migration dosyasından çıkardım, canlı görünümü doğrulamadım)
- **[YÜKSEK] Muhasebeciye veri vermek zor.**
  - Fatura listesinde tarih aralığı filtresi yok; "Ekim faturalarını ver" diyemiyorum.
  - "Excel'e Aktar" aslında CSV indiriyor. Dosyada para birimi sütunu yok: euro ve dolar faturalar aynı "Tutar" sütununda karışıyor ve toplanırsa yanlış sonuç çıkar.
  - KDV matrahı/KDV tutarı ve resmi e-fatura no/ETTN sütunu da yok.
  - Gider dışa aktarımında da para birimi yok; ödeme yöntemi ham kodla ("havale") yazılıyor.
  - (dosya: `modules/invoices/screens/InvoicesListScreen.tsx:326-347`, `modules/expenses/screens/ExpensesScreen.tsx:385-390`)
- **[YÜKSEK] e-Faturası iptal edilmiş fatura gözden kaçabilir.** Luca'da iptal edilen e-faturanın Siman'daki karşılığı "Kesildi" durumunda kalıyor ve bakiyede sayılmaya devam ediyor; bunu canlıda bir faturada gördüm. "e-Faturasız" filtresi bu faturayı göstermiyor, çünkü eski ETTN hâlâ kayıtlı. Ayrıca "red/hata" durumundaki e-faturalar için ayrı bir filtre de yok. Resmi faturası olmayan bir alacağın fark edilmemesi vergi riski taşır. (dosya: `InvoicesListScreen.tsx:188` `noEFaturaOnly` koşulu)
- **[YÜKSEK] Personel maaşları veritabanında laboratuvardaki herkese açık okunur görünüyor.** Maaş, avans, gider ve bordro tablolarında yazma yetkisi `manage_finance` ile kısıtlanmış. Okuma politikası ise yalnız "aynı lab" şartı arıyor. Arayüz Finans'ı `view_financials` ile saklıyor ama `view_salaries` yetkisi hiçbir ekranda kullanılmıyor. Bir teknisyenin, API'yi kullanmayı bilirse, arkadaşının maaşını okuyabilmesi KVKK ve iç huzur açısından kabul edilemez. Ayrıca Giderler listesinde "Maaş ödemesi: <isim> · ay" satırları tutarıyla görünüyor; finans yetkisi olan her kullanıcı (ör. bir sekreter) herkesin maaşını görüyor. (dosya: `supabase/migrations/20260914270000_sec_fix_finance_role_boundary.sql:42` `rd := lab_id = get_my_lab_id()`, `core/store/permissionStore.ts` `view_salaries`; canlı politikayı doğrulamadım)
- **[YÜKSEK] Pencere genişliği değişince uygulama beyaz ekrana düşüyor.** Sayfa telefon genişliğinde açıkken pencere masaüstü genişliğine çıkınca kenar menüden bir öğeye (ör. Finans, Özet) tıklamak sayfayı boşaltıyor. Konsolda "Cannot read properties of undefined (reading 'find')" hatası çıkıyor. İki kez tekrarladım. Tablet çevirme, tarayıcı penceresini büyütme ve iPad bölünmüş ekran bu durumu üretir. Sayfa yenilenince düzeliyor ama formda yarım kalan iş gider. Finans'a özgü değil, gezinme kabuğunda. (dosya: muhtemelen `app/(lab)/_layout.tsx` / `app/(admin)/_layout.tsx` masaüstü `PatternsShell` ↔ mobil `Tabs` geçişi)
- **[ORTA] Fatura listesinde €0 faturalar ve taslaklar "GECİKMİŞ" görünüyor.** Gecikme kontrolü bakiyeye ve taslak durumuna bakmıyor. Canlıda 0 tutarlı birkaç fatura kırmızı "GECİKMİŞ" etiketliydi; tahsilatçı boşuna arar. (dosya: `InvoicesListScreen.tsx:642` `isOverdue`)
- **[ORTA] Klinik ayarındaki "Fatura Modu: Aylık Toplu" seçeneği hiçbir şeyi değiştirmiyor.** Teslimde otomatik taslak fatura bu ayara bakmadan her sipariş için ayrı açılıyor. Kullanıcı "aylık toplu" seçtiğini sanıp her teslimde fatura görünce şaşırır. (dosya: `trg_auto_draft_invoice_on_delivery`, `modules/clinics/screens/ClinicsScreen.tsx:2308`)
- **[ORTA] Giderlerde "Bu ay" filtresi uygulanınca üstteki toplam süzülüyor, kategori kutuları süzülmüyor.** Kutular son 6 ayı göstermeye devam ediyor. Canlıda bu ay personel gideri yokken başlık "en büyük kalem Personel" yazdı. Ekranın varsayılanı da "tüm zamanlar"; bu ayın giderini görmek için 4 tık gerekiyor. (dosya: `modules/expenses/api.ts` `fetchExpenseStats(monthsBack = 6)`, `ExpensesScreen.tsx:296,458`)
- **[ORTA] Fatura detayı adres çubuğunu değiştirmiyor.** Finans içinde açılan faturanın kendi bağlantısı olmuyor: muhasebeciye ya da ortağa "şu faturaya bak" diye link atamıyorum. Sayfa yenilenince liste geri geliyor, tarayıcının geri tuşu da faturadan değil ekrandan çıkarıyor. (dosya: `InvoicesListScreen.tsx:147-155` `openInvoiceId` state)
- **[ORTA] Ekstrede resmi e-fatura numarası yok, yalnız Siman'ın iç numarası (FTR-…) var.** Kliniğin muhasebecisi defterinde e-fatura numarasını görür; mutabakatta iki numarayı eşlemek gerekir. (dosya: `buildStatementHtml.ts` `refNo: l.invoiceNo`)
- **[ORTA] Çek/senet modülü yarım.**
  - Yalnız klinikten alınan çek tutuluyor; tedarikçiye verilen çek, ciro ve karşılıksız durumu yok.
  - Tahsilatta "Çek" seçildiğinde çek no, banka ve vade sorulmuyor; çek, çek listesine düşmüyor.
  - (dosya: `modules/checks/api.ts`, `ClinicReceiptModal.tsx`)
- **[ORTA] Alış faturası gideri ile tedarikçi borcu çelişkili görünüyor.** Gider listesinde aynı alış faturası "Havale" ödeme yöntemiyle duruyor, Tedarikçiler ekranında aynı firma hâlâ "borç" gösteriyor. Ödendi mi ödenmedi mi tek bakışta anlaşılmıyor. Canlıda aynı tedarikçi fatura numarasının aynı gün aynı tutarla iki kez gider olarak görünmesine de rastladım; mükerrer kayıt uyarısı yok. (ekran: Giderler + Tedarikçiler)
- **[ORTA] Finans ekranı "Karlılık" ile açılıyor; günlük bakılacak özet yok.** Sabah bilmek istediğim şeyler: bugün vadesi gelen, gecikmiş alacak, bu hafta ödenecek çek/tedarikçi, kasa. Bunları tek bir "Finans özeti" sayfasında görmüyorum, 4 ayrı sekmeyi dolaşıyorum. (dosya: `FinanceHubScreen.tsx:121` varsayılan `'profitability'`)
- **[ORTA] Fiyat listesinde yıllık zam ve toplu güncelleme yok.** "Tüm fiyatlara %15 zam" ya da Excel'den içe/dışa aktarma bulunmuyor; 29 hizmet ve klinik özel fiyatları tek tek düzenlenecek. "Özel Listeler" sekmesindeki klinik listesinde arama kutusu da yok; 60 klinikle aşağı kaydırarak aranır. (dosya: `modules/finance/screens/PriceListScreen.tsx`)
- **[ORTA] Koyu tema riski (koddan).** Fiyat listesi ekranında çok sayıda sabit beyaz arka plan var (kartlar, kategori ve PDF pencereleri). Kasa ekranında da sabit beyaz kartlar var. Koyu temada beyaz kutu içinde açık renk yazı riski taşıyor. Ekranda doğrulamadım. (dosya: `PriceListScreen.tsx` ~28 adet `backgroundColor: '#FFF…'`, `modules/cash/screens/CashScreen.tsx:55,63`)
- **[DÜŞÜK] Yazım ve büyük harf hataları.**
  - "Vadesi Gecen" ("Geçen" olmalı).
  - "KESILDI / ÖDENDI": Türkçe olmayan büyük harf çevirisi; "KESİLDİ / ÖDENDİ" olmalı, ama aynı listede "GECİKMİŞ" doğru yazılmış.
  - "ACIKLAMA / BIRIM FIYAT" (fatura kalemleri), "Orn:" ve "Tum Hizmetler" (fiyat listesi), "AKTİF POLICY" (prim motoru).
  - Aynı ekranda "Kar marjı" ile "Net kâr" yan yana.
  - (dosya: `InvoicesListScreen.tsx:700,755` `.toUpperCase()`)
- **[DÜŞÜK] Para gösterimi tutarsız.** Aynı Karlılık kartında "968 €" ve "€28" yan yana duruyor; Faturalar "€…" önde, Sağlık Kurumları "… €" sonda yazıyor.
- **[DÜŞÜK] Tablo başlıkları birbirine yapışıyor:** Giderler'de "TUTARİŞLEM", Kasa'da "BAKİYEİŞLEM".
- **[DÜŞÜK] Her satırda kırmızı çöp kutusu var** (gider, tedarikçi, fiyat listesi). Fiyat listesinde aktif/pasif anahtarı da satırın içinde. Gider silmede onay soruluyor, ama kalabalık listede yanlış tıklama riski var.
- **[DÜŞÜK] Prim motoru euro, maaşlar TL gösteriyor;** aynı personel için iki para birimi kafa karıştırıyor.

## Kullanım kolaylığı ve bulunabilirlik
Görev testi (masaüstü 1440 px, Özet ekranından başlayarak):

| Görev | Nerede buldum | Tık | İlk denemede? | Not |
|---|---|---|---|---|
| 1. Bir kliniğin güncel borcu | Finans → Sağlık Kurumları (Hesaplar başlığı altında) → arama | 2 + yazı | Hayır | İlk içgüdüm ana menüdeki "Sağlık Kurumları" oldu; orada para bilgisi yok, ekstreye bağlantı da yok. Aynı ad iki farklı yerde, iki farklı içerikle duruyor. |
| 2. Vadesi geçmiş alacaklar | Finans → Sağlık Kurumları (yaşlandırma + "Gecikmiş" sütunu) ya da Finans → Faturalar → "Vadesi Gecen" | 2–3 | Evet | Özet'teki "Bekleyen aksiyonlar" da birkaçını gösteriyor. €0 ve taslak faturalar da "gecikmiş" çıkıyor. |
| 3. Bu ayın cirosu | Finans → Rapor → "Bu Ay" (varsayılan "Son 12 Ay") | 3 | Kısmen | Faturalar ve Karlılık ekranında başka rakamlar var; hangisinin doğru olduğu yazmıyor. |
| 4. Bir faturanın e-fatura durumu | Finans → Faturalar → listede rozet; detayda adım çubuğu | 2 (detay 3) | Evet | Red/hata durumlarını süzen bir filtre yok. |
| 5. Taslak faturalar | Finans → Faturalar → "Taslak" | 3 | Evet | Üstteki özet kutuları filtreyle değişmiyor. |
| 6. Kliniğe gönderilecek ekstre | Finans → Sağlık Kurumları → klinik → Yazdır/PDF veya Excel | 3 | Evet | E-posta/WhatsApp ile gönder düğmesi yok, dosyayı indirip elle göndermek gerekiyor. Dönem filtresinde açılış bakiyesi 0 (KRİTİK). |
| 7. Bu ayki giderler | Finans → Giderler → Filtre → "Bu ay" | 4 | Hayır | Varsayılan görünüm "tüm zamanlar"; kategori kutuları filtreye uymuyor. |
| 8. Bir hizmetin fiyatı | Finans → Fiyat Listesi (en üstte) → "Hizmet ara" | 2 + yazı | Evet | Klinik özel fiyatı için Özel Listeler → klinik (aramasız liste). Mobilde "Fiyat Listesi" yalnız hamburger menüde. |
| 9. Tahsilat girme ekranı | Ekstrede "Tahsilat ekle" / Faturalar → "Toplu Tahsilat" / fatura detayı → "Tahsilat Ekle" | 3 | Evet | Form açılıp Vazgeç ile kapatıldı. Kasa/banka hesabı seçimi yok. "Toplu Tahsilat" ve "Excel'e Aktar" mobilde gizli. |
| 10. Kasada ne kadar para var | Finans → Kasa / Banka | 2 | **Bulamadım** | Hesap tanımlı değil ("Henüz hesap yok"). Tanımlansa da tahsilat ve gider buraya akmıyor. |
| 11. Ay sonu toplu e-fatura | Finans → Faturalar → "Toplu e-Fatura" | 3 | Evet | Düğmeye basmadım; akışı koddan okudum. |
| 12. Muhasebeciye ayın faturaları | Finans → Faturalar → Excel'e Aktar | 3 | Kısmen | Tarih filtresi yok; CSV'de para birimi, KDV ve e-fatura no yok. |
| 13. Gelen e-fatura → alış faturası | Finans → Giderler → "Gelen e-Fatura" | 3 | Evet | Luca'dan okuduğu için açmadım. |
| 14. Tedarikçiye borcum | Finans → Tedarikçiler | 2 | Evet | |
| 15. Bu ayki maaş durumu | Finans → Maaşlar | 2 | Kısmen | Kişi bazında "son ödeme ayı" var ama "Ekim maaşı ödenmedi" uyarısı yok. |

UX bulguları:
- **[ORTA] Finans menüsü kalabalık ama gruplanmış.** Dört başlık altında 15 sekme var; ad ve kısa açıklamaları lab dilinde. "Prim Motoru" ve "Personel Verim" adları yazılımcı dili gibi duruyor: "Prim Hesabı" ve "Teknisyen Verimi" daha anlaşılır olur. (ekran: Finans kenar menüsü)
- **[ORTA] Aynı ad, iki farklı ekran.** Ana menüdeki "Sağlık Kurumları" müşteri kartı, Finans'taki "Sağlık Kurumları" ise bakiye listesi. Müşteri kartından o kliniğin borcuna ya da ekstresine geçiş yok, geri gelip Finans'tan arıyorum.
- **[ORTA] Mobilde finans arka planda kalmış.** Telefonda Finans, "Tüm Menü → Sık kullanılmayan ekranlar" altında duruyor; lab sahibi için finans günlük iştir. Mobil Özet'te masaüstündeki "Finansal Özet" kartı yok. Finans içindeki sekme adları kesiliyor ("Kar…", "Fat…", "Gid…", "Sağlık K…").
- **[ORTA] Rakamların neye göre hesaplandığı yazmıyor.** "Gelir", "Bu ay", "Tahsilat (30G)", "Bu Ay Tahsilat" etiketlerinin hiçbiri "kesilen fatura mı, tahsilat mı, KDV dahil mi" bilgisini vermiyor; küçük bir bilgi ikonu yeter.
- **[DÜŞÜK] Boş ekranlar.** Bütçe ve Ödeme Onayları'nda ne yapacağımı söyleyen iyi boş-durum metinleri var. Kasa/Banka'da yalnız "Henüz hesap yok" yazıyor, neden hesap açmam gerektiği anlatılmıyor.
- **[DÜŞÜK] "Vadesi Geçenleri Hatırlat" toplu gönderimi** tarayıcının yerel onay penceresiyle soruluyor. Çevrilmiyor ve kaç kliniğe, hangi kanaldan gideceğini göstermiyor. Satırdaki "Hatırlat" ise önce bir pencere açıyor; o doğru. (dosya: `ClinicBalanceScreen.tsx:150-160`)
- **[DÜŞÜK] "N faturala" çipi tek tıkla toplu fatura oluşturuyor.** Onay sorulmuyor; fatura taslak olarak açıldığı için risk düşük. (dosya: `ClinicBalanceScreen.tsx:99-124`)

## Öneriler
- **[KRİTİK · küçük]** Lab tarafındaki ekstrede açılış bakiyesini, dönem başlangıcından önceki hareketlerden hesapla (klinik tarafındaki `finance-clinic/api.ts` mantığı zaten var). Kapanış = açılış + dönem hareketi olsun. PDF ve Excel aynı rakamı versin. — Ay sonu mutabakatı ve tahsilat tartışmalarını bitirir.
- **[YÜKSEK · orta]** Ciro, tahsilat ve alacak için tek tanım ve tek kaynak belirle: kesilen (taslak/iptal hariç, KDV hariç ve dahil ayrı), tahsil edilen (tahsilat fişi tarihine göre), alacak (taslak hariç). Özet, Faturalar, Rapor ve Karlılık bu kaynaktan okusun; her rakamın yanına "neye göre" ipucu ekle. — Ortağa, bankaya ve muhasebeciye aynı rakamı söylerim.
- **[YÜKSEK · orta]** Tahsilat ve gider kaydında "hangi kasa/banka hesabı" seçilsin, hareket kasaya otomatik düşsün. Tahsilatta "Çek" seçilince çek bilgisi sorulsun ve çek/senet listesine yazılsın. — "Kasada ne var" sorusu cevaplanır, çift giriş biter.
- **[YÜKSEK · küçük]** Fatura listesine tarih aralığı filtresi ekle. CSV/Excel'e para birimi, KDV matrahı, KDV tutarı, e-fatura no/ETTN ve klinik VKN sütunlarını ekle; gider dışa aktarımına da para birimi ekle. — Muhasebeciye ay sonu dosyası tek tıkta hazırlanır.
- **[YÜKSEK · küçük]** Karlılıkta dönemin maaş girişi yoksa "İşçilik girilmemiş, marj yanıltıcı" uyarısı göster. Toplu faturada geliri kalem bazında siparişlere dağıt. — Yanlış fiyat kararını önler.
- **[YÜKSEK · küçük]** Maaş, avans ve bordro tablolarında okuma için de yetki şartı (`view_salaries` / `manage_finance`) koy. Maaş sekmesini ve gider listesindeki maaş satırlarını bu yetkiye bağla. — KVKK riski ve ekip içi gerginlik kalkar.
- **[YÜKSEK · küçük]** e-Faturası iptal/red/hata olan iç faturalar için ayrı bir filtre ve Özet'te uyarı ekle ("Resmi faturası geçersiz alacak: N"). — Vergi riski taşıyan alacak gözden kaçmaz.
- **[YÜKSEK · orta]** Telefon ↔ masaüstü genişlik geçişindeki gezinme çökmesini düzelt; geçişte gezinme durumunu sıfırla ya da kabuğu yeniden kur. — Tablet kullanan ekip beyaz ekran görmez.
- **[ORTA · küçük]** Gecikme kontrolüne "bakiye > 0 ve durum taslak değil" şartını ekle.
- **[ORTA · orta]** "Aylık Toplu" fatura modunu otomatik taslak üretimine bağla (ay içinde tek açık taslağa kalem ekle) ya da bu ayarı kaldır.
- **[ORTA · orta]** Finans'a "Bugün" özet sekmesi ekle ve varsayılan yap: vadesi bugün gelen, gecikmiş, bu hafta ödenecek, kasa/banka bakiyesi, onay bekleyen ödeme bildirimi.
- **[ORTA · küçük]** Ana menüdeki müşteri kartına bakiye, gecikmiş tutar ve "Ekstre" bağlantısı ekle.
- **[ORTA · küçük]** Ekstreden "Kliniğe gönder" (e-posta/WhatsApp, PDF ekli) ve "Tüm kliniklere ay sonu ekstresi gönder" eylemi ekle; ekstreye e-fatura numarası sütunu koy.
- **[ORTA · küçük]** Fatura detayı kendi adresine sahip olsun (`/invoice/<id>`); hub içinde açılsa da URL güncellensin.
- **[ORTA · orta]** Fiyat listesine yüzde ile toplu zam (standart ve/veya özel listeler, geçerlilik tarihiyle) ve Excel içe/dışa aktarma ekle; Özel Listeler'e klinik araması koy.
- **[ORTA · küçük]** Giderlerde kategori kutularını aktif filtreye bağla; varsayılan dönemi "Bu ay" yap. Aynı tedarikçi ve fatura numarasıyla ikinci gider girilirken uyar.
- **[DÜŞÜK · küçük]** Yazım ve büyük harf düzeltmeleri (`toLocaleUpperCase('tr-TR')`), tek para gösterim biçimi, yapışık tablo başlıkları.

## Rakiplerde/sektörde gördüklerim
- **Muhasebe programına aktarım:** Lab yazılımlarında Logo/Mikro/Luca muhasebe fişi ya da en azından muhasebecinin istediği sütunlarda aylık fatura/tahsilat/gider dosyası standarttır. Burada yok.
- **Kredi limiti / risk blokajı:** Vadesi 60 günü geçen ya da limiti aşan klinikte yeni sipariş açılırken uyarı veya yönetici onayı istenir. Siman'da klinik için kredi limiti alanı bulamadım.
- **Dönem kilidi:** Muhasebeye verilmiş ayın faturaları ve tahsilatları kilitlenir, geriye dönük değişiklik yönetici onayıyla yapılır. Siman'da bulamadım.
- **Otomatik aylık ekstre ve mutabakat (BA/BS) formu:** Ay başında her kliniğe ekstre otomatik e-postayla gider, klinik "mutabıkız" diye onaylar. Siman'da ödeme hatırlatması var ama ekstre gönderimi ve mutabakat yok.
- **Banka hareketi eşleştirme:** Banka ekstresi (Excel/MT940) yüklenip tahsilatlarla eşleştirilir. Yok.

## Göremediklerim
- **Dil:** Arayüzü başka dile almadım (tercih değiştirmek yasak). Sözlükte finans etiketlerinin büyük çoğunluğu en/de/fa için var. Ama birleştirilmiş cümleler sözlükle eşleşmez ve büyük olasılıkla Türkçe kalır: "Toplam alacak …", "N kurum · M tanesinin vadesi geçmiş", "en büyük kalem …", "N faturala", "Toplu fatura — N sipariş". Toplu hatırlatmadaki tarayıcı onay metni de çevrilmez. Durum etiketleri `toUpperCase()` ile sözlükten sonra büyütüldüğü için hem Türkçe hem yabancı dilde garip görünebilir. Ekranda doğrulamadım.
- **Koyu tema:** Tema tercihine dokunmadım. Fiyat listesi ve kasa ekranındaki sabit beyaz arka planlar koddan çıkarıldı.
- **Bağlantılı belgeleri açmadım:** e-Fatura PDF, ekstre PDF, Gelen e-Fatura listesi, ödeme linki ve hatırlatma gönderimi Luca'ya ya da dış sistemlere dokunduğu için açılmadı; davranışları koddan okundu.
- **Veritabanı politikaları:** Maaş tablolarının okuma politikası, "Gelir KDV dahil" görünümü ve otomatik taslak faturanın fatura modunu yok sayması **migration dosyalarından** çıkarıldı. Canlı veritabanındaki güncel tanımlar farklı olabilir; doğrulanmalı.
- **Hatırlatma teslimi:** Hatırlatmaların e-posta/WhatsApp ile gerçekten gidip gitmediğini göremedim. Satırdaki hatırlatma penceresinin içindeki yorum "sonradan bağlanacak" diyor, veritabanı tarafında ise gönderim var.
- **Diğer panellerden görünüm:** Klinik panelinin finans ekranlarını (açık faturalar, ödeme bildirimi, ekstre) yalnız koddan inceledim.
- **Kapsam:** Bu hesap admin panelinde (`app/(admin)`). Lab panelindeki (`app/(lab)`) aynı finans ekranı aynı bileşeni kullanıyor; kenar menüdeki "Fiyat Listesi" kısayolu yerel kodda var, canlıda görünmüyordu.
- **Pencere genişliği çökmesi:** Tarayıcı panelinde görünüm boyutu değiştirilerek üretildi. Gerçek tablet çevirmede aynı şekilde oluştuğunu varsayıyorum, cihazda denemedim.
