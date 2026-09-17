# Serbest Gönderi — Uygulama Planı

> **Ajan çalışanlar için:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (önerilen) veya `superpowers:executing-plans` ile görev-görev uygula. Adımlar `- [ ]` kutularıyla takip edilir.

**Hedef:** Lab, siparişe bağlı olmayan bir gönderi için kurye/kargo çağırabilsin; gönderi kurye takip ekranında izlensin ve ücreti giderlere düşsün.

**Mimari:** Serbest gönderi ayrı tablo değil, `deliveries` kaydının `work_order_id IS NULL` hâlidir. Kimlik olarak sipariş numarasının yerini `shipment_no` (`GND-2026-0001`) alır. Kurye paneli, canlı harita, durum akışı ve ücret→gider tetikleyicisi tek kod yolundan çalışmaya devam eder; edge fonksiyonları hiç değişmez.

**Teknoloji:** Supabase (Postgres + RLS + SECURITY DEFINER RPC), Expo Router + React Native Web, NativeWind, mevcut `banabikurye-dispatch` / `shipink-dispatch` edge fonksiyonları.

**Spec:** `docs/superpowers/specs/2026-09-14-serbest-gonderi-design.md`

## Genel Kısıtlar

- **Migration çalıştırma:** `supabase db query --linked -f <mutlak yol>` (my-expo-app içinden). MCP yetkisiz.
- **Doğrulama deseni:** Bu projede otomatik test koşumu yok. DB davranışı **geri sarılan probe** ile kanıtlanır: `DO $$ … RAISE EXCEPTION 'PROBE: %', … $$;` — istisna işlemi geri sarar, veri değişmez.
- **Sipariş akışı bit bit korunur.** `p_work_order_id` dolu her çağrı bugünkü davranışı aynen üretmeli; her DB görevinde regresyon probu zorunlu.
- **Çok dillilik (ZORUNLU):** yeni her kullanıcı metni `core/i18n/locales/auto.{en,de,fa}.json` üçüne AYNI ANDA eklenir (tr kaynaktır).
- **Koyu tema (ZORUNLU):** yeni her yüzey/metin açık ve koyu temada doğru görünür (`useMobileTokens()` / `dark:` varyantı).
- **Sayfa kenarı:** çıplak sayı yok, `PAGE_PADDING` (16).
- **İkonlar:** yalnız `core/ui/icons` (HugeIcons); `lucide-react-native` import edilmez.
- **Deploy YOK.** Kullanıcı açıkça "deploy" demedikçe yayına çıkılmaz. DB migration'ları ise uygulandığı anda canlıdır — her migration öncesi etkisi söylenir.
- **`tsc --noEmit` 0 hata** her istemci görevinin sonunda.

## Dosya yapısı

| Dosya | Sorumluluk |
|---|---|
| `supabase/migrations/20260914100000_free_shipment_schema.sql` | Şema: nullable FK, `shipment_no`, sayaç tablosu, `direction` kısıtı |
| `supabase/migrations/20260914110000_create_delivery_free.sql` | `create_delivery` siparişsiz destek |
| `supabase/migrations/20260914120000_fee_expense_free.sql` | Ücret→gider tetikleyicisi düzeltmesi |
| `modules/delivery/label.ts` (yeni) | `deliveryRef()` — sipariş no ya da gönderi no |
| `modules/orders/api.ts` | `createDelivery` imzası genişler |
| `modules/courier/components/NewShipmentModal.tsx` (yeni) | Yeni gönderi formu (tek sorumluluk: form + çağrı) |
| `modules/courier/CourierTrackingScreen.tsx` | "Yeni gönderi" butonu + etiket fallback |
| `modules/courier/api.ts`, `CourierLiveMap.tsx`, `screens/CourierDeliveryDetailScreen.tsx`, `modules/expenses/api.ts`, `modules/delivery/api.ts` | Etiket fallback |
| `modules/tv/api.ts`, `modules/station/screens/AnalyticsScreen.tsx` | Sipariş metriklerinden serbest gönderiyi ayıkla |

---

### Görev 1: Şema — siparişsiz teslimat mümkün olsun

