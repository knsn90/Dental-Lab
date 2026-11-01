# Sipariş geçmişi ve Loglar süzgeci (2. dalga 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sipariş detayında tek bir "Geçmiş" akışı (oluşturma, söz verilen teslim ve değişiklikleri, bekleme, kurye, notlar ve sohbet, üretim, revizyon/devam, finans yetkiliye); siparişte kim neyi değiştirdi kaydı; Loglar'da sunucu tarafı süzgeç.

**Architecture:**
- Geçmiş tek bir DEFINER RPC'den gelir: `order_history(p_order)`. Siparişin kendi tablolarını ve `activity_logs`'u birleştirir. Erişimi `work_orders` okuma kuralının aynası olan `can_read_work_order` ile denetler; satırları rol kurallarıyla süzer.
- Alan değişiklikleri `work_orders` AFTER UPDATE tetikleyicisiyle `log_activity()`'ye yazılır.
- Loglar `activity_log_search(...)` ile sayfalanır.
- İstemcide `modules/orders/history/` saf bir model (tür kodu → başlık/kategori) ve bir zaman çizelgesi bileşeni tutar.

**Tech Stack:** Supabase Postgres (plpgsql, triggers, indexes), Expo + react-native-web, `node --test` (`.test.mts`).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-26-siparis-gecmisi-design.md`

## Global Constraints

- **Veritabanı adımı beş aşamalıdır:**
  1. Canlı tanım `supabase/rollbacks/<ts>.before.txt` dosyasına kaydedilir.
  2. Geri alma `.down.sql` yazılır.
  3. Geri alınan işlemde rol rol ölçülür: ÖNCE → geçiş → SONRA → geri alma → GERİ ALMA, sonunda RAISE. Çıktıdaki her metin `coalesce`'li olmalı; NULL birleştirme `probe.out`'u siler (Task 1 dersi, tek tanım).
  4. **Kullanıcı onayı** alınır.
  5. `supabase db query --linked -f <mutlak>` ile uygulanır, canlıda ölçülür.
- **Deneme kimlikleri:**
  - lab `243ef1db-9853-424b-8292-0025abfca436`
  - sahip `f6817e96-2aab-443f-8cb3-02b7718f18e4`
  - finanssız müdür `8ce19a0e-445d-4167-87e6-9fc192875169`
  - teknisyen `8cde8a36-e391-4de4-9672-98dae3051810`
  - kurye `baad4b1e-093c-4ae9-9009-689c0e5b5bc7`
  - klinik yöneticisi `560e1377-3b52-437e-8bf8-65147750e8fb`
  - hekim `747ae960…` (sorguyla tam kimlik)
- **Rol görünürlüğü:** yeni DEFINER fonksiyonlar rol adı değil şu yardımcıları kullanır: `lab_can_view_finance()`, `can_view_clinic_billing(clinic)`, `_field_staff_sees`, `get_display_tech_names`, `lab_tz()`. `activity_logs` RLS değişmez.
- **Klinik ve hekime gizli olanlar** (spec karar 7):
  - `lab_notes` (yalnız `lab_notes_visible` true ise görünür) ve `manager_notes`.
  - Durum geçmişi notları.
  - Aşama satırları (`stage_*`), teknisyen ataması ve devri, kalite reddi ve yeniden iş, malzeme.
  - Lab kaynaklı beklemenin nedeni: `responsible <> 'client'` → yalnız `hold_started` / `hold_ended`, `detail.reason` boş.
  - Finans satırları ve kalem fiyatları (`can_view_clinic_billing` yoksa).
  - Kalan teknisyen adları `get_display_tech_names` sonucuna göre.
- **Tetikleyici güvenliği:** log yazımı `BEGIN … EXCEPTION WHEN OTHERS THEN NULL` içinde. Yalnız izlenen alanlardan biri `IS DISTINCT FROM` ise tek satır yazılır.
- **Ekran kuralları:**
  - Dört dil aynı anda, `auto.{en,de,fa}.json` eşit.
  - Koyu tema token'larla.
  - `PAGE_PADDING`; ikonlar `core/ui/icons`.
  - Tarih ve saat lab saat diliminde (`lab_tz`); her satır "12 Eki 14:32" biçiminde.
- **Doğrulama:** `npx tsc --noEmit --incremental false` → 0 hata. Test paketi `bash /private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/92fed326-e9be-452e-a41e-d705e960980b/scratchpad/search/suite.sh` yeşil.
- **Commit ve yayın:** commit yok; ledger tutulur. Yayın yalnız kullanıcı "deploy" deyince.
- **KVKK:** çıktılarda hasta/kişi adı ve tutar yazılmaz.

## Review Focus

1. **Klinik yöneticisi ya da hekim Geçmiş'i açar:** lab notu (görünür değilse), yönetici notu, finans satırı ve gizlenmiş teknisyen adı gelmez; hekim notu ve sohbet gelir. T1 probu (KY, H satırları).
2. **Teknisyen başka bir siparişin kimliğiyle `order_history` çağırır:** 42501 ya da boş döner. Kurye de yalnız kendi teslimatının siparişini görür. T1 probu.
3. **Aşama RPC'si, teslim ya da toplu işlem siparişi günceller:** değişiklik tetikleyicisi yalnız izlenen alan değişince ve tam bir kez yazar. Log hatası güncellemeyi bozmaz. T2 probu (zorla hata).
4. **Klinik düzenlemesi (`client_update_order`):** aynı değişiklik iki satır olarak görünmez. T2 probu.
5. **2.000'den eski log kaydı ve sipariş no ile arama:** sunucu sayfalaması ve sipariş no'ya bağlı aşama/talep kayıtları bulunur. T3 probu.

---

### Task 1: Geçmiş RPC'si — `can_read_work_order` + `order_history` + indeksler (SQL)

**Files:**
- Create: `supabase/migrations/20261027100000_siparis_gecmisi.sql` + `.down.sql` + `.before.txt`
- Probe: `scratchpad/gecmis/t1_probe.sql`

**Interfaces — Produces:**
- **`can_read_work_order`:** `public.can_read_work_order(p_order uuid) returns boolean`, SECURITY DEFINER STABLE. İçerik, `wo_select_consolidated` kuralının `id = p_order` ile birebir kopyası (canlı tanımdan alınır).
- **`order_history`:** `public.order_history(p_order uuid) returns table(at timestamptz, kind text, category text, actor_name text, detail jsonb, link_order_id uuid, link_order_no text)`, SECURITY DEFINER STABLE.
  - Erişim yoksa 42501.
  - `category` değerleri: `teslim` | `notlar_sohbet` | `uretim` | `diger`.
  - **`kind` kodları ve kaynakları:**
    - `created` — work_orders.created_at; `detail.delivery_date` = oluşturma anındaki teslim günü (ilk `delivery_date` değişikliğinin `old` değeri, yoksa bugünkü).
    - `delivery_date_changed` — activity_logs alan değişikliği, Task 2'den sonra.
    - `field_changed` — activity_logs `metadata.fields`.
    - `status_changed` — status_history.
    - `stage_assigned`, `stage_started`, `stage_completed`, `stage_approved`, `stage_skipped` — order_stages zamanları.
    - `hold_started`, `hold_ended` — work_order_holds.
    - `delivery_assigned`, `delivery_picked_up`, `delivery_delivered`, `delivery_cancelled` — deliveries; `detail`: purpose, direction, recipient_name, courier adı.
    - `message` — order_messages; `detail`: içerik ilk 280 karakter, ek adı.
    - `doctor_note` — work_orders.notes; zaman = created_at.
    - `lab_note` — work_orders.lab_notes; klinik/hekime yalnız `lab_notes_visible`.
    - `photo` — work_order_photos.
    - `change_request`, `cancel_request` — talep + karar (ayrı satırlar).
    - `prova_sent`, `prova_returned` — provas.
    - `approval_requested`, `approval_decided` — approvals + `doctor_approval_*`.
    - `implant_part` — order_implant_parts; requested/received.
    - `review` — order_reviews.
    - `invoice_issued`, `payment` — invoices (kesilmiş) + payments; yalnız finans yetkilisine.
    - `revision_opened`, `revision_of`, `continuation_opened`, `continuation_of` — revision_of_id, continues_order_id; link_order alanları dolu.
  - Teknisyen kimlikleri `get_display_tech_names` ile ada çevrilir. Klinik/hekim çağırınca gizliyse ad boş döner.
- **İndeksler:** `create index if not exists idx_activity_logs_entity on activity_logs(entity_id)` ve `idx_activity_logs_lab_created on activity_logs(lab_id, created_at desc)`.

- [ ] **Step 1:** `wo_select_consolidated`, `get_display_tech_names`, `doctor_owns_order_doctor` canlı tanımlarını ve activity_logs indekslerini `.before.txt`'e kaydet. Örnek sipariş seç: hold + teslimat + mesajı olan bir Nexadent siparişi (kimlik sorguyla; adı yazdırma).
- [ ] **Step 2: Probu yaz (ÖNCE = fonksiyon yok):** O, M, T, K (kurye), KY, H kimlikleriyle `work_orders` RLS'ten o siparişi okuyabiliyor mu (el sayımı).
- [ ] **Step 3:** Geçiş ve geri alma.
- [ ] **Step 4: SONRA beklenen:**
  - `can_read_work_order` = her kimlik için RLS okumasıyla aynı.
  - `order_history` O'da kind kümesi created, status_changed, stage_*, hold_*, delivery_*, message satırlarını içerir ve `at` sıralı.
  - KY/H: `lab_note` (görünür değilse), `stage_*`, lab kaynaklı bekleme nedeni, `invoice_issued`, `payment` (fatura yetkisi yoksa) yok; erişemiyorsa 42501.
  - T: kendi işi olmayan siparişte 42501.
  - M (finanssız): invoice/payment satırı 0.
  - GERİ ALMA: fonksiyonlar yok.
- [ ] **Step 5:** Onay → uygula → canlı ölçüm. Ledger.

### Task 2: Değişiklik kaydı — sipariş alanları, kalemler, teknisyen devri (SQL)

**Files:**
- Create: `supabase/migrations/20261027110000_siparis_alan_kaydi.sql` + `.down.sql` + `.before.txt`

**Interfaces — Produces:**
- **Sipariş alanları:** tetikleyici `trg_wo_log_field_changes` (AFTER UPDATE ON work_orders FOR EACH ROW) + fonksiyon `public._wo_log_field_changes()` (DEFINER).
  - İzlenen alanlar: patient_name, patient_age, work_type, tooth_numbers, shade, measurement_type, model_type, delivery_method, delivery_date, doctor_id, is_urgent, notes, lab_notes, implant_brand, implant_teeth, implant_details.
  - patient_name ve patient_age **değersiz** yazılır: `{field, changed: true}` (KVKK).
  - `log_activity('Siparişi düzenledi', 'work_order', NEW.id, NEW.order_number, jsonb_build_object('fields', [{field, old, new}], 'source', 'trigger'), NEW.lab_id, null)`.
- **Kalemler:** `_apply_order_edit` (canlı tanım) içine fark hesabı eklenir. Silmeden önce eski kalem kümesi alınır, yeniden yazdıktan sonra yeni küme ile karşılaştırılır.
  - Fark varsa tek `log_activity('Kalemleri düzenledi', 'work_order', …, jsonb_build_object('items', [{op: 'added' | 'removed' | 'changed', service, qty_old, qty_new, price_old, price_new, teeth_old, teeth_new, currency}]))`.
  - Fiyat alanları `order_history`'de yalnız finans yetkilisine döner.
- **Teknisyen devri:** tetikleyici `trg_stage_log_reassign` (AFTER UPDATE OF technician_id ON order_stages) → `log_activity('Aşamayı devretti', 'stage', NEW.id, …, jsonb_build_object('order_id', NEW.work_order_id, 'from', OLD.technician_id, 'to', NEW.technician_id))`. `OLD.technician_id IS DISTINCT FROM NEW.technician_id` ve ikisi de null değilse.
- **Hata güvenliği:** üç yazım da `BEGIN … EXCEPTION WHEN OTHERS THEN NULL`.
- **`client_update_order`:** kendi "düzenledi" kaydı tetikleyiciyle aynı alan değişikliğini tekrar ediyorsa o elle yazım kaldırılır; tek kaynak tetikleyici + kalem farkı. Ledger'a Ruling.

- [ ] **Step 1:** `client_update_order` ve work_orders tetikleyici listesinin canlı tanımını kaydet.
- [ ] **Step 2: Prob ÖNCE:** O olarak bir siparişin `delivery_date`'ini `update_work_order_status` dışı mevcut düzenleme yoluyla (ya da doğrudan UPDATE; lifecycle guard izin veriyorsa) değiştir; activity_logs'a yazılan satır 0.
- [ ] **Step 3:** Geçiş + geri alma.
- [ ] **Step 4: SONRA:**
  - Aynı değişiklik → tam 1 satır, `fields` içinde delivery_date old/new.
  - patient_name değişikliği → `changed: true`, değer yok.
  - `admin_update_order` ile bir kalemin adedi değişince → 1 "Kalemleri düzenledi" satırı (`op: 'changed'`); değişmeyen kalem listesi → 0.
  - Aşamanın teknisyeni değişince → 1 "Aşamayı devretti" satırı.
  - `updated_at`'ten başka değişmeyen güncelleme → 0.
  - KY olarak `client_update_order` (canlı imzayla, geçici değer) → toplam 1 satır.
  - Zorla hata: işlem içinde `log_activity` geçici olarak hata verecek şekilde değiştirilir → UPDATE yine başarılı.
  - `order_history` (T1) `delivery_date_changed` satırını döndürür.
  - GERİ ALMA = ÖNCE.
- [ ] **Step 5:** Onay → uygula → canlı ölçüm. Ledger.

### Task 3: Loglar arama RPC'si (SQL)

**Files:**
- Create: `supabase/migrations/20261027120000_log_arama.sql` + `.down.sql` + `.before.txt`

**Interfaces — Produces:**
- `public.activity_log_search(p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_kind text default null, p_order_no text default null, p_before timestamptz default null, p_limit int default 100) returns setof activity_logs`, SECURITY DEFINER STABLE.
- Yetki: bugünkü RLS ile aynı (`is_admin_user() and lab_id = get_my_lab_id()`); değilse boş.
- `p_kind` değerleri: `work_order` | `stage` | `message` | `photo` | `payment` | `material` | `auth` | `clinic` | `doctor` | `profile` | `change_request` | `field_change` (`metadata ? 'fields'`).
- `p_order_no`: o siparişin `entity_id`'si + aşama kimlikleri + talep kimlikleri + `metadata->>'order_id'`.
- Sıra `created_at desc`, `created_at < p_before`, `limit least(p_limit, 500)`.
- Kişi listesi için `public.activity_log_actors() returns table(actor_id uuid, actor_name text, n bigint)`.

- [ ] **Step 1-5:** Beş adım.
  - Prob: O için süzgeçsiz ilk sayfa 100; `p_before` ile ikinci sayfa farklı ve daha eski.
  - Sipariş no ile → o siparişin work_order + stage kayıtları.
  - M/T → 0 satır.
  - GERİ ALMA = fonksiyon yok.

### Task 4: İstemci modeli ve zaman çizelgesi bileşeni

**Files:**
- Create: `modules/orders/history/historyModel.ts`, `historyModel.test.mts`, `useOrderHistory.ts`, `OrderHistoryTimeline.tsx`
- Modify: i18n dosyaları

**Interfaces:**
- **Consumes:** T1 `order_history`.
- **Produces:**
  - `type HistoryRow = { at: string; kind: string; category: 'teslim' | 'notlar_sohbet' | 'uretim' | 'diger'; actor_name: string | null; detail: Record<string, any>; link_order_id: string | null; link_order_no: string | null }`
  - `historyTitle(row: HistoryRow): string` — Türkçe kaynak metin; çağıran `autoT` uygular; `detail` değerleri birleştirilir.
  - `filterRows(rows, chip: 'all' | 'teslim' | 'notlar_sohbet' | 'uretim'): HistoryRow[]`
  - `fmtStamp(iso: string, tz: string, locale: string): string` — "12 Eki 14:32"; `Intl` ile lab saat dilimi. Saf; import yok.
  - `useOrderHistory(orderId): { rows: HistoryRow[]; loading: boolean; error: string | null; refetch }` — realtime: order_messages + work_orders + deliveries değişince 400 ms gecikmeli tazeleme (paylaşılan kanal deseni).
  - `<OrderHistoryTimeline orderId />` — çipler (Tümü · Teslim · Notlar ve sohbet · Üretim), satırlar (saat, kişi, başlık, ayrıntı, bağlantılı sipariş numarasına basınca o sipariş), boş / yükleniyor / hata durumları.

- [ ] **Step 1: Test** (`historyModel.test.mts`):
  - `fmtStamp('2026-10-12T11:14:00Z','Europe/Istanbul','tr')` = '12 Eki 14:14'.
  - `filterRows` kategori eşlemesi.
  - Her `kind` için `historyTitle` boş değil.
  - `delivery_date_changed` başlığı eski → yeni içerir.
  - Bilinmeyen kind → genel başlık.
  - Çalıştır → FAIL.
- [ ] **Step 2:** Uygula; dört dil (her yeni Türkçe başlık auto sözlüğe).
- [ ] **Step 3:** Test PASS; `tsc` 0; paket yeşil.
- [ ] **Step 4:** Ledger.

### Task 5: Sipariş detayına bağlama (masaüstü + mobil)

**Files — Modify:**
- `modules/orders/screens/OrderDetailScreenV2.tsx`: sideTab union `:314`, sekme dizisi `:3263-3271`, ölü yerel `ActivityFeed` `:3866-3909` silinir, `activities` üretimi `:1323` kaldırılır.
- `OrderDetailMobileHandoff.tsx`: `activities` prop `:100`; "Activity log" bölümü `:951-966` Geçmiş akışını gösterir.

**Kurallar:**
- Masaüstü yan sekme kartında 4. sekme "Geçmiş".
- `?tab=history` adres parametresi sekmeyi açar (Loglar'dan geçiş için).
- Tüm paneller (lab, admin, klinik, hekim, istasyon) aynı bileşeni kullanır; görünürlüğü RPC belirler.

- [ ] **Step 1:** `check_t5.sh` yaz: V2'de `OrderHistoryTimeline` ve 'history' sekmesi var; yerel `function ActivityFeed` yok; Handoff'ta `activities` prop yok. Çalıştır → FAIL.
- [ ] **Step 2:** Uygula + dört dil.
- [ ] **Step 3:** PASS; `tsc` 0; paket yeşil.
- [ ] **Step 4: Önizleme (sahip):**
  - Bir siparişte Geçmiş: oluşturma satırı saatli, mesaj ve kurye satırları.
  - Çipler süzüyor.
  - Masaüstü + mobil genişlik; koyu tema.
- [ ] **Step 5:** Ledger.

### Task 6: Loglar ekranı — sunucu süzgeci ve sayfalama

**Files — Modify:**
- `modules/settings/sections/LogsSection.tsx`, `app/(admin)/logs.tsx` (ortak parça çıkarılabilir: `modules/logs/LogsBrowser.tsx`)
- `modules/logs/logDetail.tsx`: ENTITY_LABEL'e change_request, cancel_request, payment, field_change
- i18n dosyaları

**Kurallar:**
- `activity_log_search` + `activity_log_actors`.
- Süzgeçler: tarih aralığı (mevcut `DateRangePicker`), kişi seçimi, tür çipleri, sipariş no kutusu. Mevcut aktör tipi sekmeleri ve metin araması korunur; metin araması yüklü sayfada.
- "Daha fazla" düğmesi `p_before` ile sonraki sayfa. Realtime ekleme korunur (yalnız süzgeçsiz görünümde).
- **Görünürlük (spec karar 8):** Loglar sekmesi (Ayarlar hub'ı + admin logs rotası) yalnız kayıtları okuyabilene gösterilir: `user_type='admin'`, sunucuda `is_admin_user()`. Ayar yetkili müdüre sekme çizilmez; doğrudan adresle gelirse "yetki yok" boş durumu.
- Sipariş satırı (`entity_type` work_order/message/photo ya da metadata.order_id) → `/<panel>/order/<id>?tab=history`.
- "Durumu değiştirdi → X" satırları `autoT('Durumu değiştirdi →')` + `statusLabel(X)` ile çevrilir.
- `fields` metadata'sı LogDetail'de "alan: eski → yeni" listesi.

- [ ] **Step 1:** `check_t6.sh` yaz: `.limit(2000)` yok; `activity_log_search` kullanılıyor; tarih/kişi/tür/sipariş no süzgeçleri var. Çalıştır → FAIL.
- [ ] **Step 2:** Uygula + dört dil.
- [ ] **Step 3:** PASS; `tsc` 0; paket yeşil.
- [ ] **Step 4: Önizleme (sahip):**
  - Sipariş no ile arama o siparişin kayıtlarını getirir.
  - "Daha fazla" eski kayıtları yükler.
  - Satıra basınca siparişin Geçmiş sekmesi açılır.
- [ ] **Step 5:** Ledger.

### Final

- [ ] Bağımsız tüm-dal incelemesi (opus). Critical/Important için tek düzeltme turu; Minor'lar ledger'a.
- [ ] Hafıza `project_order_history` + MEMORY.md satırı; yol haritasında 2. dalga 3 işaretlenir.
