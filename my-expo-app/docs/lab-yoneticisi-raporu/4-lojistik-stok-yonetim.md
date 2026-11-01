# Lojistik, Stok ve Yönetim — lab yöneticisi gözüyle

Tarih: 24.10.2026 · Ortam: siman.app, admin hesabı, masaüstü (1440x900) + mobil (375x812). Hiçbir kayıt oluşturulmadı ya da değiştirilmedi. Kurye ve teknisyen panelleri koddan değerlendirildi.

## Kısa hüküm
Stok tarafı (otomatik tüketim, tükenme tahmini, FIFO, dürüst "eksik veri" uyarıları) rakiplerimden ileride, entegrasyonlar da tek ekranda derli toplu. Ama kuryede teslim kanıtı yok, kargo durumu elle sorgulanıyor, kayıtlar (log, kurye geçmişi) birkaç günlükle sınırlı ve uygulamada arama işe yaramıyor. Bugün 25 kişilik lab'ımda stok ve entegrasyon için kullanırım; kurye ve denetim (log) için yanına kâğıt/Excel koymam gerekir.

## Artılar
- **Otomatik malzeme tüketimi formülle düşüyor** — frezelemede "1 diş ÷ 33 kron/disk" gibi kuralla stoktan kesir düşülüyor ve Hareketler'de gerekçesiyle görünüyor. Teknisyene "kaç gram kullandın" sordurmadan stok tutmak her lab'ın hayali. (ekran: Stok ve Depo → Hareketler)
- **Stok ekranı kendi açığını söylüyor** — "17 kalemde minimum seviye yok, bu kalemler asla kritik görünmez" ve "127 aşamada malzeme kaydı girilmemiş" uyarıları ilk ekranda. Yanlış güven vermiyor. (ekran: Stok ve Depo → Dashboard → İşlem Bekleyenler)
- **Tükenme tahmini ve sipariş önerisi** — her ürün için "kaç gün kalır, hangi tarihte biter" ve haftalık tüketim grafiği; Kritik / FIFO önerisi alt sekmeleri. SKT'si yaklaşan lot uyarısı da var (koddan). (ekran: Stok ve Depo → Sipariş & Tahmin)
- **Kurye takibi tek ekranda** — kendi kuryem ile BanaBiKurye kuryesi aynı haritada; BanaBiKurye kuryesinin canlı konumu ~25 sn'de bir çekiliyor, zaman çizelgesi ve kurye adı/telefonu kartta. Arama kutusu sipariş no, kurye ve takip no ile arıyor. Mobilde alttan çekmece düzgün. (ekran: Kurye Takip; dosya: modules/courier/useExternalCourier.ts)
- **Kurye ücreti otomatik gidere düşüyor** — BanaBiKurye/Shipink ücretini ayrıca masraf girmeme gerek yok (koddan: trg_delivery_fee_expense).
- **Kargo etiketinde hasta bilgisi yok** — paket dışarıda dolaşırken KVKK riski yok. (dosya: modules/orders/lib/shipLabel.ts)
- **Entegrasyonlar tek sayfada** — e-Fatura (Luca), POS (iyzico), BanaBiKurye, Shipink, WhatsApp; her birinde AKTİF/PROD ve son test tarihi. (ekran: Ayarlar → Entegrasyonlar)
- **Yetki sistemi ayrıntılı** — 84 yetki, rol bazlı + kullanıcı bazlı istisna, "Kritik" etiketli yetkiler (ör. fiyat görme) ayrıca işaretli. (ekran: Ayarlar → Yetkiler)
- **Tedarikçi cari hesabı okunaklı** — alış, ödeme, fatura no, kalem sayısı, TL ödemenin € karşılığı aynı listede; Excel ve PDF çıkışı var. (ekran: Finans → Tedarikçiler → firma)
- **İzin hakkı yasal kıdem kuralıyla** — 14/20/26 gün otomatik (koddan: annual_leave_entitlement). Maaşlar yalnız "maaş görme" yetkisi olana görünüyor.
- **Yeniden yapım oranı lab/hekim kaynaklı ayrılıyor** — "hekim kaynaklı revizyonlar orana girmez" doğru yaklaşım. (ekran: Ekip → Performans)
- **Tablet kiosk girişi mantıklı** — tablet bir kez eşleşiyor, personel 6 haneli kodla giriyor, 10 dk hareketsizlikte kilitleniyor. (ekran: Ayarlar → Tabletler; dosya: app/kiosk/index.tsx)

