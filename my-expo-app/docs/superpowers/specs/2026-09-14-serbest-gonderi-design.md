# Serbest Gönderi (siparişten bağımsız kurye/kargo) — Tasarım

**Tarih:** 2026-09-14
**Durum:** Onaylandı (kullanıcı), uygulama planı bekliyor

## Problem

Lab, bir işe bağlı olmayan bir şey göndermek istediğinde sistemi kullanamıyor:
tedarikçiye iade edilecek parça, kliniğe gönderilecek belge/katalog, başka bir
laba gidecek numune, şubeden alınacak malzeme. Teslimat kaydı bugün siparişe
zorunlu bağlı (`deliveries.work_order_id NOT NULL`), dolayısıyla böyle bir gönderi
ya hiç kaydedilmiyor ya da ilgisiz bir siparişe iliştiriliyor. Sonuç: gönderi
takip edilemiyor, kurye ücreti giderlere düşmüyor.

## Kapsam kararları (kullanıcı)

| Konu | Karar |
|---|---|
| Alıcı | **Yalnız serbest adres.** Kayıtlı klinik/hekim seçimi YOK. |
| Taşıyıcı | **Üçü de**: kendi kuryemiz, Shipink (kargo), BanaBiKurye. |
| Ücret | **Sipariş kuryesiyle aynı** — lab gideri, mevcut gider akışı. |

## Mimari

Serbest gönderi **ayrı bir tablo değildir**; `deliveries` kaydının siparişsiz
hâlidir. Böylece kurye paneli, canlı harita, durum akışı, GPS, ücret→gider
tetikleyicisi ve iptal akışı tek kod yolundan çalışmaya devam eder. Siparişsiz
kaydı `work_order_id IS NULL` ayırt eder; kimlik olarak sipariş numarasının yerini
`shipment_no` alır.

Entegrasyonlar (BanaBiKurye, Shipink) **değişmez**: iki edge fonksiyonu da
`work_order_id`'yi opsiyonel alıyor ve açık adres/alıcı alanlarını
(`dest_*` / `recipient_*`) zaten destekliyor.

---

## 1. Veri modeli

### 1.1 `deliveries.work_order_id` artık boş olabilir

```sql
ALTER TABLE public.deliveries ALTER COLUMN work_order_id DROP NOT NULL;
```

Mevcut satırların hiçbiri değişmez. FK zaten `work_orders(id)`'ye bakıyor ve
nullable FK'de PostgREST gömmesi (`work_order:work_orders!work_order_id(...)`)
`null` döner — sorgular kırılmaz, yalnız gösterim fallback'i gerekir (bkz. §4).

### 1.2 Yeni kolon: `shipment_no`

```sql
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS shipment_no text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_shipment_no
  ON public.deliveries (lab_id, shipment_no) WHERE shipment_no IS NOT NULL;
```

Yalnız siparişsiz kayıtlarda dolar. Biçim: `GND-<yıl>-<4 hane>` (ör.
`GND-2026-0001`). Lab başına ve yıl başına sıralı; sipariş numarasıyla **aynı
desen**, ayrı sayaç tablosu:

```sql
CREATE TABLE IF NOT EXISTS public.shipment_number_counters (
  lab_id  uuid    NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  year    integer NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (lab_id, year)
);
```

Numara `create_delivery` içinde, sayaç upsert'i ile üretilir
(`generate_order_number` ile birebir aynı yaklaşım):

```sql
INSERT INTO public.shipment_number_counters AS c (lab_id, year, last_no)
VALUES (v_lab_id, v_year, 1)
ON CONFLICT (lab_id, year) DO UPDATE SET last_no = c.last_no + 1
RETURNING c.last_no INTO v_no;
```

### 1.3 `direction` kısıtı genişler

```sql
ALTER TABLE public.deliveries DROP CONSTRAINT deliveries_direction_chk;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_direction_chk
  CHECK (direction IN ('lab_to_clinic','clinic_to_lab','lab_to_other','other_to_lab'));
```

