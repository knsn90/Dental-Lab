# İş İstatistikleri sayfası — tasarım

**Tarih:** 2026-11-11 · **Panel:** Yönetim (admin) · **Giriş noktası:** Admin Özet'teki "Üye Trendi" kartı · **Durum:** taslak, kullanıcı onayı bekliyor (yapıcı denetimi 2026-11-11 yapıldı; §13)

Görsel taslak (sohbet içi, git dışı): üç düzen gösterildi; kullanıcı **"B üstte, A altta birleşik; C ayrı sekme"** seçti. Belge ile taslak çelişirse belge geçerlidir.

---

## 1. Neden

Admin Özet'teki Üye Trendi kartı son 6 ayın toplam üye sayısını gösteriyor. Ama "bu ay hangi iş tipinden kaç üye geldi, geçen aya göre ne değişti, hangi klinik ne gönderdi" sorularına cevap veren bir yer yok. Karta tıklayınca bugün Siparişler listesi açılıyor; istatistik değil.

Kullanıcının sözleriyle istek:
- "hangi iş tipinden kaç üye geldiğini aylık görmek istiyorum, ay ay seçip filtrelemekte isterim"
- "önceki aylara göre karşılaştırma da olsun, grafikler, karşılaştırmalar"
- klinik kırılımı bu sayfada olsun
- geçen yılın aynı ayıyla da kıyas olsun
- Excel ve PDF dışa aktarma, diğer belgelerimize uygun
- tasarım hem Siman diline hem Apple tasarım ilkelerine (`.claude/skills/apple-design`) uygun

## 2. Kim kullanır

Yönetim paneline erişebilen herkes (rota korumasına dokunulmaz). Veri, kullanıcının zaten okuyabildiği `work_orders` satırlarıdır. Lab'ın kendi RLS'i geçerlidir, yeni bir yetki açılmaz. Sayfa yalnızca Yönetim panelinde bulunur. Lab, klinik ve hekim panellerine eklenmez.

## 3. Hedefler / hedef olmayanlar / anti-hedefler

**Hedefler**
- Seçilen ayda iş tipi başına gelen miktar, işin kendi biriminde (üye / çene / adet).
- Önceki aya ve geçen yılın aynı ayına göre fark.
- 12 aylık trend; tek iş tipine ve tek kliniğe süzülebilir.
- Klinik kırılımı. O ay hiç göndermeyen, önceki ay gönderen klinik görünür kalır.
- Ay × iş tipi (ve ay × klinik) ısı haritası.
- Ekrandaki seçime göre Excel ve PDF.

**Hedef olmayanlar (bu sürümde yok)**
- Ciro / para tutarı. Bu sayfa iş hacmi sayar; para Karlılık raporunda kalır.
- Teslim süresi, gecikme, revizyon oranı gibi kalite metrikleri.
- Teknisyen başına üretim. "Üretim Analitiği" (`modules/station/screens/AnalyticsScreen.tsx`) ayrı kalır.
- Mobil uygulamaya (native) özel ayrı tasarım. Aynı ekran dar genişlikte tek sütuna iner (§7.6).

**Anti-hedefler (çalışsa bile başarısızlık sayılır)**
- Bu sayfanın bir ay için gösterdiği toplam ile Üye Trendi kartının aynı ay için gösterdiği sayı **farklıysa**.
- Çeneyi ya da adeti üyeye karıştırıp tek sayıda toplamak (eski hata; bkz. `core/util/serviceUnits.ts` baş yorumu).
- Geçen yıl verisi yokken sıfırla kıyaslayıp "+%100" gibi uydurma bir artış göstermek.
- Admin Özet'teki mevcut kartların davranışını veya sayılarını değiştirmek. Yalnız Üye Trendi kartının tıklama hedefi değişir (§4).

## 4. Giriş ve rota