## Eksiler
- [KRİTİK] **Tedarikçi alışında mükerrer fatura engeli yok** — bir tedarikçinin cari hareketlerinde aynı fatura numarası, aynı gün, aynı tutarla iki kez "Alış" olarak duruyor ve toplam borca giriyor. Sistem uyarmıyor; yalnız e-faturadan gelen kayıtlarda (ETTN) tekillik var. Ay sonu ödemesinde fazla para gönderirim. Gerçekten mükerrer mi, aynı numaralı iki ayrı fatura mı doğrulayamadım; ama uyarı olmaması başlı başına risk. (ekran: Finans → Tedarikçiler → firma → Cari hareketler; dosya: modules/purchases/api.ts, supabase/migrations/20261021180000_purchase_invoices_efatura_ettn.sql)
- [YÜKSEK] **Kuryede teslim kanıtı yok** — kurye teslimat detayındaki "Fotoğraf çek" ve "İmza al" düğmelerinin hiçbir işlevi yok (basınca bir şey olmuyor). Teslim alan kişinin adı da sorulmuyor. Klinik "bize gelmedi" dediğinde elimde yalnız "teslim edildi 09:32" var. (dosya: modules/courier/screens/CourierDeliveryDetailScreen.tsx, ActionBar bölümü, "yolda" durumu)
- [YÜKSEK] **Kuryenin "Tara" düğmesi yanlış ekrana gidiyor** — paket QR'ı okutup "Vakayı aç" denince sipariş kimliği teslimat kimliği yerine gönderiliyor; ekran "Teslimat bulunamadı" der (koddan). Kuryenin ortadaki en büyük düğmesi işe yaramıyor. (dosya: app/(courier)/_layout.tsx ScanB6Mobile onOpenOrder → modules/courier/screens/CourierDeliveryDetailScreen.tsx `.eq('id', id)`)
- [YÜKSEK] **Uygulamada arama çalışmıyor** — üstteki "Ara..." kutusuna yazıp Enter'a basınca hiçbir şey olmuyor (hiçbir panel bu kutuya iş bağlamamış). ⌘K paleti yalnız ana menü adlarını arıyor: "tedarik", "izin" → "Sonuç bulunamadı". Gömülü sayfaları (Tedarikçiler, İzin, Loglar, lab bilgileri) bulmanın tek yolu ezber. (dosya: core/layout/PatternsShell.tsx `onSearchSubmit`, core/ui/CommandPalette.tsx)
- [YÜKSEK] **Shipink kargo durumu kendiliğinden güncellenmiyor** — webhook ya da zamanlanmış sorgu yok; her kargo için sipariş detayına girip "Durumu Güncelle"ye basmak gerekiyor. Yurt dışı/şehir dışı 10 kargom varsa 10 kez. Kurye Takip haritasında kargo için konum/son durum metni yok. (dosya: supabase/functions/shipink-dispatch `check` yalnız elle; modules/orders/screens/OrderDetailScreenV2.tsx)
- [YÜKSEK] **Kurye geçmişi son 100 gönderiyle sınırlı, tarih filtresi yok** — günde 20-30 hareketi olan lab'da bu 4-5 gün eder; geçen ayki bir teslimatı ne listede ne aramada bulurum. İptal edilen gönderiler hiçbir sekmede görünmüyor. (ekran: Kurye Takip; dosya: modules/courier/CourierTrackingScreen.tsx `.limit(100)`)
- [YÜKSEK] **"Kim neyi değiştirdi" kaydı birkaç günlük** — Loglar ekranı son 1000 kaydı gösteriyor (kod 2000 istiyor, ekranda "1000 kayıt"), arama yalnız bu 1000 içinde. Tarih aralığı, kişi, eylem türü, sipariş/fatura bazlı filtre ve dışa aktarma yok. "Geçen ay bu siparişin fiyatını kim değiştirdi?" sorusunun cevabı yok; KVKK erişim kaydı açısından da zayıf. (ekran: Ayarlar → Loglar; dosya: modules/settings/sections/LogsSection.tsx)
- [YÜKSEK] **Stok rakamına güvenemiyorum** — "Kritik 0, Tükendi 0" ama 127 tamamlanmış aşamada tüketim yazılmamış ve 17 kalemde minimum yok. Bir reçine kaleminde ~894 kg (894.000 gr) stok görünüyor; 1 kg'lık şişe için makul olmayan miktara uyarı yok. Sonuç: frez diski bitti diye pazartesi sabahı öğrenebilirim. (ekran: Stok ve Depo → Ürünler / Dashboard)
- [YÜKSEK] **Kullanıcıyı pasife alma tek tık, onaysız** — Kullanıcılar listesindeki Aktif anahtarına yanlışlıkla dokunmak, o kişinin (klinik kullanıcısı ya da kurye dahil) oturumunu kapatıp hesabını kilitliyor. Silmede onay var, pasife almada yok. (ekran: Ayarlar → Kullanıcılar; dosya: modules/admin/users/LabUsersManagement.tsx `handleToggleActive`)
- [YÜKSEK] **Performans skoru yanıltıcı** — bu ay hiç işi olmayan kişilere 50-55 puan, 14 iş bitiren teknisyene 53 puan veriyor; eksik veri "50" sayılıyor. Prim ya da değerlendirme konuşmasında bu tabloyu açamam. Bir teknisyenin satırına tıklayıp hangi işleri yaptığını göremiyorum. Listede yönetici ve şirket hesabı da "teknisyen" sayılıyor. (ekran: Ekip → Performans; dosya: modules/performance/screens/PerformanceScreen.tsx ~235-245)
- [ORTA] **Malzeme talebi ile stok/alış kopuk** — talep "Teslim alındı" yapılınca stoğa giriş olmuyor, alış faturasını ayrıca Finans'tan girmem gerekiyor; çift iş ve unutma riski. Onay zinciri (teknisyen → müdür → admin) bir paket frez için ağır. (dosya: supabase/migrations/20260530180000_material_requests.sql `mark_request_received`)
- [ORTA] **Aynı ekranda farklı sayılar** — ana sayfada üstte "58 toplam sipariş", altta "Statü dağılımı 60"; ana sayfa "Geciken 2", Siparişler listesi "Geciken 1"; Ekip "5 aktif personel", İzin listesi 4 kişi, Performans "7 teknisyen". Hangisine inanacağımı bilemiyorum. (ekran: Özet, Siparişler, Ekip)
- [ORTA] **Mobil ana sayfa "BUGÜN 58 SİPARİŞ" diyor** — 58 tüm zamanların toplamı; cumartesi sabahı bugün sipariş yok. (dosya: modules/admin/components/AdminMobileDashboard.tsx, `kicker` live.total)
- [ORTA] **Kurye hastanın tam adını görüyor** — kuryenin işi için sipariş no + klinik yeter; hasta adı veri minimizasyonuna aykırı. (dosya: modules/courier/screens/CourierDeliveryDetailScreen.tsx ~413, ~523)
- [ORTA] **Onaylar dağınık** — tasarım/değişiklik onayı "Onaylar"da, izin "Ekip"te, avans "Finans"ta, malzeme talebi "Stok"ta. Ana sayfadaki "Bekleyen aksiyonlar" kartında izin, avans, malzeme talebi ve kurye işi yok.
- [ORTA] **Yıllık izin herkeste 0/0 gün** — işe giriş tarihi eksik mi, 1 yılı dolmadı mı, ekran söylemiyor. 18 yaş altı / 50 yaş üstü için 20 gün alt sınırı yok (koddan). Takvim görünümü yok; "önümüzdeki hafta kim izinde" sorusu zor. (ekran: Ekip → İzin & Devam; dosya: supabase/migrations/026_hr.sql)
- [ORTA] **Revizyon nedeni ile kaynak çelişiyor** — nedeni "Hekimin talebi" yazan bir revizyon "lab kaynaklı" sayılmış; yeniden yapım oranım şişiyor. (ekran: Ekip → Performans → Revizyonlar)
- [ORTA] **Personel ve kullanıcı iki ayrı dünya** — Ekip'te "Personel Ekle" ve "Hesap ile Ekle", Ayarlar'da "Yeni Kullanıcı": üç ayrı ekleme kapısı. Personel kartından yetkisine geçiş yok. Kullanıcılar listesinde klinik yöneticileri de "Yönetici" etiketiyle lab personelinin arasında duruyor. Yönetici, kullanıcının şifresini doğrudan yazabiliyor (sıfırlama bağlantısı yerine). (ekran: Ekip, Ayarlar → Kullanıcılar)
- [ORTA] **Ekran çökmesi** — pencere masaüstü/mobil sınırını geçtikten sonra menüden Kurye Takip'e tıklayınca sayfa bembeyaz kaldı; konsolda yönlendirme hatası (`getStateForAction ... reading 'find'`). Yenileyince düzeldi. Tableti yan çevirince yaşanabilir. (ekran: Özet → Kurye Takip)
- [DÜŞÜK] **Sayı biçimi** — Ürünler listesinde "1.025 adet" yazıyor (Türkçe okuyan bin yirmi beş anlar; aslında 1,025), dört haneli kesirler ("0.9875 Adet"). Sipariş & Tahmin'de aynı şey virgülle. "7G Çıkış 0,3602" adet ile gramı topluyor. (ekran: Stok ve Depo → Ürünler / Hareketler)
- [DÜŞÜK] **Dil hataları** — "Gunluk tuketim", "Haftalik Tuketim", "20 gun", "Azaliyor" (modules/stock/screens/StockScreen.tsx ~3295-3438); "Lab Yoneticisi", "Klinik Yoneticisi" (core/store/permissionStore.ts 318-321); "Rol bazli erisim yonetimi" (SettingsHubScreen alt yazısı). Yazılımcı dili: "Dashboard", "Stage Yetkileri", "Sidebar Markası", "tracking no".
- [DÜŞÜK] **Küçük ekran tutarsızlıkları** — Malzeme Talepleri boşken "Arama veya filtreyi temizleyin" diyor (filtre yok); Kurye Takip'te "Yolda" sekmesine geçince sağdaki kart eski teslim edilmiş gönderiyi göstermeye devam ediyor; "Tükenme tahmini 566 gün ortalama" anlamsız bir ortalama; lab adresinde ilçe/il iki kez yazılıyor ("…, Ataşehir, İstanbul, Ataşehir / İstanbul").