**Dosyalar:**
- Oluştur: `supabase/migrations/20260914100000_free_shipment_schema.sql`

**Arayüz:**
- Üretir: `deliveries.work_order_id` nullable · `deliveries.shipment_no text` · `public.shipment_number_counters(lab_id, year, last_no)` · `direction` kısıtında `lab_to_other` / `other_to_lab`

- [ ] **Adım 1: Migration dosyasını yaz**

```sql
-- 20260914100000_free_shipment_schema.sql
-- Serbest gönderi: siparişe bağlı olmayan kurye/kargo kaydı.
-- Hepsi EKLEME; mevcut satırlar ve mevcut iki direction değeri dokunulmadan kalır.

ALTER TABLE public.deliveries ALTER COLUMN work_order_id DROP NOT NULL;

ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS shipment_no text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_deliveries_shipment_no
  ON public.deliveries (lab_id, shipment_no) WHERE shipment_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shipment_number_counters (
  lab_id  uuid    NOT NULL REFERENCES public.labs(id) ON DELETE CASCADE,
  year    integer NOT NULL,
  last_no integer NOT NULL DEFAULT 0,
  PRIMARY KEY (lab_id, year)
);

-- Serbest gönderiye "labdan kliniğe" demek yön raporunu kirletir:
-- lab_to_other = labdan çıkan, other_to_lab = laba gelen alım.
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_direction_chk;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_direction_chk
  CHECK (direction IN ('lab_to_clinic','clinic_to_lab','lab_to_other','other_to_lab'));

COMMENT ON COLUMN public.deliveries.shipment_no IS
  'Siparişsiz gönderinin numarası (GND-YYYY-NNNN). Siparişli kayıtlarda NULL.';
```

- [ ] **Adım 2: Uygulamadan ÖNCE kullanıcıya etkisini söyle**

Bu migration canlı veritabanını değiştirir: `work_order_id` zorunluluğu kalkar, iki kolon/tablo eklenir. Veri silinmez, mevcut satırlar değişmez. Onay al.

- [ ] **Adım 3: Migration'ı çalıştır**

```bash
cd /Users/saber/Desktop/DentalSoftware/my-expo-app
supabase db query --linked -f "$PWD/supabase/migrations/20260914100000_free_shipment_schema.sql"
```

- [ ] **Adım 4: Şemayı doğrula**

```sql
SELECT is_nullable FROM information_schema.columns
 WHERE table_schema='public' AND table_name='deliveries' AND column_name='work_order_id';
-- beklenen: YES
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.deliveries'::regclass AND conname='deliveries_direction_chk';
-- beklenen: lab_to_other ve other_to_lab içeren CHECK
```

---

### Görev 2: `create_delivery` — siparişsiz çağrı

**Dosyalar:**
- Oluştur: `supabase/migrations/20260914110000_create_delivery_free.sql`

**Arayüz:**
- Kullanır: Görev 1'in şeması
- Üretir: `create_delivery(..., p_party_name text, p_party_address text, p_party_phone text, p_party_lat numeric, p_party_lng numeric) RETURNS uuid`

- [ ] **Adım 1: Mevcut gövdeyi al (yeniden yazma, GENİŞLET)**

```bash
cd /Users/saber/Desktop/DentalSoftware/my-expo-app
cat > /tmp/getdef.sql <<'SQL'
SELECT pg_get_functiondef(p.oid) FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='create_delivery';
SQL
supabase db query --linked -f /tmp/getdef.sql
```

Mevcut gövde korunur; yalnız aşağıdaki üç nokta değişir.

- [ ] **Adım 2: Migration'ı yaz**

İmzaya beş yeni parametre **sonda, varsayılanlı** eklenir (eski çağrılar bozulmaz).
`DECLARE` bloğuna `v_year integer := EXTRACT(YEAR FROM NOW())::int; v_no integer; v_ship_no text;` eklenir.

Yetki kontrolünden sonra, `v_lab_id` çözümünden önce siparişsiz dal:

