# Değerlendirmeler ekranı ve düşük puan takibi — tasarım

**Tarih:** 2026-11-04 · **Yol haritası:** 3. dalga, madde 2 ("Değerlendirmeler ekranı: ortalama, klinik kırılımı, düşük puan uyarısı") · **Ön koşul:** WhatsApp puan isteği (`docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md`; DB + web canlı, Meta şablon onayı bekliyor) · **Durum:** onaylandı 2026-11-04; metinler §14 (onaylı); plan `docs/superpowers/plans/2026-11-04-degerlendirmeler-ekrani.md` · **Uygulama (2026-11-04):** DB + web hazır; WhatsApp şablonları (`dusuk_puan_lab`, `dusuk_puan_hatirlatma`) Meta onayı bekliyor; `send-whatsapp-meta` edge yayını onaydan sonra. Ekran, Sağlık Kurumları'nın sol menüsünde Takip › Değerlendirmeler bölümü (kullanıcı isteğiyle sekmeler sol menüye taşındı; mobilde üç sekme + tüm menü penceresi).

Görsel taslaklar (brainstorm oturumu, git dışı): `.superpowers/brainstorm/31429-1793788500/content/degerlendirmeler-v5.html` (ekran) ve `takip-v2.html` (arama takibi + işaretleme penceresi). Belge ile taslak çelişirse belge geçerlidir.

---

## 1. Neden

Bugün düşük bir puanı görmek için o siparişin sayfasını açmak gerekiyor. Puanları bir arada gösteren bir pencere yok. Uygulamadan verilen puanlarda lab'a hiç haber de gitmiyor; hekim 1 puan verse kimse duymuyor. (WhatsApp'tan gelen "Sorun var" cevabı için haber tasarlandı, Meta onayını bekliyor.)

Lab yöneticisi düşük puan gördüğünde **kliniği arayıp sorunu konuşuyor**. Ayrıca **ayda bir** "hangi kliniğin puanı düşüyor" diye bakmak istiyor. Bu iş üç şey kuruyor:

1. Düşük puan, puan kaydedildiği anda yöneticiyi bulur (uygulama içi + WhatsApp).
2. Yönetici kliniği aradığını işaretler ve not düşer. 2 gün aranmayan düşük puan için hatırlatma gider.
3. Aylık bakış ekranı: ortalama, klinik başına 6 aylık seyir, düşük puanlar listesi.

Canlı durum (2026-11-04): tek lab'da 6 değerlendirme var, hepsi uygulamadan, hepsi 5 puan. WhatsApp puan isteği açılınca hacim artacak. Ekran az veriyle de anlamlı görünmeli (bkz. §6.5).

## 2. Kim kullanır

**Yalnız lab yöneticileri:** `profiles.user_type = 'admin'` ya da `user_type = 'lab' AND role = 'manager'`, aynı lab, `is_active` doğru. Bu, puan isteğindeki `_review_alert_lab` ve `get_/set_review_wa_settings` ile **aynı tanımdır** (`user_type='admin'` kullanıcılar Yönetim paneline düşer; ekran orada da bulunur, bkz. §7); ekran, uyarılar, hatırlatmalar ve arama notları bu kümeye açıktır. Başka rol (teknisyen, kurye, muhasebe vb.) ekranı görmez, uyarı almaz, notları okuyamaz.

Siparişin kendi sayfasındaki değerlendirme bölümü bugün kim görüyorsa öyle kalır (bugün: lab çalışanları; teknisyen yalnız görebildiği işlerde). Buna dokunulmaz.

## 3. Hedefler

- Düşük puanın hiçbiri gözden kaçmaz: kaydedildiği anda yöneticilere haber gider.
- Her düşük puanın "arandı mı" durumu tek bakışta görülür; aranmayan 2 gün sonra hatırlatılır.
- Ayda bir açılan ekranda, puanı düşen klinik en üstte görünür.

## 4. Hedef dışı ve anti-hedefler

