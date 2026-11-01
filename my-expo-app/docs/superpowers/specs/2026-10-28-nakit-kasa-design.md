# Nakit kasa: "kasada ne kadar nakit olmalı" (denetim yol haritası 2. dalga, madde 8)

Tarih: 2026-10-28 · Durum: onaylandı ("onaylıyorum, planı yaz") · Plan: `docs/superpowers/plans/2026-10-28-nakit-kasa.md`

## 1. Niyet

Lab yöneticisi kasada şu an ne kadar nakit **olması gerektiğini** Siman'da tek bakışta görmek istiyor.

Bugünkü durum:
- Nakit tahsilatlar deftere yazılıyor.
- Banka bakiyeleri banka uygulamasından izleniyor.
- Siman bu iş için hiç kullanılmıyor.

Kullanıcı: "kasada ne kadar nakit olmalı onu görelim"; "deftere yazıyoruz, bundan sonra Siman'a gireriz"; "euro da giriyor, iki ayrı kasa olsun".

Yol haritasındaki madde daha genişti: kasa/banka bağlantısı ve çek listesi. Kullanıcıyla konuşulunca kapsam **nakit kasaya** daraldı.

## 2. Hedefler, hedef dışı, yapılmaması gerekenler

**Hedefler**
- İki nakit kasa vardır: **TL kasası** ve **EUR kasası**. Her biri kendi para biriminde bakiye tutar.
- Ödeme yöntemi **nakit** olan her tahsilat, kendi para birimindeki kasaya **giriş** olarak kendiliğinden düşer. Kasa ekranına ayrıca gitmek gerekmez. Kapsam iki kayıt türüdür: fatura tahsilatı (`payments`) ve klinik makbuzu (`clinic_receipts`).
- Ödeme yöntemi **nakit** olan **elle girilmiş giderler** ve **maaş/avans ödemeleri** kendi para birimindeki kasadan **çıkış** olarak kendiliğinden düşer. Siman maaş ve avansları `expenses`'a kendiliğinden kopyalar. Kullanıcıya göre kurye ücretleri, alış faturası giderleri ve düzenli (otomatik) giderler kasadan ödenmiyor; bunlar kasaya düşmez.
- Kaynak kayıt düzeltilirse kasa hareketi de düzelir. Bu, tutar, tarih, para birimi ve ödeme yöntemi değişikliklerini kapsar. Kaynak silinirse ya da iptal edilirse hareket de kalkar.
- **Açılış sayımı:** kasa, o gün sayılan tutarla başlar. Geçmiş defter kayıtları taşınmaz.
- **Bankaya yatırma:** kasadan bankaya yatırılan nakit, kasadan çıkış olarak tek adımda kaydedilir.
- **Sayım:** yönetici kasadaki gerçek tutarı girer. Siman'ın beklediği tutardan farkı varsa fark "sayım farkı" hareketi olarak yazılır ve beklenen bakiye gerçeğe eşitlenir.

**Hedef dışı (şimdilik)**
- Banka hesabı bakiyesi. Kullanıcı bankayı banka uygulamasından izliyor.
- Çek listesi.
- Kasadan ödenmeyen sistem giderleri. Bunlar kurye ücretleri (BanaBiKurye dahil; `trg_delivery_fee_expense` hepsini 'nakit' yazıyor), alış faturasından doğan giderler ve düzenli giderlerden üretilenlerdir. Kullanıcı bunların kasadan ödenmediğini söyledi.
- Kurlar arası çevrim: TL kasası ile EUR kasası ayrı kalır, toplanmaz.

**Yapılmaması gerekenler**
- Kasa bakiyesi asla iki kez saymamalı. Aynı tahsilat ya da gider yalnız bir harekete karşılık gelir.
- Açılış sayımından **önceki** nakit kayıtlar kasaya yazılmamalı. Aksi hâlde bakiye geçmişle şişer: 51 nakit gider zaten var ve tahsilatlar deftere gitmişti.
- Var olan "Kasa / Banka" ekranının elle hareket girme ve hesap açma özellikleri bozulmamalı.

## 3. Bugünkü durum (Nexadent, 2026-10-28 sayımı)

| Kayıt | Durum |
|---|---|
| `cash_accounts` | 0 kayıt; Kasa / Banka ekranı hiç kullanılmamış |
| `cash_movements` | 0 kayıt |
| Giderler | 80: 51 nakit, 28 havale, 1 kart |
| Tahsilatlar | 3, hepsi nakit: `payments` üzerinden 2, `clinic_receipts` üzerinden 1. Kalanı deftere yazıldı |

Not: `payments.lab_id` bütün satırlarda NULL. Lab, faturaya bağlanarak bulunuyor.

**Var olan yapı**
- Migration: `supabase/migrations/024_cash_accounts.sql`.
- Ekran: `modules/cash/screens/CashScreen.tsx` ("Kasa / Banka").
- API: `modules/cash/api.ts`.
- **`cash_accounts` sütunları:**
  - `lab_id`, `name`;
  - `account_type`: `kasa` ya da `banka`;
  - `currency`, `opening_balance`, `is_active`.