- Yeni rota: `app/(admin)/work-stats.tsx` → ekran `modules/admin/workStats/WorkStatsScreen.tsx`.
- `app/(admin)/index.tsx`'teki Üye Trendi kartının ok düğmesi bugün `router.push('/(admin)/orders')` yapıyor (≈ satır 2117). Bu, `'/(admin)/work-stats'` olur. Aynı dosyadaki diğer `/(admin)/orders` bağlantılarına dokunulmaz.
- Mobil Admin Özet'teki (`modules/admin/components/AdminMobileDashboard.tsx`) Üye Trendi kartı da aynı rotaya gider. Bugün bir hedefi varsa o değişir, yoksa bir dokunma hedefi eklenir.
- Sayfa yan menüye ayrı bir öğe olarak **eklenmez** (kullanıcı istemedi). Yalnız karttan açılır. Geri düğmesi Admin Özet'e döner.

## 5. Sayım kuralları (tek tanım)

Bu bölüm Üye Trendi kartıyla birebir aynıdır. Fark çıkarsa kart doğrudur, sayfa yanlıştır.

1. **Hangi sipariş:** **oturumdaki kullanıcının lab'ının** (`profile.lab_id`) `work_orders` satırları — sorgu `lab_id`'yi açıkça süzer, yalnız RLS'e güvenmez (çok-lab okuyabilen bir hesap labları toplamasın diye; benim kararım); `status !== 'iptal'` ve `tooth_numbers` en az bir elemanlı. Kart (`app/(admin)/index.tsx` ≈ satır 1560–1575) diş listesi boş siparişleri hiç saymıyor; sayfa da saymaz. Arşivli siparişler sayılır (kartla aynı).
2. **Hangi ay:** siparişin **geldiği** tarih, `created_at`. Ay, kartta olduğu gibi tarayıcının yerel saatine göre `getFullYear()/getMonth()` ile bulunur; UTC'ye göre çizilmez.
3. **Miktar ve kova:** `resolveUnitForWorkType(work_type, unitByServiceName)` → birim. `memberBucketOf(birim)` → kova (`uye` / `cene` / `adet`). `serviceUnitQty(birim, tooth_numbers)` → miktar. `unitByServiceName`, `lab_services(name, unit)` üzerinden kurulur (kartla aynı).
4. **İş tipi etiketi:** `workTypeGroupLabel(work_type)`. Tekrarlı "X, X, X" tekilleşir, parantez ekleri atılır. Karışık iş tipi ("Zirkon, E.max") kendi etiketiyle tek satırdır, bölünmez. **Not:** Admin Özet'teki "İş Tipi Dağılımı" kartı (`wtMap`, ≈ satır 1588–1600) iptal edilenleri DIŞLAMIYOR; sayfa dışlar. Eşlik şartı yalnız **aylık toplamlar** (Üye Trendi) içindir; dağılım kartı bu işte değiştirilmez, ayrı bir düzeltme olarak kullanıcıya önerilir.
5. **Klinik:** `work_orders.doctor_id` → `doctors.id` → `doctors.clinic_id` → `clinics.name`. Ölçüm (2026-11-11, ana lab): 80 siparişin 80'i bu yolla bir kliniğe çözülüyor. Çözülemeyen sipariş (hekimi silinmiş, `clinic_id` boş vb.) **"Kliniği bilinmeyen"** adlı tek bir satırda toplanır, atılmaz. Böylece toplamlar kartla tutar. `doctor_id` polimorfiktir (bkz. bellek: hekim doctor_id polimorfizmi). Yine de tüm siparişlerde `doctors.id` olduğu ölçüldü; profil id gelirse "Kliniği bilinmeyen"e düşer.
6. **"Toplam üye"** yalnızca `uye` kovasıdır. Çene ve adet ayrı kutularda gösterilir, toplama eklenmez.

## 6. Veri

**Kaynak:** istemci, `work_orders` (`id, work_type, status, created_at, tooth_numbers, doctor_id`), `doctors` (`id, clinic_id`), `clinics` (`id, name`) ve `lab_services` (`name, unit`) tablolarını RLS altında okur. Toplama işini saf bir TS modülü yapar.

