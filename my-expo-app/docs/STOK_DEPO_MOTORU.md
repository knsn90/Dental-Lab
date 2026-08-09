# Stok & Depo Motoru — Teknik Referans

**Sürüm:** D1–D4 tamamlandı · **Son güncelleme:** 31 Temmuz 2026
**Durum:** Şema + RPC + UI canlıda. Miktarsız teknisyen akışı bayrak arkasında **kapalı**.
**İlgili belgeler:** [`inventory-v2/d2-design.md`](inventory-v2/d2-design.md) (D2 tasarım notu) · [`DESIGN_LANGUAGE.md`](DESIGN_LANGUAGE.md)

---

## 1. Bu motor ne yapar

Laboratuvarın malzeme hayat döngüsünü tek bir deftere bağlar:

```
SATIN ALMA ──▶ stock_movements (IN)  ──▶ fifo_layers (katman açılır)
                                          │
ÜRETİM     ──▶ stage_material_selections ─┤   (teknisyen NE kullandığını seçer)
               (miktar profilden hesaplanır)
                     │
                     ▼
               stock_movements (OUT / WASTE) ──▶ fifo_allocations (en eski katmandan düşülür)
                     │
SAYIM      ──▶ inventory_verifications ──▶ stock_movements (ADJUST) ──▶ period_closures (kilit)
                     │
                     ▼
               stock_items.quantity   (trg_stock_qty_sync — TEK kaynak)
```

**Tek defter kuralı:** stok miktarını değiştiren her şey `stock_movements`'a satır yazar.
`UPDATE stock_items SET quantity` elle **yasaktır** — `trg_stock_qty_sync` trigger'ı
miktarı hareketlerden türetir; elle yazmak çift sayım üretir.

---

## 2. Kilitli kararlar

Bunlar tartışmaya kapalı; kod bu varsayımlar üzerine kuruludur.

| # | Karar | Sonucu |
|---|---|---|
| **K1** | Teknisyen **miktar girmez** — yalnız kullandığı gerçek ürünü seçer | Teknisyen ekranında miktar/fire input'u yok |
| **K2** | Hesaplanan miktarı **hiç kimse düzeltemez** (yönetici dahil) | Tek düzeltme yolu D3 envanter doğrulaması |
| **K3** | **Fire = ikinci kullanım olayı** | Aynı malzeme tekrar eklenir, `usage_kind='fire'`, ikinci düşüm olur |
| **K4** | **Profil kuralı yoksa stok DÜŞMEZ** | Seçim `pending_no_profile` kalır, yöneticiye rapor düşer |
| **K5** | Maliyet finansa **alışta** girer | Tüketim maliyeti finansa post edilmez — çift sayım olmaz |
| **K6** | **Ortalama maliyet YOK — FIFO zorunlu** | Tüm kalemler katmanlanır |
| **K7** | Baz para birimi **snapshot**'tır | Bugünkü ayar geçmişe uygulanmaz |

---

## 3. Şema

### 3.1 Defter (mevcut, D1'de genişletildi)

`stock_movements` — eklenen kolonlar:

| Kolon | Amaç |
|---|---|
| `idempotency_key` | Aynı onayın ikinci kez yazılmasını engeller |
| `lot_no`, `expiry_date` | İzlenebilirlik (geri kazanılamayan veri — alışta toplanır) |
| `selection_id` | Hareketi hangi teknisyen seçiminin doğurduğu |

