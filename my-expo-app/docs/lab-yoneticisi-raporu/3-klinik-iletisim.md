# Klinik İlişkileri ve İletişim — lab yöneticisi gözüyle

> İnceleme: 24 Ekim 2026. Canlı NexaDent admin hesabında yalnız okuma yapıldı (masaüstü 1440×900 + mobil 375×812). Klinik ve hekim panelleri koddan değerlendirildi. Rapor kişisel veri içermez.

## Kısa hüküm

Müşteri kartoteği, siteden kayıt ve onay akışı, sipariş içi sohbet ve bildirim tercihleri sağlam bir zemin. Kliniğin sipariş verme, takip etme ve borç ödeme tarafı da benim lab'ımda iş görür. Ama bir müşteriyle olan ilişkimin **tamamını tek yerde göremiyorum**. Kartta sipariş sayısı, bakiye, son sipariş ve yazışma yok. Üst çubuktaki arama kutusu çalışmıyor. Değerlendirmeler ve "en çok iş gönderen klinik" için bir ekran yok. İletişim de dört ayrı yere dağılmış durumda: sipariş sohbeti, Siman dışındaki WhatsApp, telefon talepleri ve destek. 60 klinikli bir lab'da bu, her gün "şu klinikle en son ne konuştuk, borcu ne kadar" sorusuna 4-5 ekran gezmek demek.

## Artılar

- **Siteden kayıt + onay akışı uçtan uca düşünülmüş.** Klinik kendini kaydediyor ve bağlantı kodunu giriyor. Bekleme ekranı 20 sn'de bir durumu yokluyor. Onaylanınca hesap açılıyor, kliniğe bildirim gidiyor. Onaylar ekranında Reddet için onay soruluyor, reddedilen kayıt geri alınabiliyor. (ekran: Onaylar → Hekim Kayıtları; dosya: `modules/approvals/PendingApprovalsScreen.tsx`, `modules/auth/screens/ApprovalWaitingScreen.tsx`)
- **Yeni kurum formu eksiksiz.** Kategori (muayenehane/klinik/poliklinik/hastane), ülke, Google'dan kurum adı arama, il/ilçe/mahalle zinciri, VKN/vergi dairesi, fatura modu (aylık toplu / her teslimat) ve vade günü aynı formda. Elle eklerken aynı isimde kurum için uyarı veriyor. (ekran: Sağlık Kurumları → Yeni Kurum Ekle; dosya: `modules/clinics/screens/ClinicsScreen.tsx` ClinicModal)
- **Klinik sipariş verirken kendi fiyatını görüyor.** Kliniğe özel fiyat ya da iskonto sihirbazda uygulanıyor, özet adımında tutar çıkıyor. "Fiyat ne olacak?" telefonu azalır. (dosya: `modules/orders/screens/NewOrderScreen.tsx` ~1490, `showPrices`)
- **Sipariş sihirbazı hatalı işi kapıda durduruyor.** İmplant markası zorunlu ("bilinmiyor" seçeneği de var). Dijital ölçümde STL/CAD dosyası zorunlu. Teslim tarihi hafta sonunu sayarak hesaplanıyor. Dosyasız tarama ya da markasız implant yüzünden kliniği geri arama sayısı düşer. (dosya: `NewOrderScreen.tsx` 1650-1715)
- **İşi beklemeye alma, sorumluyu ayırıyor.** "Eksik tarama / eksik parça / hekim onayı" gibi nedenler müşteri kaynaklı sayılıyor, teslim tarihi bekleme kadar öteleniyor ve hekime neden bildiriliyor. Lab haksız yere "geciken" görünmüyor. (dosya: `modules/orders/holdApi.ts`)
- **Klinik tarafında finans net.** Özet, cari ekstre, bekleyen faturalar ve ödemeler sekmeleri var. "Ödeme bildir" ile dekont bilgisi girilip lab onayına düşüyor. Girişte vadesi geçmiş borç penceresi ve "Kartla öde" düğmesi tahsilatı hızlandırır. (dosya: `modules/finance-clinic/`, `core/finance/PaymentReminderGate.tsx`)
- **Değerlendirme formu gerçek bir diş kalite kontrolü.** Marjinal uyum, oklüzyon, kontakt, estetik, yüzey ve zamanında teslim ayrı puanlanıyor. Ağız içi foto eklenebiliyor, lab yanıt yazabiliyor. Teslimde klinikten puan isteniyor. (dosya: `modules/reviews/`)
- **Bildirim tercihleri kategori × kanal bazında.** Uygulama içi, push, e-posta ve WhatsApp ayrı ayrı açılıp kapatılabiliyor. Varsayılanlar mantıklı: sohbet ve aşama değişikliği e-posta atmıyor. (dosya: `core/store/notificationPrefsStore.ts`)
- **Tek girişle birden çok lab.** Klinik aynı hesapla başka lab'larla da çalışabiliyor. Müşteriyi "tek lab'a kilitli" diye kaybetmem. (dosya: `modules/lab-connections/api.ts`)
- **Telefon talepleri ekranı sade.** Durum (Yeni/Arandı/Kapandı), not, görüşme dökümü ve "Geri ara" düğmesi var. Liste açılınca hiçbir şey otomatik değişmiyor. (ekran: Telefon Talepleri)
- **Kâğıtla çalışan klinik için boş iş emri formu.** "İş emri formu yazdır → kurum seç" ile kliniğe özel boş form basılabiliyor. (ekran: Sağlık Kurumları → Belgeler)