```sql
  IF p_work_order_id IS NULL THEN
    IF COALESCE(TRIM(p_party_name), '') = '' OR COALESCE(TRIM(p_party_address), '') = '' THEN
      RAISE EXCEPTION 'serbest gönderide karşı taraf adı ve adresi zorunlu';
    END IF;
    IF COALESCE(p_direction,'') NOT IN ('lab_to_other','other_to_lab') THEN
      RAISE EXCEPTION 'serbest gönderide yön lab_to_other veya other_to_lab olmalı';
    END IF;
  END IF;
```

`v_lab_id` çözümü siparişsizde zaten profile'a düşüyor (mevcut `IF v_lab_id IS NULL` dalları) — dokunma.

Klinik/hekim sorgusu yalnız sipariş varken çalışsın:

```sql
  IF p_work_order_id IS NOT NULL THEN
    SELECT COALESCE(d.full_name, p.full_name), COALESCE(c.address, ''),
           COALESCE(d.phone, p.phone, ''), COALESCE(c.name, '')
      INTO v_cli_name, v_cli_addr, v_cli_phone, v_org_name
      FROM public.work_orders wo
      LEFT JOIN public.doctors  d ON d.id = wo.doctor_id
      LEFT JOIN public.clinics  c ON c.id = d.clinic_id
      LEFT JOIN public.profiles p ON p.id = wo.doctor_id
     WHERE wo.id = p_work_order_id;
  END IF;
```

Uç noktaları kuran `IF v_incoming THEN … ELSE … END IF;` bloğunun ÖNÜNE serbest dal:

```sql
  IF p_work_order_id IS NULL THEN
    -- Girilen adres yöne göre bir uca yazılır; labın ucu her zaman sunucuda dolar.
    IF p_direction = 'other_to_lab' THEN          -- ALIM: girilen adres ÇIKIŞ
      v_org_name  := TRIM(p_party_name);
      v_org_addr  := TRIM(p_party_address);
      v_org_lat   := p_party_lat;  v_org_lng := p_party_lng;
      v_dest_name := v_lab_name;
      v_dest_addr := v_lab_addr;   v_dest_phone := v_lab_phone;
      v_dest_lat  := v_lab_lat;    v_dest_lng := v_lab_lng;
    ELSE                                           -- GÖNDERİ: girilen adres VARIŞ
      v_org_name  := v_lab_name;
      v_org_addr  := v_lab_addr;
      v_org_lat   := v_lab_lat;    v_org_lng := v_lab_lng;
      v_dest_name := TRIM(p_party_name);
      v_dest_addr := TRIM(p_party_address);
      v_dest_phone:= NULLIF(TRIM(COALESCE(p_party_phone,'')), '');
      v_dest_lat  := p_party_lat;  v_dest_lng := p_party_lng;
    END IF;

    INSERT INTO public.shipment_number_counters AS c (lab_id, year, last_no)
    VALUES (v_lab_id, v_year, 1)
    ON CONFLICT (lab_id, year) DO UPDATE SET last_no = c.last_no + 1
    RETURNING c.last_no INTO v_no;
    v_ship_no := 'GND-' || v_year::text || '-' || LPAD(v_no::text, 4, '0');
  ELSIF v_incoming THEN
    … (mevcut clinic_to_lab dalı aynen) …
  ELSE
    … (mevcut lab_to_clinic dalı aynen) …
  END IF;
```

INSERT'e iki değişiklik: kolon listesine `shipment_no`, değer listesine `v_ship_no`; ayrıca
`COALESCE(p_purpose, 'teslimat')` → `COALESCE(p_purpose, CASE WHEN p_work_order_id IS NULL THEN 'diger' ELSE 'teslimat' END)`
ve `COALESCE(p_direction, 'lab_to_clinic')` aynen kalır (serbest dal zaten yönü doğruluyor).

