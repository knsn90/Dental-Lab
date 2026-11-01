# Prova ve randevu takibi (2. dalga 4) — tasarım

**Tarih:** 2026-10-27
**Kaynak:**
- Yol haritası `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` (2. dalga 4 — K5).
- Kullanıcıyla beyin fırtınası (2026-10-27).
- Mevcut durum taraması ve canlı şema kontrolü (bölüm 7).
- Onaylı etkileşimli prototip: `docs/superpowers/specs/2026-10-27-prova-takibi-prototip.html`. Tarayıcıda açılır; üstteki seçiciyle dört durum denenir.

## 1. Amaç ve neden

Lab yöneticisinin sözleriyle:
- "Prova gittiğinde ne zaman döneceğini takip edemiyorum."
- "Hekim randevuya göre söylüyor ama çoğu zaman bilmiyoruz."
- "Hasta ne zaman gelecek, ne zaman yetiştirmemiz gerekiyor, bu bilgi bizde olmuyor. Hastanın randevu bilgisi de girilse çok iyi olur."

Bugün provanın klinikte olduğunu gösteren bir durum yok, prova kliniğe gidince teslim sayacı da durmuyor. Hastanın prova ve takma randevusu hiçbir yerde kayıtlı değil. Bu tasarım dört şey getiriyor:
- Provanın nerede olduğunu ve ne zaman dönmesi gerektiğini tek bakışta gösteren bir takip.
- Hastanın prova ve takma randevusunun kaydı.
- Gecikme ve randevu riskinde uyarı.
- Prova klinikteyken duran ve dönüşte teslim tarihini kaydıran sayaç.

**Başarı:** Lab, bir siparişin hero satırına bakınca provanın klinikte kaç gündür olduğunu görür. Dönmesi geciken provalardan ve randevuya yetişmeyecek işlerden, kimse aramadan uygulama içi bildirimle haberdar olur. Siparişler listesinde bu işleri tek dokunuşla süzer.

## 2. Hedefler, hedef dışı, kaçınılacaklar

**Hedefler**
- Bir siparişte birden çok prova; her biri Hazırlanıyor → Klinikte → Döndü akışıyla.
- Prova ve takma randevuları: isteğe bağlı, birden çok, ayrı türler.
- Kurye bacağından otomatik işaretleme; lab için elle işaretleme.
- Hekim ve klinik tarafında öneri ile lab onayı.
- Gecikme ve randevu riski uyarıları; Siparişler'de iki filtre.

**Hedef dışı**
- Hasta takvimi ya da klinik randevu sistemi. Yalnız bu siparişi ilgilendiren randevular kaydedilir.
- WhatsApp hatırlatması. Meta şablonu gerekir, sonraki iş.
- Risk yüzünden teslim tarihini otomatik değiştirmek (bkz. kural 4.5).

**Kaçınılacaklar** (çalışsa da başarısızlık sayılır)
- "Yoğun ve yorucu" randevu listesi. Kullanıcı: "çok yoğun ve yorucu liste yapmayalım, gerekirse eklesin". Randevu alanı boşken yer kaplamamalı.
- Onay pencereleri. İşaretleme anında olur, yanlışlık "Geri al" ile düzeltilir.
- Sayacın iki kez durması ya da teslim tarihinin aynı gün için iki kez kayması.
- Yeni sipariş statüsü eklemek. Durum makinesi, kanban ve KPI'lar etkilenmemeli (bkz. 6.1).

## 3. Kullanıcının kararları (2026-10-27)

1. **Bir siparişte birden fazla prova** olabilir.
2. **Randevular:**
   - Prova randevusu ve takma randevusu ayrı türlerdir; her türden birden fazla olabilir.
   - Liste kalabalık olmaz, gerektiğinde eklenir.
3. **Randevuyu hekim sipariş verirken girer, lab düzenleyebilir.**
4. **Prova klinikteyken sayaç durur**, klinik kaynaklı bekleme gibi.
5. **Prova dönünce teslim tarihi, klinikte geçen gün kadar ileri kayar.**
   - Okuyucu sorusu üzerine yeniden soruldu: "klinikte geçen tüm gün mü, yalnız geciken gün mü?" Cevap: **klinikte geçen tüm gün**.
   - Kullanıcı sonucunu bilerek seçti: zamanında dönen prova da tarihi kaydırır ve randevu riski uyarısı üretebilir.