**Hedef dışı (bu işte yapılmaz):**
- Teknisyen ya da hekim kırılımı. Ekran klinik düzeyinde kalır. Hekim adı yalnız düşük puan satırında bilgi olarak görünür.
- Kliniğe görünen "lab yanıtı" (`order_reviews.lab_reply`) ile ilgili değişiklik. O alan aynen kalır. Arama notu ondan ayrı ve iç kullanım içindir.
- Siparişin sayfasındaki değerlendirme bölümünde değişiklik (arama durumu oraya taşınmaz).
- Excel/PDF dışa aktarma, e-posta özeti.
- Türkçe dışında WhatsApp şablonu (yöneticiler Türkçe kullanıyor; mevcut lab şablonu da yalnız `tr`).
- Puan isteğinin kendisinde (gönderim zamanı, düğmeler, hekime giden metinler) değişiklik. Tek istisna §5.4'teki uyarı birleştirmesi.

**Anti-hedefler (çalışsa bile başarısızlık sayılır):**
- Aynı düşük puan için iki ayrı uyarı gitmesi (örn. WhatsApp "Sorun var" için hem eski hem yeni uyarı).
- Arama notunun kliniğe ya da hekime görünmesi.
- Hatırlatmaların spam'e dönüşmesi (her 2 günde bir tekrar, ya da arandıktan sonra gelmesi).
- Yönetici olmayan birinin uyarı alması ya da ekranı/notları görmesi.
- WhatsApp'a ya da bildirim gövdesine hasta adı yazılması.
- Koyu temada okunmayan yüzey, Farsça/İngilizce/Almanca'da Türkçe kalan metin.

## 5. Düşük puan ve uyarı

### 5.1 Tanım

Bir değerlendirme **düşüktür** eğer `overall ≤ 3` **ya da** alt puanlardan (`fit`, `occlusion`, `contacts`, `esthetics`, `surface`, `on_time`) boş olmayan herhangi biri `≤ 3` ise.

Kaynaktan bağımsızdır: uygulamadan verilen (klinik/hekim) ve WhatsApp düğmesinden gelen puanlar aynı kurala tabidir. WhatsApp düğmeleri: Sorunsuz = 5 (düşük değil), Küçük düzeltme = 3 (**düşük**), Sorun var = 1 (**düşük**).

**Uç durum — uygulama puanı varken gelen WhatsApp cevabı:** puan isteği, işe zaten değerlendirme varsa gönderilmiyor; ama istek gittikten sonra uygulamadan puan verilip ardından WhatsApp'ta "Küçük düzeltme"/"Sorun var"a basılabilir. `review_wa_record_answer` bu durumda uygulama değerlendirmesini ezmiyor (bu kural korunur). Yine de bu cevap **düşük sinyal sayılır**: uyarı gider ve iş "Düşük puanlar" listesinde görünür; satırda WhatsApp cevabı ve uygulama puanı birlikte gösterilir. Yani bir iş, değerlendirmesi düşükse **ya da** WhatsApp cevabı düşükse düşüktür. (Benim kararım: "hiçbir düşük puan gözden kaçmaz" hedefi.)

### 5.2 Ne zaman uyarı gider

- Yeni bir değerlendirme düşük olarak kaydedildiğinde.
- Var olan bir değerlendirme güncellenip **kötüleştiğinde**: düşük değilken düşük olursa ya da düşükken en düşük puanı daha da düşerse. İyileşen güncelleme uyarı göndermez. (Puan isteğindeki "yalnız kötüleşirse tekrar haber" kuralıyla aynı.)
- Uyarı anlıktır (puan kaydının hemen ardından).

### 5.3 Kime, hangi kanaldan