Benzersizlik: `ux_stock_movements_idem (lab_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

### 3.2 Üretim malzemesi soyutlaması (D2)

| Tablo | Ne tutar |
|---|---|
| `production_materials` | Marka bağımsız malzeme (`ZIRCON_BLOCK`, `GLAZE`, `PORCELAIN`…). Reçeteler SKU değil bunu referanslar. `allowed_stations uuid[]`, `consumption_behavior` = `standard\|single_use\|untracked` |
| `stock_items.production_material_id` | Ticari ürün → üretim malzemesi bağı. **NULL = miktarsız akışta seçilemez** |
| `consumption_profiles` | Profil başlığı. `lab_id IS NULL AND is_template` = global salt-okunur şablon |
| `consumption_profile_versions` | Sürüm + `status draft\|active\|archived`. Profil başına **tek aktif sürüm** (`ux_profile_single_active`) |
| `consumption_rules` | (istasyon × malzeme) → miktar kuralı. `is_assumption` bayrağı ile varsayım/gerçek ayrımı |
| `stage_material_selections` | Teknisyenin miktarsız seçimi. Hareket bundan **türetilir** |
| `disc_yield_ref` | Disk kalınlığı → ortalama kron verimi (global, tenant'sız) |
| `lab_settings.inventory_qtyless_enabled` | Özellik bayrağı, default `false` |

### 3.3 Doğrulama & dönem (D3)

| Tablo | Ne tutar |
|---|---|
| `inventory_verifications` | Sayım oturumu. `draft → approved → closed` |
| `inventory_verification_lines` | Kalem başına `system_qty` (**snapshot**) + `physical_qty` |
| `period_closures` | Kapatılmış dönem. `reopened_at IS NULL` ise kilit aktif |

### 3.4 FIFO (D4)

| Tablo | Ne tutar |
|---|---|
| `fifo_layers` | Her giriş bir katman: `qty_in`, `qty_remaining`, `unit_cost`, `currency`, `rate_at_time`, `base_currency`, `lot_no`, `expiry_date` |
| `fifo_allocations` | Her çıkışın hangi katmandan ne kadar aldığı. `is_uncovered=true` = katman yetmedi |

**RLS:** Tüm tablolarda `is_lab_user() AND lab_id = get_my_lab_id()` kalıbı.
FIFO tabloları ve `disc_yield_ref` yalnız **SELECT** açar — yazma trigger/RPC üzerinden.

---

## 4. Tüketim motoru (D1)

Önceden **iki ayrı yazıcı** vardı ve ikisi farklı davranıyordu. D1'de tek çekirdeğe indirildi:

```
confirm_stage_materials(...)   ─┐
                                ├─▶ apply_stage_materials_core(...)  ─▶ stock_movements
record_stage_consumption(...)  ─┘
```

`apply_stage_materials_core(p_stage_id, p_lines, p_actor, p_idempotency_key, p_work_order_id, p_stage_name)`

- **Yetki kontrolü yapmaz** — `anon`/`authenticated`'tan REVOKE edilmiştir, yalnız sarmalayıcılar çağırır.
- Kur/maliyet snapshot'ı, `stage_id` bağı ve paket bölmesi artık **her iki yolda da aynı**.
- Paket içeriği tüketimi: kalemin `pack_size` > 0 ise girilen içerik miktarı pakete bölünür (gr tüket → kesirli adet düş).
- Legacy kanban yolu satırlara `qty_in_stock_unit: true` ekler → birim çevrimi ve pack bölmesi atlanır (eski davranış birebir korunur).
- Fire ayrı satırdır: `type='WASTE'`, `waste_reason` ile.

**Idempotency:** anahtar satır bazında türetilir (`<key>:<idx>:out` / `:waste`) ve
`ON CONFLICT … DO NOTHING` ile yazılır. Retry / çift dokunuş / fallback zinciri
stoğu iki kez düşürmez. *Doğrulandı: 1. çağrı 2 satır, 2. çağrı 0 satır.*

---

## 5. Miktar nasıl hesaplanır (D2)

Teknisyen ürünü seçer → motor kuralı çözer → miktarı hesaplar.

### Hesap modelleri (`consumption_rules.calc_model`)

| Model | Formül |
|---|---|
| `fixed` | `qty` (iş başına sabit) |
| `per_tooth` | `qty × diş sayısı` |
| `per_jaw` | `qty × çene sayısı` — `jaw_count(int[])` FDI numaralarından türetir (üst 11–28, alt 31–48) |
| `per_unit` | `qty × order_item.quantity` |
| `disc_yield` | Disk kalınlığına bağlı: seçilen kalemin `thickness_mm`'i `disc_yield_ref`'ten çözülür |

`disc_yield` neden gerekli: 12 mm zirkon disk ≈ 21,5 kron, 25 mm ≈ 52,5 kron.
Tek bir "diş başına disk" sabiti yanlış olurdu.

### Kural çözümü

`conditions jsonb` (örn. `{"work_type":"zirkonyum"}`) — boş = her işe uyar,
**en çok koşul eşleşen kural kazanır**.

### Varsayım vs. gerçek

`is_assumption = true` → SIMAN'ın başlangıç varsayımı, düzenlenmesi beklenir.
Yönetici değeri `upsert_consumption_rule` ile elle düzenlediğinde **otomatik `false`** olur —
artık laboratuvarın onayladığı değerdir. Spec §17: varsayımlar ile doğrulanmış davranışlar ayrı gösterilir.

### Kural bulunamazsa (K4)

Seçim `stage_material_selections`'a `status='pending_no_profile'` ile yazılır,
`stock_movements`'a **hiçbir şey yazılmaz**, satır yöneticinin "tanımsız profil" raporuna düşer.
Sessizce sıfır düşmek veya tahmin etmek yasaktır.

---

## 6. Ürün → malzeme eşleştirmesi

`suggest_stock_material_mapping(p_lab_id)` **yalnız önerir, hiçbir şey yazmaz.**
Yazma yalnız yönetici onayıyla `apply_stock_material_mapping(p_pairs)` üzerinden olur.

Öncelik sırası kritik — bir ad birden çok anahtar kelime içerebilir:

```
STAIN → GLAZE → PORCELAIN → ZIRCON
"CZR. FC CLEAR GLAZE-5GR"   → CZR(porselen)+GLAZE → GLAZE kazanır
"GC OPTIGLAZE COLOR ORANGE" → glaze+color         → STAIN kazanır
"GC INİTİAL ZR-FS DENTİN"   → ZR(zirkon)+dentin   → PORCELAIN kazanır
```

**Güven:** `yüksek` = ad eşleşmesi · `orta` = kategori yedeği · `yok`.

> ⚠️ **Türkçe tuzağı:** Postgres'te `~*` (case-insensitive regex) Türkçe **İ** harfini
> küçültemez. `tr_norm()` ile ad ASCII küçük harfe indirilir ve desenler ASCII tutulur.
> Bu düzeltmeden önce 90 kalemin 73'ü, sonra **90'ı** yüksek güvenle eşleşti.
>
> ⚠️ Postgres ARE'de kelime sınırı `\y`'dir — `\b` **değil**.

---

## 7. Envanter Doğrulama (D3)

Adı bilinçli olarak "stok sayımı" değil **"Envanter Doğrulama"**dır (spec §7.6).

```
open_inventory_verification  →  save_verification_count  →  approve  →  close  ↔  reopen
      (draft, system_qty              (physical_qty)         (ADJUST      (kilit)   (admin +
       snapshot alınır)                                    hareketleri)            gerekçe zorunlu)