**Benim kararım: hesap istemcide.** Gerekçe: birim çözümü (`serviceUnits.ts`) TS'te ve kart da istemcide hesaplıyor. Aynı işi SQL'de ikinci kez yazmak, §3'teki "kart ile sayfa farklı" anti-hedefini doğrudan riske sokar. Hacim küçük: ana lab bugüne kadar 80 sipariş; 24 aylık pencere (12 ay + geçen yılın 12 ayı) birkaç bin satırı geçmez. Bu karar yanlışsa (çok büyük bir lab gelirse) maliyeti, toplayıcıyı bir RPC arkasına taşımaktır; ekran sözleşmesi değişmez.

**Pencere:** seçili ayın 11 ay öncesinden seçili ay sonuna kadar, artı geçen yılın aynı 12 ayı. Tek sorguda `created_at >= (seçili ay − 23 ay)`. Sayfalama gerekiyorsa Supabase'in 1000 satır sınırı aşılmadan sayfalı okunur; sessizce kesilmez.

**Saf modül:** `modules/admin/workStats/aggregate.ts`
- Girdi: ham sipariş satırları, hekim → klinik eşlemesi, klinik adları, `unitByServiceName`, seçili ay, lab'ın bugünü.
- Çıktı: ay başına `{ uye, cene, adet }`, ay × iş tipi × kova miktarı, ay × klinik × kova miktarı, önceki ay ve geçen yıl farkları (geçen yıl verisi yoksa `null`).
- React ve Supabase bilmez; `node --test` ile test edilir (`aggregate.test.mts`).
- Kartla eşlik testi: aynı ham veriyle kartın ay toplamı ile modülün ay toplamı eşit. Kartın kodu şimdilik değiştirilmez; test, ikisinin de dayandığı `serviceUnits` fonksiyonlarını aynı sırayla kullandığını sabitler.

**Veri yok / eksik durumları**
- "Kayıt dönemi" **lab geneli**dir (benim kararım). Klinik ya da iş tipi süzgeci açıkken kayıt dönemi içindeki boş aylar "0" yazar (o klinik o ay göndermedi — doğru bilgi), kayıt dönemi öncesi aylar "kayıt yok". Ortalama ve kıyas da aynı sınırı kullanır.
- Lab'ın ilk siparişinden önceki aylar "kayıt yok" olarak gösterilir, "0" yazılmaz. 0 yalnız kayıt dönemi içinde hiç sipariş gelmeyen ay içindir. İlk sipariş ayı, penceredeki en eski `created_at`'tan değil ayrı bir `min(created_at)` okumasından alınır.
- Ana lab'da veri Haziran 2026'da başlıyor. Geçen yılla kıyas ilk kez Haziran 2027'de gerçek veriyle dolar.

## 7. Ekran

### 7.1 Yapışkan araç çubuğu (üstte)
- Sol: başlık "İş İstatistikleri" ve altında **ay seçici**: `‹ Kasım 2026 ›` oklarla bir ay geri/ileri; ortadaki etikete basınca kayıt dönemindeki ayların listesi açılır. İleri ok içinde bulunulan aydan öteye gitmez; geri ok kayıt döneminin ilk ayında durur. Ay değişince 24 aylık pencere yeniden okunur; okunmuş pencereler oturum içinde önbelleğe alınır, aynı aya dönüşte tekrar sorgulanmaz. Trend sütununa basmak da ayı seçer (benim kararım).
- **Klinik seçici:** varsayılan "Tüm klinikler". Arama kutulu liste; basılan düğmenin altından açılır ve oraya kapanır. Liste, penceredeki klinikleri en çok gönderenden aza sıralar.
- **Kıyas düğmesi:** iki konumlu segment, "Önceki ay" / "Geçen yıl". Varsayılan önceki ay.
- **Dışa aktarma:** "Excel" ve "PDF" düğmeleri (§8).
- Yarı saydam malzeme: kaydırınca içerik altından bulanık geçer, sert alt çizgi yerine kenarda yumuşak bir solma kullanılır. `PatternsShell` kaydırma kabı yüzünden `position: sticky` çalışmaz; `modules/admin/users/useStickyFollow.ts`'teki yöntem (gerçek kaydırma kaplarını dinleyip `translateY`) kullanılır ya da bu ekrana uyarlanır.