## Kullanım kolaylığı ve bulunabilirlik
Görev testi tablosu (masaüstü, ana sayfadan başlayarak):

| Görev | Nerede buldum | Tık | İlk denemede? | Not |
|---|---|---|---|---|
| 1. Bugün çıkacak / yoldaki kurye işleri | Kurye Takip → "Yolda" sekmesi | 2 | Kısmen | "Yolda" tüm aktif işleri (bekleyen + atanan + yolda) gösteriyor. "Bugün teslim edilmesi gereken ama kuryeye verilmemiş işler" listesi yok; tarih filtresi yok. Ana sayfada kurye kartı yok. En yakın: Siparişler → "Hazır" sekmesi. |
| 2. Bir gönderi şu an nerede | Kurye Takip → arama kutusu (sipariş no / kurye / takip no) → kart | 2 + yazma | Evet | BanaBiKurye ve kendi kurye için harita + zaman çizelgesi. Shipink kargoda konum yok; durum için sipariş detayına girip "Durumu Güncelle". Bugün aktif gönderi olmadığı için canlı konumu göremedim. |
| 3. Kritik stoklar | Stok ve Depo → Dashboard (Kritik / Tükendi) ya da Sipariş & Tahmin → Kritik | 1-2 | Evet | Kolay bulunuyor; ama eksik veri yüzünden "0" güvenilir değil. Kenar çubuğunda stok rozeti yalnız kritik varsa çıkıyor. |
| 4. Bir tedarikçiden son alışlar | Finans → Tedarikçiler → firma → Cari hareketler | 3 | Hayır | Önce Stok'a baktım, sonra ⌘K'da "tedarik" aradım (sonuç yok), Ayarlar'da da yok. Stokçu gözüyle tedarikçi Stok'ta olmalı. |
| 5. Personel izinleri | Ekip → İzin & Devam | 2 | Evet | Herkesin hakkı 0/0; takvim yok. |
| 6. Teknisyenin bu ayki performansı | Ekip → Performans (varsayılan "Bu Ay") | 2 | Evet | Satırdan detaya inilmiyor; Finans → Personel Verim ikinci bir yer. Skor yanıltıcı. |
| 7. Kullanıcı yetkisi nerede değişir | Ayarlar → Yetkiler (Rol bazlı / Kullanıcı bazlı) ya da Ayarlar → Kullanıcılar → kalem | 2-3 | Evet | Kullanıcı bazlıda önce rol seçmek zorunlu, isimle arama yok. Ekip'teki personel kartından bağlantı yok. |
| 8. Kurye/kargo ve e-fatura entegrasyonları | Ayarlar → Entegrasyonlar | 2 | Evet | Alt yazı "e-Fatura & POS ayarları" diyor ama kurye, kargo, WhatsApp da burada. |
| 9. "Kim neyi değiştirdi" | Ayarlar → Loglar | 2 | Evet | Son 1000 kayıt; tarih/eylem/varlık filtresi ve dışa aktarma yok. |
| 10. Lab bilgileri (unvan, vergi no, logo) | Ayarlar → Genel → Laboratuvar Kimliği | 2 | Hayır | "Genel"in alt yazısı "Dil, saat dilimi, format" ve HESAP (kişisel) grubunda. Önce Profil'e, sonra Finans Ayarları'na baktım. Bulununca eksiksiz: unvan, VKN, vergi dairesi, adres, iletişim, logo. |
| Ek: Fire bildirmek | Stok ve Depo → Ürünler → "Fire bildir" | 2 | Evet | Görünür yerde. |
| Ek: Malzeme talebini onaylamak | Stok ve Depo → Malzeme Talepleri | 2 | Evet | Akış boş, deneyemedim. |
| Ek: Tedarikçiye toplam borcum | Finans → Tedarikçiler (üst kart) | 2 | Hayır (aynı sebep) | TL ve € borç ayrı ayrı; iyi. |
| Ek: Yeni tablet (kiosk) eklemek | Ayarlar → Tabletler | 2 | Evet | Açıklama metni net. |
| Ek: Bu ayki kurye masrafı | Finans → Giderler (koddan) | — | Denemedim | Ücret otomatik gidere düşüyor; kurye/klinik bazlı özet rapor göremedim. |