## Eksiler

- [YÜKSEK] **Klinik kartında iş ilişkisi yok.** Kartta yalnız telefon, e-posta, adres, hekimler, iskonto ve aktif anahtarı var. Bu ay kaç sipariş geldiği, açık sipariş, bakiye/geciken borç, son sipariş tarihi, ortalama puan ve yazışmalar yok. Karttan o kliniğin siparişlerine geçilemiyor. Sipariş listesi aramasında da klinik adı aranmıyor (yalnız no, hekim, hasta, iş tipi). Bir klinik "neden son iki aydır iş göndermiyoruz" diye aradığında cevap için Finans, Siparişler ve Mesajlar arasında gezmem gerekiyor. (ekran: Sağlık Kurumları; dosya: `ClinicsScreen.tsx`, `modules/orders/screens/OrdersListScreenV2.tsx` 402-405)
- [YÜKSEK] **Var olan müşteriyi platforma almanın temiz yolu yok.** (a) Davet ya da katılım koduyla gelen klinik için sunucu her seferinde **yeni** bir kurum kaydı açıyor. Lab'ın elindeki eski kayıtla (geçmiş siparişler, iskonto, özel fiyat, bakiye) eşleştirme yok, onay ekranında "bu kliniği şu kayıtla birleştir" seçeneği de yok. Sonuç çift kayıt ve bölünmüş cari. (b) Diğer yol "Yetkili Girişi": şifreyi lab belirliyor, kliniğe mail gitmiyor, ilk girişte şifre değiştirme zorunlu değil. Şifreyi telefonla söylemem gerekiyor; bu hem güvenlik hem KVKK açısından sorunlu. (dosya: `supabase/migrations/20261017193000_clinic_self_signup_flow.sql` `_clinic_connect` ~383, `ClinicsScreen.tsx` ~1937)
- [YÜKSEK] **Müşteri iletişimi dört yere dağılmış, tek zaman çizelgesi yok.** Sipariş sohbeti Mesajlar'da. WhatsApp yazışmaları, bot kapalıyken Siman'a hiç düşmüyor; ekran "WhatsApp Business uygulamanızdan cevaplayın" diyor. Telefon talepleri ayrı ekranda, destek talepleri de ayrı ekranda. Hiçbiri kliniğin kaydına bağlı değil: telefon ve WhatsApp kayıtları yalnız numara gösteriyor, numaranın hangi kliniğe ait olduğu söylenmiyor. Bir personel ayrılınca WhatsApp geçmişi de onun telefonunda kalıyor. (ekran: Mesajlar, WhatsApp Destek, Telefon Talepleri, Destek)
- [YÜKSEK] **Lab genelinde değerlendirme ekranı yok.** Puanlar yalnız tek tek sipariş detayında görünüyor. Teknisyen ortalaması Finans → Personel Verim'e gömülü. "Bu ay hangi klinik memnun değil", "düşük puanlı işler" ya da "yorumlar" listesi yok, düşük puan gelince lab'a uyarı gittiğine dair kod da bulamadım. Müşteriyi kaybettiren sinyali kaçırırım. (dosya: `modules/reviews/` yalnız `OrderDetailScreenV2` içinde kullanılıyor)
- [YÜKSEK] **"En çok iş gönderen klinikler" raporu yok.** Ana sayfada iş tipi ve statü dağılımı var, klinik sıralaması yok. En yakın şey Finans → Karlılık → "Doktor bazlı kârlılık": hekim bazında, ilk 5, kâra göre sıralı. Klinik bazında ciro ya da adet trendi ve "son 60 gündür iş göndermeyen müşteriler" uyarısı yok. (ekran: Özet, Finans → Karlılık)
- [ORTA] **Teslim tarihi kuralı katı ve herkese aynı.** Normal işte en erken 5 iş günü, acilde 1 iş günü. Kural kodun içine sabit yazılmış: iş tipine göre değişmiyor (gece plağı ile zirkonya köprü aynı), resmi tatilleri bilmiyor, lab ayarından değiştirilemiyor ve lab personeline de uygulanıyor. İki günde çıkan işi isteyen klinik ya "acil" işaretler (acil enflasyonu) ya da yanlış tarih girer. (dosya: `NewOrderScreen.tsx` ~1670, `core/util/businessDays.ts`)
- [ORTA] **Lab'ın banka bilgisi (IBAN) kliniğe hiçbir yerde gösterilmiyor.** Hatırlatma penceresi, cari ekstre ve fatura görünümünde lab IBAN'ı yok; labs tablosunda da alanı yok (kasa hesaplarında var). Havaleyle ödemek isteyen klinik IBAN'ı WhatsApp'tan soruyor, tahsilat gecikiyor. (dosya: `modules/invoices/buildStatementHtml.ts` holder bloğu, `core/finance/PaymentReminderModal.tsx`)
- [ORTA] **Destek talepleri sahipsiz kalabiliyor.** Listede 2 açık talep vardı; ikisi de yaklaşık 4 aylık, durumu hâlâ "Yeni" ve "SLA aşıldı" etiketi var. SLA aşılınca yöneticiye kaçırma ya da hatırlatma mekanizması görmedim. Kategoriler de karışık ("STL dosyası açılmıyor", "Yazılım hatası", "KVKK talebi" yan yana). Hangisine lab'ın, hangisine Siman'ın bakacağı belli değil. (ekran: Destek; dosya: `modules/support/types.ts`)
- [ORTA] **Sohbet mesajı kliniğe yalnız uygulama içinde ve push ile gidiyor.** Lab bir siparişte "scanbody gönderir misiniz?" diye sorduğunda, klinik uygulamayı açmazsa göremiyor. Varsayılanda e-posta ve WhatsApp kapalı, okunmayan soru için hatırlatma da yok. Üretim beklerken kimse fark etmiyor. (dosya: `notificationPrefsStore.ts` chat satırı)
- [ORTA] **Aktif/pasif anahtarları onaysız ve hata kontrolsüz.** Klinik ve hekim satırındaki anahtar tek tıkla kaydı pasife alıyor. Onay sorulmuyor, sunucu hata verse de ekranda anahtar değişmiş görünüyor (`{error}` kontrol edilmiyor). Yanlışlıkla pasife alınan hekim sipariş veremez, ben de fark etmem. (dosya: `ClinicsScreen.tsx` `handleToggleClinic` / `handleToggleDoctor` ~301, ~404)
- [ORTA] **Sipariş sihirbazında hasta kimliği fazla zorunlu.** Ad, soyad, yaş ve cinsiyet zorunlu. Lab için baş harfler ya da protokol no çoğu zaman yeter. Hem kliniği yavaşlatıyor hem KVKK'daki veri en aza indirme ilkesine ters. (dosya: `NewOrderScreen.tsx` 1653-1656)
- [DÜŞÜK] **Reddetme gerekçesiz.** Lab başvuruyu reddederken neden yazamıyor; klinik yalnız "Bu laboratuvar isteğini reddetti" görüyor. (dosya: `modules/lab-connections/api.ts` `labRejectClinic`)
- [DÜŞÜK] **Kategori sayıları gerçeği yansıtmıyor.** 0 muayenehane görünüyor ama "Diş Hekimi …" adlı tek hekimli kurumlar "Klinik" sayılmış. Kurum listesinde "Laboratuvar" kategorisi de var (lab'ın müşteri listesinde garip duruyor). (ekran: Sağlık Kurumları üst kutular)

## Kullanım kolaylığı ve bulunabilirlik

Görev testi (ana sayfadan başlayarak):

| Görev | Nerede buldum | Tık | İlk denemede? | Not |
|---|---|---|---|---|
| 1. Yeni klinik ekleme formu | Sağlık Kurumları → sağ panel "Yeni Kurum Ekle" | 2 | Evet | Form uzun ama düzenli. Mobilde liste üstündeki siyah "+" düğmesi. Açıp İptal ile kapattım. |
| 2. Onay bekleyen klinik/hekim başvuruları | Onaylar → Hekim Kayıtları (varsayılan sekme) | 1 | Evet | Sorun şu ki var olan bir hesabın "bağlanma isteği" ayrı bir yerde, Sağlık Kurumları → Bağlantılar → Bekleyen istekler'de duruyor. Aynı iş için iki gelen kutusu var. |
| 3. Bir hekimin telefonu | Sağlık Kurumları → Hekimler sekmesi (Telefon sütunu) ya da klinik satırını açınca | 2-3 | Hayır | Önce kliniği açtım. Üstteki "Ara..." kutusu hekim bulmuyor (aşağıya bakın). Mobilde numaraya dokunup aranamıyor. |
| 4. Bir klinikle yazışmalar (açmadan) | Mesajlar (kenar çubuğu) | 1 | Kısmen | Liste sipariş bazında: aynı klinik 8 ayrı satırda tekrar ediyor. Arama klinik adını aramıyor. Masaüstünde Mesajlar'a basınca **en yeni sohbet kendiliğinden açılıyor** (aşağıya bakın). |
| 5. Kliniklerin verdiği puanlar | **Bulamadım** | — | Hayır | Toplu ekran yok. Puan yalnız tek tek sipariş detayında ve Finans → Personel Verim'de teknisyen ortalaması olarak var. |
| 6. Telefonla gelen talepler | Telefon Talepleri (kenar çubuğu) | 1 | Evet | Bekleyen 3 talebin üçünde de isim ve talep yok, yalnız numara var. Numara kliniklerle eşleştirilmiyor. |
| 7. En çok iş gönderen klinikler | **Klinik bazında bulamadım.** En yakını: Finans → Karlılık → "Doktor bazlı kârlılık" | 2 | Hayır | Hekim bazında, ilk 5, kâra göre sıralı. Finans → Sağlık Kurumları bakiye listesi fatura sayısını gösteriyor ama ciro sıralaması değil. |
| 8. Davet/bağlantı kodu verme yeri | Sağlık Kurumları → sağ panel "Bağlantı davet kodu" ya da Bağlantılar sekmesi | 2 | Evet | Düğmeye basmak anında yeni kod üretiyor, bu yüzden basmadım. Kod yalnız kopyalanıyor; WhatsApp/e-posta/link ile gönderme yok. |

UX bulguları:

- [YÜKSEK] **Üst çubuktaki "Ara..." kutusu hiçbir şey yapmıyor.** Yazıp Enter'a bastım, sonuç gelmedi. Kodda bu kutuya bağlı bir işlev yok (`onSearchSubmit` hiçbir panelde verilmemiş). ⌘K paleti de yalnız sayfa adlarını arıyor; klinik, hekim ya da sipariş bulmuyor. Her ekranda en görünür yerde duran ama çalışmayan bir arama, kullanıcının yazılıma güvenini sarsar. (dosya: `core/layout/PatternsShell.tsx` ~684, `core/ui/CommandPalette.tsx`)
- [YÜKSEK] **Mesajlar'a tıklamak en yeni sohbeti açıp okundu işaretliyor.** Masaüstünde açılan pencere listedeki ilk sohbeti kendiliğinden seçiyor, sohbet de açıldığında gelen mesajları "okundu" yapıyor. Yönetici listeye göz atmak için açtığında, aslında teknisyenin ya da müdürün cevaplaması gereken yeni mesajın okunmamış rozeti sessizce kayboluyor. (dosya: `modules/orders/components/MessagesPopup.tsx` ~2136 otomatik seçim, ~898 otomatik okundu)
- [ORTA] **Bildirim zili sürekli "99+".** Bu kadar birikmiş bildirim, kimsenin zile bakmadığını gösteriyor; gerçekten önemli olan (yeni kayıt, ödeme bildirimi) kalabalıkta kayboluyor. Zil panelini açmadım, yalnız sayıyı gördüm.
- [ORTA] **Aynı ad iki farklı ekranda kullanılıyor.** Ana menüdeki "Sağlık Kurumları" müşteri listesi, Finans → Hesaplar altındaki "Sağlık Kurumları" ise bakiye listesi. İsimleri aynı, içerikleri farklı. Destek ile WhatsApp Destek de yan yana duran iki ayrı "destek".
- [ORTA] **Mobilde klinik listesi zor okunuyor.** Üstteki kategori kutuları ilk ekranın tamamını kaplıyor, liste ancak aşağı kaydırınca başlıyor. Satırda yazdır/düzenle/sil ikonları ve ok düğmesi genişliğin yarısını aldığı için klinik adları kesiliyor ("Diş Hekimi Engi…"); benzer adlı klinikler ayırt edilemiyor. Sağ alttaki asistan balonu satırdaki ok düğmesinin üstüne biniyor. Silme (çöp kutusu) ikonu kırmızı ve parmak altında. (ekran: Sağlık Kurumları, mobil)
- [ORTA] **Telefon numaralarına dokunup aranamıyor.** Klinik ve hekim ekranlarında `tel:`, WhatsApp ya da `mailto:` bağlantısı yok. Sahada telefonla çalışan yönetici numarayı elle çevirmek zorunda. (dosya: `ClinicsScreen.tsx`)
- [ORTA] **Koyu temada davet kodu okunmaz olabilir (koddan).** "Bağlantı gönder" penceresinde kod kutusunun zemini sabit açık gri (`#F8FAFC`). Koyu temada yazı rengi açık tona dönüyor, yani açık zemin üstünde açık yazı. Bağlantılar sekmesi de sabit beyaz kartlarla çizilmiş, koyu temada beyaz bir ada gibi duracak. (dosya: `ClinicsScreen.tsx` ~842, `modules/lab-connections/screens/LabConnectionsScreen.tsx`)
- [DÜŞÜK] **Değerlendirme formunda çevrilmemiş metin var.** "Marjinal Uyum", "Estetik / Renk" ve "Kenar uyumu / pasiflik" en/de/fa sözlüklerinde yok. Yabancı klinik bu satırları Türkçe görür. (dosya: `modules/reviews/constants.ts`, `core/i18n/locales/auto.*.json`)
- [DÜŞÜK] **Durum adları tutarsız.** Aynı aşama bir yerde "Final QC" (İngilizce), bir yerde "KK", bir yerde "Kalite Kontrol" olarak geçiyor. Klinik "Final QC"yi anlamayabilir. (dosya: `modules/orders/constants.ts`)
- [DÜŞÜK] **WhatsApp Destek ekranı çoğu zaman boş.** Bot kapalıyken gelen mesajlar oraya düşmüyor ama menü öğesi duruyor. Yönetici "neden boş?" diye düşünür. Uyarı kutusu durumu açıklıyor, yine de menüde yer kaplıyor.
- [DÜŞÜK] **Kenar çubuğundan bir kez boş sayfa açıldı.** İlk denemede "Sağlık Kurumları"na tıklayınca sayfa tamamen beyaz kaldı. Adresle açınca ve sonraki tıklamalarda düzgün çalıştı, tekrar üretemedim.

## Öneriler

- [YÜKSEK · orta] **Klinik kartına "müşteri özeti" ekleyin.** Bu ay / son 3 ay sipariş adedi ve ciro, açık sipariş, bakiye ve geciken tutar, son sipariş tarihi, ortalama puan, son 5 yazışma; altında "Siparişleri gör" ve "Ekstreyi gör" bağlantıları. Sipariş aramasına ve Mesajlar aramasına klinik adını ekleyin (iki satırlık düzeltme). Kazancı: müşteri telefonuna 10 saniyede cevap.
- [YÜKSEK · küçük] **Üst arama kutusunu çalıştırın ya da kaldırın.** En azından klinik, hekim ve sipariş no aransın, sonuç açılır listede çıksın. ⌘K paletine de aynı kayıt araması eklensin.
- [YÜKSEK · küçük] **Mesajlar penceresi açılınca sohbet otomatik seçilmesin.** Seçilen sohbet de yalnız kullanıcı tıklayınca okundu olsun.
- [YÜKSEK · orta] **Onay ve davette "mevcut kayıtla eşleştir" adımı ekleyin.** Onay ekranında telefon, e-posta ya da VKN'ye göre benzer kurumlar önerilsin; "Bu, şu kayıtlı müşterim" seçilince yeni kayıt açılmasın. Davet kodu da baştan belirli bir klinik kaydına bağlanarak üretilebilsin.
- [YÜKSEK · küçük] **"Yetkili Girişi"ni davet e-postasıyla değiştirin.** Lab yalnız e-postayı girsin, klinik kendi şifresini linkten belirlesin. Kopyalanabilen kodun yanına "WhatsApp ile gönder" düğmesi eklensin.
- [YÜKSEK · orta] **Değerlendirmeler ekranı açın.** Ortalama puan (boyut bazında), klinik bazında kırılım, düşük puanlı işler listesi ve yorumlar olsun; 3 ve altı puan gelince yöneticiye bildirim gitsin.
- [YÜKSEK · orta] **"Müşteri analizi" raporu ekleyin.** Klinik bazında adet ve ciro sıralaması, aydan aya değişim, "son X gündür iş göndermeyen müşteriler" listesi. Ana sayfaya "Bu ayın ilk 5 kliniği" kartı konsun.
- [ORTA · orta] **İletişimi kliniğe bağlayın.** Telefon talebi ve WhatsApp numarası kayıtlı klinik ya da hekim telefonuyla eşleşince adı gösterilsin, "Kliniğe ekle" ve "Siparişe dönüştür" düğmeleri olsun.
- [ORTA · küçük] **Teslim süresini lab ayarı yapın.** İş tipi bazında minimum gün (hizmet kartında) ve resmi tatil takvimi olsun; lab personeli bu sınırı aşabilsin.
- [ORTA · küçük] **Lab IBAN'ını gösterin.** Ayarlar'a banka hesabı alanı eklensin; fatura, ekstre ve ödeme hatırlatmasında görünsün.
- [ORTA · küçük] **Aktif/pasif anahtarına onay ve hata kontrolü ekleyin.** Sunucu hata verirse anahtar eski hâline dönsün ve uyarı çıksın.
- [ORTA · küçük] **Okunmayan sohbet sorusuna hatırlatma gönderin.** Lab'ın sorusu X saat okunmazsa kliniğe e-posta ya da WhatsApp gitsin.
- [ORTA · küçük] **Destek talebine sahip ve süre kuralı koyun.** SLA aşılınca yöneticiye bildirim gitsin; "lab'a" ve "Siman'a" giden talepler ayrılsın.
- [DÜŞÜK · küçük] Hasta kimliğinde baş harf ya da protokol no seçeneği, reddetme gerekçesi alanı, eksik çeviriler, tek durum adı ("Kalite Kontrol"), mobilde satır ikonlarını "•••" menüsüne toplama ve tıklayınca arama bağlantıları.

## Rakiplerde/sektörde gördüklerim

- Lab yazılımlarında müşteri kartı genelde bir "CRM sekmesi"dir: ciro grafiği, son siparişler, açık bakiye, notlar ve görüşme kayıtları tek sayfada durur.
- "Kayıp müşteri" uyarısı yaygın: normalde haftada 3 iş gönderen klinik 2 haftadır sessizse satış sorumlusuna görev düşer.
- İş tipine göre standart üretim süresi (ör. zirkonya 5 gün, gece plağı 2 gün) sipariş anında önerilen teslim tarihi olarak gelir.
- Fatura ve ekstrede banka bilgisi standarttır; çoğu yazılımda "ödeme linki" de ekstrenin içinde gider.

## Göremediklerim

- **Klinik ve hekim panellerine giriş yapmadım.** Sihirbaz adımları, finans ekranları, hatırlatma penceresi ve değerlendirme formu yalnız koddan değerlendirildi; ekranda nasıl göründüklerini doğrulamadım.
- **Sağlık Kurumları → Bağlantılar sekmesini açmadım.** Sekme açılırken `lab_get_or_create_public_code` çağrılıyor; lab'ın kodu yoksa yeni kod oluşturabilir. Ekran, yazma riski yüzünden yalnız koddan değerlendirildi.
- **Ödeme hatırlatmasının kime çıktığını göremedim.** `my_payment_reminder` RPC'si repoda yok (doğrudan veritabanında). Polikliniğe bağlı bir hekimin kliniğin borcunu görüp görmediğini doğrulayamadım.
- **Düşük puan bildirimi.** Repoda bulamadım; yalnız veritabanında tanımlı bir bildirim varsa göremedim.
- **Koyu tema ve diğer diller canlıda denenmedi** (tercih değiştirilmedi); bulgular koddandır.
- **Oturum sırasında başkasının yaptığı işlem:** Onaylar ekranında bekleyen bir hekim kaydı vardı. Birkaç dakika sonra "Onaylandı" olarak geçmişe düştü ve kurum listesi 24'ten 25'e çıktı. Bu onayı **ben yapmadım**; aynı hesabı kullanan başka biri yapmış olmalı.
- **Benim neden olabileceğim yan etki:** Mesajlar'a tıkladığımda en yeni sohbet kendiliğinden açıldı (yukarıdaki bulgu). O sırada kenar çubuğunda ve pencere başlığında okunmamış rozeti görünmüyordu, bu yüzden muhtemelen okunmamış bir mesaj etkilenmedi; yine de not ediyorum. Pencereyi kapatırken tarayıcı panoya yazma olayı bildirdi; panodaki içeriği kontrol edin.
