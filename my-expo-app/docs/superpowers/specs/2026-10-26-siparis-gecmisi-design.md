# Sipariş geçmişi ve Loglar süzgeci (2. dalga 3) — tasarım

**Tarih:** 2026-10-26
**Kaynak:**
- Yol haritası `docs/superpowers/plans/2026-10-24-denetim-yol-haritasi.md` (2. dalga 3).
- Denetim raporu: "Sipariş geçmişi siparişin içinde değil. Yalnız Ayarlar → Loglar'da, son ~1000 kayıt içinde aranıyor".
- Mevcut durum taraması (2026-10-26) ve canlı şema kontrolü.

## 1. Amaç ve neden

Kullanıcı bir siparişin geçmişine şunları öğrenmek için bakıyor:
- Siparişi hangi tarih ve saatte kim oluşturdu.
- Teslim için hangi gün söz verildi.
- Kurye ne zaman teslim etti.
- Hekimden hangi notlar ve mesajlar geldi.

Loglar ekranında da "bir siparişte kim neyi değiştirdi" sorusunu arıyor. Bugün bu bilgilerin bir kısmı hiç kaydedilmiyor, bir kısmı birden çok tabloya dağılmış. Kayıtları da yalnız sahip görebiliyor. Bu tasarımın üç parçası var:
- Sipariş içinde tek bir "Geçmiş" akışı.
- Siparişte yapılan değişikliklerin kaydı.
- Loglar ekranında sunucu tarafında süzme.

**Başarı:** Bir hekim "geç geldi" ya da "şunu yazmıştım" dediğinde, lab sipariş detayındaki Geçmiş sekmesinden şunları tek bakışta görür ve saatleriyle okur:
- ne zaman oluşturuldu ve ne söz verildi;
- teslim tarihi kim tarafından, ne zaman değiştirildi;
- iş neden beklemeye alındı;
- kurye ne zaman teslim etti;
- hekim ne yazdı.

## 2. Kullanıcının kararları (2026-10-26)

1. **Yerleşim A: tek zaman çizelgesi.**
   - Olaylar tek akışta, en eski üstte.
   - Üstte süzgeç çipleri: Tümü · Teslim · Notlar ve sohbet · Üretim.
   - **Her satırda tarih ve saat** (ör. 12 Eki 14:32) ve işi yapan kişinin adı yazar ("saatte yazsın").
2. **Akışta görünecekler:**
   - Oluşturma: kim, ne zaman, o anda söz verilen teslim günü.
   - Teslim tarihi değişiklikleri: kim, ne zaman, eski → yeni.
   - Kurye: teslim alma ve teslim etme anı, teslim alan kişi.
   - Hekim notları ve sohbet mesajları.
   - Durum ve aşama değişiklikleri.
   - Dosya ve fotoğraf yüklemeleri.
   - Değişiklik ve iptal talepleri.
3. **Revizyon ve devam siparişleri** iki yönlü görünür.
   - Ana siparişte: "Revizyon açıldı · #NO · kim, ne zaman", numara bağlantılı.
   - Yeni siparişte: "#NO'nun revizyonu olarak açıldı". Devam siparişi için aynısı.
4. **Kullanıcının onayıyla eklenenler (benim önerim):**
   - Beklemeye alma ve devam ettirme: kim, ne zaman, neden.
   - Hekim (tasarım) onayı: istendi, onaylandı ya da düzeltme istendi.
   - Prova: gitti, döndü.
   - Teknisyen ataması ve devri.
   - Kuryenin tüm gidişleri (ara gidişler dahil).
   - İmplant parçası talebi.
   - Fatura ve tahsilat (yalnız yetkiliye).
   - Hekimin verdiği değerlendirme puanı.
5. **Hekim ve klinik de Geçmiş'i görür.**
6. **Loglar'da asıl ihtiyaç: "bir siparişte kim neyi değiştirdi".**
   - Siparişin önemli alanları değiştikçe "kim · ne zaman · hangi alan · eski → yeni" kaydı tutulur.
   - Loglar ekranı süzmeyi sunucuda yapar: tarih aralığı, kişi, eylem türü, sipariş numarası. Sayfa sayfa yüklenir, 2.000 kayıt sınırı kalkar.
   - Loglar'da bir sipariş satırı o siparişin Geçmiş sekmesini açar.