UX bulguları:
- [YÜKSEK] Arama yok hükmünde — üst kutu ölü, ⌘K yalnız 14 menü adını biliyor. Alt sekmelerde yaşayan Tedarikçiler, İzin, Loglar, Lab bilgileri, Yetkiler'e ancak ezberle ulaşılıyor. (ekran: tüm paneller)
- [ORTA] Tedarikçi ve lab kimliği beklenmedik yerlerde: Tedarikçiler Finans'ta (Stok'ta değil), lab unvanı/vergi no "Genel" adlı kişisel ayar sayfasında. Kod yorumu Tedarikçiler'in Ayarlar'da olduğunu söylüyor ama orada yok. (dosya: app/(admin)/_layout.tsx 289, modules/settings/screens/SettingsHubScreen.tsx)
- [ORTA] Mobilde "Tüm Menü — Sık kullanılmayan ekranlar" başlığı altında Kurye Takip, Stok ve Finans var. Yöneticinin telefonda en sık baktığı ekranlar "sık kullanılmayan" diye saklanmış; Üretim Panosu mobil menüde hiç yok. (ekran: mobil → •••)
- [ORTA] Sayıların ekrandan ekrana tutmaması (58/60, geciken 2/1, personel 5/4/7) güveni bozuyor.
- [ORTA] Tehlikeli eylemler listede çıplak: kullanıcı satırında Aktif anahtarı (onaysız) ve kırmızı çöp kutusu yan yana.
- [DÜŞÜK] Kurye Takip'te iki sekme var (Yolda / Teslim Edildi); "Bekliyor", "İptal", "Bugün" ayrımı yok. Teslim Edildi sekmesi tek kayıt + "Daha fazla (52)" ile açılıyor.