### 7.2 Sekmeler
Araç çubuğunun altında iki sekme: **"Genel bakış"** (varsayılan) ve **"Isı haritası"**. Sekme çubuğu proje pill kuralına uyar (CLAUDE.md §1c).

### 7.3 Genel bakış — üst: trend
- 12 sütun; her sütun bir ay, yüksekliği o ayın **üye** toplamı. Admin Özet'teki Üye Trendi kartının taranmış hap sütun dilinden türetilir.
- Seçili ay dolu accent, diğerleri soluk. Sütun altında ay kısaltması ve sayı.
- "Geçen yıl" kıyası seçiliyken geçen yılın aynı ayları soluk bir çizgi/işaret olarak üst üste gelir; verisi olmayan aylarda çizilmez.
- Sütuna basınca o ay seçilir; alt bölüm ve araç çubuğundaki ay etiketi güncellenir.
- Grafiğin üstünde **iş tipi çipleri**: "Tümü" + penceredeki en çok gelen iş tipleri (fazlası "Diğer…" altında). Bir çip seçilince sütunlar yalnız o iş tipinin miktarını gösterir. Çene/adet birimli bir tip seçilince sütun birimi o olur ve eksen etiketi birimi yazar.
- Kayıt olmayan aylar kesik çizgili boş sütun ve "kayıt yok" ile gösterilir.

### 7.4 Genel bakış — alt: seçili ay
**Dört kutu:** Toplam üye · Çene · Adet · 6 ay ortalaması (üye/ay). Ortalamaya yalnız kayıt dönemindeki aylar girer. İlk üç kutunun altında, seçili kıyasa göre fark: "−21 · Eki 84" ya da geçen yıl kıyasında "— · geçen yılın bu ayına ait kayıt yok". Fark yönü renkle değil işaret ve metinle de okunur (artış/azalış sözcüğü ekran okuyucuya verilir).

**İki liste yan yana** (dar ekranda alt alta):
- **İş tipleri:** en çok gelenden aza. Satır: ad, oransal çubuk, miktar + birim, kıyas farkı. Çubuk uzunluğu yalnız aynı birimdekiler arasında karşılaştırılır; çene/adet satırları farklı tonla çizilir ve sayının yanında birimi yazar.
- **Klinikler:** bu ay en çok üye gönderenden aza. Satır: klinik adı, üye miktarı (çene/adet varsa küçük not), kıyas farkı. Kıyas ayında gönderip bu ay göndermeyen klinikler listenin sonunda soluk, "bu ay 0" ile.
- **Bağlantı:** iş tipine basmak klinik listesini o tipi gönderenlere süzer (tekrar basınca kalkar). Kliniğe basmak üstteki klinik seçiciyi o kliniğe geçirir; sayfanın tamamı o kliniğe süzülür.
- İş tipi satırına basınca satırın altında o tipin 12 aylık mini grafiği açılır (aynı anda bir tane).

**Boş ay:** "Bu ay sipariş gelmedi" boş durumu (EmptyStateX); kayıt dönemi öncesiyse "Bu aya ait kayıt yok".

### 7.5 Isı haritası sekmesi
- Satır ekseni geçişi: "İş tipi" / "Klinik".
- Sütunlar: seçili ayla biten 12 ay. Hücre: miktar; rengin yoğunluğu satırın kendi en büyük değerine göre (her satır kendi ölçeğinde). Böylece az gelen bir tipin dalgalanması da görünür.
- Çene/adet birimli satırlar birim etiketini satır adının yanında taşır.
- Hücreye basınca o ayın o iş tipinde (veya o klinikte) gelen siparişleri listeleyen bir pencere açılır (sipariş no, klinik, iş tipi, miktar). Satıra basınca siparişin sayfasına gidilir. Pencere `U.modalOverlay` / `U.modalCard` ile, ortada.
- Klinik seçici burada da geçerlidir. "İş tipi" ekseninde tek kliniğin tablosu görünür; "Klinik" ekseninde tek satıra iner.