15. **Provadaki iş her yerde "Provada" görünür**, "Beklemede" değil (okuyucu sorusu 2, önerilen seçenek). Bu cevap ortak ekranlara dokunma onayıdır. Ayrıntı: 5.6.
6. **İşaretleme:**
   - Kurye prova gidişini teslim edince prova kendiliğinden "Klinikte" olur, dönüşü teslim edince "Döndü" olur.
   - Lab aynı işaretlemeleri düğmeyle de yapabilir.
7. **Gecikme:** Prova, randevunun ertesi günü hâlâ dönmemişse gecikmiş sayılır. Prova randevusu yoksa gönderildikten 3 gün sonra gecikmiş sayılır.
8. **Randevu riski:** Yalnız gösterilir; teslim tarihi bu yüzden değişmez.
   - Teslim tarihi takma randevusuyla aynı gün ya da sonrasındaysa → "Randevuya yetişmiyor".
   - Takma randevusuna 2 gün kalmış ve iş teslim edilmemişse → "Randevu yaklaşıyor".
9. **Bildirimler:**
   - Dönmesi geciken provalar ve randevuya yetişmeyecek işler lab'a uygulama içi bildirimle gider.
   - Kliniğe her geciken prova için bir kez hatırlatma gider: uygulama içi ve e-posta.
10. **Sipariş detayında Prova popup'ı, B düzeni** ("Şu an" kartı öne çıkar). Lab işaretlemeyi bu popup'ta yapar.
11. **Tasarım Apple tasarım mantığında.** Onaylı prototip bölüm 5.2'deki davranışları gösterir.
12. **Hekim ve klinik aynı popup'ı görür.**
    - Randevuyu değiştirebilirler; değişiklik "önerilen tarih" olarak bekler, lab onaylar.
    - Provayı işaretleyebilirler; bu da lab onayına bağlıdır.
13. **Yeni sipariş sihirbazı:** Randevu satırı 3. adımda, teslim tarihinin altında durur.
14. **Siparişler:** "Provada" ve "Randevu riski" filtreleri eklenir.

## 4. Kurallar

### 4.1 Prova durumu

| Görünen ad | Anlamı | Teslim sayacı |
|---|---|---|
| Hazırlanıyor | Prova planlandı, henüz gönderilmedi | işler |
| Klinikte | Prova kliniğe gitti | durur |
| Lab onayı bekliyor | Hekim "Provayı geri gönderdim" dedi, lab henüz teslim almadı | durur |
| Döndü | Prova lab'a geri geldi | yeniden işler |

- "Gecikti", Klinikte ya da Lab onayı bekliyor durumundaki bir provanın gecikme kuralını (4.3) aşmış hâlidir. Ayrı bir durum değil, bir işarettir.
- Mevcut `tamamlandı` değeri korunur. Hangi anlamda kullanılacağına builder karar verir (bkz. 6.2).

### 4.2 Geçişler

- **Gönderildi işareti:** Hazırlanıyor → Klinikte. Kaynağı ya kuryenin prova gidiş bacağını teslim etmesi ya da lab'ın düğmesidir. Gönderim günü kaydedilir.
- **Döndü işareti:** Klinikte ya da Lab onayı bekliyor → Döndü. Kaynağı ya kuryenin prova dönüş bacağını teslim etmesi ya da lab'ın düğmesidir. Dönüş günü kaydedilir. Döndü işaretlenirken isteğe bağlı bir hekim notu yazılabilir.
- **Hekimin işareti:** Klinikte → Lab onayı bekliyor ("Provayı geri gönderdim").
  - Lab onaylarsa, yani prova eline geçerse → Döndü.
  - Lab onay beklemeden kendisi Döndü işaretlerse bekleyen istek kendiliğinden kapanır.
- **Geri al:** Elle yapılan her işaretleme 5 saniye boyunca "Geri al" ile tamamen geri alınabilir. Bu, sayaç ve teslim tarihi etkilerini de kapsar.
- **Geçmiş tarihli işaret** *(benim kararım)*: Lab işaretlemeyi çoğu zaman bir gün geç yapar.
  - İşaretlemenin günü varsayılan olarak bugündür. Ana düğmenin altındaki küçük "Tarih: bugün" bağlantısı daha önceki bir günü seçtirir; ileri tarih seçilemez.
  - Seçilen gün sayacın başlangıcını ya da bitişini, "N. gün" sayısını, gecikme hesabını ve teslim tarihi kaymasını belirler.
  - Kuryenin işareti, bacağın teslim edildiği anı kullanır.
  - Yanlışsa maliyeti: tarih seçici gereksiz kalır, işlevi bozmaz.
