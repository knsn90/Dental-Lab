# İmplant Parçaları Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siparişe implant parçası (scan body, dijital analog …) kaydı + lab→klinik talep akışı, ambalaj fotoğrafı, sohbet mesajı, bildirim ve devam siparişinde "aynısını talep et".

**Architecture:** Yeni `order_implant_parts` + `order_implant_part_photos` tabloları; tüm yazmalar SECURITY DEFINER RPC (rol = `_implant_parts_actor(order)` → 'lab' | 'clinic'); RPC aynı işlemde sohbet mesajı ve bildirim üretir. İstemcide tek paylaşılan `ImplantPartsSection` bileşeni hem desktop İMPLANT şeridine hem mobil handoff'a takılır.

**Tech Stack:** Supabase Postgres (RLS, plpgsql), Expo Router / React Native + RN-web, NativeWind (yalnız düz View/Text'te), expo-image-picker.

**Spec:** `docs/superpowers/specs/2026-09-12-implant-parts-design.md`

## Global Constraints
- lab_id → `labs(id)`; tenant filtresi `get_my_lab_id()`.
- Tabloya doğrudan INSERT/UPDATE/DELETE politikası YOK; yalnız RPC.
- Depo yolu: `orders/<work_order_id>/parts/<part_id>/<dosya>` (bucket `work-order-photos`, private → signed URL).
- Bildirim: talep → `_notify_channels` (hekim + klinik, e-posta dahil; teknisyen talebinde klinik bildirimi YOK); diğerleri `_notify_inapp`. Kategori `implant_parts`.
- Mesaj: `order_messages.message_type` = `parts_request` | `parts_status`, içerik düz metin, emoji yok.
- Native: nesne stil; `Animated.View`'e className yok; `onPress ? Pressable : View` + fonksiyon stil yok; token renkler (useMobileTokens / isDark); 16px kenar.
- Metinler tr + en/de/fa (`auto.{en,de,fa}.json`) birlikte.
- Test çerçevesi yok: DB → geri sarılan SQL probe (`raise exception` ile rollback); istemci → `tsc --noEmit --incremental false` + puppeteer mock harness (web) + iOS simülatör ekran görüntüsü.

---

### Task 1: DB — şema, RLS, depo kuralları, RPC'ler, mesaj + bildirim
**Files:** Create `my-expo-app/supabase/migrations/20260912100000_implant_parts.sql`
**Produces (RPC imzaları):**
- `request_implant_parts(p_order uuid, p_parts jsonb) returns setof uuid` — parts: `[{tooth_number?, part_type, brand?, model?, ref_code?, quantity?, note?, return_required?, copied_from_part_id?}]`
- `set_implant_part_status(p_part uuid, p_status text) returns void`
- `revert_implant_part_status(p_part uuid) returns void`
- `update_implant_part(p_part uuid, p_fields jsonb) returns void`
- `delete_implant_part(p_part uuid) returns void`
- `add_implant_part_photo(p_part uuid, p_path text) returns uuid`, `delete_implant_part_photo(p_photo uuid) returns text` (silinen yol)
- [ ] Migration yaz → `supabase db query --linked -f <mutlak yol>` ile uygula
- [ ] Probe: lab olarak talep → status talep_edildi + 1 mesaj + klinik bildirimi; klinik olarak siparis_verildi; klinik teslim_alindi deneyince hata; lab teslim → iade (return_required) ; hepsi `raise exception` ile geri sarılır

### Task 2: İstemci API + tipler
**Files:** Create `my-expo-app/modules/orders/implantParts.ts`
**Produces:** `ImplantPart`, `ImplantPartPhoto`, `PartType`, `PartStatus`, `PART_TYPE_LABELS`, `PART_STATUS_META`, `fetchImplantParts(orderId)`, `requestImplantParts`, `setPartStatus`, `revertPartStatus`, `updatePart`, `deletePart`, `uploadPartPhoto(orderId, partId, asset)`, `deletePartPhoto`, `signPartPhotos(paths)`, `useImplantParts(orderId, parentOrderId?)`
- [ ] Yaz, tsc temiz

### Task 3: UI — ImplantPartsSection (+ ekleme/düzenleme penceresi, önceki iş bloğu)
**Files:** Create `my-expo-app/modules/orders/components/ImplantPartsSection.tsx`, `ImplantPartsSheet.tsx`
**Consumes:** Task 2. Props: `{ orderId, parentOrderId?, parentOrderNumber?, implantTeeth: number[], brandForTooth: (t)=>string, role: 'lab'|'clinic', compact?: boolean }`
- [ ] Diş gruplu liste, durum rozeti, birincil buton, ⋯ menü, geçmiş, küçük resim + lightbox
- [ ] Sheet: diş seçimi, çoklu satır, iade anahtarı (scan body varsayılan açık), fotoğraf seç (ImagePicker web+native)
- [ ] Önceki iş bloğu: "Aynısını talep et" / "Tümünü talep et" → sheet ön-dolu

### Task 4: Entegrasyon — desktop İMPLANT şeridi + mobil handoff
**Files:** Modify `modules/orders/screens/OrderDetailScreenV2.tsx` (İMPLANT şeridi ~2623), `modules/orders/screens/OrderDetailMobileHandoff.tsx` (4b İmplant ~756)
- [ ] Görünme: implant bilgisi VEYA parça varsa (şerit parça varken implant yoksa da açılır)
- [ ] Rol: lab paneli/admin → 'lab'; klinik/hekim → 'clinic'

### Task 5: Sohbet kartı
**Files:** Modify `modules/orders/components/MessagesPopup.tsx` (MessageBubble)
- [ ] `message_type` parts_* ise kart görünümü; eski düz metin fallback aynı içerik

### Task 6: i18n + bildirim tercihi
**Files:** `core/i18n/locales/auto.{en,de,fa}.json`, `modules/settings/sections/NotificationsSection.tsx`
- [ ] Yeni metinler 3 dil; `implant_parts` kategorisi tercih listesinde

### Task 7: Doğrulama
- [ ] tsc 0 hata; web harness (lab + klinik rolü) ekran görüntüleri; iOS simülatör ekran görüntüsü aynı sipariş; karşılaştır
