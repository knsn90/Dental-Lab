# Sipariş ve Üretim — lab yöneticisi gözüyle

İnceleme: 24 Ekim 2026, siman.app canlı yönetici (admin) hesabı, masaüstü (1440 px) ve mobil (375 px) görünüm, yalnız okuma. Ekranda göremediğim roller (teknisyen istasyonu, tablet) ve akışlar koddan değerlendirildi; hangisinin koddan olduğu her maddede yazılı.

## Kısa hüküm

Sipariş detayı, 3D görüntüleyici, iş emri etiketi, üretim panosu ve "İşi beklet" mantığı benim lab'ımda bugün iş görür, bazıları rakiplerimden iyi. Ama sabah ilk baktığım üç şey zayıf. Siparişler listesinde teslim tarihi sütunu yok, "geciken" sayısı her ekranda farklı, prova takibi de hiç yok. Üretim verisi (kim yaptı, ne kadar sürdü) bu hesapta gerçeği yansıtmıyor, bu yüzden performans ve prim kararları bugün bu veriye dayanamaz.

## Artılar

- **Sipariş detayı tek ekranda toplanmış.** Hasta, hekim ve klinik, iş tablosu, diş şeması, dosyalar, hekim notu, mesaj kutusu, lojistik ve aşama listesi (aşama, atanan kişi, tarih) aynı sayfada. Telefonla soru gelince başka sayfaya gitmeden cevap verebiliyorum. (ekran: Siparişler → sipariş; `modules/orders/screens/OrderDetailScreenV2.tsx`)
- **3D görüntüleyici tarayıcıda, ek program kurmadan çalışıyor.** Üst çene, alt çene ve kapanış ayrı katmanlarda açılıyor. Mesafe ölçümü, kapanış analizi, yüzey dalgalanması, X-ray, gülüş fotoğrafı bindirme, kalem notu ve ekran görüntüsü var. Tasarımcının "tarama nerede, hangi dosya" diye dolaşması biter. (ekran: sipariş → Taramalar → "Tümünü 3D Aç"; `modules/viewer-3d/components/ViewerToolbar.tsx`)
- **İş emri etiketi doğru düşünülmüş.** A4/A5/A6 seçimi ve önizleme var. Etikette QR, alış/teslim tarihi, iş, renk, Palmer diş haçı ve hekim notu bulunuyor. Hasta adı yalnız baş harflerle basılıyor, bu da KVKK açısından iyi. (ekran: sipariş → yazıcı ikonu; `modules/orders/lib/workLabel.ts`)
- **Üretim panosu iyi bir başlangıç.** İşler istasyon sütunlarında duruyor. "Atanmamış" sütununda tek tıkla otomatik atama ve kırmızı gecikme vurgusu var, arama kutusu teknisyen adını da arıyor. (ekran: Üretim Panosu; `modules/station/screens/ProductionKanbanScreen.tsx`)
- **"İşi beklet" adil kurgulanmış.** Neden kategorisi seçiliyor. Bekleme müşteriden kaynaklıysa teslim tarihi bekleme kadar ötelenir ve lab haksız yere "gecikmiş" yazılmaz. (`modules/orders/holdApi.ts`)
- **Teknisyen istasyon ekranında doğru düğmeler var (koddan).** İşe Başla, Durdur, Makineye Ver (fırın süresini ayrı sayıyor), Devam Et ve Blokla düğmeleri, kontrol listesi, tasarım dosyası zorunluluğu ve "şu aşamayı bekliyorsun" ipucu bulunuyor. (`modules/orders/screens/OperatorScreen.tsx`, `modules/orders/components/WorkstationActionBar.tsx`)
- **Revizyon ile devam siparişi ayrı tutuluyor.** Yeniden yapım oranı lab kaynaklı ve hekim kaynaklı olarak ayrılıyor; bu ay %6,9 görünüyor. (ekran: Ekip → Performans)
- **Kâğıt ya da WhatsApp ile gelen sipariş için "Manuel" gelen kutusu var.** Kâğıt iş emri OCR ile okunup yeni siparişe ön doldurulabiliyor (koddan). (`modules/orders/components/ScanWorkOrderModal.tsx`)
- **Günlük gecikme özeti e-postası var (koddan).** Bekletilen işleri gecikenlerden ayrı sayıyor. (`supabase/migrations/20260722120000_daily_order_watch.sql`)
- **TV/duvar panosu uzaktan okunacak şekilde tasarlanmış.** Üretim hattı, "şu an çalışılıyor" bölümü ve "Dikkat" listesi var. (siman.app/tv)
- **Çeviri kapsamı iyi.** Bu alandan denediğim yaklaşık 30 metnin neredeyse hepsi en/de/fa sözlüklerinde mevcut.