### Kurye ve teknisyen telefondan gününü nasıl geçirir (koddan)
- **Kurye:** Uygulama "Bugün" ekranıyla açılıyor: sıradaki iş kartı, "Yol tarifi" (Google/Apple Maps, Waze, Yandex seçimi) ve tek dokunuşla "Aldım / Teslim Et". Konum arka planda gönderiliyor, alt menü Bugün · Liste · Harita · Profil, ortada "Tara". Takıldığı yerler: teslimde foto/imza/teslim alan yok (düğmeler ölü); "Tara" ile paket okutunca "Teslimat bulunamadı"; hasta adını görüyor; "Profil" sekmesi aslında istatistik ekranını açıyor.
- **Teknisyen:** Açılışta KPI'lı Özet ekranı geliyor, iş kuyruğu bir tık ötede (İşlerim). İşe Başla / Duraklat / Tamamla; malzeme tüketen istasyonda tamamlamada malzeme onay penceresi, tasarım aşamasında dosya yüklemeden tamamlanamıyor. Malzeme, avans ve izin talepleri "Talepler" menüsünde toplu. Tezgâhta çalışan biri için açılış ekranı doğrudan İşlerim olmalı.

## Öneriler
- [KRİTİK · küçük] Alış faturasında "aynı tedarikçi + aynı fatura no" kontrolü: veritabanında tekillik + formda "bu fatura daha önce girildi" uyarısı. — Fazla ödeme riskini kapatır.
- [YÜKSEK · orta] Teslim kanıtı: teslimde fotoğraf + teslim alan adı (+ isteğe bağlı imza) zorunlu/opsiyonel; klinik ve lab panelinde görünsün. — İtirazlarda kanıt, kurye disiplini.
- [YÜKSEK · küçük] Kurye taramasında okunan sipariş kimliğinden o siparişin aktif teslimatını bulup açmak. — Kuryenin ana düğmesi çalışır.
- [YÜKSEK · orta] Gerçek global arama: sipariş no, klinik, hekim, tedarikçi, ürün, personel ve ayar alt sayfaları (Tedarikçiler, İzin, Loglar, Lab bilgileri, Yetkiler); üst kutu ve ⌘K aynı motoru kullansın. — Gömülü özellikler bulunur hale gelir.
- [YÜKSEK · orta] Shipink takibini zamanlanmış görevle (ör. 2 saatte bir) ya da webhook ile güncellemek; Kurye Takip'te kargo satırında son durum metni. — Kargoları tek tek açmaktan kurtarır.
- [YÜKSEK · orta] Kurye Takip'e tarih aralığı, "Bugün" sekmesi, "kuryeye verilmeyi bekleyen hazır işler" bölümü, iptaller ve sayfalama; günlük kurye çıkış listesi yazdırma. — Sabah planlaması tek ekrandan yapılır.
- [YÜKSEK · orta] Loglar: sunucu tarafı sayfalama, tarih/kişi/eylem/varlık filtresi, CSV çıkışı; sipariş ve fatura detayında "bu kaydın geçmişi". — Denetim ve KVKK.
- [YÜKSEK · küçük] Aktif/Pasif anahtarına onay penceresi ("X pasife alınacak, oturumu kapanacak"). — Yanlışlıkla kilitlemeyi önler.
- [YÜKSEK · küçük] Performans skorunda veri yoksa "—" göstermek, en az N iş şartı, yalnız üretim personelini listelemek, satırdan teknisyenin işlerine inmek. — Prim konuşmasında kullanılabilir hale gelir.
- [ORTA · küçük] Malzeme talebinde "Teslim alındı" → alış formunu ürün/miktar/tedarikçi önceden dolu açsın. — Tek adımda stok girişi.
- [ORTA · küçük] Ayarlar'da ORGANİZASYON altına "Laboratuvar" (kimlik, fatura bilgileri, logo) bölümü; Stok'a "Tedarikçiler" kısayolu; Entegrasyonlar alt yazısını düzeltmek. — Bulunabilirlik.
- [ORTA · küçük] Toplam, geciken ve personel sayılarını tek kaynaktan hesaplamak; mobil "Bugün 58 sipariş" etiketini düzeltmek. — Güven.
- [ORTA · küçük] Kurye ekranlarında hasta adını gizlemek (ya da baş harfler). — KVKK veri minimizasyonu.
- [ORTA · orta] Tek "Onay kutusu": izin, avans, malzeme talebi, tasarım/değişiklik onayları; ana sayfa "Bekleyen aksiyonlar"a da eklensin. — Sabah tek yerden onay.
- [ORTA · küçük] Stokta makul olmayan miktar uyarısı (ambalajın 10 katı gibi), yerel ondalık biçimi, farklı birimleri toplayan kartları kaldırmak. — Veri temizliği.
- [ORTA · orta] İzin takvimi (ay görünümü) ve neden 0 gün olduğunu söyleyen açıklama; yaş kuralı. — Planlama.
- [DÜŞÜK · küçük] ASCII Türkçe ve İngilizce kalan metinleri düzeltmek (yukarıdaki liste). — Profesyonel görünüm, çeviri sözlüğünün eşleşmesi.
- [DÜŞÜK · küçük] Teknisyen açılış ekranını İşlerim yapmak; kuryede "Profil" sekmesinin adını düzeltmek.

