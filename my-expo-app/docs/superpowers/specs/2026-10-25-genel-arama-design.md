# Genel arama (2. dalga 1, Y1) — tasarım

**Tarih:** 2026-10-25
**Kaynak:** Denetim yol haritası 2. dalga madde 1 (`docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md`). Bulgu: `docs/lab-yoneticisi-raporu/5-gezinme-bulunabilirlik.md` (Y1, 5/5).
**Görsel:** Kullanıcı seçimi "B — ortada açılan arama penceresi" (`.superpowers/brainstorm/…/content/arama-yerlesim.html`).

## 1. Amaç ve neden

Bir hekim ya da klinik "şu hastanın işi ne durumda" diye aradığında lab sahibi bugün Siparişler ekranına gidip oradaki yerel aramayı kullanıyor. O arama yalnız ekrana yüklenmiş son 300 siparişte sipariş no, hasta, hekim ve iş tipine bakıyor; **klinik adını bulmuyor**. Her paneldeki üstteki "Ara..." kutusu ölü (Enter hiçbir şey yapmıyor), Ctrl+K yalnız menü adlarını arıyor ve yalnız admin + lab masaüstünde açılıyor; mobil admin'de hiç arama yok.

Başarı: hangi ekranda olursa olsun, kutuya hasta adını / sipariş no'yu / klinik adını yazıp **tek tıkla siparişin detayına** gitmek. Kullanıcı: "siparişin detay sayfası açılırsa yeterli".

## 2. Kullanıcının kararları (2026-10-25)