Serbest gönderiye "labdan kliniğe" demek yön raporlarını kirletir. `lab_to_other`
= labdan çıkan gönderi, `other_to_lab` = laba gelen alım. Mevcut iki değer ve
onları kullanan tüm satırlar aynen geçerli kalır.

### 1.4 Görünürlük (RLS) — değişiklik YOK

Mevcut politikalar bu senaryoyu zaten doğru karşılıyor:

- `deliveries_select` ve `tenant_guard` **`lab_id`** üzerinden çalışıyor → lab ve
  admin serbest gönderiyi görür.
- `deliveries_update_courier` `courier_id = auth.uid()` → atanan kurye kendi
  gönderisini günceller.
- `deliveries_select_clinic` `work_orders` üzerinden EXISTS kuruyor → siparişsiz
  kayıt kliniklere **görünmez**. İstenen davranış budur; labın kendi gönderisi
  müşteriyi ilgilendirmez.

---

## 2. Sunucu tarafı

### 2.1 `create_delivery` — siparişsiz çağrı

İmza genişler (mevcut çağrılar bozulmaz; yeni parametreler sonda ve varsayılanlı):

```sql
create_delivery(
  p_work_order_id uuid,              -- artık NULL olabilir
  p_mode text,
  p_courier_id uuid DEFAULT NULL,
  p_external_provider text DEFAULT NULL,
  p_external_tracking_no text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_purpose text DEFAULT 'teslimat',
  p_direction text DEFAULT 'lab_to_clinic',
  p_fee_amount numeric DEFAULT NULL,
  p_fee_currency text DEFAULT NULL,
  p_fee_source text DEFAULT NULL,
  p_stage_snapshot text DEFAULT NULL,
  -- YENİ (yalnız siparişsiz gönderide kullanılır). "Karşı taraf" = yöne göre
  -- varış ya da çıkış noktası; labın ucu her zaman sunucuda doldurulur.
  p_party_name text DEFAULT NULL,
  p_party_address text DEFAULT NULL,
  p_party_phone text DEFAULT NULL,
  p_party_lat numeric DEFAULT NULL,
  p_party_lng numeric DEFAULT NULL
) RETURNS uuid
```

Davranış:

1. Yetki kontrolü aynen korunur (admin veya lab manager/admin).
2. `p_work_order_id IS NULL` ise:
   - `p_party_name` ve `p_party_address` **zorunlu**; biri boşsa
     `RAISE EXCEPTION 'serbest gönderide karşı taraf adı ve adresi zorunlu'`.
   - `v_lab_id` çağıranın `profiles.lab_id`'sinden (yoksa `profiles.id`) çözülür —
     bugün sipariş yoksa zaten uyguladığı fallback.
   - `shipment_no` üretilir (§1.2).
   - Girilen adresin hangi uca yazılacağı **yöne** bağlıdır; klinik/hekim sorgusu
     hiç çalıştırılmaz:
     - `lab_to_other` (gönderi): girilen adres **varış** (`destination_*`,
       `dest_lat/lng`), çıkış (`origin_*`) labın adresi.
     - `other_to_lab` (alım): girilen adres **çıkış** (`origin_*`, `origin_lat/lng`),
       varış (`destination_*`) labın adı/adresi/telefonu.
     Bu ayrım şart: alımda adresi varışa yazmak kuryeyi ters yöne gönderir.
   - `purpose` verilmediyse `'diger'` yazılır — serbest gönderi bir sipariş
     teslimatı değildir, `'teslimat'` sayılırsa kurye amaç raporu kirlenir.
3. `p_work_order_id` doluysa **mevcut davranış bit bit korunur** — yeni
   parametreler yok sayılır.

### 2.2 Ücret → gider tetikleyicisi düzeltilir

`trg_delivery_fee_expense` bugün `lab_id`'yi siparişten okuyor:

```sql
SELECT w.lab_id, w.order_number INTO v_lab, v_order_no
  FROM public.work_orders w WHERE w.id = NEW.work_order_id;
IF v_lab IS NULL THEN RETURN NEW; END IF;     -- siparişsiz kayıtta SESSİZCE çıkar
```

Bu hâliyle serbest gönderinin ücreti **hiçbir zaman** gidere düşmez. Düzeltme:

```sql
SELECT w.lab_id, w.order_number INTO v_lab, v_order_no
  FROM public.work_orders w WHERE w.id = NEW.work_order_id;
v_lab := COALESCE(v_lab, NEW.lab_id);         -- serbest gönderi: kaydın kendi labı
IF v_lab IS NULL THEN RETURN NEW; END IF;
```

Gider açıklamasındaki referans, sipariş numarası yoksa gönderi numarasına düşer:

```sql
v_ref := COALESCE(v_order_no, NEW.shipment_no, '?');
v_desc := 'Kurye · ' || v_purpose || ' · ' || v_yon || ' · #' || v_ref || ' · ' || v_who;
```

Yön etiketi yeni değerleri tanır:

```sql
v_yon := CASE NEW.direction
           WHEN 'clinic_to_lab' THEN 'Klinik → Lab'
           WHEN 'lab_to_other'  THEN 'Lab → Dış'
           WHEN 'other_to_lab'  THEN 'Dış → Lab'
           ELSE 'Lab → Klinik' END;
```

Gider kategorisi `kurye` olarak kalır (kullanıcı kararı: sipariş kuryesiyle aynı
akış). Ücret silinince/iptal edilince gideri kaldıran mevcut dal aynen çalışır.

### 2.3 `trg_bbk_sync_order_status` — değişiklik YOK

Tetikleyici `work_orders`'ı `WHERE id = NEW.work_order_id` ile günceller;
`NULL`'da 0 satır etkiler, hata vermez. Serbest gönderinin durumu hiçbir siparişi
kıpırdatmaz — istenen davranış budur.

---

## 3. İstemci — API katmanı

`modules/orders/api.ts` içindeki `createDelivery`, `workOrderId`'yi opsiyonel
alacak ve yeni alıcı alanlarını geçirecek şekilde genişler:

```ts
export async function createDelivery(params: {
  workOrderId?: string | null;          // serbest gönderide null
  mode: 'internal' | 'external';
  /* … mevcut alanlar … */
  partyName?: string;      // yöne göre alıcı ya da gönderen
  partyAddress?: string;
  partyPhone?: string;
  partyLat?: number | null;
  partyLng?: number | null;
}): Promise<{ ok: boolean; deliveryId?: string; error?: string }>
```

Mevcut çağrı yerleri (sipariş teslimatı) hiç değişmez.

---

## 4. Arayüz

### 4.1 Kurye Takip sayfası — "Yeni gönderi"

`modules/courier/CourierTrackingScreen.tsx` başlığına bir aksiyon butonu ve
açtığı form (yeni bileşen: `modules/courier/components/NewShipmentModal.tsx`).
Form alanları:

| Alan | Tip | Not |
|---|---|---|
| Yön | İki seçenek: **Gönderi** (`lab_to_other`) / **Alım** (`other_to_lab`) | Varsayılan: Gönderi |
| Alıcı adı | Zorunlu metin | Alımda "gönderen" olarak etiketlenir |
| Adres | Zorunlu | Mevcut `AddressAutocompleteField` kullanılır (lat/lng de gelir) |
| Telefon | İsteğe bağlı | BanaBiKurye SMS bildirimi için önerilir |
| Taşıyıcı | Kendi kuryemiz / BanaBiKurye / Shipink | Kendi kuryede kurye seçici çıkar |
| İçerik / not | İsteğe bağlı metin | `deliveries.notes` |
| Ücret | İsteğe bağlı sayı + para birimi | Girilirse gidere düşer |

Kayıt sonrası kurye takip listesi tazelenir ve yeni gönderi listede görünür.

### 4.2 Etiket fallback'i — dokunulacak okuma yerleri