## Eksiler

- [KRİTİK] **Prova takibi yok.** Metal prova, bisküvi prova gibi "klinikte provada" ya da "provadan döndü" durumları için ekran, filtre veya statü yok. "İşi beklet" kategorilerinde "Provada" da yok. Metal destekli ve porselen işlerde günün yarısı prova trafiği. Bunu izleyemezsem işler ya "geciken" görünür ya da gözden kaybolur. Kodda `provas` tablosu ve hazır bir `ProvaSection` bileşeni var ama hiçbir ekranda kullanılmıyor. Yalnız lab-müdür özetinde "bugünkü prova" sayısı çıkıyor; yönetici özetinde o da yok. (dosya: `modules/orders/components/ProvaSection.tsx`, `modules/provas/`, `modules/orders/holdApi.ts` HOLD_CATEGORIES)
- [YÜKSEK] **Siparişler listesinde teslim tarihi sütunu yok.** Ne masaüstünde ne mobilde var. Tablo "Oluşturma" tarihini gösteriyor. "Teslim Tarihi"ne göre sıralayınca sıra rastgele görünüyor, çünkü tarih ekranda yok. Teslim tarihi ancak durum rozetinin yanındaki (i) ikonuna tıklayınca açılan küçük pencerede görünüyor. Lab'da listeye bakmamın birinci sebebi teslim tarihi. (ekran: Siparişler; dosya: `modules/orders/screens/OrdersListScreenV2.tsx` sütun başlıkları ~1605-1620, `DesktopRow`)
- [YÜKSEK] **"Geciken" sayısı her ekranda farklı.** Özet 2, Siparişler 1, Üretim Panosu 2, TV 2 diyor. Günlük e-posta ise beklemedeki işleri saymıyor. Toplam sipariş de Özet'in üst kısmında 58, "Statü Dağılımı"nda 60. Nedenleri:
  - Pasife alınmış (arşiv) bir sipariş özete ve panoya giriyor ama listede gizli.
  - Duraklatılmış bir iş listede "Duraklatıldı" görünüyor. Aynı iş kanbanda "84g gecikti", TV'de "şu an çalışılıyor" ve "84 gün geç" görünüyor.
  - Bu sayılara güvenemem. (dosya: `app/(admin)/index.tsx` loadExtra ~1458-1503; `OrdersListScreenV2.tsx` filtered/overdueCount ~400-440; `modules/station/hooks/useKanbanData.ts`; `modules/tv/BoardScreen.tsx`)
