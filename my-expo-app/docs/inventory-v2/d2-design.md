# D2 — Miktarsız tüketim: üretim malzemesi + sürümlü profil

**Durum:** Tasarım notu — ONAY BEKLİYOR, şemaya dokunulmadı
**Tarih:** 2026-07-31
**Ön koşul:** D1 canlı (`20260731090000_inventory_d1_engine_core.sql`)

---

## 1. Kilitlenen kararlar

| # | Karar | Kaynak |
|---|---|---|
| K1 | Teknisyen **miktar girmez** — yalnız kullandığı gerçek ürünü seçer | Kullanıcı, 31 Tem 2026 |
| K2 | Profilin hesapladığı miktarı **hiç kimse düzeltemez** (yönetici dahil). Tek düzeltme yolu D3 envanter doğrulaması | Kullanıcı |
| K3 | **Fire = ikinci kullanım olayı.** Aynı malzeme tekrar eklenir, `usage_kind='fire'` etiketlenir; profil miktarı kadar ikinci düşüm olur | Kullanıcı + spec §7.2/5 |
| K4 | Profil kuralı yoksa: **seçim kaydedilir, stok hareketi YAZILMAZ**, satır `pending_no_profile` olur ve yöneticiye "tanımsız profil" raporuna düşer | Spec §7.3 (güven seviyesi), §7.5 (maliyet "beklemede"), §15 (tamamlanmamış seçim raporu) |
| K5 | Maliyet finansa **alışta** girer; tüketim maliyeti finansa post edilmez (D1 kararı sürüyor) | Önceki onay |

K2'nin sonucu: `MaterialConfirmModal`'daki tüm miktar/fire input'ları ve
`DecimalInput` teknisyen akışından kalkar. Ekran "hangi malzemeleri kullandın?"
çoktan-seçmeli bir listeye dönüşür.

K4'ün sonucu: **seçim ile tüketim ayrı kayıtlar olmak zorunda.** Bugün tek
kayıt var (`stock_movements`). Seçim yapıldığı hâlde hareket yazılmayan durum
ancak ayrı bir seçim tablosuyla izlenebilir.

---

## 2. Bugünkü profil kapsaması (ölçüldü — işin ana riski)

| Alan | Dolu |
|---|---|
| `stock_items.units_per_tooth` | 90 aktif kalemden **1** |
| `stock_items.consume_at_stage` | **2** |
| `stock_items.usable_stages` | **2** |
| `lab_stations.default_consumption_rules` | 8 tüketen istasyondan 6'sında birer kategori kuralı |

Kuralsız tüketen istasyonlar: **Polisaj, 3D Yazıcı Modelaj, Alçı Modelaj**.

> Miktar alanı bu tabloyla kaldırılırsa sistem pratikte hiç stok düşmez.
> Bu yüzden D2'nin teslimi yalnız şema değil, **profil doldurma sihirbazı +
> kapsama raporu**dur (bkz. §6).

---

## 3. Yeni tablolar

### 3.1 `production_materials` — marka bağımsız üretim malzemesi
`id, lab_id, code, name, allowed_stations uuid[], default_unit,
consumption_behavior, is_active, created_at/updated_at`