Sipariş numarası gösteren her yer, siparişsiz kayıtta `shipment_no`'ya düşmeli
(aksi hâlde "#undefined" görünür). Tek bir yardımcı yazılır ve hepsi onu kullanır:

```ts
// modules/delivery/label.ts
export function deliveryRef(d: { work_order?: { order_number?: string | null } | null;
                                shipment_no?: string | null }): string {
  return d.work_order?.order_number ?? d.shipment_no ?? '—';
}
```

Geçilecek dosyalar:

1. `modules/courier/api.ts` — `fetchMyDeliveries` (`order_number` alanına fallback)
2. `modules/courier/CourierTrackingScreen.tsx` — liste satırı + detay paneli
3. `modules/courier/CourierLiveMap.tsx` — harita balonu/kartı
4. `modules/courier/screens/CourierDeliveryDetailScreen.tsx` — başlık
5. `modules/expenses/api.ts` + gider detay ekranı — bağlı teslimat kartı
6. `modules/delivery/api.ts` — liste/okuma yardımcıları

### 4.3 Sipariş metriklerinden ayrıştırma

Serbest gönderi bir **sipariş teslimatı değildir**; sipariş sayan iki yerde
dışarıda bırakılır:

- `modules/tv/api.ts:148` — "bugün teslim edilen" sayacı → `.not('work_order_id','is',null)`
- `modules/station/screens/AnalyticsScreen.tsx:89` — teslimat performansı →
  aynı filtre

`modules/expenses` tarafında ise **dahil edilir**: kurye gideri kurye gideridir.

---

## 5. Entegrasyon eşlemesi

Edge fonksiyonlarında değişiklik yok; form verisi mevcut override alanlarına
geçirilir.

**BanaBiKurye** (`banabikurye-dispatch`): `dest_name`, `dest_address`,
`dest_phone`, `dest_lat`, `dest_lng` — kaydın **varış** ucundan beslenir (alım
yönünde bu labın adresidir). `work_order_id` gönderilmez.

**Shipink** (`shipink-dispatch`): `recipient_name`, `recipient_phone`,
`recipient_street`, `recipient_city` (**İLÇE**), `recipient_state` (**İL**),
`recipient_zip`, `recipient_country` — kaydın **varış** ucundan beslenir.
`work_order_id` gönderilmez.

> Not: Shipink'te `state`=İL, `city`=İLÇE eşlemesi ters görünür ama doğrudur;
> mevcut sipariş akışı da böyle gönderiyor.

---

## 6. Doğrulama

1. **Geri sarılan SQL probu**: siparişsiz `create_delivery` çağrısı → kayıt oluştu
   mu, `shipment_no` üretildi mi, `lab_id` doğru mu.
2. **Gider probu**: aynı kayda `set_delivery_fee` → `expenses` satırı oluştu mu,
   açıklamada `#GND-...` geçiyor mu, `lab_id` doğru mu. (Bugün bu satır hiç
   oluşmuyor; düzeltmenin kanıtı budur.)
3. **Kırılmazlık**: siparişli bir teslimat oluştur + ücret gir → açıklama ve gider
   eskisiyle birebir aynı mı (regresyon).
4. **Klinik görünürlüğü**: klinik kullanıcısı kimliğiyle `deliveries` sorgusu →
   serbest gönderi dönmemeli.
5. `tsc --noEmit` 0 hata; kurye takip ekranı ve kurye paneli elle gözden geçirilir
   (açık + koyu tema).

---

## 7. Kapsam dışı (bilinçli)

- Kayıtlı klinik/hekim/tedarikçi rehberinden alıcı seçme (kullanıcı kararı:
  yalnız serbest adres).
- Serbest gönderinin klinik/hekim panelinde görünmesi.
- Gönderi için ayrı bir liste ekranı — mevcut Kurye Takip listesi kullanılır.
- Toplu gönderi, şablon adres, tekrar eden gönderi.
- Serbest gönderiye dosya/foto ekleme.