1. **Arayüz: ortada açılan arama penceresi (komut paleti).** Üstteki "Ara..." kutusuna tıklamak ya da Ctrl+K (Mac'te ⌘K) aynı pencereyi açar. Telefonda aynı pencere, + düğmesinin üstündeki arama düğmesiyle açılır (hazır `SearchAboveFab`).
2. **Aranacaklar ve tıklayınca gidilecek yer:**

   | Sonuç | Neye göre eşleşir | Tıklayınca |
   |---|---|---|
   | Sipariş | sipariş no, hasta adı, **klinik adı**, hekim adı | o siparişin detay sayfası |
   | Klinik | klinik adı | Sağlık Kurumları'nda o kliniğin kartı **açık** |
   | Hekim | hekim adı | **o hekimin siparişleri** listesi (Siparişler, o hekime süzülmüş) |
   | Fatura | fatura no | fatura detayı |
   | Sayfa | menü ve iç sayfa adları (bugünkü palet gibi) | o sayfa |

3. **Kim kullanır:** Herkes; herkes yalnız görmeye yetkisi olan şeyi bulur ("onlarda görmeye yetkileri olan şeyleri arayabilirler").
4. **Siparişler ekranının kendi aramasına klinik adı da eklenir.**

Kullanıcı aşağıdaki geri bildirimime itiraz etmedi (onaylanmış sayılır, düzeltme gelirse belge güncellenir):
- Sipariş satırında hasta, sipariş no, klinik, hekim, iş tipi, aşama/durum ve teslim tarihi görünür.
- Arşivlenmiş, iptal ve teslim edilmiş siparişler de çıkar; durum rozetiyle ayrılır.
- Türkçe harf ve büyük/küçük harf farkı aramayı bozmaz ("ayse" → "Ayşe", "ismail" → "İSMAİL", "isik" → "IŞIK"); sipariş no'nun bir parçası ("248") da eşleşir.
- Fatura = kliniklere kesilen satış faturaları; tedarikçiden gelen alış faturaları kapsam dışı.

## 3. Hedefler, hedef olmayanlar, yapılmaması gerekenler

**Hedefler**
- Tek arama penceresi bütün panellerde aynı davranır (admin, lab, klinik, hekim, istasyon/teknisyen); her panelde yalnız o panelde gidilebilecek ve kişinin yetkisinin açtığı sonuç grupları görünür (§5.4).
- Sipariş araması **sunucuda** yapılır: ekrana yüklenmiş son 300 siparişle sınırlı değildir.
- Mevcut palet davranışı korunur: menü/sayfa araması, ok tuşları + Enter, Esc ile kapatma, mobil açılış.

**Hedef olmayanlar**
- Alış (tedarikçi) faturası, stok, personel, kurye teslimatı, mesaj araması.
- Kurye paneli: bugün üst kutu ve palet yok; bu işte eklenmez.
- "Son aramalar", favoriler, sonuç önizlemesi.
- Siparişler ekranının 300 satır sınırını kaldırmak (genel arama eski siparişleri zaten bulur).
- Tam metin / benzerlik (trigram) dizini. Canlı veri küçük (2026-10-25: 77 sipariş, 68 fatura, 31 klinik, 16 hekim). §6'daki eşik aşılırsa ayrı iş.
- Fatura okuma kuralındaki lab-içi açık (aşağıda §7): bu iş onu **genişletmez** ama düzeltmez; ayrı madde.

**Yapılmaması gerekenler (bunlar olursa iş başarısız sayılır)**
- Bir kişinin ekranlarda göremediği bir kaydı (başka lab'ın siparişi, kliniğin başka kliniğe ait faturası, finans yetkisi olmayana fatura) aramada görmesi.
- Arama metninin (hasta adları) aktivite kaydına, bildirime ya da analitik olaya yazılması (KVKK).
- Bugün çalışan palet kullanımının (sayfaya gitme, kısayol, mobil açılış) bozulması; Siparişler ekranının mevcut filtre/parametre davranışının değişmesi.
- Her tuşa basışta sunucuya istek: yazma bitene kadar beklenir (§5.2).

## 4. Mevcut durum (inceleme, 2026-10-25)

- **Üst kutu:** `core/layout/PatternsShell.tsx:683-689` — yerel `searchQ`, Enter'da `onSearchSubmit?.()`; hiçbir layout bu prop'u vermiyor.
- **Palet:** `core/ui/CommandPalette.tsx` — props `navItems/onNavigate/accentColor`; öğeler senkron memo (:99-117), gruplama :129-136, web klavye dinleyicisi :79-96. Asenkron sonuç ve yükleniyor durumu yok. Durum: `core/store/commandPaletteStore.ts` (`openPalette` sorguyu sıfırlar).
- **Paneller:** masaüstü palet yalnız admin (`app/(admin)/_layout.tsx:212`) ve lab (`app/(lab)/_layout.tsx:250`, `filteredNavForPalette` yetki süzgeçli :218-222). Klinik, hekim, istasyon yalnız mobil palet; kurye hiç. `ADMIN_NAV_VISIBLE` yalnız özellik bayrağıyla süzülüyor. `SearchAboveFab` (`core/ui/mobile/PillTabBar.tsx:685`) ve `CommandPaletteFAB` hiç çizilmiyor. PillTabBar'ın kendi sayfa araması var (`filteredSearch` :211-218).
- **Siparişler ekranı araması:** `modules/orders/screens/OrdersListScreenV2.tsx:416-433` — istemci tarafında `order_number`, `doctor.full_name`, `patient_name`, `work_type`; klinik adı (`o.doctor.clinic.name`, satırda mevcut) kontrol edilmiyor. Veri `fetchAllWorkOrders` ile son 300 (`modules/orders/api.ts:274-292`). URL parametreleri yalnız `status` ve `filter` (`modules/orders/lib/listParams.ts`); hekim/klinik/arama parametresi yok.
- **Sipariş → hekim/klinik:** `work_orders.doctor_id` çok biçimli (`doctors.id` ya da `profiles.id`), FK yok; istemci `attachDoctors` (`api.ts:194-229`) ile `doctors(…, clinic:clinics(name))` + `profiles(full_name, clinic_id, clinic_name)` çözüyor. `work_orders.doctors_id` sütunu da var. Klinik panelinde isimler `resolve_doctor_names` RPC'siyle.
- **Klinik kartı:** `modules/clinics/screens/ClinicsScreen.tsx` — tek parametre `editClinic` (:215-224, ref korumalı). Kart açılması `expanded` Set'i (:204, :779); liste düz ScrollView (:538), satırlarda ref/onLayout yok.
- **Fatura detayı:** admin/lab `invoice/[id]` → FinanceHubScreen + InvoiceDetailScreen; klinik/hekim `invoice/[id]` → InvoiceDetailScreen (salt okunur). `fetchInvoiceById` UUID ya da `invoice_number` kabul eder (`modules/invoices/api.ts:81-100`). Görünen no `invoice_number` (`FTR-YYYY-NNNNN`); e-fatura no ayrı sütun `efatura_number`.
- **Veritabanı:** `pg_trgm` ve `unaccent` yok. `ilike` Türkçe harfleri katlamıyor (denendi: `'Ayşe' ilike '%ayse%'` = false, `lower('İ')` = 2 karakter). Şu katlama çalışıyor: `translate(lower(x), 'ıiçğöşüâîû' || chr(775), 'iicgosuaiu')`.
- **Örnek sorgu:** Simanty `siparisAra` (`modules/denty/tools.ts:774-789`) — `work_orders` üzerinde `ilike` + `sanitizeIlikeTerm` (`core/util/search.ts:5`), limit 8.

## 5. Tasarım

### 5.1 Açılış
- Masaüstü: üst kutuya tıklamak / odaklanmak paleti açar (kutuya yazılmış metin palete taşınır). Ctrl+K ve ⌘K her panelde (admin, lab, klinik, hekim, istasyon) paleti açar — bugün yalnız admin + lab.
- Mobil: **üst çubukta (QR'ın solunda) arama düğmesi** aynı paleti açar — admin, lab, klinik, hekim. *Kullanıcı kararı 2026-10-25:* + düğmesinin üstü Simanty düğmesine ayrılmış (çakışıyordu), arama üst çubuğa alındı. İstasyonda çubuktaki "Ara" sekmesi zaten paleti açar (ek düğme yok); kurye kapsam dışı.
- *Kullanıcı isteği 2026-10-25:* admin mobil üst çubuğundan Mesajlar düğmesi kaldırıldı (alt çubukta Mesaj var). Lab, klinik ve hekimde alt çubukta Mesaj olmadığı için üstteki düğme kalır.

### 5.2 Arama davranışı
- Boş kutuda bugünkü gibi sayfa listesi.
- En az 2 karakter; yazma durduktan ~250 ms sonra tek sunucu isteği; eski istek yanıtı yenisinin üstüne yazılmaz.
- Sonuçlar gruplu, sıra: **Siparişler · Klinikler · Hekimler · Faturalar · Sayfalar**. Grup başına en çok 6 sonuç (siparişte 8). Sayfa eşleşmesi istemcide, anında.
- Siparişlerde tam sipariş no eşleşmesi en üstte, sonra en yeni oluşturulan. Sipariş grubu sınıra ulaşırsa son satırda "Daha fazla sonuç var, aramayı daraltın" ipucu görünür (tıklanmaz). *Benim kararım:* "Siparişler'de tümünü gör" + `?q=` yok — Siparişler ekranı son 300 siparişi istemcide süzdüğü için eski eşleşmeler orada eksik kalırdı; ekranın veri çekişini değiştirmek kapsam dışı.
- Yükleniyor, sonuç yok ve hata durumları pencerede görünür (hata sessiz geçmez).
- Klavye: ok tuşları gruplar arasında da gezer, Enter seçer, Esc kapatır.

### 5.3 Satır içerikleri
- **Sipariş:** sipariş no · hasta adı; alt satır klinik · hekim · iş tipi; sağda durum/aşama rozeti + teslim tarihi. Arşiv/iptal/teslim rozetle ayrılır.
  - *Benim kararım — arşiv:* arşivlenmiş siparişler yalnız Siparişler ekranında "Arşivi göster" seçeneği olan kişiye (bugün admin paneli, `OrdersListScreenV2.tsx:622`) çıkar; diğerlerinde ekranları gibi arşiv hariç (`fetchAllWorkOrders` varsayılanı, `api.ts:286`). İptal ve teslim edilmiş siparişler herkese çıkar (ekranlarda da görünüyorlar).
- **Klinik:** ad; alt satır hekim sayısı (ve pasifse "pasif").
- **Hekim:** ad; alt satır klinik adı.
- **Fatura:** fatura no (e-fatura no eşleştiyse o da); alt satır klinik · tutar (kaydın para birimiyle) · durum.
  - *Benim kararım — klinik/hekim paneli:* klinik finans listesiyle aynı küme: aktif lab'daki kliniğin faturaları, `iptal` hariç (`modules/finance-clinic/api.ts` `.neq('status','iptal')`). Hekim paneli bugün `ClinicFinanceHubScreen` ile kliniğin tüm faturalarını gösteriyor; arama da aynısını yapar (hekime göre daraltma yok).
- **Sayfa:** bugünkü palet satırı.

### 5.4 Yetki ve panel kuralı
Bir sonuç **ancak** hem (a) kişi o kaydı bugün ekranlarda görebiliyorsa, hem (b) gidilecek sayfa o panelde varsa ve kişinin menüsü o sayfayı gösteriyorsa listelenir.

| Panel | Siparişler | Klinikler | Hekimler | Faturalar | Sayfalar |
|---|---|---|---|---|---|
| admin, lab | menüde Siparişler varsa (lab: `view_orders`) | menüde Sağlık Kurumları varsa | menüde Siparişler varsa | menüde Finans varsa (lab: `view_financials`) | süzülmüş menü |
| klinik | kendi siparişleri (menü `orders_view`) | — | — | kendi faturaları | menü |
| hekim | kendi siparişleri | — | — | kendi faturaları | menü |
| istasyon (teknisyen) | panelin Siparişler sayfası varsa | — | — | yalnız finans yetkisi varsa ve panelde fatura sayfası varsa (bugün yok → —) | menü |

- Satırların kendisi sunucuda **çağıranın kimliğiyle** okunur (RLS uygulanır); arama yeni bir okuma yolu açmaz.
- *Benim kararım — çoklu-lab klinik:* klinik/hekim kullanıcıları yalnız **aktif lab**'da arar (ekranlar gibi `getActiveLabId`/`labEq`); RLS'in açtığı diğer bağlı lab'lar aramaya girmez. Sonuca tıklayınca lab değişmez.
- *Benim kararım — fatura yetki anahtarı:* sunucudaki kontrol, menünün Finans için kullandığı anahtarla aynıdır (lab: `view_financials`; istemci eşlemesi `view_financials`→`view_finance`, sunucuda ikisi de kabul edilir) ya da `manage_finance`. Canlıda (2026-10-25) `lab_manager` ve `technician` rollerinde finans anahtarı yok, lab'a özel yetki seti yok; §6'daki "lab müdürü fatura görmez" satırı bu veriye dayanır, yetki verilirse görür.
- Faturalar sunucuda ayrıca finans yetkisine bağlanır (§7): RLS bugün lab'daki herkese fatura okutuyor, arama bunu yaymaz.
- Admin menüsü bugün yalnız özellik bayrağıyla süzülüyor; admin rolü her şeyi gördüğü için sorun değil, ama grup kararı menüden alınacaksa admin için de aynı süzgeç uygulanır.

### 5.5 Gidilecek sayfalar (yeni parametreler, eklemeli)
- **Sipariş:** mevcut `/<panel>/order/<id>` (panel-agnostik çözüm: `useSegments()[0]`, bkz. hafıza `feedback_panel_agnostic_routes`).
- **Klinik:** Sağlık Kurumları'na yeni `?clinic=<id>` parametresi: sekme "Tümü"ye, filtre ve arama temizlenir, kart açılır ve görünür alana kaydırılır. `editClinic` ile aynı ref korumalı desen; mevcut davranış değişmez.
- **Hekim:** Siparişler'e yeni `?doctor=<id>` parametresi: liste o hekime süzülür, ekranda süzgeç görünür ve kaldırılabilir. Süzgeç sunucu sorgusuna da uygulanır (son 300 sınırına takılmaz). Mevcut `status`/`filter` parametreleriyle birlikte çalışır.
  - *Benim kararım — "hekim" nedir:* hekim sonucu `doctors` tablosundaki kayıttır (Sağlık Kurumları'nın gösterdiği lab hekim rehberi). `?doctor=<doctors.id>` hem `work_orders.doctor_id = doctors.id` olan hem de o hekime bağlı hekim hesabının profil kimliğiyle açılmış siparişleri kapsar (profil→hekim bağı, bkz. hafıza "Hekim hesabı oto-bağ" / `_doctor_profile_owns_doctor`). Bağ sütununun adı uygulayıcı tarafından doğrulanır.
- **Fatura:** mevcut `/<panel>/invoice/<id>`.

### 5.6 Siparişler ekranı araması
`OrdersListScreenV2.tsx:424-428` eşleşmesine `o.doctor?.clinic?.name` eklenir; aynı Türkçe katlama kuralı istemcide de uygulanır (ayse → Ayşe). Mobil liste aynı süzgeci kullandığı için otomatik düzelir.

### 5.7 Sunucu (öneri; ayrıntı uygulayıcının)
- Yeni RPC (ör. `global_search(p_q text, p_kinds text[])`) **SECURITY INVOKER**: dört kaydı tek gidiş-dönüşte döndürür; çağıranın RLS'i uygulanır. Hangi grupların isteneceğini istemci paneline göre gönderir; sunucu faturalarda ayrıca yetki kontrol eder.
- Katlama için IMMUTABLE yardımcı (ör. `search_fold(text)`, §4'teki `translate`).
- Sipariş → klinik/hekim adı çözümü `doctor_id` çok biçimliliğine uyar (`doctors` ya da `profiles`). RLS bir adı gizliyorsa satır yine çıkar, ad boş kalır.
- `ilike` deseninde `%`/`_` kaçışı (`sanitizeIlikeTerm` eşdeğeri).
- Veritabanı adımı kullanıcı kuralıyla: canlı tanım, geri alma, rol rol geri alınan denemeler (admin, lab müdürü, teknisyen, klinik yöneticisi, hekim; başka lab'ın kaydı görünmemeli), onay, uygulama.

## 6. Doğrulama ölçütleri

| Kim | Deneme | Beklenen |
|---|---|---|
| Lab sahibi | "ayse", "AYŞE", hasta adının parçası | aynı siparişler |
| Lab sahibi | sipariş no parçası ("248") ve tam no | tam eşleşme en üstte |
| Lab sahibi | klinik adı | Klinikler grubunda klinik + o kliniğin siparişleri |
| Lab sahibi | fatura no / e-fatura no | Faturalar grubunda fatura, tıklayınca detay |
| Lab sahibi | hekim → tıkla | Siparişler o hekime süzülü, süzgeç kaldırılabilir |
| Lab sahibi | klinik → tıkla | Sağlık Kurumları'nda kart açık ve görünür |
| Lab müdürü / teknisyen | fatura no | Faturalar grubu yok (yetki yok) |
| Klinik yöneticisi / hekim | başka kliniğin hasta adı / sipariş no | sonuç yok |
| Herkes | başka lab'ın sipariş no'su | sonuç yok |
| Mobil admin | + üstündeki arama düğmesi | palet açılır, aynı sonuçlar |
| Her panel | Ctrl+K, üst kutu | palet açılır; sayfaya gitme bugünkü gibi |

Ek: `tsc` 0; saf yardımcılar (katlama, sıralama, panel→grup kararı, parametre ayrıştırma) için `node --test` testleri; dört dil sözlüğü eşit; açık + koyu tema, masaüstü + telefon ekran kontrolü; yazma sırasında tek istek (ağ panelinde doğrulanır). Performans eşiği: sipariş sayısı ~20.000'i ya da arama yanıtı 300 ms'yi geçerse trigram dizini ayrı iş olarak açılır.

## 7. Yan bulgu (bu işin kapsamı dışında)

`invoices` okuma kuralı `invoices_lab_select` yalnız `lab_id = get_my_lab_id()` — lab'daki herkes (teknisyen, kurye dahil) fatura tutarlarını sorguyla okuyabiliyor; ekranlar bunu finans yetkisiyle gizliyor. 0b'deki İK tablolarının benzeri. Arama bunu genişletmez (§5.4); kuralın kendisi ayrı bir madde olarak kullanıcıya sunulur.

## 8. Uygulayıcıya bırakılanlar

- Paletin asenkron sonuçla nasıl genişletileceği (mevcut bileşene ekleme ya da yanına yeni bileşen); mevcut davranış korunmak şartıyla.
- RPC'nin adı, imzası, dönüş şekli; istemci tarafında grup başına sorgu mu tek RPC mi (tek RPC önerilir).
- Mobilde + düğmesi olmayan çubuklarda giriş noktası (§5.1).
- Kaydırma tekniği (`scrollTo` + `onLayout` haritası ya da web'de `scrollIntoView`).
- Yeni metinler (ör. "Daha fazla sonuç var, aramayı daraltın", "Sonuç yok", "Aranıyor…") dört dilde, koyu tema token'larla; ikonlar HugeIcons adaptöründen.