- **Alıcılar:** §2'deki lab yöneticileri (değerlendirmenin `lab_id`'si).
- **Uygulama içi bildirim:** her zaman; zil bildirimine ek olarak telefon/web anlık bildirimi (push) de gider, yönetici uygulamayı açmadan duysun diye. (Benim kararım: "hemen" isteği; telefonda yalnız zil bildirimi anında ulaşmaz.) Bugün `_notify_channels` e-posta + push + web push'u birlikte gönderiyor; "push var, e-posta yok" için yeni yardımcı ya da parametre gerekir (kurucuya kalır).
- **WhatsApp:** yeni lab şablonu `dusuk_puan_lab` (§9) ile. Şablon Meta'da onaylanana kadar WhatsApp gitmez; yalnız uygulama içi gider. Mevcut kanal tercihlerine (bildirim tercihleri, opt-out) uyulur.
- **E-posta:** yalnız bugün e-posta alan durumda kalır: WhatsApp "Sorun var" (`review_problem`) bugün tüm kanallardan (e-posta dahil) gidiyor, bu korunur. Diğer düşük puanlara e-posta eklenmez. (Benim kararım: lab bildirim kuralı "mail yalnız aksiyon/özet"; tek uyarıda e-posta zaten Sorun var'da var.)

### 5.4 Mevcut WhatsApp uyarısıyla birleşme

Bugün `_review_alert_lab` (migration `20261103130000`) WhatsApp cevabında "Sorun var" için `review_problem` (tüm kanallar, şablon `is_sorunu_lab`), "Küçük düzeltme" için `review_minor` (yalnız uygulama içi) yazıyor. Yeni uyarı tüm düşük puanları kapsadığı için:

- Bir düşük puan olayı için **tek** uyarı gider. WhatsApp kaynaklı düşük puanlar da yeni uyarı yolundan geçer; eski `review_problem`/`review_minor` yazımı ile yeni uyarı aynı olay için ikisi birden çalışmaz.
- "Küçük düzeltme" artık WhatsApp da alır (eşik 3 ve altı olduğu için; kullanıcı kararı).
- "Sorun var" bugün `_notify_channels` ile aldığı her şeyi almaya devam eder (zil, push, web push, e-posta, WhatsApp); birleştirme hiçbir kanalı eksiltmez.
- Hangi şablonun ("Sorun var" için `is_sorunu_lab` mı, yeni `dusuk_puan_lab` mı) kullanılacağı kurucuya kalır; koşul: alıcı tek mesaj alır ve mesajda puan bilgisi bulunur. Hangisi Meta'da önce onaylanırsa o kullanılabilir.

### 5.5 Uyarı içeriği

Sipariş no, klinik adı, hekim adı, iş türü, düşük olan puanlar (örn. "Genel 3, Uyum 2") ve ekrandaki ilgili satıra bağlantı. **Hasta adı yazılmaz. Hekimin yorumu da bildirim gövdesine ve WhatsApp'a yazılmaz**, çünkü serbest metindir ve hasta adı içerebilir; yorum yalnız ekranda görünür. (Benim kararım.) Metinler §9'da.

Bağlantı: bildirime dokununca Değerlendirmeler ekranı o satır görünür/vurgulu açılır (panel-agnostik route kuralına uyulur, bkz. memory "Panel-agnostik route"). WhatsApp mesajında bağlantı yoktur (mevcut lab şablonu gibi "Siman'da" der).

## 6. Arama takibi ve hatırlatma

### 6.1 "Arandı" işareti ve not

- Her düşük puan satırında **"Arandı"** düğmesi. Basınca ortada pencere açılır (`U.modalOverlay`): başlık "Arandı olarak işaretle", sipariş no · klinik · iş türü, **isteğe bağlı** "Görüşme notu" alanı, "Vazgeç" / "Kaydet".
- Kayıt: kim işaretledi, ne zaman, not metni. Satır sönükleşir; altında yeşil "Arandı · <kişi> · <tarih saat>" ve not görünür.
- Not sonradan **"Notu düzenle"** ile değiştirilebilir; aynı pencerede **işareti kaldır** seçeneği de vardır (yanlışlıkla basılırsa). (Benim kararım.)
- Bir yönetici işaretleyince lab'ın tüm yöneticileri için "arandı" sayılır.
- Not **yalnız lab yöneticilerine** görünür. Klinik, hekim ve diğer lab rolleri okuyamaz (RLS ile; istemci gizlemesi yetmez).
- Tek kayıt tutulur (geçmiş yok); en son düzenleyen ve zamanı görünür. (Benim kararım; geçmiş gerekirse sonradan.)
- **Arandıktan sonra puan kötüleşirse:** yeni uyarı gider (§5.2) ve iş **yeniden "Aranmadı"ya döner**; eski arama kaydı silinmez, satırda soluk "Önceki arama · kişi · tarih" ve notuyla görünür. Bunun için arama kaydı hangi puan durumuna karşı yapıldığını saklar (ör. o andaki en düşük puan). Yeni "Arandı" işareti eski kaydın yerini alır. (Benim kararım: aranmış görünen bir iş, hekim puanı 3'ten 1'e indirince gözden kaçmasın.)

### 6.2 Hatırlatma

- Düşük puan **48 saat** içinde "arandı" işaretlenmezse aynı yöneticilere **bir kez** hatırlatma gider: uygulama içi + WhatsApp (şablon `dusuk_puan_hatirlatma`, §9; onaya kadar yalnız uygulama içi).
- 48 saat, işi "Aranmadı" durumuna sokan uyarının gittiği andan sayılır. Her böyle dönem için en fazla **bir** hatırlatma gider. Aranmamış bir iş daha da kötüleşip yeniden uyarı alırsa dönem değişmez (saat yeniden başlamaz). "Arandı" işaretlenmiş iş kötüleşip "Aranmadı"ya dönerse yeni dönem başlar ve 48 saat sonra bir hatırlatma daha gidebilir. (Benim kararım.)
- Hatırlatma **gitmez** eğer: işaretlenmişse, ya da değerlendirme sonradan düşük olmaktan çıkmışsa (hekim puanı 3'ün üstüne çekmiş).
- Ekranda 48 saati geçmiş aranmamış satırda kırmızı **"2 gündür aranmadı"** etiketi görünür (gün sayısı gerçek süreye göre: "3 gündür aranmadı" vb.).

### 6.3 Düşük olmaktan çıkan puan

Hekim puanı sonradan yükseltip değerlendirme artık düşük değilse: satır "Düşük puanlar" listesinden düşer, bekleyen hatırlatma iptal olur. Varsa arama kaydı silinmez (değerlendirme tekrar düşerse yeniden görünür). (Benim kararım.)

## 7. Ekran

**Yer (kullanıcı kararı):** ayrı menü kalemi değil; **Sağlık Kurumları** ekranında (`modules/clinics/screens/ClinicsScreen.tsx`) sekme şeridinin sonuna eklenen **"Değerlendirmeler"** sekmesi (Bağlantılar'dan sonra). Bu ekran lab paneli (`app/(lab)/clinics.tsx`) ve Yönetim paneli (`app/(admin)/clinics.tsx`) tarafından ortak kullanılır; kullanıcı sekmenin **iki panelde de** görünmesini onayladı. Her panel kendi accent/zeminini kullanır (`usePanelTheme()`).

- Sekme yalnız §2'deki yöneticilere görünür; diğer roller Sağlık Kurumları'nı bugünkü gibi görür, bu sekmeyi görmez. Sekmeye route/parametre ile doğrudan gelen yönetici olmayan kullanıcı varsayılan sekmeye düşer; veri zaten sunucuda reddedilir.
- Bu sekmede ekranın arama/süzgeç satırı gizlenir (Bağlantılar sekmesindeki gibi); içerik aşağıdaki düzenle sekmenin altında açılır.
- Bildirim bağlantısı Sağlık Kurumları'nı bu sekme seçili ve ilgili satır vurgulu açar; route panel-agnostik yazılır (lab ve Yönetim panelinde doğru panele düşer).
- `app/(admin)/doctors.tsx` da aynı ekranı kullanıyor; orada sekmenin görünüp görünmemesi mevcut sekme mantığına göre kurucuya kalır, koşul: yönetici olmayan görmez.

Mobil ve masaüstünde aynı ekran; telefonda tek sütun.

Yerleşim, yukarıdan aşağı (taslak `degerlendirmeler-v5.html` + `takip-v2.html`):

### 7.1 Üst kısım — beyaz hero (`WhiteHero`)

- Kicker: "Değerlendirmeler · <Ay Yıl>".
- Başlık: "Ortalama 4,6" (seçili ayın ortalaması; `overall` ortalaması, bir ondalık, Türkçe ondalık virgül; dil biçimine uyulur).
- Altında: geçen aya göre fark ("Geçen aya göre 0,2 düştü / yükseldi / değişmedi") ve "<n> işe puan verildi".
- Sağda üç rakam: **Değerlendirme** (ay içindeki sayı), **Düşük puan** (ay içindeki düşük sayısı, kırmızı), **Puan alma** (oran, §7.4).
- Altta ay seçici: ‹ önceki ay · <Ay Yıl> · sonraki ay ›. Varsayılan içinde bulunulan ay. Gelecek aya gidilmez.

### 7.2 Klinikler tablosu

Finans listelerindeki şeritli tablo dili (`MobileTableX` kalıbı; masaüstünde de). Şerit: "Klinikler", alt satır "En çok düşen en üstte", sağda "<n> klinik".

Her satır:
- Baş harf karesi, klinik adı, alt satır "<n> değerlendirme · <k> düşük" (k=0 ise yalnız sayı).
- **Son 6 ay çizgisi:** seçili ay dahil son 6 ayın aylık ortalaması. Puanı olmayan ay boşluk bırakır (çizgi o aydan atlar ya da kopar). Son nokta: önceki 3 aya göre düştüyse kırmızı, yükseldiyse yeşil, karşılaştırma yoksa içi boş gri.
- **Bu ay:** seçili ayın ortalaması (büyük), altında fark "↓ 1,2" / "↑ 0,2".
- **Fark:** seçili ayın ortalaması − önceki 3 ayın (seçili aydan önceki 3 takvim ayı) **tüm puanlarının** ortalaması.

Sıralama: en çok düşen en üstte; sonra fark sırasıyla; önceki 3 ayda puanı olmayan ("yeni") klinikler farklıların altında; bu ay puanı olmayan klinikler en altta ("Bu ay puan yok", önceki ortalama gösterilir). Listede yalnız son 6 ayda en az bir puanı olan klinikler görünür.

Satıra dokunmak: aynı ekranda o kliniğe süzülmüş değerlendirme listesi açılır (seçili ayın bütün değerlendirmeleri, düşük olsun olmasın; satır içeriği §7.3'e benzer). Süzgeç kolayca kaldırılır. (Benim kararım: ayrı sayfa değil.)

**Klinik nedir:** işin hekiminin kliniği (`work_orders.doctor_id → doctors.clinic_id → clinics`). Hekimin kliniği yoksa hekim kendi satırı olarak görünür (adıyla). Çok-lab'lı klinikte yalnız bu lab'ın işleri sayılır.

### 7.3 Düşük puanlar tablosu

Şerit: "Düşük puanlar", alt satır "Genel puan ya da herhangi bir alt puan 3 ve altı"; sağda iki seçenekli süzgeç **"Aranmadı · <n>" / "Tümü · <n>"**. Aranmamış düşük puan varken ekran "Aranmadı" seçili açılır, yoksa "Tümü". Kapsam: seçili ayda verilmiş düşük puanlar **artı** daha eski ama hâlâ aranmamış olanlar (aranmayan iş, ay değişti diye kaybolmaz). (Benim kararım.)

Sıra: aranmamışlar üstte, en eski en başta; sonra arananlar, en yeni en başta.

Her satır:
- Solda kare: en düşük puan (kırmızı ton).
- "#<sipariş no> · <klinik>", 48 saati geçmiş aranmamışta kırmızı "<n> gündür aranmadı".
- Alt satır: hekim · iş türü · (WhatsApp ise `WhatsApp'tan "<düğme>"`) · tarih.
- Kırmızı rozetler: düşük olan her puan ("Genel 3", "Uyum 2", "Kontakt 3", "Zamanında teslim 3"…).
- Yorumun ilk satırı, italik (varsa).
- Düğmeler: **Kliniği ara** (koyu), **Arandı** (beyaz buton kuralı), **Siparişe git**. Arandıysa: yeşil "Arandı · kişi · tarih" + not kutusu, düğmeler "Notu düzenle" ve "Siparişe git".
- **Kliniği ara:** telefonda `tel:` ile arar; masaüstünde numarayı gösterir (kopyalanabilir). Numara: kliniğin telefonu, yoksa hekimin telefonu; ikisi de yoksa düğme pasif ve tooltip "Telefon kayıtlı değil". (Benim kararım.)
- Sol renkli kenarlı kart kalıbı **kullanılmaz** (memory: no-left-border-cards); not kutusu düz soluk zemin.

### 7.4 Tanımlar

- **Ay:** değerlendirmenin verildiği tarih (`order_reviews.created_at`), Türkiye saatiyle. Güncellenen değerlendirme ilk verildiği aya kalır, güncel puanıyla.
- **Ortalama:** `overall` ortalaması. Alt puanlar ortalamaya girmez; yalnız "düşük" tanımında kullanılır.
- **Puan alma oranı:** puan isteği tasarımında (§8, onaylı) tanımlanan ölçü: **teslimden sonraki 14 gün içinde değerlendirme alma oranı**. Hesap: seçili ayda teslim edilen (`work_orders.delivered_at`, teslim edildi) **ve 14 günlük süresi dolmuş** işler payda; bunlardan teslimden sonra 14 gün içinde değerlendirme (`order_reviews.created_at`) almış olanlar pay. `review_requests`'ten değil `work_orders` + `order_reviews`'ten hesaplanır, böylece puan isteğinden önceki aylar da dolu çıkar. Süresi dolmamış teslimler sayılmaz; seçili ayda süresi dolmuş hiç teslim yoksa rakam "—" olur ve ipucu "Bu ayın teslimlerinin 14 günü henüz dolmadı" der. (Benim kararım: onaylı tanıma bağlı, eski aylar için de çalışan kaynak.)
- Revizyon ve devam siparişleri ayrı iş olarak sayılır (puan isteği tasarımıyla aynı).

### 7.5 Boş ve az veri durumları

- Lab'ın hiç değerlendirmesi yoksa: `EmptyStateX` — "Henüz değerlendirme yok", alt metin puan isteğini açmaya yönlendirir (ayar kartının yeri). Ayarı açma düğmesi yalnız ayar zaten bu yöneticiye açıksa.
- Seçili ayda puan yoksa: hero "Bu ay puan yok", tablolar kendi boş satırlarını gösterir; aranmamış eski düşük puanlar yine listelenir.
- Her ortalamanın yanında puan sayısı görünür, çünkü 1–2 puanla çıkan ortalama yanıltabilir.
- Yükleniyor durumu ve hata durumu (hata butonun/alanın yanında görünür; memory "Eylem hatası görünür olmalı").

## 8. Tasarım kuralları (uygulamanın kendi dili)

- Panelin kendi paleti (`usePanelTheme()`): lab panelinde safran accent + `#F5F1EB` zemin, Yönetim panelinde o panelin accent'i + zemini. Renk/zemin hardcode yok. Görsel taslaklar lab renkleriyle çizildi.
- `WhiteHero` (hero), `MobileTableX` kalıbında şeritli tablolar, `EmptyStateX`, `GlassTooltip` (tüm ikon-butonlar), `U.modalOverlay` + `U.modalCard` (pencere), ikonlar yalnız `core/ui/icons`.
- Sayfa kenarı `PAGE_PADDING`, kart arası `CARD_GAP`; hub içindeyse çift dolgu yok.
- Seçili süzgeç pill'i diğerinden geniş (CLAUDE.md §1c).
- Koyu tema aynı anda: hero `useHeroSurface`/WhiteHero'nun koyu hâli, tablolar `useInkUI` tokenları, kırmızı/yeşil durum tonları koyuda alfa zemin + açık metin, beyaz butonlar `U.plainBtn`.
- Dört dil aynı anda (tr/en/de/fa): yeni metinler sözlüklere; sabit dizilerdeki etiketler ve `SvgText` (çizgi grafikte etiket varsa) `autoT()`; Farsça'da sağdan sola düzen bozulmamalı. Veritabanına Türkçe yazılan bildirim başlıkları render'da `autoT()` ile çözülür.
- Hareket: dokunuşta anlık geri bildirim (basılınca hafif küçülme), `prefers-reduced-motion`'da animasyon yok.

## 9. Metinler (onaya sunulur)

| Yer | Metin |
|---|---|
| Uygulama içi uyarı başlığı | `Düşük puan` |
| Uygulama içi uyarı gövdesi | `<sipariş no> · <klinik> · <hekim> · <iş türü> · <düşük puanlar>` (örn. `2481 · Klinik C · Hekim 1 · Zirkonya köprü · Genel 3, Uyum 2`); yorum yok (§5.5) |
| Uygulama içi hatırlatma başlığı | `Düşük puan 2 gündür aranmadı` |
| Uygulama içi hatırlatma gövdesi | `<sipariş no> · <klinik> · <düşük puanlar>` |
| Şablon `dusuk_puan_lab` (UTILITY, `tr`) | `Düşük puan: {{klinik}} kliniğinden {{hekim}}, {{siparis_no}} numaralı {{is_turu}} işine düşük puan verdi ({{puanlar}}). Ayrıntılar Siman'da Değerlendirmeler ekranında.` |
| Şablon `dusuk_puan_hatirlatma` (UTILITY, `tr`) | `Hatırlatma: {{klinik}} kliniğinin {{siparis_no}} numaralı işteki düşük puanı 2 gündür aranmadı olarak bekliyor. Siman'da Değerlendirmeler ekranından "Arandı" olarak işaretleyebilirsiniz.` |
| Pencere | başlık `Arandı olarak işaretle` · alan `Görüşme notu` · ipucu `İsteğe bağlı. Yalnız lab yöneticileri görür, klinik görmez.` · `Vazgeç` / `Kaydet` · `İşareti kaldır` |

Şablon metinleri Meta'ya gönderilmeden önce kullanıcıya son hâliyle gösterilir. Meta UTILITY yerine MARKETING'e çevirirse metin işlem odaklı tutularak yeniden başvurulur.

## 10. Kısıtlar

- **Veritabanı değişikliği süreci (zorunlu):** her migration için canlıdan alınmış `.before.txt`, `.down.sql`, `RAISE EXCEPTION 'PROBE …'` ile geri alınan prova; uygulamadan önce kullanıcıdan açık "Onaylıyorum, uygula"; uygulama `supabase db query --linked -f <mutlak yol>`; sonra canlıda doğrulama.
- **Provada gönderici çağrılmaz:** `_notify_channels`, e-posta göndericileri, `_review_dispatch`, `fn_review_request_tick`, `fn_daily_order_watch`, `fn_prova_watch`, `fn_scan_schedule_digest`, `_prova_notify_lab`. `_notify_inapp`/`_notify_channels` prova işleminde `uuid` dönen sahte fonksiyonla değiştirilir.
- **Yeni tabloda RLS şart**, lab sınırı (`lab_id` → `labs`, tenant guard kalıbı). Arama notu yalnız §2 yöneticilerine okunur/yazılır.
- Lab adına çalışan fonksiyonlar `assert_my_lab` / lab sınırı kalıbına uyar (bkz. `20261104110000`).
- `send-whatsapp-meta` değişikliği ve edge function deploy'u yalnız ilgili Meta şablonu onaylandıktan sonra. `NOTIFY_FN_SECRET` hiçbir çıktıda yazdırılmaz.
- Web yayını yalnız kullanıcı "deploy" deyince. Paylaşılan ekran/bileşen değişikliği başka panelleri etkileyecekse önce kullanıcıya sorulur.
- Kullanıcıya verilen çıktılarda (raporlar, doğrulama özetleri) kişi adı ve para tutarı yazılmaz; kimlik numarası kullanılır.
- `tsc --noEmit` 0 hata; test paketi yeşil; üç otomatik sözlüğün anahtar kümeleri eşit.

## 11. Kurucuya kalanlar

- Arama kaydının tablo yapısı (ayrı tablo mı, `order_reviews` üzerinde sütunlar mı). Koşul: not yalnız yöneticilere okunur — `order_reviews` bugün lab'ın tüm çalışanlarına ve sipariş taraflarına okunuyor, bu yüzden not o satırda tutulacaksa okuma kısıtı ayrıca sağlanmalı.
- Uyarının tetiklenme yeri (`order_reviews` üzerinde tetikleyici ya da her iki yazma yolunda RPC) ve §5.4 birleştirmesinin yöntemi.
- Hatırlatmanın zamanlayıcısı (mevcut cron kalıbı, ör. `fn_review_request_tick` gibi; yeni görev mi, mevcut göreve ek mi).
- Ekran verisinin nasıl çekileceği (tek RPC önerilir: ay parametresi, yönetici kontrolü, klinik özetleri + 6 aylık seriler + düşük puan listesi).
- Çizgi grafik bileşeni (projede var olan bir sparkline varsa o).
- Sekmenin ikonu (varsa) ve sekme şeridindeki sayaç (ör. aranmamış düşük puan sayısı) gösterilip gösterilmeyeceği.
- Bildirim kategorisinin adı; `trg_whatsapp_meta_notify`'ın müşteri kategorileri (`new_order`, `delivery`, `approval`) dışında kalmalı ki hekime yanlış şablon gitmesin.

## 12. Başarı ölçüsü

Özellik açıldıktan sonra her düşük puan için: yöneticiye uyarı gitmiş olması ve düşük puanların çoğunun 48 saat içinde "arandı" işaretlenmesi. Ekran bu oranı ayrıca göstermez; doğrulama sorguyla yapılır.

## 13. Kullanıcı kararları (bu konuşmada)

- Düşük puan bugün görünmüyor; yönetici kliniği arayıp konuşuyor.
- Uyarı: uygulama içi + WhatsApp, hemen.
- Eşik: 3 ve altı; herhangi bir alt puan 3 ve altıysa da.
- Ekran: A yerleşimi (tek sayfa: rakamlar → klinik tablosu → düşük puanlar) + klinik satırlarında 6 aylık çizgi; uygulamanın tasarımına uygun.
- Yalnız lab yöneticileri görür.
- Arandı olarak işaretleme + not.
- 2 gün aranmazsa tekrar hatırlatma.
- Ekranın yeri: Sağlık Kurumları içinde "Değerlendirmeler" sekmesi; lab paneli ve Yönetim panelinde de görünür.

## 14. Onaylanan metinler (2026-11-04)

Kullanıcı §9'daki şablon taslakları yerine aşağıdaki düzeltilmiş metinleri onayladı (gerekçe: kliniği olmayan hekimde "X kliniğinden X" çıkıyordu; hatırlatma cümlesi düzeltildi). §9 ile çelişirse bu bölüm geçerlidir.

| Yer | Metin |
|---|---|
| Şablon `dusuk_puan_lab` (UTILITY, `tr`) | `Düşük puan: {{hekim}} ({{klinik}}), {{siparis_no}} numaralı {{is_turu}} işine düşük puan verdi: {{puanlar}}. Ayrıntılar Siman'da Değerlendirmeler ekranında.` |
| Şablon `dusuk_puan_hatirlatma` (UTILITY, `tr`) | `Hatırlatma: {{klinik}} için {{siparis_no}} numaralı işteki düşük puan 2 gündür aranmadı. Siman'da Değerlendirmeler ekranından "Arandı" olarak işaretleyebilirsiniz.` |
| Uygulama içi uyarı | başlık `Düşük puan` · gövde `<sipariş no> · <klinik> · <hekim> · <iş türü> · <düşük puanlar>` |
| Uygulama içi uyarı ("Sorun var" WhatsApp cevabı) | başlık `Hekim sorun bildirdi` · gövde aynı biçim; WhatsApp şablonu `is_sorunu_lab` |
| Uygulama içi hatırlatma | başlık `Düşük puan 2 gündür aranmadı` · gövde `<sipariş no> · <klinik> · <düşük puanlar>` |
| Pencere | §9'daki gibi |

Değişkenler: `dusuk_puan_lab` → `hekim`, `klinik`, `siparis_no`, `is_turu`, `puanlar`; `dusuk_puan_hatirlatma` → `klinik`, `siparis_no`. Hekimin kliniği yoksa `klinik` = hekimin adı.