### 7.6 Dar ekran (<768 px)
Tek sütun. Trend grafiği yatay kaydırılır, kenarlarda yumuşak direnç gösterir ve seçili ay görünür alanda tutulur. Dört kutu 2×2 dizilir. İş tipi ve klinik listeleri alt alta durur. Isı haritası yatay kaydırılır, satır adı sütunu sabit kalır. Araç çubuğundaki klinik seçici ve kıyas aynı kalır; dışa aktarma tek bir "Dışa aktar" düğmesine toplanır, iki seçenekli küçük menü açar.

### 7.7 Görsel dil
- Zemin admin `bgPage` `#F7F9FC`; kartlar `surface`; accent admin kobaltı `#4771AB` (`usePanelTheme()`); hiçbir renk elle sabitlenmez.
- Rakamlar `tabular-nums`. Büyük rakamlar Inter Tight 300, negatif harf aralığı (≈ −0.025 × boyut). Bölüm etiketleri 11 px büyük harf.
- İkonlar yalnız `core/ui/icons` (HugeIcons line). Renkli sol-kenarlı kart **yok**.
- Tooltip gereken yerde `GlassTooltip`; tarayıcı `title=` kullanılmaz.
- **Koyu tema:** aynı anda yapılır. Hero/accent gereken yüzeylerde lacivert üçlü (`#001F3F → #002A5C → #004B87`); sütun ve ısı hücreleri koyu zeminde okunur bir mavi tonundan (`isDark` varyantı) türetilir; düz butonlar `U.plainBtn`.

### 7.8 Hareket ve his (Apple tasarım ilkeleri)
- **Basınca anında tepki:** sütun, çip, satır ve hücre basıldığı anda hafifçe küçülür ve vurgulanır (`scale ≈ 0.97`). Bırakmayı beklemez.
- **Değer değişimi yaylıdır ve kesilebilir:** ay, klinik ya da çip değişince sütun yükseklikleri ve kutu sayıları **ekrandaki mevcut değerden** hedefe kritik sönümlü yayla akar (sekmesiz; `react-native-reanimated` zaten projede). Hızlı ardışık seçimlerde animasyon sıraya girmez, yolda yeni hedefe döner.
- Mini grafik ve sipariş penceresi bastığın yerden açılır, oraya kapanır.
- `prefers-reduced-motion` açıkken yay ve kayma yerine kısa solma kullanılır. Sayılar doğrudan son değeri yazar.
- `prefers-reduced-transparency` açıkken araç çubuğu düz zemine geçer.

## 8. Dışa aktarma

Her iki biçim de **o an ekranda seçili olanı** alır: klinik, seçili ay, kıyas türü.

**İçerik (iki biçimde aynı):**
1. Başlık: "İş İstatistikleri · Kasım 2026 · Tüm klinikler" (veya klinik adı) · kıyas türü · oluşturulma zamanı.
2. Özet: toplam üye / çene / adet ve kıyas farkları.
3. İş tipi tablosu: iş tipi, birim, bu ay, kıyas ayı, fark.
4. Klinik tablosu: klinik, üye, çene, adet, kıyas üye, fark.
5. 12 ay tablosu: ay × iş tipi (birimli).

**PDF:** `core/print/exportHtmlPdf.ts` (web geniş ekranda yazdırma sekmesi, dar/PWA'da indirme, native'de paylaşım) ve lab anteti `labLetterheadApi`. Fatura/iş dökümü PDF'leriyle aynı antet. Kâğıt her zaman açık renk. Dosya adı: `is-istatistikleri-2026-11.pdf` (klinik seçiliyse adı eklenir, güvenli karakterlere indirgenir).

**Excel:** `modules/finance-clinic/export.ts`'teki HTML → `.xls` yöntemi. Sayılar hücrede sayı olarak durur, bölümler arası boş satır vardır. Dosya adı aynı kalıpta, `.xls`. Web'de indirme. **Native'de** (o dosyada native yolu yok) aynı HTML `expo-file-system` ile önbellek klasörüne `.xls` olarak yazılır ve `expo-sharing` ile paylaşım sayfası açılır; iki paket de projede zaten var, yeni bağımlılık değil (benim kararım).