- [ ] **Adım 3: Migration'ı çalıştır**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260914110000_create_delivery_free.sql"
```

- [ ] **Adım 4: Serbest gönderi probu (geri sarılır)**

```sql
DO $$
DECLARE v_user uuid; v_id uuid; r record;
BEGIN
  SELECT id INTO v_user FROM profiles
   WHERE user_type='lab' AND role='manager' AND COALESCE(is_active,true) LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_id := public.create_delivery(NULL, 'internal', v_user, NULL, NULL, 'PROBE kutu',
            NULL, 'lab_to_other', NULL, NULL, NULL, NULL,
            'Test Tedarik A.Ş.', 'Kadıköy İstanbul', '05551112233', 40.99, 29.02);

  SELECT shipment_no, lab_id, purpose, direction, destination_name,
         destination_address, origin_name, work_order_id
    INTO r FROM deliveries WHERE id = v_id;

  RAISE EXCEPTION 'PROBE no=% lab=% amaç=% yön=% varış=%/% çıkış=% sipariş=%',
    r.shipment_no, r.lab_id, r.purpose, r.direction,
    r.destination_name, r.destination_address, r.origin_name, COALESCE(r.work_order_id::text,'NULL');
END $$;
```

Beklenen: `no=GND-2026-0001` biçiminde, `amaç=diger`, `yön=lab_to_other`, varış girilen adres, çıkış lab adı, `sipariş=NULL`.

- [ ] **Adım 5: Alım yönü probu**

Adım 4'ün aynısı, `'lab_to_other'` yerine `'other_to_lab'`. Beklenen: **çıkış** girilen ad/adres, **varış** lab adı.

- [ ] **Adım 6: Regresyon probu — siparişli akış bozulmadı**

```sql
DO $$
DECLARE v_user uuid; v_wo uuid; v_id uuid; r record;
BEGIN
  SELECT wo.id, (SELECT p.id FROM profiles p WHERE p.lab_id = wo.lab_id
                  AND p.user_type='lab' AND p.role='manager' LIMIT 1)
    INTO v_wo, v_user FROM work_orders wo WHERE wo.lab_id IS NOT NULL
   ORDER BY wo.created_at DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user::text)::text, true);

  v_id := public.create_delivery(v_wo, 'internal', v_user);
  SELECT shipment_no, purpose, direction, destination_name, origin_name
    INTO r FROM deliveries WHERE id = v_id;
  RAISE EXCEPTION 'PROBE-REG no=% amaç=% yön=% varış=% çıkış=%',
    COALESCE(r.shipment_no,'NULL'), r.purpose, r.direction, r.destination_name, r.origin_name;
END $$;
```

Beklenen: `no=NULL`, `amaç=teslimat`, `yön=lab_to_clinic`, varış hekim/klinik adı.

---

### Görev 3: Ücret → gider tetikleyicisi

**Dosyalar:**
- Oluştur: `supabase/migrations/20260914120000_fee_expense_free.sql`

**Arayüz:**
- Kullanır: Görev 1 (`shipment_no`), Görev 2 (serbest kayıt)
- Üretir: `trg_delivery_fee_expense()` — siparişsiz kayıtta da gider yazar

- [ ] **Adım 1: Bugünkü hatayı kanıtla (geri sarılır)**

Görev 2 Adım 4'teki probu, `create_delivery` çağrısından sonra
`PERFORM public.set_delivery_fee(v_id, 250);` ekleyerek çalıştır ve
`SELECT count(*) FROM expenses WHERE delivery_id = v_id` sonucunu yazdır.
Beklenen (düzeltmeden ÖNCE): **0** — tetikleyici `lab_id`'yi siparişten okuduğu için sessizce çıkıyor.

- [ ] **Adım 2: Migration'ı yaz**

Mevcut `trg_delivery_fee_expense()` gövdesi korunur; üç nokta değişir.

```sql
  -- lab: sipariş yoksa kaydın kendi labı
  SELECT w.lab_id, w.order_number INTO v_lab, v_order_no
    FROM public.work_orders w WHERE w.id = NEW.work_order_id;
  v_lab := COALESCE(v_lab, NEW.lab_id);
  IF v_lab IS NULL THEN RETURN NEW; END IF;
```

```sql
  v_yon := CASE NEW.direction
             WHEN 'clinic_to_lab' THEN 'Klinik → Lab'
             WHEN 'lab_to_other'  THEN 'Lab → Dış'
             WHEN 'other_to_lab'  THEN 'Dış → Lab'
             ELSE 'Lab → Klinik' END;
```

```sql
  -- referans: sipariş no yoksa gönderi no
  v_desc := 'Kurye · ' || v_purpose || ' · ' || v_yon
            || ' · #' || COALESCE(v_order_no, NEW.shipment_no, '?')
            || ' · ' || v_who;