- **`cash_movements` sütunları:**
  - `account_id`, `amount`, `movement_date`, `description`;
  - `direction`: `giris` ya da `cikis`;
  - `category`: CHECK listesi `tahsilat`, `odeme`, `maas`, `kira`, `malzeme`, `vergi`, `diger`;
  - `ref_type`, `ref_id`.
- `v_cash_account_summary`: hesap başına giriş, çıkış ve bakiye.
- **Ödeme yöntemleri:**
  - fatura tahsilatı `PaymentMethod`: `nakit`, `kart`, `havale`, …;
  - gider `ExpensePaymentMethod`: `nakit`, `kart`, `havale`, `cek`, `diger`.

## 4. Davranış

### 4.1 Kasalar
- Lab başına en fazla bir **nakit TL kasası** ve bir **nakit EUR kasası** vardır. Mevcut `cash_accounts` satırları kullanılır: `account_type='kasa'`, `currency` TRY ya da EUR.
- Kasa ilk **açılış sayımıyla** oluşur. Yönetici kasayı seçer (TL ya da EUR), sayılan tutarı ve tarihi girer.
- **Açılış tarihi** kasaya kaydedilir. Bu tarihten önceki nakit kayıtlar o kasaya yazılmaz.
- Lab'ın ana para birimi ne olursa olsun iki kasa da açılabilir. Proje kuralı gereği sabit ₺ yazılmaz; her kasa kendi para birimini gösterir.

### 4.2 Otomatik hareketler
Hangi kayıt kasaya düşer:

| Kaynak | Koşul | Hareket |
|---|---|---|
| Fatura tahsilatı (`payments`) | yöntem `nakit`; **makbuzdan doğmamış** (`receipt_id` boş)¹; para birimi için açık kasa var; kesim anından sonra oluşturulmuş | giriş, kategori `tahsilat`, `ref_type='payment'` |
| Klinik makbuzu satırı (`clinic_receipt_lines`, makbuz yöntemi `nakit`) | satırın para birimi için açık kasa var (TRY/EUR) | **satır başına** giriş ★, kategori `tahsilat`, `ref_type='clinic_receipt_line'`. Karışık TL+EUR makbuz iki hareket yazar |
| Gider (`expenses`) | yöntem `nakit`; **elle girilmiş ya da maaş/avanstan gelmiş**²; aynı kasa ve kesim koşulu | çıkış. Maaş ve avans → `maas`; diğerleri gider kategorisine en yakın kasa kategorisi, yoksa `odeme`. `ref_type='expense'` |

¹ Makbuz dağıtımı (`alloc_receipt_to_invoices`) ve klinik alacağı uygulaması (`apply_clinic_credit`) da `payments` satırı üretir. O nakit makbuz satırında zaten sayıldı; ikinci kez sayılmaz.

² Kurye ücreti, alış faturası ya da düzenli giderden üretilmiş giderler bağlantı sütunlarıyla ayırt edilir ve kasaya düşmez.

Ortak kurallar:
- **Kaynak değişince:** tutar, tarih, para birimi ya da yöntem değişirse hareket güncellenir. Yöntem nakit olmaktan çıkarsa ya da kaynak silinir veya iptal edilirse hareket kaldırılır.
- **Tekillik:** bir kaynak kaydın en fazla bir otomatik hareketi olur. Tekillik `(ref_type, ref_id)` ile sağlanır.
- **Otomatik hareketler kasa ekranından silinemez ya da değiştirilemez.** Düzeltme kaynakta yapılır: tahsilatta ya da giderde. Ekranda hareketin kaynağı gösterilir ve dokununca kaynağa gidilir.
- **Farklı para birimindeki nakit (kullanıcı kararı):** fatura tahsilatı her zaman faturanın para biriminde tutulur (`payments_financial_guard`). Klinik bir EUR faturasını TL nakitle öderse bu **klinik makbuzuyla** kaydedilir. Makbuz TL satırını TL kasasına yazar ve faturalara dağıtılır. Fatura tahsilat formu değişmez.
- **Kesim anı ★:** açılış sayımı ve her sayım bir **an** (zaman damgası) kaydeder.
  - Kaynak kayıt, açılış anından **sonra oluşturulduysa** kasaya yazılır. Açılıştan önce oluşturulmuş kayıtlar sayılan nakde dahil kabul edilir.
  - Sayımda fark, sayılan tutar ile o andaki beklenen tutar arasındaki farktır.
  - Sayım penceresi "Sayımdan önce bugünkü nakit tahsilat ve giderlerin girildiğinden emin olun" uyarısını gösterir. Sayımdan sonra geriye tarihli girilen nakit, beklenen bakiyeyi sayımdan sonra değiştirir.
- **Kasası olmayan para birimi:** TL ve EUR dışındaki nakit (ör. USD) kasaya yazılmaz. Kasa ekranında "kasası olmayan nakit" diye ayrı ve küçük bir uyarı satırı görünür ★.