**Metinler:** şablon ham HTML ürettiği için tüm başlık/sütun metinleri `autoT()` ve `printLocale()` ile yazılır (dört dil).

**Hata:** açılır pencere engeli veya üretim hatası düğmenin yanında görünür metinle gösterilir. Sessiz başarısızlık olmaz.

## 9. Çok dillilik

Ekrandaki tüm düz Türkçe metinler `auto.{en,de,fa}.json`'a aynı anda eklenir. Birleştirilmiş metinler (`${n} …`, "Eki 84" gibi) `autoT()` ile parçalanır. Ay adları `printLocale()` / `Intl.DateTimeFormat` ile yerelleştirilir, elle Türkçe dizi kullanılmaz. Farsça RTL'de grafik zaman ekseni soldan sağa kalır (zaman ekseni yönü), listeler ve araç çubuğu aynalanır.

## 10. Kısıtlar

- Admin Özet'teki diğer kartlara, `serviceUnits.ts` davranışına ve diğer panellere dokunulmaz. `serviceUnits.ts`'e yeni bir yardımcı **eklenebilir** ama mevcut fonksiyonların sonucu değişmez.
- DB değişikliği beklenmiyor. Gerekirse (ör. eksik bir indeks) CLAUDE.md'deki beş adımlı migration düzeni ve açık onay gerekir.
- Yeni npm bağımlılığı eklenmez (grafikler View/`react-native-svg` ile çizilir).
- `tsc --noEmit` 0 hata; mevcut testler yeşil.
- Deploy yalnız kullanıcı "deploy" deyince.

## 11. Yapıcıya bırakılanlar

- Bileşen ayrımı ve dosya düzeni (`modules/admin/workStats/` altında).
- Yay parametreleri: kritik sönüm, tepki ≈ 0,35 s civarı.
- İş tipi çip sayısının eşiği ("Diğer…"e düşme sınırı).
- Isı haritası renk yoğunluğu basamakları.
- Klinik seçicinin arama davranışının ayrıntısı.

## 12. Kabul

- Ana lab için Haziran–Kasım 2026 ay toplamları Üye Trendi kartıyla aynı: Haz 36 · Tem 19 · Ağu 75 · Eyl 32 · Eki 84 · Kas 63 üye; Kasım çene 4, adet 1 (2026-11-11 ölçümü; gün ilerledikçe Kasım artar).
- Bir kliniğe süzünce tüm bölümler o kliniğe iner; klinik toplamlarının toplamı + "Kliniği bilinmeyen" = genel toplam.
- Geçen yıl kıyasında Haziran 2027 öncesi her ay "—" ve not gösterir; hiçbir yerde uydurma yüzde çıkmaz.
- Excel ve PDF, ekrandaki seçimle aynı sayıları verir; dört dilde basılır.
- Koyu temada beyaz patlama veya görünmez metin yok; hareket azaltma açıkken yay/kayma yok.

## 13. Yapıcı denetiminden sonra verilen kararlar (2026-11-11)

Bağımsız bir okuyucu belgeyi kodla karşılaştırdı. Kullanıcıya sorulmadan şu kararlar verildi; yanlışsa düzeltilir:
1. Ay seçimi: araç çubuğunda ‹ › oklar + ay listesi; ay değişince pencere yeniden okunur, önbelleklenir (§7.1).
2. Native Excel: `expo-file-system` + `expo-sharing` ile paylaşım (§8).
3. Süzgeçli görünümde "kayıt yok" sınırı lab genelidir; içindeki boş aylar 0 (§6).
4. İptaller her yerde dışlanır; eşlik yalnız aylık toplamlar için. İş Tipi Dağılımı kartının iptalleri sayması ayrı bir hata olarak öneriliyor, bu işte dokunulmuyor (§5.4).
5. Sorgular `profile.lab_id` ile açıkça süzülür (§5.1).
