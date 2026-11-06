# Ön ekstre, hekim onayı ve kesinleşmiş fatura kilidi — tasarım

Tarih: 2026-11-06 · Durum: taslak (kullanıcı okuması bekleniyor)

## 1. Amaç ve neden

Siman kalıcı ve birçok lab'ın kullanacağı bir sistem. Fatura tarafında yerleşik muhasebe yazılımlarının (Logo, Mikro, Paraşüt, Odoo) yıllardır uyguladığı düzen izlenir: **kesinleşmiş fatura düzenlenmez ve silinmez; düzeltme yeni bir belgeyle yapılır.** Böylece her değişikliğin izi kalır.

Sorun şu: ekstreler genelde ay sonunda hekime gönderiliyor ve hekim itiraz edebiliyor. Örnekler: "bu işin fiyatı şu olacaktı", "model ücretsiz olacaktı". Bugün lab bu itirazları kesilmiş faturayı "Taslağa Dön" ile açıp düzelterek çözebiliyor. Bu, değişmezlik kuralına ters.

Çözüm: itirazı fatura kesinleşmeden önce yakalamak.
- Faturalar ay boyunca taslakta kalır ve ekstrede "ön ekstre" olarak görünür.
- Hekim kalemlere not ya da itiraz yazabilir.
- Faturalar, hekim ya da klinik onay verince kesinleşir.

Bu akış lab'a göre değişebildiği için bir ayardır. Lab'lar kendi düzenine göre açar ya da kapatır.

## 2. Hedefler

1. **Ayar.** Finans Ayarları'nda lab bazında "Hekim/klinik onayıyla kesinleştir" seçeneği (açık/kapalı).
2. **Ön ekstre (ayar açıkken).**
   - Taslak faturalar ekstrede "Onay bekliyor" olarak görünür.
   - Ekstrede iki ayrı rakam olur:
     - **Kesinleşmiş bakiye:** ödenmesi gereken tutar. Hatırlatma ve gecikme hesapları yalnız bunun üzerinden yapılır.
     - **Onay bekleyen tutar:** bilgi amaçlıdır.
3. **Not ve itiraz.**
   - Hekim ya da klinik ekstredeki her kaleme kolayca not yazabilir, hem cep telefonundan hem bilgisayardan.
   - Not yazılan kalem "İtiraz" olarak işaretlenir.
   - Lab itirazı ekstrenin üstünde görür, taslağı düzeltir ve yanıt yazabilir.
4. **Onay yolları.** Her onayda kim, ne zaman, hangi yoldan onayladı bilgisi saklanır.
   - Hekim ya da klinik yöneticisi kendi panelinden "Onayla" der.
   - WhatsApp ya da e-postayla gelen **bağlantıdan** onaylar. Giriş gerekmez.
   - **PDF ekstredeki bağlantı ya da karekoddan** onaylar.
   - **Lab klinik adına onay kaydeder.** Açıklama zorunludur, örneğin "05.11.2026 telefon görüşmesine göre". Ekstrede "Lab tarafından kaydedildi · tarih · gerekçe" diye ayrıca görünür; hekimin kendi onayıymış gibi gösterilmez.
5. **Kısmi onay.** Hekim "İtirazsız kalemleri onayla" ya da "Tümünü onayla" diyebilir.
   - Onaylanan kalemlerin faturaları kesinleşir.
   - İtirazlı kalemi taşıyan fatura, itiraz çözülene kadar taslakta kalır.
6. **Onay gelmezse bekler.** Faturalar kendiliğinden kesinleşmez. Lab yöneticisinin "klinik adına onay kaydet" yolu çıkış kapısıdır.
7. **PDF ekstre** aynen kalır ve onay yollarından biri olarak kullanılır.
   - Ön ekstre PDF'inde belirgin bir "Ön ekstre — onay bekliyor" ibaresi bulunur.
   - PDF'te onay bağlantısı ya da karekod bulunur.
8. **Kesinleşmiş fatura kilidi (ayardan bağımsız, her lab için).**
   - Kesilmiş fatura düzenlenemez, taslağa döndürülemez, silinemez.
   - "Taslağa Dön" kaldırılır.
   - Silme yalnız taslakta mümkündür; bu kural sunucuda da zorunlu olmalı.
   - Düzeltme yolları:

     | Durum | Yol |
     |---|---|
     | Tek kalemin fiyatı yanlış ya da kalem ücretsiz olmalıydı | **Düzeltme belgesi (DZ)** |
     | Dönem için genel bir indirim | **Ekstre indirimi (İND)**; mevcut |
     | Yanlış klinik ya da yapılmamış iş | **İptal** (kayıtta "iptal" olarak kalır) ve doğrusunun yeniden kesilmesi |
     | Faturaya hiç yazılmamış iş | **Ek fatura** |