7. **Hekim ve klinik yalnız onları ilgilendiren olayları görür** (okuyucu sorusu 1, "Yalnız onları ilgilendiren").
   - **Görünenler:**
     - Oluşturma ve teslim tarihi değişiklikleri.
     - Durum adımları (alındı, üretimde, hazır…).
     - Klinik kaynaklı beklemeler (`responsible='client'`), nedeniyle.
     - Prova, hekim onayları, kurye.
     - Hekim notu ve sohbet; değişiklik ve iptal talepleri.
     - İmplant parçası talebi, değerlendirme.
     - Fatura ve tahsilat, yalnız fatura yetkilisine.
   - **Lab kaynaklı bekleme:** yalnız "Beklemede / devam etti" olarak görünür, nedeni yazmaz.
   - **Görünmeyenler:**
     - Kalite kontrol reddi ve yeniden iş.
     - Aşama ayrıntısı, teknisyen ataması ve devri.
     - Malzeme tüketimi.
     - Lab notu (görünür işaretli değilse), yönetici notu, durum geçmişindeki iç notlar.
8. **Loglar ekranını yalnız sahip görür** (okuyucu sorusu 5, "Yalnız sahip").
   - Erişim genişlemez: bugünkü `activity_logs` kuralı, yani `is_admin_user()` + kendi lab'ı.
   - Kayıtları okuyamayan kişiye (ör. ayar yetkili müdür) Loglar sekmesi hiç gösterilmez; boş ekran kalkar.
   - Müdür, sipariş içindeki Geçmiş sekmesinde o siparişin kayıtlarını yine görür.

## 3. Benim kararlarım (bu belgeyle sunuluyor)