## Rakiplerde/sektörde gördüklerim
- Günlük kurye çıkış listesi (manifest) ve çok duraklı tur planı: sabah "hangi kurye hangi klinikleri hangi sırayla" tek kâğıtta.
- Teslimde imza + fotoğraf + teslim alan adı; klinik tarafında görünür.
- Kurye/kargo ücretini kliniğe yansıtma (faturaya satır olarak) seçeneği; burada ücret hep lab gideri.
- Minimum seviyenin altına düşen ürünlerden tek tıkla tedarikçiye satın alma siparişi (e-posta/WhatsApp ile); burada "sipariş verildi" yalnız durum işareti.
- Vaka bazlı malzeme lot izlenebilirliği ve vaka başına uygunluk beyanı (yurt dışı/AB müşterileri bunu istiyor).
- İzin/vardiya takvimi ve devam-devamsızlık raporunun bordroya aktarılması.

## Göremediklerim
- Kurye ve teknisyen panellerine giriş yapamadım; o bölümler tamamen koddan.
- Değerlendirme anında yolda gönderi yoktu ("Yolda 0"); canlı konum takibini çalışırken göremedim.
- Mükerrer görünen alış faturasının gerçekten mükerrer mi, aynı numaralı iki ayrı fatura mı olduğunu doğrulayamadım.
- Kurye "Tara" hatası ve ölü foto/imza düğmeleri koddan; cihazda denemedim. Kurye panelinin sipariş tablosunu okuma yetkisi (RLS) varsa bile yönlendirme yanlış.
- Koyu tema ve diğer diller: tercihleri değiştirmedim. Koddan: Entegrasyonlar ekranı sabit beyaz kart ve sabit açık renk yazı kullanıyor, koyu temada beyaz kutular kalması muhtemel; kiosk ekranı her zaman açık renk. Çeviri sözlüğü baktığım metinlerin çoğunu kapsıyor; "Gunluk tuketim:", "X gun", "Kar katkısı" gibi birkaç metin ve sayı ile birleşik metinler Türkçe kalır.
- Malzeme talepleri ve izin talepleri akışı boş olduğu için uçtan uca deneyemedim.
- Lot → hasta izlenebilirliği olup olmadığını koddan netleştiremedim (FIFO katmanları ve SKT uyarısı var).
- Kurye Takip'teki beyaz ekran çökmesini bir kez yaşadım; yenileyince tekrarlamadı.