- **Kimler işaretler ve onaylar** *(benim kararım)*: Bu eylemler teslim tarihini değiştirdiği için sipariş üzerinde bekleme başlatma/bitirme yetkisi olan lab kullanıcılarına açıktır. Bu yetki bugün hero'daki "Beklet / Devam ettir" düğmelerinin yetkisidir. Kapsam:
  - Gönderildi ve Döndü işaretleri.
  - "Teslim aldım".
  - Randevu önerisini onaylama ve reddetme.
  - Lab adına randevu girme.

  Teknisyen ve kurye bu eylemleri popup'tan yapamaz; kurye kendi bacağını teslim ederek işaretler. Yanlışsa maliyeti: yetki tek bir kontrolde toplanır, değiştirmek kolaydır.

### 4.3 Gecikme

- Her provanın bir **dönüş için son günü** vardır. Klinikteki prova bu günü geçtiği gün hâlâ dönmemişse gecikmiş sayılır. Son gün iki türlü belirlenir:
  - Onaylı bir prova randevusu varsa: randevunun günü. Prova, randevunun ertesi günü gecikmiş olur.
  - Yoksa: gönderim günü + 2. Prova, gönderildikten 3 gün sonra gecikmiş olur.
  - *(Plan yazılırken düzeltildi: önceki metin "gönderim + 3, ertesi gün gecikmiş" diyordu. Bu, kullanıcının "gönderildikten 3 gün sonra gecikmiş sayılsın" kararından bir gün sonraya düşüyordu.)*
- Hangi prova randevusunun hangi provaya ait olduğu: gönderimden sonraki ilk onaylı prova randevusu. *(Benim kararım: provaya randevu bağlanmaz, tarihten eşleşir. Yanlışsa maliyeti: çok provalı işlerde yanlış son gün.)*
- Gecikme "N gün gecikti" olarak gösterilir.

### 4.4 Sayaç ve teslim tarihi

- Bir provanın Klinikte olduğu andan Döndü olduğu ana kadar sayaç durur. Bu, klinik kaynaklı bekleme ile aynı davranıştır.
- Prova Döndü olunca teslim tarihi, klinikte geçen gün kadar ileri kayar.
  - Gün hesabı mevcut "klinik kaynaklı bekleme" ile aynı yapılır.
  - Kayma geçmişte (Geçmiş akışında) görünür.
- Aynı gün sayılarının iki kez durmaması ve iki kez kaydırılmaması gerekir. Siparişte o sırada başka bir bekleme açıksa ya da iki prova aynı anda klinikteyse bile bu geçerlidir (bkz. 6.3).

### 4.5 Randevu riski

- Yalnız onaylı randevular üzerinden hesaplanır. Önerilen tarih, onaylanana kadar riski değiştirmez.
- **Hangi teslim tarihi** *(benim kararım)*: Prova kliniğe gitmediyse ya da dönmüşse güncel teslim tarihi kullanılır. Prova klinikteyken ise **tahmini teslim** kullanılır.
  - Tahmini teslim = güncel teslim tarihi + şu iki sayıdan büyüğü:
    - gönderimden beklenen dönüşe kadar geçen gün,
    - gönderimden bugüne kadar geçen gün.
  - Böylece risk, tarih dönüşte kaymadan önce görünür. Popup ve risk çipi bu durumda "tahmini 12 Kas" der.
  - Yanlışsa maliyeti: uyarı birkaç gün erken ya da geç çıkar.
- Takma randevusu kuralları:
  - Teslim tarihi takma günü ya da sonrasıysa → "Randevuya yetişmiyor" (kırmızı).
  - Takma gününe 2 gün ya da daha az kalmış ve iş teslim edilmemişse → "Randevu yaklaşıyor" (turuncu).
  - Diğer durumlarda → "Yetişir" (yeşil).
- Prova dönüşünde teslim tarihi kayınca risk yeniden hesaplanır. Kayma işi "yetişmiyor"a düşürürse uyarı da gider.
- Risk teslim tarihini değiştirmez. Lab tarihi gerekirse kendisi değiştirir.

### 4.6 Randevular