9. **Düzeltme belgesi (DZ).** Kesinleşmiş faturanın belirli bir kalemine bağlı, eksi tutarlı ayrı bir belge.
   - Örnek: "DZ-17 · F-1234 · Model ücretsiz · −500".
   - Gerekçe zorunludur.
   - Ekstrede ilgili faturanın altında görünür.
   - Faturayı ödeme gibi kapatır, böylece hatırlatma ve gecikme listeleri kendiliğinden düzelir. İND'nin pay ve alacak altyapısı örnek alınır.
   - Yetki: finans yetkisi. Her DZ aktivite günlüğüne yazılır.
10. **Kesinleştirme ve e-fatura ayrıdır.** "Kesinleşti" demek e-fatura gönderildi demek değildir. E-fatura (Luca) bugünkü gibi isteğe bağlı, ayrı bir adımdır; hangi faturanın e-faturaya gideceğine lab karar verir.

## 3. Hedef olmayanlar

- E-faturası gönderilmiş faturada DZ'nin vergi karşılığı (iade faturası ya da fiyat farkı faturası) ve Luca'ya gönderimi bu işin parçası değildir. Muhasebeci kuralı netleştirince ayrı iş olarak ele alınır. Bu işte DZ yalnız iç belgedir. E-faturası gönderilmiş faturaya DZ kesilirken "e-fatura tarafını muhasebecinizle düzenleyin" uyarısı gösterilir.
- Ayar kapalıyken bugünkü akış (lab taslağı kendisi keser) değişmez. Kesinleşmiş fatura kilidi ve DZ ise iki durumda da geçerlidir.
- Otomatik kesinleştirme (N gün sonra) yapılmaz. Kullanıcı kararı: "onay gelene kadar beklesin".

## 4. Anti-hedefler (teknik olarak çalışsa bile başarısızlık sayılır)

- Taslak (onay bekleyen) tutar için kliniğe gecikme ya da ödeme hatırlatması gitmesi.
- Lab'ın verdiği onayın hekimin kendi onayı gibi görünmesi.
- Kesinleşmiş bir faturanın herhangi bir yoldan (istemci, RPC, toplu işlem) değiştirilebilmesi ya da silinebilmesi.
- Onay bağlantısının başka bir kliniğin ya da başka bir dönemin verisini açabilmesi.
- Bakiye toplamının klinik listesi, ekstre ve PDF arasında farklı çıkması.

## 5. Kısıtlar ve bugünkü durum

- **Taslak oluşumu.** İş teslim edilince `work_orders_auto_draft_invoice` taslak fatura açar. Ayın 1'inde `fn_generate_monthly_invoices` (cron `monthly-invoice-sweep`) faturasız işleri klinik başına taslakta toplar.
- **Taslaklar bakiyede yok.** `v_clinic_balance*` ve hatırlatmalar taslakları hariç tutar. Bu korunmalı (bkz. 4).
- **Ekstre ekranları.** Lab tarafı `ClinicStatementScreen` ((lab) ve (admin) `statement/[clinicId]`). Klinik ve hekim panelinde `finance.tsx` ve `invoice/[id]` var. Ön ekstre bu panellere eklenir.
- **İND altyapısı.** `clinic_statement_discounts`, `payments(payment_method='indirim')` payları, `_sd_apply_credit` ve `zz_sd_invoice_credit` tetikleyicisi. DZ aynı pay ve alacak modelini kullanabilir.
- **Bekleyen değişiklik.** `supabase/migrations/20261106100000_sd_taslak_kilidi.sql` henüz uygulanmadı. İND payı olan faturanın taslağa dönmesini engelliyor. Bu tasarımdaki tam kilit onu kapsar. Kurucu ya tam kilitle birlikte uygular ya da tam kilit gelene kadar ara güvenlik olarak uygular.
- **Proje kuralları.**
  - Dört dil birlikte (tr/en/de/fa) ve koyu tema aynı anda.
  - `PAGE_PADDING`, ortalanmış popup (`U.modalOverlay`), `GlassTooltip`, hata mesajı düğmenin yanında.
  - Yeni tablo RLS'siz olmaz.
  - DB değişikliği beş adımla yapılır: `.before.txt`, `.down.sql`, rollback'li prob, açık onay, uygula ve ölç.
  - Gönderici (WhatsApp/e-posta) problarda çağrılmaz. Edge ve web yayını ayrı onayla yapılır.
  - KVKK: onay bağlantısında ve PDF'te gereğinden fazla kişisel veri olmaz.