- `code`: `ZIRCON_BLOCK`, `GLAZE`, `STAIN`, `PMMA_DISC`, `MODEL_RESIN`…
- `allowed_stations`: hangi istasyonlarda seçilebilir (spec'in "izin verilen
  üretim aşamaları" maddesi — bizde istasyon UUID'si, metin değil)
- `consumption_behavior`: `standard | single_use | untracked`
  (ileride "açık disk/blok kapasitesi" için yer ayrılıyor, D2'de kullanılmıyor)
- Tenant: `lab_id → labs(id)`, RLS lab bazlı

### 3.2 `consumption_profiles` + sürümler
`consumption_profiles: id, lab_id (NULL = global şablon), name, is_template,
is_active`
`consumption_profile_versions: id, profile_id, version int, status
(draft|active|archived), valid_from, published_by, published_at`

- Global şablon salt okunur; lab **kopyalayıp** kendi sürümünü düzenler
- Bir işte kullanılan sürüm sonradan değişmez (kayıt sürüm id'sini saklar)

### 3.3 `consumption_rules`
`id, version_id, station_id, production_material_id, calc_model, qty numeric,
unit, conditions jsonb, sort_order`

`calc_model` (mevcut hizmet-birimi sözlüğüyle aynı dil):

| model | miktar |
|---|---|
| `fixed` | `qty` (iş başına sabit) |
| `per_tooth` | `qty × diş sayısı` |
| `per_jaw` | `qty × çene sayısı` |
| `per_unit` | `qty × order_item.quantity` |

`conditions`: `{"work_type": "...", "case_type": "...", "material": "..."}` —
boş ise her işe uyar. Çözümleme: en çok koşul eşleşen kural kazanır, eşitlikte
`sort_order`.

### 3.4 `stage_material_selections` — teknisyenin seçimi (miktarsız)
`id, lab_id, stage_id, work_order_id, stock_item_id, production_material_id,
usage_seq int, usage_kind (normal|fire|rework), technician_id,
resolved_rule_id, resolved_version_id, computed_qty, status
(applied|pending_no_profile|reversed), movement_id, idempotency_key, created_at`

- Aynı malzeme tekrar seçilirse `usage_seq` artar → K3'ün fire'ı burada
- `status='pending_no_profile'` → `movement_id` NULL, stok düşmemiş
- `movement_id → stock_movements(id)`: seçim → tüketim → maliyet zinciri
  tek sorguda izlenebilir (spec §4.10 açıklanabilirlik)

### 3.5 Mevcut tablolara ek
- `stock_items.production_material_id uuid NULL → production_materials(id)`
- `stock_movements.selection_id uuid NULL → stage_material_selections(id)`

Hiçbir kolon düşürülmez; `units_per_tooth`/`consume_at_stage` yerinde kalır
(geri dönüş için).

---

## 4. Akış

1. Teknisyen "Tamamla"ya basar.
2. Sistem istasyona izin verilen `production_materials`'ı listeler.
3. Her üretim malzemesi altında, o malzemeye eşlenmiş **aktif** stok kalemleri
   gösterilir. Teknisyen kullandığını işaretler. **Miktar alanı yok.**
4. Tekrar kullanım: aynı kalem "+ tekrar" ile ikinci kez eklenir, isteğe bağlı
   `fire` etiketi.
5. `confirm_stage_materials` (D2 sürümü) her seçim için:
   a. `stage_material_selections` satırını yazar (idempotency anahtarıyla)
   b. iş tipi + diş/çene sayısı + istasyon ile kuralı çözer
   c. **kural varsa** → miktarı hesaplar → D1 çekirdeğiyle `stock_movements`
      yazar → `status='applied'`, `movement_id` dolar
   d. **kural yoksa** → `status='pending_no_profile'`, hareket yok, uyarı
6. Yönetici raporu: "Profil tanımsız seçimler" — hangi istasyon/kalem
   kombinasyonu kuralsız, kaç iş etkilenmiş.

Fire, (4)'teki ikinci seçim satırıdır; miktarı yine profilden gelir (K3).

---

## 5. Migration planı (5 adım, her biri geri alınabilir)

1. `production_materials` + `stock_items.production_material_id` (boş)
2. `consumption_profiles` + `_versions` + `consumption_rules`
3. `stage_material_selections` + `stock_movements.selection_id`
4. Global şablon seed'i: `core/materials/consumptionRef.ts` değerleri
   (zirkonyum/PMMA disk kalınlık→kron, porselen gr/diş, cam seramik 1:1,
   model reçine çene başı, SprintRay gr/iş) — **açıkça "varsayım" etiketli**
5. `confirm_stage_materials` D2 sürümü + feature flag

**Feature flag:** `lab_settings.inventory_qtyless_enabled boolean default false`.
Kapalıyken bugünkü miktar akışı aynen çalışır — geri dönüş tek satır UPDATE.

---

## 6. Kapsama riski ve azaltma (bu iş olmadan D2 yayına alınamaz)

| Risk | Azaltma |
|---|---|
| Profil kapsaması ~%1 → hiç stok düşmez | **Profil sihirbazı**: 90 kalem için toplu "bu kalem hangi üretim malzemesi + hangi istasyon + ne kadar" ekranı. Kategori bazlı toplu atama. |
| Kural yazacak kişi yok | Global şablondan tek tıkla kopyala + 6 kategoriye varsayılan kural |
| Sessiz kayıp (stok düşmüyor ama kimse fark etmiyor) | Kapsama raporu + aşama sonunda teknisyene "bu seçim profilsiz, yöneticiye bildirildi" bilgisi |
| Profil yanlış → stok sapar | D3 envanter doğrulaması sapmayı gösterir; K2 gereği tek düzeltme yolu budur |

**Yayın eşiği önerisi:** tüketen istasyonlarda kullanılan kalemlerin en az
%80'i bir kurala bağlanmadan flag açılmaz.

---

## 7. Kapatılan sorular

1. **Üretim malzemesi sayısı:** ilk sürümde ~10-12 kod, bugünkü 6 stok
   kategorisinden türetilir. Az sayıda kod = az eşleştirme yükü.
2. **`per_jaw` verisi:** `work_orders`'ta çene/ark kolonu YOK, yalnız
   `tooth_numbers` var. Çene sayısı diş numaralarından türetilecek
   (11-28 → üst, 31-48 → alt; ikisi de varsa 2). Kural motoruna
   `jaw_count(tooth_numbers)` yardımcı fonksiyonu eklenir.
3. **Kural koşulu alanı:** `work_orders.work_type` (metin) mevcut;
   `case_type` kolonu yok → koşul sözlüğü `work_type` üzerinden kurulur.
4. **Profilsiz seçim bildirimi:** anlık bildirim YOK — günlük özet + ekranda
   kalıcı rapor. (Bildirim gürültüsü kararlarıyla uyumlu.)