- [YÜKSEK] **Pasife alınmış sipariş üretim panosunda duruyor.** "Atama bekliyor" sütununda "Otomatik ata" düğmesiyle görünüyor; biri yanlışlıkla ölü bir işi teknisyene atayabilir. (ekran: Üretim Panosu, Atanmamış sütunu; `v_active_orders_kanban` arşiv filtresi yok)
- [YÜKSEK] **Sipariş geçmişi siparişin içinde değil.** Kim, ne zaman, ne yaptı bilgisi için Ayarlar → Loglar → büyüteç → sipariş no yazmak gerekiyor. Arama tarayıcıda, son ~1000 kayıt içinde yapılıyor (ekranda "1000 KAYIT" yazıyor, kodda limit 2000). 25 kişilik lab'da bu bir-iki günlük kayıt eder; geçen ayki bir şikâyette cevap bulamam. Detayda `ActivityFeed` bileşeni tanımlı ama kullanılmıyor. (dosya: `OrderDetailScreenV2.tsx` ~3864; `modules/settings/sections/LogsSection.tsx` ~178-188)
- [YÜKSEK] **Aşamada yazan isim işi atanan kişi, yapan değil. Üretim verisi gerçeği yansıtmıyor.** Teslim edilmiş bir siparişin 9 aşamasının hepsini yönetici hesabı loglara göre yaklaşık 12 saniyede tamamlamış. Detayda ise o aşamaların yanında iki teknisyenin adı yazıyor. Ekip → Performans'ta tüm süreler "0 sa", skorlar yine 50-68 arası çıkıyor. Ya teknisyenler istasyon ekranını kullanmıyor ya da işler toplu kapatılıyor. Her iki durumda da prim ve performans kararı bu veriye dayanamaz. Uygulama bu durumu fark edip uyarmıyor. (ekran: Ayarlar → Loglar, Ekip → Performans)
- [YÜKSEK] **Teslim tarihi en erken 5 iş günü sonrası seçilebiliyor (acil değilse).** Kural panelden bağımsız ve sabit. Tamir, gece plağı, geçici kron gibi 1-2 günlük işlerde lab ya gerçek dışı bir tarih yazacak ya da işi "Acil" işaretleyecek. Acil ek ücreti tanımlıysa fiyat şişer ve "Acil" filtresi kirlenir. (ekran: Yeni sipariş → 3. adım Teslimat; dosya: `modules/orders/screens/NewOrderScreen.tsx` ~1677 ve ~4133)
- [YÜKSEK] **Üst bardaki "Ara..." kutusu hiçbir şey aramıyor.** Sipariş numarası yazıp Enter'a bastım, sonuç gelmedi; `onSearchSubmit` hiçbir panelde bağlanmamış. ⌘K paleti de yalnız menü sayfalarını buluyor, sipariş veya hasta aramıyor. Sipariş aramak için önce Siparişler'e gitmek gerekiyor. (dosya: `core/layout/PatternsShell.tsx` ~676-688, `core/ui/CommandPalette.tsx`)
- [YÜKSEK] **Teslim edilmiş siparişte yanlış düğmeler görünüyor.**
  - Masaüstünde "Hekim Onayına Gönder", "Aşama ekle" ve Kurye aşamasında "Kuryeye Gönder" duruyor. Elden teslim edilmiş işte kurye kaydı olmadığı için düğme çıkıyor; yanlış tıklanırsa mükerrer kurye ve masraf doğar.
  - Mobilde aynı iş "Kalan 4g" ve "Aşama 5/9" gösteriyor (masaüstünde 11/11). Yanında "Duraklat" (hiçbir şey yapmıyor, `onPause={undefined}`) ve "Aşama tamam" düğmeleri var.
  - (dosya: `modules/orders/components/StageWorkflowTimeline.tsx` ~398; `OrderDetailScreenV2.tsx` canSendDesignApproval ~688, ~1540; `OrderDetailMobileHandoff.tsx` ~498-523)
- [YÜKSEK] **Bugün ve yarın teslim edilecek işlerin listesi yok.**
  - Özet'teki "BUGÜN" rozeti bugün açılan sipariş sayısını gösteriyor, teslim edilecekleri değil.
  - "Bekleyen aksiyonlar" kartı 3 gün içindeki teslimlerden en fazla 2'sini listeliyor.
  - Gecikenleri yalnız son 8 siparişten aldığı için özetteki 2 geciken iş bu kartta hiç görünmüyor.
  - (dosya: `app/(admin)/index.tsx` ~1416-1425, ~1632-1660)
- [ORTA] **Mesajlar'ı ya da bir siparişi açmak mesajları "okundu" işaretliyor.** Masaüstünde Mesajlar açılır penceresi en son konuşmayı otomatik seçiyor; seçilen konuşmanın mesajları okundu işaretleniyor. Sipariş detayını açmak da, sohbet paneli hiç açılmasa bile, o işin mesajlarını okundu yapıyor. `read_at` kişiye özel değil, herkese ortak, ve hekime "okundu" olarak yansıyor. Müdür "bir bakayım" derken asıl ilgilenecek kişinin rozetini söndürür. (dosya: `modules/orders/components/MessagesPopup.tsx` ~2136; `modules/orders/hooks/useChatMessages.ts` markRead; `modules/orders/chatApi.ts` markMessagesAsRead)
- [ORTA] **Özet'teki kırmızı "GECİKEN" rozeti filtresiz listeye götürüyor.** Tıklayınca Siparişler açılıyor ama "Geciken" filtresi uygulanmamış oluyor. İlk denemede boş beyaz sayfa geldi; ikinci denemede liste açıldı. (dosya: `app/(admin)/index.tsx` ~1882)
- [ORTA] **Siparişlerin kanban görünümünde sorunlar var.**
  - Sekme ve filtreler uygulanmıyor (`visibleOrders` kullanılıyor).
  - Kartta hekim adı yerine yalnız "Dt." yazıyor; ünvan adın ilk kelimesi sayılmış.
  - "Başlat" düğmesi planlama yapılmamış işi doğrudan üretime itebilir.
  - (dosya: `modules/orders/components/KanbanBoard.tsx` ~214-302; `OrdersListScreenV2.tsx` ~927)