```

`v_desc` içindeki eski `COALESCE(v_order_no, '?')` satırı kaldırılır. Diğer her şey (kur
anlık görüntüsü, `ON CONFLICT`, iptal/sıfır ücrette gideri silen dal) aynen kalır.

- [ ] **Adım 3: Migration'ı çalıştır**

```bash
supabase db query --linked -f "$PWD/supabase/migrations/20260914120000_fee_expense_free.sql"
```

- [ ] **Adım 4: Gider probu (geri sarılır)**

Adım 1'in aynısı. Beklenen (düzeltmeden SONRA): `expenses` satır sayısı **1**,
`category='kurye'`, açıklamada `#GND-2026-...` geçiyor, `lab_id` gönderinin labı.

- [ ] **Adım 5: Regresyon probu**

Siparişli bir teslimat oluştur + `set_delivery_fee` → açıklama eskisiyle aynı biçimde
(`Kurye · Teslimat · Lab → Klinik · #NEX-... · Kendi kuryemiz`) olmalı.

- [ ] **Adım 6: Klinik görünürlüğü probu (geri sarılır)**

Serbest gönderi klinik/hekim tarafına SIZMAMALI (spec §1.4). Serbest bir kayıt
oluşturduktan sonra, klinik kullanıcısının kimliğiyle aynı işlemde oku:

```sql
DO $$
DECLARE v_lab_user uuid; v_clinic_user uuid; v_id uuid; v_seen int;
BEGIN
  SELECT id INTO v_lab_user FROM profiles
   WHERE user_type='lab' AND role='manager' AND COALESCE(is_active,true) LIMIT 1;
  SELECT id INTO v_clinic_user FROM profiles
   WHERE user_type IN ('clinic_admin','clinic_secretary') AND COALESCE(is_active,true) LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_lab_user::text)::text, true);
  v_id := public.create_delivery(NULL,'internal',v_lab_user,NULL,NULL,NULL,NULL,
            'lab_to_other',NULL,NULL,NULL,NULL,'Test A.Ş.','Kadıköy İstanbul',NULL,NULL,NULL);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_clinic_user::text)::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_seen FROM deliveries WHERE id = v_id;

  RAISE EXCEPTION 'PROBE-KLINIK gorunen=%', v_seen;
END $$;
```

Beklenen: `gorunen=0`.

---

### Görev 4: İstemci API + etiket fallback

**Dosyalar:**
- Oluştur: `modules/delivery/label.ts`
- Düzenle: `modules/orders/api.ts` (`createDelivery`), `modules/courier/api.ts`, `modules/courier/CourierTrackingScreen.tsx`, `modules/courier/CourierLiveMap.tsx`, `modules/courier/screens/CourierDeliveryDetailScreen.tsx`, `modules/expenses/api.ts`, `modules/delivery/api.ts`, `modules/tv/api.ts`, `modules/station/screens/AnalyticsScreen.tsx`

**Arayüz:**
- Kullanır: Görev 2'nin RPC imzası
- Üretir: `deliveryRef(d): string` · `createDelivery({ workOrderId?: string | null, partyName?, partyAddress?, partyPhone?, partyLat?, partyLng?, … })`

- [ ] **Adım 1: Etiket yardımcısını yaz**

```ts
// modules/delivery/label.ts
/**
 * Teslimat kaydının ekranda görünen referansı.
 * Siparişli kayıtta sipariş numarası, serbest gönderide gönderi numarası.
 * Tek yerde durur; aksi hâlde her listede "#undefined" riski doğar.
 */
export function deliveryRef(d: {
  work_order?: { order_number?: string | null } | null;
  order_number?: string | null;
  shipment_no?: string | null;
}): string {
  return d.work_order?.order_number ?? d.order_number ?? d.shipment_no ?? '—';
}

/** Serbest gönderi mi (siparişe bağlı değil)? */
export function isFreeShipment(d: { work_order_id?: string | null }): boolean {
  return !d.work_order_id;
}
```

- [ ] **Adım 2: `createDelivery` imzasını genişlet**