## 6. Kurucuya bırakılanlar

- Onay bağlantısının biçimi: imzalı jeton, süre, tek kullanım ya da dönem başına yeniden kullanım. Anti-hedef 4 sağlanmalı.
- Not ve itiraz verisinin şeması: kalem bazında mesaj dizisi mi, tek not mu. Durumlar: açık, yanıtlandı, çözüldü.
- Dönemin tanımı: takvim ayı (öneri), ya da lab'ın seçebileceği bir aralık.
- Kesinleştirmenin teknik yolu: mevcut "Kesildi İşaretle" yolunun yeniden kullanılması. Numara, `kesildi` durumu ve İND alacağının otomatik uygulanması bugünkü gibi çalışmalı.
- DZ numaralama: lab başına sıralı ("DZ-" + numara), İND'deki gibi.
- "Taslağa Dön" kaldırıldığında bugün taslağa dönmüş eski faturaların durumu (geriye dönük bir iş gerekmeyebilir).

## 7. Kurucu kararları (kullanıcının onayına sunulan)

- K1: Kesinleşmiş fatura kilidi ve DZ, ayar kapalıyken de geçerli. Kullanıcı genel kural olarak söyledi: "onaylanan faturalar düzeltilmemeli silinememeli".
- K2: Kısmi onayda itirazlı kalemin bulunduğu fatura bütünüyle taslakta kalır. Fatura bölünmez.
- K3: Hekim notu yazdığında lab'a uygulama içi bildirim gider.
- K4 — Kilidin kapsamı:
  - Kesinleşmiş sayılan durumlar: `kesildi` ve sonrası (kısmi ödendi, ödendi, gecikmiş).
  - **Kilitli alanlar:** kalemler, tutarlar, klinik, para birimi, fatura tarihi ve numara.
  - **Serbest kalanlar:** ödeme, İND/DZ payları, `ödendi` / `kısmi` / `iptal` durum geçişleri, e-fatura alanları ve sistem tetikleyicileri (kur, toplam yeniden hesaplama).
  - Sipariş revizyonu ya da iptali kesinleşmiş faturayı değiştirmez. Fark DZ ya da ek faturayla kapatılır.
  - İzin listesi sunucu tetikleyicisinde tutulur.
- K5 — Ayar açıkken "Kesildi İşaretle" yerine "Klinik adına onay kaydet" gelir; gerekçe zorunludur. Lab'ın onaysız doğrudan kesme yolu bu olur ve izi kalır.
- K6 — Onayın kapsamı:
  - Onay, hekimin o an gördüğü taslakları anında kesinleştirir. Bu yüzden "onaydan sonra düzenleme" durumu oluşmaz.
  - Aynı döneme onaydan sonra eklenen yeni taslaklar onay bekler ve sonraki onaya kalır.
  - İtiraz "çözüldü" yanıtı alan kalem tekrar onaya düşer.
- K7 — DZ sınırları:
  - Tutar, hedef kalemin tutarını aşamaz. Para birimi faturanınkiyle aynıdır.
  - Fatura ödenmişse DZ tutarı kliniğe alacak olur ve açık faturalara uygulanır (İND modeli).
  - Ödemeli faturanın iptali bugünkü gibi davranır.
- K8 — Kesinleşen faturanın tarihi kesinleşme günüdür. Vade bu tarihten hesaplanır.
- K9 — Ayar değişirse:
  - Açılınca mevcut taslaklar "onay bekliyor" olur.
  - Kapanınca bekleyen taslaklar normal taslağa döner; notlar ve itirazlar korunur.
- **Kullanıcı kararı — onaylayan kişi:** "yönetici hekim verir". Kliniğin yönetici hesabı (`clinic_admin`), kliniğin tüm ekstresini tek seferde onaylar. Klinikteki diğer hekimler ekstreyi görür ve not yazabilir, ama onaylayamaz. Kliniği olmayan bağımsız hekimde onayı hekimin kendisi verir (kurucu kararı). Onay bağlantısı yönetici hekime gider.
- **Kullanıcı kararı — gönderim zamanı:** "ay sonunda". Ön ekstre her ay sonunda kendiliğinden gönderilir (cron); kanal WhatsApp ya da e-posta, PDF'li. Lab gerektiğinde "Onay iste" ile elle yeniden gönderebilir. Otomatik hatırlatma yoktur; yanıt gelmezse yeniden göndermek lab'ın kararıdır (kurucu kararı).
- K10 — Bekleyen `sd_taslak_kilidi` değişikliği, tam kilit gelene kadar ara güvenlik olarak önce uygulanır (kullanıcı onayıyla).