- **Görünürlük (karar 5'in ayrıntısı):**
  - Hekim ve klinik lab içi notu (`lab_notes`) görmez; `lab_notes_visible` açıksa görür. Yönetici notunu (`manager_notes`) hiç görmez.
  - Teknisyen adları hekim ve kliniğe mevcut "teknisyen adı görünürlüğü" kuralıyla gösterilir (`get_display_tech_names`: tam ad / ad / gizli).
  - Fatura ve tahsilat satırları:
    - Lab'da `lab_can_view_finance()` olana görünür.
    - Klinikte `can_view_clinic_billing()` olana görünür.
    - Fiyat ve iskonto alanlarının değişikliği de aynı kurala bağlıdır.
  - Teknisyen yalnız kendi işlerinin geçmişini görür (rol görünürlüğü kuralı, `can_see_work_order_id`). Kurye yalnız kendi teslimatlarının siparişlerini görür.
- **Kaynaklar birleştirilir:** Geçmiş tek bir log tablosundan değil, siparişin kendi kayıtlarından okunur. Eskiye dönük de dolu görünür:
  - `work_orders`: oluşturma, revizyon ve devam bağları.
  - `status_history`.
  - `order_stages` zamanları: atama, başlama, bitiş, onay.
  - `work_order_holds`: başlama, bitiş, neden, kişiler.
  - `deliveries`: bacaklar; alındı ve teslim zamanı, teslim alan.
  - `order_messages`.
  - Hekim notu ve lab notu.
  - `work_order_photos` ve ekler.
  - `order_change_requests` ve `order_cancellation_requests`.
  - `provas`, `approvals` ve `doctor_approval_*` alanları.
  - `order_implant_parts`, `order_reviews`, `invoices` ve `payments`.
  - `activity_logs`: alan değişiklikleri ve log'a özgü olaylar.
- **Tek sunucu fonksiyonu:** Akışı `order_history(p_order uuid)` döndürür (SECURITY DEFINER).
  - Önce çağıranın siparişi görebildiğini doğrular. Lab için `can_see_work_order_id`; klinik ve hekim için mevcut sipariş okuma kuralı.
  - Satırları yukarıdaki görünürlük kurallarıyla süzer.
  - Her satır: zaman, tür kodu, kategori (teslim / notlar_sohbet / uretim / diger), kişi adı, ayrıntı (jsonb), gerekiyorsa bağlantılı sipariş kimliği ve numarası.
  - `activity_logs` RLS'i bugün yalnız sahibe açık; bu yüzden fonksiyon DEFINER. RLS değiştirilmez.
- **Değişiklik kaydı:** `work_orders` üzerinde AFTER UPDATE tetikleyicisi önemli alanlarda değişiklik varsa tek bir `activity_logs` satırı yazar. Mevcut `log_activity()` RPC'sini kullanır.
  - Satır içeriği: `entity_type='work_order'`, eylem "Siparişi düzenledi", `metadata.fields = [{field, old, new}]`.
  - İzlenen alanlar:
    - Hasta: adı, yaşı (değersiz, aşağıdaki karara bakın).
    - İş: iş tipi, diş numaraları, renk, ölçü/model türü, teslim yöntemi.
    - Teslim tarihi, hekim, acil işareti.
    - Notlar: hekim notu, lab notu.
    - İmplant: marka, dişler, ayrıntı.
    - Fiyatlar kalemlerde; aşağıdaki kalem kararına bakın.
  - Teslim tarihi değişikliği ayrıca kendi tür koduyla gösterilir.
  - Mevcut klinik düzenleme kaydıyla (`client_update_order`) aynı değişikliği ikinci kez yazmaz.
  - Kişi: `auth.uid()`; oturumsuz (cron/sistem) ise "Sistem".
- **Kalem değişiklikleri** (okuyucu sorusu 2):
  - Siparişin fiyat, adet, hizmet ve kalem dişleri `order_items`'ta tutuluyor. Her düzenlemede (`_apply_order_edit`, hem `client_update_order` hem `admin_update_order`) kalemler silinip yeniden yazılıyor.
  - Bu yüzden kalem farkı düzenleme fonksiyonunun içinde hesaplanır: eski küme ↔ yeni küme, eklenen / çıkarılan / adet-fiyat-diş değişen kalem. Sonuç tek bir "Kalemleri düzenledi" kaydı olur.
  - Fiyat değerleri yalnız finans yetkilisine gösterilir.
  - `work_orders.sale_price` ve `discount_amount` hiçbir yerde yazılmadığı için izlenmez.
- **Teknisyen devri** (okuyucu sorusu 3): bugün iz bırakmıyor (`ReassignModal` `technician_id`'yi doğrudan değiştiriyor). `order_stages` üzerinde AFTER UPDATE OF technician_id tetikleyicisi "devir: kimden → kime" kaydı yazar. Hata yutulur, aynı güvenlik kuralı geçerli.
- **Hasta adı ve yaşı değişikliği değersiz kaydedilir** (okuyucu sorusu 4, KVKK): kayıtta yalnız "hasta adı değişti" yazar, eski/yeni değer tutulmaz. Loglar kalıcıdır, hasta verisini anonimleştirme yolu yoktur; genel arama tasarımında da hasta adı log'da ihlal sayılmıştı. Diğer alanlarda eski → yeni tutulur.
- **Geçmiş başlıkları ekranda üretilir:** satırlar tür kodlarıyla gelir, başlıklar istemcide dört dilde oluşturulur. Veritabanındaki Türkçe `action` metinlerine dayanılmaz. Bugün "Durumu değiştirdi → Teslim Edildi" en/de/fa'da Türkçe kalıyor; Loglar ekranındaki satırlar için de bu boşluk kapatılır.
- **Loglar ekranı:**
  - Sunucu fonksiyonu `activity_log_search(p_from, p_to, p_actor, p_kind, p_order_no, p_before timestamptz, p_limit int)` imleçle sayfalar.
  - Erişim bugünkü gibidir: yalnız şu an Loglar'ı görebilen sahip/yönetici; lab'a süzülür.
  - Kişi süzgeci lab'daki kişilerin listesinden seçilir.
  - Sipariş numarası araması, o siparişe bağlı aşama ve talep kayıtlarını da bulur.
  - Sipariş satırına basınca o siparişin detayı Geçmiş sekmesi açık gelir.
- **Mevcut kod:**
  - `OrderDetailScreenV2.tsx` içindeki kullanılmayan yerel `ActivityFeed` silinir, yerini yeni bileşen alır.
  - Masaüstünde yan sekme kartına (Hekim notu · Lab notu · Dosyalar) "Geçmiş" sekmesi eklenir.
  - Mobilde (`OrderDetailMobileHandoff`) "Aktivite" bölümü Geçmiş akışını gösterir.
  - Mobildeki ölü `activities` prop'u (yanlış alanları okuyordu) kaldırılır.
- **Performans:** `activity_logs` için `(entity_id)` ve `(lab_id, created_at desc)` indeksleri eklenir. Sipariş geçmişi tek RPC çağrısıdır; sayfalama gerekmez (bir siparişin olayları sınırlı).

## 4. Hedefler, hedef dışı, istenmeyen sonuçlar

**Hedefler:**
- §2 ve §3'teki Geçmiş akışı (masaüstü + mobil, tüm paneller).
- Alan değişikliği kaydı.
- Loglar'da sunucu süzgeci ve sayfalama.
- Dört dil, koyu tema.

**Hedef dışı:**
- Eski (bu işten önceki) alan değişikliklerini geri üretmek. Kayıt olmadığı için mümkün değil.
- Söz verilen teslim için saat alanı eklemek. Teslim tarihi gün olarak kalır.
- Aşama zamanlama raporları.
- `activity_logs` RLS kuralını genişletmek.
- Yeni bildirim üretmek.

**İstenmeyen sonuçlar:**
- Hekim ya da kliniğin lab içi not, yönetici notu, finans ya da gizlenmiş teknisyen adı görmesi.
- Teknisyenin başkasının işinin geçmişini görmesi.
- Saatsiz satır.
- Aynı değişikliğin iki kez görünmesi.
- Sipariş detayının belirgin yavaşlaması.
- Çalışan sipariş akışlarının (aşama, teslim, düzenleme) değişiklik tetikleyicisi yüzünden bozulması. Tetikleyici hata verirse güncelleme yine başarılı olmalı.

## 5. Kısıtlar

- **Veritabanı değişikliği beş adımda yapılır:**
  1. Canlı tanım kaydedilir.
  2. Geri alma betiği hazırlanır.
  3. Rol rol geri alınan işlemde denenir: sahip, müdür, teknisyen, kurye, klinik yöneticisi, hekim.
  4. Kullanıcı onayı alınır.
  5. Uygulanır ve canlıda doğrulanır.
- **Tetikleyici güvenli olmalı:** log yazımı hata verirse sipariş güncellemesi geri alınmaz (yakalanır). Sıcak tablo; yalnız izlenen alanlar gerçekten değiştiğinde tek satır yazılır.
- **Rol görünürlüğü** (`project_role_visibility`) korunur. Yeni DEFINER fonksiyonlar rol adı değil yardımcılar kullanır: `lab_can_view_finance`, `can_view_clinic_billing`, `can_see_work_order_id`, `get_display_tech_names`.
- **Ekran kuralları:**
  - Dört dil aynı anda, `auto.{en,de,fa}.json` eşit.
  - Koyu tema token'larla.
  - Sayfa kenarı `PAGE_PADDING`.
  - İkonlar `core/ui/icons`.
  - Saat ve tarih lab saat diliminde (`lab_tz`, tek tanım).
- **Doğrulama:** `tsc --noEmit --incremental false` 0 hata; test paketi yeşil.
- **Commit ve yayın:** commit yok; yayın yalnız "deploy" ile.
- **KVKK:** çıktılarda hasta/kişi adı ve tutar yazılmaz.

## 6. Uygulayıcıya bırakılanlar

- `order_history` satır şeması ve tür kodlarının tam listesi; kategori eşlemesi §2'deki çiplere uyar.
- Akıştaki küçük olayların birleştirilmesi. Örnek: aynı dakikada aynı kişinin aşama "başladı" + "bitti" satırları tek satır olabilir; okunabilirlik için uygulayıcının kararı.
- Bileşen ve dosya düzeni: `modules/orders/history/` önerisi.
- Loglar'daki eylem türü listesi: mevcut `entity_type` değerleri + yeni tür kodları.
- `activity_logs` bugünkü satırlarının (2.258) Loglar'da yeni süzgeçlerle aranabilmesi. Eski Türkçe `action` metinlerinden türe eşleme.

## 7. Kabul ölçütü

- **Örnek sipariş üzerinde canlı ölçüm (geri alınan işlemde):**
  - Oluşturma, teslim tarihi değişikliği, beklemeye alma, kurye teslimi ve bir mesaj Geçmiş'te doğru sırada ve saatleriyle görünür.
  - Hekim ve klinik yöneticisi lab notu ve finans satırı görmez.
  - Teknisyen başka siparişin geçmişini alamaz.
- **Değişiklik kaydı:**
  - Bir alan değişikliği tam bir kez kaydedilir.
  - Değişmeyen güncelleme kayıt yazmaz.
  - Tetikleyici hatası güncellemeyi bozmaz.
- **Loglar:**
  - Tarih, kişi, tür ve sipariş no süzgeçleri sunucudan doğru sayıda kayıt döndürür.
  - 2.000'den eski kayda sayfalayarak ulaşılır.