`modules/orders/api.ts` içinde `workOrderId: string` → `workOrderId?: string | null`,
parametre listesine `partyName/partyAddress/partyPhone/partyLat/partyLng` eklenir ve
RPC gövdesine geçirilir:

```ts
    p_work_order_id: params.workOrderId ?? null,
    /* … mevcut alanlar … */
    p_party_name:    params.partyName ?? null,
    p_party_address: params.partyAddress ?? null,
    p_party_phone:   params.partyPhone ?? null,
    p_party_lat:     params.partyLat ?? null,
    p_party_lng:     params.partyLng ?? null,
```

- [ ] **Adım 3: Okuma yerlerine `shipment_no` ekle ve etiketi `deliveryRef` ile çöz**

Aşağıdaki her `select(...)` listesine `shipment_no` eklenir ve sipariş numarası gösteren
her yer `deliveryRef(...)` çağırır:
`modules/courier/api.ts:30` · `modules/courier/CourierTrackingScreen.tsx:291` ·
`modules/courier/CourierLiveMap.tsx:221` · `modules/courier/screens/CourierDeliveryDetailScreen.tsx:97` ·
`modules/expenses/api.ts:163` · `modules/delivery/api.ts` (113, 131, 145, 176).

`modules/courier/api.ts` içindeki eşlemede:

```ts
    order_number: r.work_order?.order_number ?? r.shipment_no ?? null,
```

- [ ] **Adım 4: Sipariş metriklerinden serbest gönderiyi ayıkla**

```ts
// modules/tv/api.ts — "bugün teslim edilen" yalnız SİPARİŞ teslimatlarını saysın
supabase.from('deliveries').select('id', { count: 'exact', head: true })
  .not('work_order_id', 'is', null)
  .eq('status', 'teslim_edildi').gte('delivered_at', todayISO),
```

```ts
// modules/station/screens/AnalyticsScreen.tsx — teslimat performansı
  .from('deliveries').select('status, delivered_at')
  .not('work_order_id', 'is', null)
```

- [ ] **Adım 5: Doğrula**

```bash
npx tsc --noEmit
```
Beklenen: 0 hata.

---

### Görev 5: "Yeni gönderi" formu — kendi kuryemiz

**Dosyalar:**
- Oluştur: `modules/courier/components/NewShipmentModal.tsx`
- Düzenle: `modules/courier/CourierTrackingScreen.tsx` (buton + tazeleme), `core/i18n/locales/auto.{en,de,fa}.json`

**Arayüz:**
- Kullanır: `createDelivery` (Görev 4), `AddressAutocompleteField`
- Üretir: `<NewShipmentModal visible onClose onCreated={(id: string) => void} accent={string} />`

- [ ] **Adım 1: Formu yaz**

Durum: `direction: 'lab_to_other' | 'other_to_lab'` (varsayılan `lab_to_other`),
`partyName`, `address` + `addrSelected {address, lat, lng}`, `phone`, `notes`,
`courierId`, `fee`, `feeCurrency`.

Alanlar: yön seçici (Gönderi / Alım) · karşı taraf adı (zorunlu) ·
`AddressAutocompleteField` (zorunlu; `onSelect(address, lat, lng)` ile lat/lng yakalanır) ·
telefon · kurye seçici (lab kuryeleri) · not · ücret.

Gönder:

```ts
const res = await createDelivery({
  workOrderId: null,
  mode: 'internal',
  courierId,
  direction,
  purpose: 'diger',
  notes: notes.trim() || undefined,
  partyName: partyName.trim(),
  partyAddress: addrSelected?.address ?? address.trim(),
  partyPhone: phone.trim() || undefined,
  partyLat: addrSelected?.lat ? Number(addrSelected.lat) : null,
  partyLng: addrSelected?.lng ? Number(addrSelected.lng) : null,
  feeAmount: fee.trim() ? Number(fee.replace(',', '.')) : null,
  feeSource: fee.trim() ? 'manuel' : undefined,
});
if (!res.ok) { toast.error(res.error ?? 'Gönderi oluşturulamadı.'); return; }
onCreated(res.deliveryId!);
```

Doğrulama: ad ve adres boşsa `toast.error('Alıcı adı ve adres zorunlu.')`, çağrı yapılmaz.