- [ORTA] **Bir teknisyenin işlerini bulmak zor.** Siparişler'de teknisyen filtresi ya da sütunu yok, Performans satırları tıklanmıyor. Tek yol Üretim Panosu araması; o da yalnız şu anki aşamayı gösteriyor, sıradaki atanmış işleri göstermiyor.
- [ORTA] **Üretimde görünen tek iş 84 gündür duraklatılmış ve Ekip'te aktif görünmeyen bir teknisyende duruyor.** Panoda ve TV'de "çalışılıyor" görünüyor, devir uyarısı yok. (ekran: Üretim Panosu ↔ Ekip)
- [ORTA] **Yeni siparişte hasta soyadı ve yaşı zorunlu.** Laba çoğu zaman yalnız ad ya da baş harf gelir; sonuç uydurma veri olur. (ekran: Yeni sipariş → 1. adım)
- [ORTA] **Malzeme tüketimi fiilen sıfır kaydediliyor.** Loglarda frezeleme aşamasının malzeme tüketimi "0 Adet" düşmüş. Ya tüketim adımı atlanıyor ya da varsayılan sıfır; her iki durumda da stok düşmüyor. (ekran: Ayarlar → Loglar)
- [ORTA] **TV panosunda hasta tam adı büyük puntoyla yazıyor.** Lab'a giren kurye, klinik çalışanı ya da ziyaretçi görür. Etikette baş harf kullanılırken TV'de tam ad kullanılması KVKK açısından tutarsız. (dosya: `modules/tv/BoardScreen.tsx`)
- [ORTA] **TV/canlı pano uygulamanın hiçbir yerinden açılmıyor.** siman.app/tv adresini bilmek gerekiyor.
- [ORTA] **Yazdırma yeri tahmin edilemiyor.** "Hızlı işlem · etiket" başlıklı kartta yazdır düğmesi yok. Yazdırma, sayfanın üstündeki küçük yazıcı ikonunda ve QR koduna tıklamada.
- [DÜŞÜK] **Türkçe ek hatası:** "Üretimde'a geç", "Final QC'a geç" yazıyor. Kalıp şablon metin olduğu için diğer dillere de çevrilemiyor. (dosya: `OrderDetailScreenV2.tsx` ~2120-2122)
- [DÜŞÜK] **"Fiziksel ölçü" etiketi sözlükte yok;** en/de/fa'da Türkçe kalıyor. (dosya: `OrderDetailScreenV2.tsx` ~1897)
- [DÜŞÜK] **Yönetici işlemlerinde yazılımcı jargonu var:** "Geri alınamaz · CASCADE". Ayrıca liste satırı menüsünde her satırda "Kalıcı sil" duruyor.
- [DÜŞÜK] **QR adresleri sorunlu.** Native uygulamada QR eski alan adına (dental-lab-steel.vercel.app) gidiyor. Web'de ekrandaki QR görseli üçüncü taraf bir servisten (api.qrserver.com) geliyor; servis yoksa ekranda QR görünmez. (dosya: `OrderDetailScreenV2.tsx` ~1081-1083, ~2006)
- [DÜŞÜK] **"Bugün" UTC'ye göre hesaplanıyor.** Gece 00:00-03:00 arasında Türkiye'de dünü "bugün" sayar. (dosya: `app/(admin)/index.tsx` L134, `OrdersListScreenV2.tsx` ~360)
- [DÜŞÜK] **Panonun başlığı yanıltıcı.** Üretim Panosu "4 iş üretimde" diyor; bunların 3'ü atanmamış, 1'i duraklatılmış.
- [DÜŞÜK] **Geçici teşhis kodu kalmış.** Sipariş listesinde her render'da log yazan kod duruyor. (dosya: `OrdersListScreenV2.tsx` ~362-395)

## Kullanım kolaylığı ve bulunabilirlik

Görev testi (Özet ekranından başlayarak, masaüstü):