- Her randevunun bir türü (prova ya da takma), bir günü ve isteğe bağlı bir saati vardır.
- **Lab'ın girdiği ya da değiştirdiği randevu** hemen geçerli olur.
- **Hekimin sipariş verirken girdiği randevu** siparişle birlikte gelir, ayrıca onay istemez.
- **Hekimin ya da kliniğin sonradan yaptığı değişiklik** "önerilen tarih" olarak bekler.
  - Popup'ta eski tarihin yanında görünür: "Takma · Cum 13 Kas → önerilen Pzt 16 Kas · onay bekliyor".
  - Lab aynı satırda Onayla ya da Reddet der. Reddederken isteğe bağlı kısa bir not yazabilir.
  - Reddedilirse eski tarih kalır.
- Yeni randevu ekleme ve silme için de aynı öneri kuralı geçerlidir. *(Benim kararım.)*

### 4.7 Bildirimler

| Olay | Kime | Kanal | Ne zaman |
|---|---|---|---|
| Prova gecikti | Lab | Uygulama içi | Gecikmenin ilk günü, bir kez |
| Prova gecikti | Klinik (siparişin hekimi + klinik hesabı) | Uygulama içi + e-posta | Prova başına **bir kez** |
| Randevuya yetişmiyor / yaklaşıyor | Lab | Uygulama içi | Duruma ilk düştüğünde, bir kez |
| Hekim randevu önerdi / provayı geri gönderdi | Lab | Uygulama içi | Anında |
| Lab öneriyi onayladı / reddetti | Hekim / klinik | Uygulama içi | Anında |

- Lab tarafında kimin alacağı: lab yöneticileri. *(Benim kararım: mevcut "geciken sipariş" özetiyle aynı alıcılar. Yanlışsa maliyeti: bildirimin yanlış kişiye gitmesi; alıcı listesi tek yerden değişir.)*
- Lab bildirimleri e-posta göndermez. Bu, mevcut lab bildirim gürültüsü kuralına uyar: durumlar uygulama içi, e-posta yalnız eylem ve özet içindir.
- Her bildirim siparişi açar. Prova bildirimleri doğrudan Prova popup'ını açar.

## 5. Ekranlar

### 5.1 Hero satırı: "Prova" düğmesi

- Sipariş detayının hero eylem satırında, Geçmiş'in yanında durur ve aynı düğme stilindedir.
- Etiket her zaman "Prova"dır; durum varsa yanına eklenir: "Prova · Klinikte 2. gün", "Prova · 1 gün gecikti", "Prova · Döndü".
- Etiketin önündeki renkli nokta durumu gösterir: turuncu klinikte, kırmızı gecikmiş ya da randevu riski, yeşil dönmüş. Prova ve randevu yoksa nokta görünmez.
- Satır sığmadığında mevcut "•••" taşma düzenine katılır. Taşma sırası builder'ındır, ama Prova, Destek ve Yazdır'dan sonra gizlenir.
- Mobilde sipariş detayının üst çubuğunda bir ikon olarak durur, renkli nokta ile. *(Benim kararım.)*
- GlassTooltip'i vardır.
- `?tab=prova` adresi popup'ı açar. Bildirimler bu adresi kullanır.

### 5.2 Prova popup'ı (B düzeni) — prototip birebir