- [ ] **Adım 2: Kurye Takip ekranına butonu bağla**

Başlık satırına "Yeni gönderi" butonu (`Plus` ikonu, `core/ui/icons`), yalnız lab/admin
panelinde görünür (kurye panelinde `courierId` doluyken gizli). `onCreated` → `load()`.

- [ ] **Adım 3: Çevirileri ekle**

Yeni dizeler (`Yeni gönderi`, `Gönderi`, `Alım`, `Alıcı adı`, `Gönderen adı`, `Adres`,
`Telefon`, `Kurye`, `Ücret`, `Alıcı adı ve adres zorunlu.`, `Gönderi oluşturulamadı.`)
`auto.en.json`, `auto.de.json`, `auto.fa.json` dosyalarının **üçüne birden** eklenir.

- [ ] **Adım 4: Doğrula**

```bash
npx tsc --noEmit
```
Ardından localhost'ta: Kurye Takip → Yeni gönderi → kendi kuryemizle kayıt →
listede `GND-...` referansıyla görünüyor mu, kurye panelinde çıkıyor mu, koyu temada
okunuyor mu.

---

### Görev 6: BanaBiKurye ile serbest gönderi

**Dosyalar:**
- Düzenle: `modules/courier/components/NewShipmentModal.tsx`

**Arayüz:**
- Kullanır: `banabikurye-dispatch` edge fonksiyonu (DEĞİŞTİRİLMEZ)

- [ ] **Adım 1: Taşıyıcı seçicisini ekle**

`carrier: 'internal' | 'bbk' | 'shipink'` durumu; `internal` Görev 5'teki akış.

- [ ] **Adım 2: Fiyat hesapla**

```ts
const { data } = await supabase.functions.invoke('banabikurye-dispatch', {
  body: {
    action: 'calculate',
    notes: notes.trim() || undefined,
    dest_name:    partyName.trim(),
    dest_address: addrSelected?.address ?? address.trim(),
    dest_lat:     addrSelected?.lat ?? undefined,
    dest_lng:     addrSelected?.lng ?? undefined,
    dest_phone:   phone.trim() || undefined,
  },
});
```
`work_order_id` **gönderilmez**. Yanıt `ok` değilse `data.message` gösterilir.

- [ ] **Adım 3: Kurye çağır ve kaydı oluştur**

`action: 'create'` aynı gövdeyle çağrılır; dönen `order_id` ile:

```ts
const res = await createDelivery({
  workOrderId: null, mode: 'external', externalProvider: 'banabikurye',
  externalTrackingNo: String(orderId), direction, purpose: 'diger',
  partyName: partyName.trim(), partyAddress: addrSelected?.address ?? address.trim(),
  partyPhone: phone.trim() || undefined,
  partyLat: addrSelected?.lat ? Number(addrSelected.lat) : null,
  partyLng: addrSelected?.lng ? Number(addrSelected.lng) : null,
  feeAmount: price != null ? Number(price) : null,
  feeCurrency: 'TRY', feeSource: 'banabikurye',
});
```

> BanaBiKurye ₺ ile çalışır — para birimi `TRY` sabittir, labın baz kuru değil.
> Fiyat API'den **sayı** gelir; `parseFee` kullanma (noktayı binlik sanıp 100× şişirir).

- [ ] **Adım 4: Doğrula**

`npx tsc --noEmit` 0 hata. Localhost'ta "Fiyat hesapla" gerçek fiyat döndürüyor mu
(gönderi OLUŞTURMAZ, ücretsiz çağrıdır) — buraya kadar test edilir; gerçek kurye
çağırmak kullanıcının onayıyla yapılır.

---

### Görev 7: Shipink (kargo) ile serbest gönderi

**Dosyalar:**
- Düzenle: `modules/courier/components/NewShipmentModal.tsx`, `core/i18n/locales/auto.{en,de,fa}.json`

**Arayüz:**
- Kullanır: `shipink-dispatch` edge fonksiyonu (DEĞİŞTİRİLMEZ)

- [ ] **Adım 1: Kargo alanlarını ekle**