### 4.3 Kullanıcının eliyle girdiği hareketler
- **Bankaya yatırma:** kasadan çıkış, kategori `transfer` (yeni). Açıklama: "Bankaya yatırıldı".
- **Sayım:** yönetici kasada saydığı tutarı girer. Siman beklenen bakiyeyle farkı hesaplar. Fark sıfır değilse `sayim` kategorisinde (yeni) giriş ya da çıkış hareketi yazılır. Açıklama "Sayım farkı" biçiminde, sayımın kendisi de kayıt altında ★.
- Mevcut elle hareket ekleme (diğer giriş/çıkış) aynen kalır.

### 4.4 Ekran
- Mevcut "Kasa / Banka" ekranı **nakit kasa odaklı** olur. Üstte iki kasa kartı (TL ve EUR) yer alır; her kartta beklenen bakiye, son sayım tarihi ve farkı, "Sayım yap" ve "Bankaya yatır" düğmeleri bulunur.
- Altta seçili kasanın hareket listesi bulunur. Her satırda tarih, açıklama, kaynak (tahsilat / makbuz / gider / elle) ve tutar yer alır.
- Banka hesabı ekleme ve banka hareketleri bu sürümde ekranda **öne çıkarılmaz**. Var olan özellik bozulmaz ★.
- Koyu tema, dört dil (tr, en, de, fa), her düğmede GlassTooltip ve ortada açılan pencereler, proje kurallarına göre.

### 4.5 Ödeme yöntemi zorunlu seçim (kullanıcı kararı)
Şu formlarda ödeme yöntemi **boş gelir ve seçilmeden kaydedilmez**: fatura detayındaki tahsilat, toplu tahsilat, klinik makbuzu ve gider. Amaç, havalenin yanlışlıkla kasaya düşmemesi.

Veritabanındaki `'nakit'` varsayılanı değişmez, çünkü sistemin kendiliğinden yazdığı kayıtlar ona dayanıyor ★. Zorunluluk formlarda uygulanır.

### 4.6 Yetki
- Kasa bakiyesini görmek ve sayım ya da bankaya yatırma girmek, mevcut finans yetkisi olan kullanıcılara açıktır. Bu kullanıcılar admin, lab yöneticisi ve finans yetkisi verilenlerdir ★.
- Teknisyen ve kurye kasayı görmez.
- Otomatik hareketler sunucuda yazılır. İstemci `cash_movements`'a otomatik kategoride (`ref_type` dolu) yazamaz.

## 5. Kısıtlar
- Supabase, çok kiracılı yapı:
  - `lab_id` her zaman `labs(id)`'e FK'dir;
  - RLS tabloda açık kalır;
  - view'lar kiracı süzgeciyle çalışır: `v_cash_account_summary` için güvenlik kipi doğrulanmalı (`security_invoker` ya da `get_my_lab_id()` süzgeci).
- Veritabanı değişikliği beş adımlı protokolle yapılır:
  1. canlı tanımı yakalama;
  2. geri alma dosyası;
  3. geri alınan deneme (önce / sonra / geri alma);
  4. kullanıcı onayı;
  5. canlıya uygulama ve ölçüm.
- Kaynak tablolardaki mevcut tetikleyici ve kurallar bozulmaz. Tahsilat ve gider akışlarına yalnız ekleme yapılır; mevcut fonksiyonlar değiştirilmez ★. Bu tetikleyicilerden biri `trg_stock_qty_sync` gibi gider tarafındakiler.
- Para formatlayıcıları savunmacı yazılır: `(Number(n)||0)`.
- Tahsilatların çoğu henüz Siman'da değil. Doğruluk, kullanıcının bundan sonra nakit tahsilatları girmesine bağlıdır. Bu ekranda açıkça söylenir ★.

## 6. Kullanıcının kararları
- Kasadan çıkanlar yalnız elle girilen nakit giderler ile nakit maaş ve avanslardır. Kurye ücretleri, alış faturası giderleri ve düzenli giderler kasadan ödenmiyor.
- Farklı para birimindeki nakit, klinik makbuzuyla kaydedilir.
- Ödeme yöntemi formlarda zorunlu seçimdir.
- Görmek istenen: kasada ne kadar nakit olmalı (banka bakiyesi değil).
- Bundan sonra nakit tahsilatlar Siman'a girilecek.
- İki ayrı kasa: TL ve EUR.
- Shipink (madde 6) ertelendi; muhasebeci dışa aktarımı (madde 7) küçük sürümle yapıldı. Bu madde bağımsızdır.

## 7. Builder'a kalanlar (★ işaretliler benim kararım; değiştirilebilir)
- Otomatik hareketin yolu: kaynak tablolarda tetikleyici mi, yoksa tek bir sunucu fonksiyonu mu. Tekillik ve düzeltme kuralları sağlanmak şartıyla builder seçer.
- **Kaynak alanlarının adları doğrulanmalı:**
  - `payments` ve `clinic_receipts` için tutar, para birimi ve tarih sütunları;
  - fatura tahsilatının para birimi faturadan mı geliyor, kendi alanı mı var;
  - giderin para birimi alanı.
- Gider kategorisinden kasa kategorisine eşleme tablosu.
- `category` CHECK listesine `transfer` ve `sayim` eklenmesi.
- Açılış tarihinin nerede tutulacağı (`cash_accounts`'a sütun ya da açılış hareketi).