Yerleşim:
1. **Başlık:** "Prova", altında sipariş no · iş adı, sağda ✕ (GlassTooltip'li).
2. **"Şu an" kartı:** Durum renginde yumuşak zemin üzerinde şunlar yer alır:
   - Üst satır: "ŞU AN · 2. BİSKÜVİ PROVA" (durum + prova adı).
   - Büyük ince başlık: "Klinikte" / "1 gün" (gecikti) / "Döndü" / "Hazırlanıyor", yanında küçük gün bilgisi.
   - Üç parçalı ilerleme şeridi: Gönderildi · Klinikte · Dönüş. Altında tarihler.
   - En fazla iki açıklama satırı, ikonlu. Örnekler: "Dönüş için son gün Cum 30 Eki · prova randevusu", "Teslim sayacı duruyor · iş klinikte bekliyor", "Kliniğe hatırlatma gitti · Cmt 31 Eki", "Teslim sayacı yeniden işliyor", "Teslim tarihi 3 gün kaydı · Çar 11 Kas".
   - Tek ana düğme, duruma göre değişir:
     - Hazırlanıyor → "Gönderildi olarak işaretle"
     - Klinikte ya da Gecikti → "Döndü olarak işaretle"
     - Lab onayı bekliyor → "Teslim aldım"
   - Yanında ikincil düğme: "Prova kuryesi" ya da "Dönüş kuryesi". Mevcut kurye bacağı akışını ilgili amaçla açar.
   - Döndü'de ana düğme yok; "+ Hekim notu" vardır.
   - Klinikte prova yoksa kart sıradaki randevuyu ve "Prova gönder" düğmesini gösterir.
   - Hiç prova yoksa kart sade bir boş durumdur. *(Benim kararım.)*
3. **RANDEVULAR:** Sağda "+ Randevu". Satırlar şöyle görünür: "Prova · Cum 30 Eki · 14:30", "Takma · Cum 13 Kas" + risk çipi (Yetişir / Randevu yaklaşıyor / Randevuya yetişmiyor). Önerilen tarih ve Onayla/Reddet aynı satırda yer alır (4.6).
4. **ÖNCEKİ PROVALAR:** Sağda "+ Yeni prova". Her satır "1. Metal prova · 22 → 24 Eki · Döndü" biçimindedir. Dokununca açılır, hekim notunu ve nasıl döndüğünü gösterir.

Davranış (Apple tasarım mantığı, prototipteki gibi):
- **Açılış ve kapanış:**
  - Kart, Prova düğmesinin bulunduğu yerden büyüyerek ortaya gelir; kapanınca aynı yoldan geri döner.
  - Hareket kritik sönümlü yaydır, taşma ve zıplama yoktur (yanıt ~0,38 sn).
  - Hareket her an kesilebilir: kapanırken yeniden açılırsa anlık konumdan döner.
  - Arka plan açılışla birlikte bulanıklaşır (uygulamanın popup zemini).
- **Ortada açılır:** Mobilde de ortadadır, alttan açılan sayfa kullanılmaz. Dar ekranda dış boşluk 12'dir.
- **Basış tepkisi:** Düğmeler basıldığı an hafifçe küçülür.
- **İlerleme şeridi:** Her parça kendi yayıyla dolar.
- **Geri al:** İşaretleme onay penceresi açmaz. Altta 5 saniye "Döndü olarak işaretlendi · Geri al" bildirimi çıkar. Bildirim cam yüzeylidir; yaylı yükselir ve iner.
- **Hareketi azalt** açıksa yalnız solma kullanılır.
- **Kapanış yolları:** Esc, dışarı dokunma ya da ✕. Açılınca odak ✕'e, kapanınca Prova düğmesine gider.
- **Durum rengi:** Kart zemini durum rengine yumuşak geçişle döner.
- **Koyu tema:** Durum zeminleri yarı saydam vurgu + açık vurgu metni (proje rozet kuralı). Sayfa ve kart zeminleri token'dan gelir.

### 5.3 Hekim ve klinik görünümü

- Aynı popup açılır. Lab'a özel satırlar görünmez: "Teslim sayacı duruyor" ve kurye düğmeleri.
- **Ana düğme:** Klinikte ve gecikmiş provada ana düğme "Provayı geri gönderdim"dir. İşaretlenince "Lab onayı bekliyor" yazar.
- **Randevular:**
  - "+ Randevu" ve randevu satırındaki düzenleme bir öneri oluşturur.
  - Satırda "önerilen · onay bekliyor" görünür.
  - Reddedilen önerinin yanında lab'ın notu görünür.
- **Hero düğmesi:** Hekim ve klinik panelinin sipariş detayında da Prova düğmesi bulunur.

### 5.4 Yeni sipariş sihirbazı (3. adım)

- Teslim tarihi alanının altında sessiz bir satır bulunur: "Hastanın randevusu var mı?" ve yanında "+ Prova randevusu", "+ Takma randevusu".
- Eklenen randevu küçük bir satır olur: tür · tarih · isteğe bağlı saat · ✕.
- Zorunlu değildir, siparişi engellemez.
- **Uyarı:** Teslim tarihi takma randevusuyla aynı gün ya da sonrasındaysa alanın hemen altında uyarı çıkar: "Teslim tarihi takma randevusundan sonra". Uyarı yalnız bilgi verir, siparişi engellemez.
- **Düzenleme:** Aynı satır sipariş düzenlemede de görünür.
  - Hekimin değişikliği öneri olarak gider (4.6).
  - Lab'ın değişikliği hemen geçerli olur.
- **Diğer sipariş girişleri:** Simanty, WhatsApp ve OCR ile gelen siparişlerde randevu alanı bu işte zorunlu değildir. *(Benim kararım: sonraki iş.)*

### 5.5 Siparişler listesi

- **Filtreler:** Durum filtrelerinin yanına iki filtre gelir.
  - **"Provada (n)":** Klinikte ya da Lab onayı bekliyor durumunda provası olan siparişler.
  - **"Randevu riski (n)":** "Randevuya yetişmiyor" ya da "Randevu yaklaşıyor" durumundaki siparişler.
- **Satır rozeti:**
  - Provası klinikte olan satırda: "Provada · 2. gün". Gecikince kırmızı: "Prova 1 gün gecikti".
  - Riskli satırda: "Randevuya yetişmiyor" ya da "Randevu yaklaşıyor".
  - Rozete dokununca sipariş detayında Prova popup'ı açılır.
- **Paneller:**
  - Filtreler lab ve yönetici listelerinde bulunur.
  - Rozetler hekim ve klinik listelerinde de görünür. *(Benim kararım.)*

### 5.6 Uygulamanın geri kalanında "Provada" (karar 15)

Prova beklemesi teknik olarak mevcut bekleme yuvasını kullanır (6.1), ama hiçbir yerde "Beklemede" ya da "Duraklatıldı" olarak görünmez:
- **Liste ve rozetler:** Bugün beklemedeki siparişi "Beklemede" / "Duraklatıldı" diye gösteren her yer prova beklemesinde "Provada · N. gün" yazar. Gecikmişse "Prova N gün gecikti" yazar. Bu yerler:
  - Siparişler listesinin teslim sütunu.
  - Sipariş durum bilgisi.
  - Hekim ve klinik panoları.
  - Diğer bekleme rozetleri.
- **Sipariş detayı hero'su:** "Beklemede N gün" bloğu ve "Devam ettir" düğmesi prova beklemesinde çıkmaz. Yerini hero'daki Prova düğmesi ve popup alır.
  - Prova beklemesini yalnız prova akışı kapatabilir.
  - Mevcut "Devam ettir" yolu sunucuda da prova beklemesini kapatmayı reddeder.
- **Sabah özeti:** Her sabahki "bekleyen siparişler" özeti prova beklemesindeki işleri saymaz. Onlar kendi gecikme bildirimiyle gelir (4.7).
- **Değişmeyenler:** Diğer bekleme kategorileri bugünkü gibi kalır.

Builder bu ortak yüzeylerin tam listesini çıkarır. Her birinde değişiklik yalnız prova kategorisi için eklenir; diğer beklemelerin görünümü bit bit korunur.

### 5.7 Geçmiş

Sipariş Geçmişi zaten prova gönderme ve dönüş olaylarını gösteriyor. Şunlar da eklenir:
- Hekimin "geri gönderdim" işareti.
- Randevu ekleme ve değişiklikleri: öneri, onay ve red.
- Dönüşteki teslim tarihi kayması.

Bu olaylar mevcut rol süzgecine uyar.

## 6. Benim kararlarım ve builder'a bırakılanlar

### 6.1 Provada = bekleme mekanizması, yeni statü değil *(benim kararım)*

- Prova klinikteyken sipariş, mevcut bekleme mekanizmasıyla "klinik kaynaklı" beklemeye alınır. Bu bekleme yeni bir kategori ile açılır (ör. `client_prova`).
- Bunun sağladıkları:
  - Sayacın durması ve dönüşte teslim tarihinin kayması (kararlar 4 ve 5) hazır davranıştan gelir.
  - Sipariş statüsü, kanban, KPI ve "geciken" tanımı değişmez.
  - Bekleme olarak görünmez; her yerde "Provada" görünür (5.6).
- Yanlışsa maliyeti: "Provada"nın ayrı bir statü olarak raporlanması istenirse sonradan eklenir.

### 6.2 Builder'a bırakılanlar

- **Randevu kaydı:** Tablo yapısı ve sipariş başına randevu modeli. Öneri ve onay için mevcut `order_change_requests` deseni yeniden kullanılabilir ya da ayrı tutulabilir.
- **`provas` tablosundaki düzeltmeler:**
  - Durum kısıtına Hazırlanıyor ve Lab onayı bekliyor durumları eklenir.
  - `sent_date` zorunluluğu planlanmış prova için kaldırılır.
  - `tamamlandı` değerinin akıştaki yeri belirlenir.
- **Gecikme ve risk taraması:** Hangi saatte çalışacağı (mevcut sabah cron'larının yanında) ve bildirimlerin tekrar engeli.
- **Kurye bağlantısı:** Prova bacağı teslim edilince doğru provanın işaretlenmesi; birden çok açık prova varsa eşleştirme.
- **Taşma sırası:** Hero satırında taşma sırasının ayrıntısı ve mobil üst çubuk yerleşimi.
- **Eski ProvaSection:** Emoji ve StyleSheet kullanıyor, sipariş detayına bağlı değil. Kaldırılması ya da yeni popup'ın içine taşınması builder'ındır.

### 6.3 Builder'ın özellikle dikkat edeceği uç durumlar

- **Başka bir bekleme açıkken prova gönderilmesi:** Sipariş tek bekleme yuvası taşıyor. Sayaç iki kez durmamalı, teslim tarihi aynı günler için iki kez kaymamalı. Diğer bekleme kapanırken prova hâlâ klinikteyse sayaç durmaya devam etmeli.
- **Aynı anda iki prova klinikteyken:** Örneğin alt ve üst çene aynı anda klinikteyse sayaç ilk gidişte durur, son dönüşte yeniden işler.
- **Geri al:** Sayaç ve teslim tarihi etkisini de tam geri almalı.
- **Yetki sınırı:** Kurye otomatiği ve gecikme taraması lab kullanıcısı oturumu olmadan çalışır. Mevcut bekleme fonksiyonları çağıranın lab'ını doğruluyor, bu yüzden sistem yolu ayrı ve güvenli olmalı.
- **Hekimin yetkisi:** Hekim yalnız kendi siparişinde öneri ve işaret yapabilir. Lab onayı olmadan hiçbir alanı doğrudan değiştiremez.

## 7. Mevcut durum (2026-10-27 taraması)

- **`provas` tablosu:**
  - Canlıda 0 satır.
  - Durum kısıtı yalnız `gönderildi / döndü / tamamlandı` değerlerine izin veriyor; `planlandı` yok, oysa eski ProvaSection bunu kullanıyor.
  - `sent_date` zorunlu.
  - Sipariş Geçmişi `sent_date` ve `return_date`'i okuyor.
- **Bekleme:**
  - `work_orders.hold_*` tek yuva. `hold_order` / `resume_order` SECURITY DEFINER ve çağıranın lab'ını doğruluyor.
  - Klinik sorumlu beklemede `resume_order`, geçen gün kadar teslim tarihini kaydırıyor (`round(saat/24)`). `work_order_holds` geçmişi tutuyor.
- **Kurye:** `deliveries.purpose` içinde `prova_gidis` ve `prova_donus` var (1 kayıt). Teslim durumu `teslim_edildi`.
- **Bildirim:** `notifications` tablosu ve `_notify_*` yardımcıları var. Cron'da `daily-order-watch` her gün 08:00 UTC'de çalışıyor.
- **Değişiklik talebi:** `order_change_requests` hekim değişikliği + lab onayı için var.

## 8. Proje kısıtları (her görevde geçerli)

- **Diller:** Her yeni metin tr + en + de + fa aynı anda yazılır. `auto.{en,de,fa}.json` anahtarları eşit kalır.
- **Koyu tema:** Aynı anda yapılır, token'larla. Rozetler yarı saydam vurgu + açık vurgu metni kullanır.
- **Popup:** `useInkUI().modalOverlay` / `modalCard`, mobilde de ortada. Her yeni düğmede GlassTooltip var. Düğme satırı tek stil, tek satır; yalnız sığmazsa "•••".
- **Veritabanı:**
  - 5 adımlı protokol: canlı tanımın yedeği → geri alma dosyası → geri alınan deneme → kullanıcı onayı → uygulama ve ölçüm.
  - Yeni tablolarda RLS açılır; `lab_id` `labs(id)`'e bağlanır.
  - Gönderim yapan fonksiyonlar denemelerde çağrılmaz.
- **Doğrulama:** `tsc --noEmit` 0 hata. Test paketi yeşil.
- **Deploy:** Yalnız kullanıcı "deploy" deyince.
- **KVKK:** Çıktılarda hasta adı ve tutar yazılmaz, yalnız sayılar.
- **Parça parça ilerleme:** "Çalışan sistemi bozmadan aşama aşama." Her parça kendi başına çalışır ve geri alınabilir.