Shipink yapılandırılmış adres ister; serbest metin adres yetmez. `carrier === 'shipink'`
iken görünen ek alanlar: **İl** (`state`), **İlçe** (`city`), **Posta kodu** (`zip`),
paket ölçüleri `weight/length/width/height` (varsayılan `1 / 20 / 15 / 10`).

> Eşleme terstir ama doğrudur: Shipink'te `state` = **İL**, `city` = **İLÇE**.

- [ ] **Adım 2: Tarife sorgula**

```ts
const body = {
  direction,
  note: notes.trim() || undefined,
  recipient_name:   partyName.trim(),
  recipient_phone:  phone.trim() || undefined,
  recipient_street: addrSelected?.address ?? address.trim(),
  recipient_state:  shpState.trim(),   // İL
  recipient_city:   shpCity.trim(),    // İLÇE
  recipient_zip:    shpZip.trim() || undefined,
  packages: [{ weight: Number(shpWeight) || 1, length: Number(shpLength) || 20,
               width: Number(shpWidth) || 15, height: Number(shpHeight) || 10 }],
};
const { data } = await supabase.functions.invoke('shipink-dispatch', { body: { action: 'rates', ...body } });
```

İl veya ilçe boşsa çağrı yapılmaz: `toast.error('Kargo için alıcının ili ve ilçesi zorunlu.')`.

- [ ] **Adım 3: Gönderi oluştur ve kaydet**

```ts
const { data } = await supabase.functions.invoke('shipink-dispatch', {
  body: { action: 'create', carrier_service_id: serviceId,
          carrier_account_id: rate?.carrier_account_id ?? undefined,
          carrier_provider: rate?.provider ?? undefined, ...body },
});
```
Yanıt alanları: `tracking_number`, `price`, `currency`, `shipment_id`, `label_url`.

```ts
const d = data as any;
// Fiyat API'den ZATEN sayı gelir — parseFee kullanma (241.16 → 24116 bug'ı).
const priceNum = Number(d.price ?? rate?.price);
const fee = isFinite(priceNum) && priceNum >= 0 ? priceNum : null;

const res = await createDelivery({
  workOrderId: null, mode: 'external',
  externalProvider: 'Shipink',                       // sipariş akışıyla AYNI yazım
  externalTrackingNo: d.tracking_number ? String(d.tracking_number) : undefined,
  direction, purpose: 'diger', notes: notes.trim() || undefined,
  partyName: partyName.trim(), partyAddress: addrSelected?.address ?? address.trim(),
  partyPhone: phone.trim() || undefined,
  feeAmount: fee,
  feeCurrency: fee != null ? String(d.currency ?? rate?.currency ?? 'TRY') : null,
  feeSource: fee != null ? 'shipink' : undefined,
});
if (!res.ok) { toast.error('Gönderi oluştu ama teslimat kaydı açılmadı: ' + (res.error ?? '')); return; }

// İptal ve etiket uçları takip numarasını DEĞİL Shipink'in kendi id'sini ister.
if (d.shipment_id || d.label_url) {
  await supabase.from('deliveries').update({
    external_tracking_code: d.shipment_id ? String(d.shipment_id) : null,
    external_label_url:     d.label_url ?? null,
  }).eq('id', res.deliveryId!);
}
```

- [ ] **Adım 4: Çevirileri ekle**

`İl`, `İlçe`, `Posta kodu`, `Ağırlık (kg)`, `En`, `Boy`, `Yükseklik`,
`Kargo için alıcının ili ve ilçesi zorunlu.` → üç dile birden.

- [ ] **Adım 5: Doğrula**

`npx tsc --noEmit` 0 hata. Localhost'ta tarife sorgusu (gönderi oluşturmaz) fiyat
döndürüyor mu. Gerçek gönderi oluşturma kullanıcının onayıyla denenir.

---

## Sıra ve bağımlılık

1 → 2 → 3 (DB zinciri, her biri canlıya uygulanır) → 4 (istemci uyumu) → 5 (uçtan uca
çalışan en küçük özellik) → 6, 7 (taşıyıcılar; birbirinden bağımsız).

Görev 5 bittiğinde özellik **kullanılabilir** durumdadır; 6 ve 7 üzerine eklenir.