| Görev | Nerede buldum | Tık | İlk denemede? | Not |
|---|---|---|---|---|
| 1. Yeni iş emri aç, adımlara bak, kaydetmeden çık | Sol menü "Yeni sipariş" (Özet'te "Başla" da var) | 1 | Evet | 4 adım: Klinik & hasta → Diş & protez → Vaka detayları → Özet & gönder. Boş "İleri"de alan bazlı kırmızı uyarılar çıktı. Veri girmeden ilerlenmediği için 2-4. adımları koddan inceledim. X ile soru sormadan çıktı. |
| 2. Geciken işleri bul | Özet'teki kırmızı "GECİKEN 2" → Siparişler → "Geciken" çipi | 3 | Kısmen | Rozet filtresiz liste açıyor (ilk denemede boş sayfa). Liste 1 iş gösteriyor; o da duraklatılmış bir iş. Özetteki 2. iş arşivde. |
| 3. Bugün/yarın teslim edilecekleri bul | Doğrudan yok. Özet → "Bekleyen aksiyonlar" (en fazla 2), Üretim Panosu kartlarında "3 gün" gibi kalan süre | 4+ | Hayır | "BUGÜN" rozeti yanılttı (bugün açılan sipariş sayısı). Listede teslim tarihi sütunu yok; sıralama var ama tarih görünmüyor. |
| 4. Siparişin hangi aşamada, hangi teknisyende olduğunu gör | Siparişler → sipariş → "Aşama detayları"nı aç; ya da Üretim Panosu sütunları | 3 | Evet | Listede aşama adı rozette var, teknisyen yok. Detaydaki isim atanan kişi, yapan değil. |
| 5. Prova bekleyen / provadan dönen işleri bul | Bulamadım | — | Hayır | Ekran, filtre, statü yok; "İşi beklet" nedenlerinde de yok. |
| 6. Bir teknisyenin elindeki işleri gör | Üretim Panosu → arama kutusuna teknisyen adı | 2 + yazma | Hayır | Önce Ekip → Performans'a gittim; orada satırlar tıklanmıyor. Siparişler'de teknisyen filtresi yok. |
| 7. Siparişin 3D taramasını/dosyalarını aç | Sipariş → sağ kolon "Taramalar" → "Tümünü 3D Aç" | 3 | Evet | 3 dosya ~15-20 sn'de açıldı. Araç çubuğu yalnız ikon (tooltip koddan var). |
| 8. İş emri etiketini yazdır | Sipariş → üstteki küçük yazıcı ikonu (ya da QR'a tıkla) → A4/A5/A6 önizleme | 3 | Kısmen | Önce "Hızlı işlem · etiket" kartına baktım; orada yazdır yok. "Yazdır"a basmadım. |
| 9. Siparişin geçmişini gör (kim, ne zaman) | Ayarlar → Loglar → büyüteç → sipariş no | 4 + yazma | Hayır | Siparişin içinde yok. Yalnız son ~1000 kayıtta arıyor. |
| Ek: Planlama bekleyen işler | Siparişler → "Planlama" sekmesi; Üretim Panosu "Atanmamış" sütunu | 2 | Evet | |
| Ek: Acil işler | Siparişler → "Acil" çipi | 2 | Evet | |
| Ek: Kâğıt/WhatsApp ile gelen sipariş | Siparişler → "Manuel" | 2 | Evet | İçini açmadım. |
| Ek: Duraklatılmış (bekletilen) işler | Ayrı filtre yok | — | Hayır | "Geciken" ya da "Üretim" içinde karışık. |
| Ek: Bir hekimin açık işleri | Siparişler → liste arama (hekim adı) | 2 + yazma | Evet | |
| Ek: Yeniden yapım oranı | Ekip → Performans | 2 | Hayır | "Ekip" altında olması tahmin edilmez. |

UX bulguları:

- [YÜKSEK] **En görünür arama kutusu (üst bar) ölü.** Kullanıcı ilk orayı dener, sonuç gelmeyince "sipariş yok" sanır. (ekran: tüm sayfalar)
- [YÜKSEK] **Aynı kavram ekrandan ekrana farklı anlam taşıyor.** "Geciken", "üretimde", toplam sipariş gibi sayılar her ekranda başka. Duraklatılmış iş bir yerde "Duraklatıldı", bir yerde "84 gün geç", bir yerde "çalışılıyor" görünüyor. (ekran: Özet, Siparişler, Üretim Panosu, TV)
- [ORTA] **İş bilgisi beklenmedik yerlere dağılmış.** Teslim tarihi küçük bir (i) penceresinde, geçmiş Ayarlar'da, yeniden yapım oranı Ekip'te, TV panosu hiçbir menüde yok.
- [ORTA] **Masaüstünde aşama listesi kapalı geliyor.** Siparişin en önemli bilgisi (hangi aşama, kimde) bir tık arkada.
- [ORTA] **Sipariş detayında "Bu vakayı özetleyeyim mi?" balonu her açılışta çıkıyor.** Sağ alttaki asistan simgesiyle üst üste biniyor; mobilde ayrıca "+" düğmesinin yanında duruyor.
- [DÜŞÜK] **Mobilde üst kısım çok yer kaplıyor.** Üretim Panosu'nun özet kartı ilk ekranın üçte ikisini kaplıyor, sütunlar sağa kaydırılıyor ve kart metinleri kesiliyor. Teknisyen ve müdür için telefonda zor. (ekran: Üretim Panosu, 375 px)
- **Boş durum ve uyarılar iyi.** "Bu vaka için henüz mesaj yok", "Önce bir diş seçin" gibi boş durum metinleri açık. Yeni siparişteki hatalar alanın altında ve düğmenin yanında çıkıyor.

Koyu tema (koddan): tema değiştirmedim. Sipariş listesi, sipariş detayı ve üretim panosu `dark:` sınıfları ve token kullanıyor; açıkça beyaz kalacak bir yüzey görmedim. Etiket önizlemesi bilinçli olarak beyaz; TV panosu hep koyu.

Diğer diller (koddan): denediğim metinlerin neredeyse hepsi sözlükte. Sızıntı olarak "Fiziksel ölçü" ve "…'a geç" kalıbını buldum.

## Öneriler

- [KRİTİK · orta] **Prova durumu ekle.** "Provada / provadan döndü" sipariş durumu ya da bekleme kategorisi olsun. Mevcut `ProvaSection`'ı sipariş detayına bağla ve Siparişler'e "Provada" filtresi koy; prova gönderim ve dönüş tarihi kaydedilsin. Kazanç: metal ve porselen işlerinin yarısı görünür olur, sahte "geciken" sayısı düşer.
- [YÜKSEK · küçük] **Siparişler tablosuna "Teslim" sütunu ekle.** Tarih ve "2 gün kaldı / 3 gün gecikti" bilgisi gösterilsin. Varsayılan sıralama aktif işlerde teslim tarihi olsun; mobil satırda da oluşturma tarihi yerine teslim tarihi yazsın. Kazanç: sabah listesi tek bakışta okunur.
- [YÜKSEK · küçük] **"Bugün teslim" ve "Yarın teslim" kısayolları ekle.** Siparişler'de çip olarak dursun; Özet'teki "BUGÜN" rozeti de gerçekten bugün teslim edilecekleri saysın ve filtreli listeye götürsün. "GECİKEN" rozeti de filtre uygulanmış listeye açılsın.
- [YÜKSEK · orta] **"Geciken" tanımını tek bir fonksiyonda topla.** Arşiv, iptal ve bekleme hariç tutulsun; Özet, liste, kanban, pano, TV ve e-posta aynı fonksiyonu kullansın. Arşivlenmiş işler panodan ve TV'den çıksın.
- [YÜKSEK · küçük] **Siparişin içine "Geçmiş" sekmesi ekle.** Sunucu tarafında sipariş ID'siyle filtrelensin; tanımlı ama kullanılmayan `ActivityFeed` bunun için kullanılabilir. Kazanç: şikâyette 10 saniyede cevap.
- [YÜKSEK · orta] **Aşamada "atanan" ve "tamamlayan" kişiyi ayrı göster.** Yönetici toplu kapattığında performans raporu bunu "teknisyen verisi değil" diye işaretlesin. Süre verisi yoksa skor gösterilmesin.
- [YÜKSEK · küçük] **5 iş günü kuralını lab ayarına ya da iş tipine bağla.** Lab ve yönetici panelinde serbest olsun, yalnız klinik ve hekim panelinde uygulansın.
- [YÜKSEK · küçük] **Üst bardaki aramayı bağla.** Sipariş no, hasta, hekim ve klinik arasın; ⌘K paletine de sipariş araması eklensin.
- [YÜKSEK · küçük] **Teslim edilmiş siparişte üretim ve kurye düğmelerini gizle.** Hekim onayı, aşama ekle, Kuryeye Gönder, mobil Duraklat ve Aşama tamam gizlensin; mobil "Kalan" sayacı teslimde durup "Teslim edildi: tarih" yazsın.
- [ORTA · küçük] **Sipariş detayı ve Mesajlar açıldığında otomatik "okundu" yapma.** Okundu yalnız sohbet gerçekten açılınca işaretlensin; okunma durumu kişi başına tutulsun.
- [ORTA · küçük] **Teknisyen görünümü ekle.** Siparişler'e "Teknisyen" filtresi gelsin, Performans satırına tıklayınca o kişinin aktif ve sıradaki işleri açılsın. Pasif kullanıcıda açık iş kalırsa uyarı verilsin.
- [ORTA · küçük] **Hasta soyadı ve yaşı opsiyonel olsun,** ya da "bilinmiyor" seçeneği eklensin.
- [ORTA · küçük] **TV panosunda hasta adını baş harfe çevir (KVKK).** Panoya Üretim Panosu'ndan "TV'de aç" bağlantısı ver.
- [ORTA · küçük] **Yazdırmayı görünür yap.** "Hızlı işlem · etiket" kartına "İş emrini yazdır" düğmesi koy; liste satırı menüsüne de "Etiket yazdır" ekle.
- [DÜŞÜK · küçük] **Küçük düzeltmeleri toplu yap.** "…'a geç" ek hatası düzeltilsin ("Üretime geç" gibi), "Fiziksel ölçü" sözlüğe eklensin, "CASCADE" kaldırılsın. Kanban kartında hekim adı ünvanı atlayarak gösterilsin; native QR alan adı ve UTC "bugün" hesabı düzeltilsin.

## Rakiplerde/sektörde gördüklerim

- **Teslim takvimi.** Günlük ya da haftalık "yarın çıkacak işler" listesi ve sabah bunun yazdırılabilir çıktısı alışık olduğum bir şey; burada yok.
- **"Klinikte / provada" (out to dentist, try-in) standart bir durum.** Prova randevu tarihi ve dönüş beklentisiyle birlikte tutulur.
- **İş kutusu ya da tepsi numarası ve barkod.** İstasyonda kutu okutularak aşama başlatılıp bitirilir; böylece "kim yaptı, ne kadar sürdü" verisi kendiliğinden doğru oluşur. Burada QR var ama istasyonda okutup başlat/bitir akışını göremedim.
- **İş tipine göre otomatik teslim tarihi önerisi.** Kron 5 gün, tamir 1 gün gibi; bayram ve tatil günleri de takvimde hesaba katılır.

## Göremediklerim

- Yeni sipariş sihirbazının 2-4. adımlarını (diş seçimi, iş detayı, dosyalar, özet) yalnız koddan inceledim. İleri geçmek için veri girmek gerekiyordu ve form taslağı tarayıcıya kaydediliyor; ortak tarayıcıda gerçek kullanıcıya "taslağınız var" sorusu çıkarmamak için veri girmedim.
- Teknisyen istasyon paneli, tablet kiosk ve mobil teknisyen akışını yalnız koddan inceledim.
- Planlama (Plan Önizleme & Onay), QC red, yeniden atama ve devam siparişi pencerelerini aksiyon içerdikleri için açmadım; koddan değerlendirdim.
- İmplant parçaları bölümünü canlı görmedim. İmplantlı işlerin mesajları vardı ve açmak mesajları okundu işaretlerdi.
- Koyu tema ve diğer dilleri arayüzden değiştirmedim; yalnız koddan ve sözlüklerden değerlendirdim.
- Bu lab'ın verisi küçük (58 sipariş, üretimde 1 iş). Yoğun bir günde pano ve listenin hızı bilinmiyor.
- Test sırasında bir kez "Mesajlar"ı açtım. Masaüstü penceresi en son konuşmayı otomatik seçti. Açmadan önce okunmamış mesaj rozeti 0'dı. Okundu işaretleme yalnız okunmamış mesajları güncellediği için verinin değişmemiş olması gerekir, yine de bildiriyorum.
- Loglarda test süresince hesapta "Klinik güncellendi" kayıtları gördüm. Benim işlemim değil; aynı hesabı kullanan başka biri ya da başka bir ajan olabilir.