```

- Kullanıcıya **"bu ay ne kadar kullandın?" SORULMAZ.** Yalnız fiziksel miktar girilir, farkı sistem hesaplar.
- `system_qty` taslak açılırken **snapshot**'lanır — sayım sürerken oluşan hareketler farkı bozmaz.
- Düzeltme hareketi: `type='ADJUST'` + **işaretli** miktar. `stock_effect` ADJUST'ı +1 yönünde uygular,
  dolayısıyla eksi fark stoğu doğru azaltır. *Doğrulandı: 1000 → 970.*
- **Kapalı dönem kilidi:** `guard_closed_period()` trigger'ı, kapalı döneme ait `stock_movements`
  satırının UPDATE/DELETE'ini reddeder. "Sessiz güncelleme kesinlikle yasaktır."
  Düzeltme için dönem yeniden açılır (admin + gerekçe) veya güncel döneme düzeltme kaydı girilir.

---

## 8. FIFO & Yeniden Sipariş (D4)

### FIFO

Mevcut deftere **trigger ile** bağlanır — hiçbir RPC değişmedi.
`trg_fifo_apply` = `AFTER INSERT ON stock_movements`.

| Hareket | Etki |
|---|---|
| `IN` · `RETURN` · `ADJUST(+)` | Yeni katman açılır |
| `OUT` · `WASTE` · `ADJUST(−)` | En eski katmandan (`ORDER BY received_at, created_at FOR UPDATE`) sıralı tahsis |

Stok yetmezse **gizlenmez**: `layer_id NULL` + `is_uncovered=true` tahsis satırı yazılır,
maliyet son bilinen birim fiyattan tahmin edilir. Tahsis toplamı her zaman tüketilen miktara eşittir.

### Yeniden sipariş önerisi

`report_reorder_suggestions(p_lab_id, p_window_days, p_lead_days, p_safety_days)`

```
hız            = pencere tüketimi / gerçek gözlem günü
kalan gün      = mevcut miktar / hız
sipariş tarihi = bugün + (kalan gün − tedarik − emniyet)
önerilen miktar= max( hız × (tedarik + emniyet) × 2 − miktar , min_quantity − miktar , 0 )
```

**Güven açıkça etiketlenir:** `yok` (tüketim verisi yok — minimum stok kuralı devreye girer) ·
`düşük` (3'ten az hareket veya 30 günden kısa geçmiş) · `orta`.
Tüketim hiç yoksa öneri uydurulmaz; yalnız `min_quantity` kuralı çalışır.

---

## 9. Para birimi ve maliyet

Finans **katı per-currency**'dir — her kur için ayrı ekstre, "≈ baz" toplama yok.
Envanter tarafında geçerli kurallar:

1. **Maliyet alışta finansa girer** (K5). Tüketim maliyeti tekrar post edilmez.
2. **Baz para birimi snapshot'tır** (K7). Nexadent'in `default_currency`'si sonradan TRY → EUR
   değişti; güncel ayarı geçmişe uygulamak `*_base` değerlerini **~53 kat** yanlış gösteriyordu.
   Bu yüzden `base_currency` her satırda saklanır.
3. **`cost_base`, `unit_cost_base_at_time`'dan DEĞİL kurdan türetilir.** Bazı canlı hareketlerde
   `unit_cost` (0,45 EUR) ile `unit_cost_base_at_time` (23.933) tutarsız; ikisini çarpmak
   227.364 gibi saçma tabanlar üretiyordu. **`cost_base = cost × rate`** her zaman tutarlıdır.
4. `get_currency_rate` doğrudan çift bulamazsa (veya çift 365 günden eskiyse) **TRY üzerinden köprü kurar:**
   `X→BAZ = (X→TRY) / (BAZ→TRY)`.

---

## 10. RPC referansı

| RPC | Ne yapar |
|---|---|
| `apply_stage_materials_core(...)` | **Çekirdek.** İstemciye kapalı (REVOKE) |
| `confirm_stage_materials(stage, lines, advance, idem_key)` | Operatör/sipariş detay yolu |
| `record_stage_consumption(order, stage, items, user)` | İstasyon kanban yolu (legacy imza korundu) |
| `create_purchase_invoice(...)` | Alış — satır JSON'una `lot_no` + `expiry_date` eklendi (opsiyonel) |
| `suggest_stock_material_mapping(lab)` | Eşleştirme önerir, **yazmaz** |
| `apply_stock_material_mapping(pairs)` | Toplu onay — yalnız yönetici/admin |
| `clone_consumption_profile(template)` | Global şablonu laba kopyalar. Kural bağları **kod + istasyon adıyla** yeniden kurulur → çok-lab güvenli. Idempotent |
| `get_lab_consumption_profile(lab)` | Aktif profil + kural sayısı + kaçının hâlâ varsayım olduğu |
| `upsert_consumption_rule(...)` | Kural ekle/güncelle/sil. Aktif lab profili yoksa hata verir |
| `report_profile_coverage(lab)` | (malzeme × istasyon) kombinasyonlarında kural var mı + `mapped_items` |
| `open_inventory_verification(...)` | Sayım taslağı açar, `system_qty` snapshot'lar |
| `save_verification_count(...)` | Fiziksel miktarı yazar |
| `approve_inventory_verification(id)` | Farkları `ADJUST` hareketine çevirir |
| `close_inventory_period(id)` / `reopen_inventory_period(id, reason)` | Kilitler / açar (admin + gerekçe zorunlu) |
| `list_inventory_verifications(limit)` · `get_verification_lines(id)` | Okuma |
| `report_fifo_stock(lab)` | Açık katmanlar + kalan miktar/değer |
| `report_reorder_suggestions(lab, window, lead, safety)` | Sipariş önerisi |
| `jaw_count(int[])` · `tr_norm(text)` | Yardımcı (IMMUTABLE) |

---

## 11. UI yüzeyleri

| Ekran | Dosya | Rota |
|---|---|---|
| Ürün → Üretim Malzemesi Eşleştirme | [`MaterialMappingScreen.tsx`](../modules/stock/screens/MaterialMappingScreen.tsx) | `/material-mapping` |
| Standart Tüketim Profili | [`ConsumptionProfileScreen.tsx`](../modules/stock/screens/ConsumptionProfileScreen.tsx) | `/consumption-profile` |
| Envanter Doğrulama | [`InventoryVerificationScreen.tsx`](../modules/stock/screens/InventoryVerificationScreen.tsx) | `/inventory-verification` |
| FIFO & Yeniden Sipariş | [`FifoReorderScreen.tsx`](../modules/stock/screens/FifoReorderScreen.tsx) | `/fifo-reorder` |
| Stok & Depo (Ayarlar sekmesi) | [`StockScreen.tsx`](../modules/stock/screens/StockScreen.tsx) | `/stock` |
| Miktarsız malzeme seçimi | [`MaterialSelectModal.tsx`](../modules/orders/components/MaterialSelectModal.tsx) | modal |
| Bayrak farkında sarmalayıcı | [`StageMaterialModal.tsx`](../modules/orders/components/StageMaterialModal.tsx) | modal |

Dört yeni ekran hem `(lab)` hem `(admin)` panelinde kayıtlı, sekmede `href: null` ile gizli.
API katmanı: [`modules/stock/api.ts`](../modules/stock/api.ts).
Ortak tasarım atomları: [`core/ui/ds/index.tsx`](../core/ui/ds/index.tsx).

---

## 12. Devreye alma kontrol listesi

Miktarsız akış (`lab_settings.inventory_qtyless_enabled = true`) açılmadan önce:

- [ ] Tüm aktif stok kalemleri bir üretim malzemesine eşlenmiş olmalı — **✅ 90/90**
- [ ] Lab kendi profilini şablondan kopyalamış olmalı — **✅**
- [ ] Profil kapsaması **≥ %80** — **⚠️ şu an %58** (19 kombinasyondan 11'inde kural var)
- [ ] Eşleşmemiş üretim malzemesi kalmamalı — **⚠️ 4 malzemenin bağlı kalemi yok**
- [ ] Kalan varsayım kuralları yöneticiye onaylatılmalı — **⚠️ 22 kuraldan 8'i hâlâ varsayım**

Bayrak açılana kadar bugünkü miktar girişli akış çalışmaya devam eder; hiçbir davranış değişmez.

---

## 13. Canlı durum (31 Temmuz 2026)

| Ölçüm | Değer |
|---|---|
| Aktif stok kalemi / eşleşmiş | 90 / **90** |
| Üretim malzemesi | 16 |
| Tüketim kuralı (varsayım) | 22 (8) |
| Profil kapsaması | %58 |
| Stok hareketi | 107 |
| FIFO katmanı / tahsis | 92 / 15 (5'i `is_uncovered`) |
| Miktarsız seçim | 0 (bayrak kapalı) |
| Envanter doğrulaması | 1 |
| `inventory_qtyless_enabled` | **false** |

---

## 14. Bilinen tuzaklar

1. **`stock_items.quantity` elle güncellenmez.** `trg_stock_qty_sync` tek kaynaktır; elle yazmak çift sayım üretir.
2. **`lab_stations` tenant kolonu `lab_profile_id`** (FK → `labs`), `lab_id` değil.
3. **`work_orders` sipariş numarası `order_number`**, `order_no` değil.
4. **Postgres ARE'de `\y`** kullanılır, `\b` değil.
5. **Türkçe `İ` `~*` ile küçülmez** → `tr_norm()` şart.
6. `apply_stage_materials_core` **yetki kontrolü yapmaz** — doğrudan çağrılamaz, sarmalayıcı zorunlu.
7. Baz para birimi ve `cost_base` kuralları için bkz. §9 — bunlar canlı veride bulunmuş gerçek hatalardır.

---

## 15. Migration listesi

| Dosya | İçerik | Durum |
|---|---|---|
| `20260730180000_stock_qty_single_source.sql` | Miktar tek kaynak trigger'ı | ✅ canlı |
| `20260731090000_inventory_d1_engine_core.sql` | Tek tüketim motoru + idempotency + lot/SKT | ✅ canlı |
| `20260731110000_purchase_lot_expiry.sql` | Alışta lot / son kullanma tarihi | ✅ canlı |
| `20260801090000_inventory_d2_schema.sql` | D2 şeması + RLS + özellik bayrağı | ✅ canlı |
| `20260801100000_inventory_d2_seed_materials.sql` | 16 üretim malzemesi seed'i | ✅ canlı |
| `20260801110000_inventory_d2_mapping_suggest.sql` | Eşleştirme önerisi + onay | ✅ canlı |
| `20260801120000_inventory_d2_mapping_tr_normalize.sql` | `tr_norm()` Türkçe düzeltmesi | ✅ canlı |
| `20260801130000_inventory_d2_profile_seed.sql` | Global şablon + `disc_yield_ref` + `is_assumption` | ✅ canlı |
| `20260801140000_inventory_d2_profile_clone_coverage.sql` | Profil kopyalama + kapsama raporu | ✅ canlı |
| `20260801150000_inventory_d2_rule_upsert.sql` | Kural düzenleme + profil okuma | ✅ canlı |
| `20260802090000_inventory_d3_verification.sql` | Doğrulama şeması + dönem kilidi | ✅ canlı |
| `20260802100000_inventory_d3_verification_rpcs.sql` | Doğrulama akışı RPC'leri | ✅ canlı |
| `20260803090000_inventory_d4_fifo.sql` | FIFO katman/tahsis + trigger | ✅ canlı |
| `20260731100000_drop_dead_stage_material_consumptions.sql` | Ölü tablo temizliği | ⛔ **beklemede** — DROP güvenlik sınıflandırıcısı tarafından engellendi, elle çalıştırılmalı |

`report_fifo_stock` ve `report_reorder_suggestions` canlıya `apply_migration` ile doğrudan
uygulandı; migration dosyası olarak repoda değiller. Sıfırdan kurulumda elle eklenmeleri gerekir.
