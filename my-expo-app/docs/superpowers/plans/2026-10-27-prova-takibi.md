# Prova ve randevu takibi (2. dalga 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Siparişte prova takibi (Hazırlanıyor → Klinikte → Lab onayı bekliyor → Döndü), hastanın prova/takma randevuları, gecikme ve randevu riski uyarıları, sayacı durdurup dönüşte teslim tarihini kaydıran prova beklemesi; sipariş detayında B düzeni Prova popup'ı, sihirbazda randevu satırı, Siparişler'de iki filtre.

**Architecture:**
- **Prova beklemesi:** Mevcut bekleme yuvasını (`work_orders.hold_*` + `work_order_holds`) yeni `client_prova` kategorisiyle kullanır. Açma ve kapama yalnız sunucudaki `_prova_hold_sync` ile olur; `resume_order` bu kategoriyi reddeder.
- **Yazma yolu:** Bütün yazmalar SECURITY DEFINER RPC'lerden geçer. Kurye bacağı tetikleyiciyle işaretler.
- **Okuma:** Tek bir rol süzgeçli `order_prova_snapshot(p_order)` (popup) ve `order_prova_flags()` (liste rozet ve filtre).
- **Günlük tarama:** `fn_prova_watch()`, gecikme ve risk bildirimini prova/sipariş başına bir kez gönderir.
- **İstemci:** `modules/orders/prova/` saf bir model (`provaModel.ts`, test edilir), RPC sarmalayıcıları, popup ve randevu düzenleyicisini tutar.

**Tech Stack:** Supabase Postgres (plpgsql, triggers, pg_cron, pg_net), Expo + react-native-web, `node --test` (`.test.mts`).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-10-27-prova-takibi-design.md`. Onaylı prototip: `docs/superpowers/specs/2026-10-27-prova-takibi-prototip.html` (görsel ve hareket kaynağı; 5.2'yi birebir izler).

## Global Constraints

- **Veritabanı adımı beş aşamalıdır:**
  1. Canlı tanım `supabase/rollbacks/<ts>.before.txt` dosyasına kaydedilir.
  2. `.down.sql` yazılır.
  3. Geri alınan işlemde ölçülür: ÖNCE → geçiş → SONRA → down → GERİ ALMA, sonra RAISE. Üretici `scratchpad/gecmis/gen_probe.py S mig down out measure`. Her metin birleştirmesi `coalesce`'li.
  4. **Kullanıcı onayı** AskUserQuestion ile alınır.
  5. `supabase db query --linked -f <mutlak yol>` (my-expo-app'ten) ile uygulanır, canlıda ölçülür.
- **Deneme kimlikleri:**
  - lab `243ef1db-9853-424b-8292-0025abfca436`
  - sahip `f6817e96-2aab-443f-8cb3-02b7718f18e4`
  - teknisyen `8cde8a36-e391-4de4-9672-98dae3051810`
  - kurye `baad4b1e-093c-4ae9-9009-689c0e5b5bc7`
  - klinik yöneticisi `560e1377-3b52-437e-8bf8-65147750e8fb`
  - hekim sorguyla bulunur
- **Gönderen fonksiyonlar denemelerde çağrılmaz:** `fn_prova_watch`, `_notify_channels`, e-posta gönderen her şey. Denemeler yalnız `_prova_watch_collect` ve uygulama içi bildirim satırlarını ölçer.
- **Yeni tablo:** RLS açılır; `authenticated`'dan INSERT/UPDATE/DELETE alınır (yazma yalnız RPC ile). FORCE RLS yok. `lab_id` → `labs(id)`.
- **Yetki:**
  - Lab yönetimi `_prova_can_manage(p_order)` ile denetlenir: aynı lab (`get_my_lab_id()`), `my_user_type()` lab ya da admin, `my_role_key()` technician ya da courier değil; veya platform yöneticisi.
  - Hekim ve klinik `_client_owns_order(p_order)` ile denetlenir. Planlama başladı mı sorusu `_order_planning_started(p_order)` ile yanıtlanır.
  - Okuma `can_read_work_order(p_order)` ile denetlenir.
- **Tarih:**
  - "Bugün" = `lab_today(lab_id)`, saat dilimi = `lab_tz(lab_id)`.
  - Prova günleri `date`'tir. Geçmiş tarihli işaret ≤ bugün olmalı, dönüş ≥ gönderim günü olmalı.
- **Dönüş için son gün (`return_by`):**
  - Gönderim gününden sonraki ilk onaylı, silinmemiş prova randevusunun günü; yoksa `sent_date + 2`.
  - `bugün > return_by` iken prova gecikmiştir; `late_days = bugün − return_by`.
- **Teslim kayması:** Prova beklemesi kapanınca `delivery_date += (kapanış günü − bekleme başlangıç günü)`, lab saat dilimine göre gün farkı (spec karar 5).
- **Risk:** Yalnız onaylı randevular kullanılır.
  - `effective_delivery`: prova beklemesi açıksa `delivery_date + max(return_by − başlangıç günü, bugün − başlangıç günü)`, değilse `delivery_date`.
  - En yakın gelecek takma randevusuna göre: `effective_delivery ≥ takma` → `yetismiyor`; değilse `takma − bugün ≤ 2` → `yaklasiyor`; değilse `yetisir`. Teslim edilmiş iş ya da takmasız iş → `null`.
- **Bildirim kategorileri:**
  - Lab'a: uygulama içi, kategori `order_status`, alıcılar `p.lab_id = lab AND (user_type='admin' OR (user_type='lab' AND role='manager'))` ve aktif. Bu, `fn_daily_order_watch` alıcılarıyla aynıdır.
  - Kliniğe gecikme hatırlatması: uygulama içi + yalnız `send-email-notification`, kategori `order_status`. WhatsApp/push çağrılmaz.
  - `action_url` `/order/<id>?tab=prova`.
- **Ekran:**
  - Dört dil aynı anda; `auto.{en,de,fa}.json` eşit.
  - Koyu tema token'larla; rozetler yarı saydam vurgu + açık vurgu metni.
  - Popup `useInkUI().modalOverlay/modalCard`, mobilde de ortada, dar ekranda dolgu 12.
  - Her yeni düğmede GlassTooltip; ikonlar `core/ui/icons`; emoji yok.
  - Hareket kritik sönümlü yay (OrderHistoryModal kalıbı); hareketi azaltma açıksa solma.
- **Doğrulama:**
  - `npx tsc --noEmit --incremental false` → 0.
  - Paket `bash /private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/92fed326-e9be-452e-a41e-d705e960980b/scratchpad/search/suite.sh` yeşil.
- **Commit ve yayın:** Commit yok, ledger tutulur. Yayın yalnız "deploy" ile.
- **KVKK:** Çıktılarda hasta/kişi adı ve tutar yazılmaz.

## Review Focus

1. **Başka bir bekleme açıkken prova gönderilir, sonra o bekleme "Devam ettir" ile kapanır.** Sayaç durmaya devam eder (prova beklemesi o an açılır). Toplam kayma, ilk duruştan son dönüşe kadarki takvim gününü aşmaz. Test: T2 probu "D: diğer bekleme".
2. **İki prova aynı anda klinikte.** Biri dönünce bekleme sürer; ikincisi dönünce tek kayma olur. Test: T2 probu "C: iki prova".
3. **Kurye `prova_donus` bacağı, klinikte prova yokken teslim edilir (BanaBiKurye dahil).** Teslim güncellemesi bozulmaz, prova değişmez. Test: T2 probu "E: kurye".
4. **Başka kliniğin hekimi, teknisyen ya da kurye RPC'leri çağırır.** 42501 döner. Hekimin planlama sonrası randevu değişikliği öneri olur; planlama öncesi doğrudan geçer. Test: T3 probu "rol".
5. **Geri al:** Başka kullanıcı ya da süre aşımında reddedilir. Geri alma teslim tarihini ve beklemeyi birebir eski hâline getirir. Kurye işaretinin geri alması yoktur. Test: T2 probu "F: geri al".

---

### Task 1: Şema — `provas` genişletme + `order_appointments` + yardımcılar (SQL)

**Files:**
- Create: `supabase/migrations/20261027160000_prova_sema.sql` + `supabase/rollbacks/20261027160000_prova_sema.{down.sql,before.txt}`
- Probe: `scratchpad/prova/t1_probe.sql`

**Interfaces — Produces:**
- **`provas` değişiklikleri:**
  - `provas_status_check` → `('planlandı','gönderildi','onay_bekliyor','döndü','tamamlandı')`.
  - `sent_date` NULL olabilir.
  - Yeni sütunlar: `client_returned_at timestamptz`, `client_returned_by uuid references profiles(id) on delete set null`, `late_notified_at timestamptz`, `last_action jsonb`.
- **`order_appointments` tablosu:**
  - Sütunlar:
    - `id uuid pk default gen_random_uuid()`
    - `lab_id uuid not null references labs(id)`
    - `work_order_id uuid not null references work_orders(id) on delete cascade`
    - `kind text not null check (kind in ('prova','takma'))`
    - `appt_date date`, `appt_time time`
    - `pending_action text check (pending_action in ('ekle','degistir','sil'))`, `pending_date date`, `pending_time time`
    - `pending_by uuid references profiles(id) on delete set null`, `pending_at timestamptz`
    - `review_note text`, `reviewed_at timestamptz`, `removed_at timestamptz`
    - `risk_notified_level text`
    - `created_by uuid references profiles(id) on delete set null`
    - `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
  - `check (appt_date is not null or pending_action = 'ekle')`.
  - İndeks `(work_order_id) where removed_at is null`.
  - RLS: SELECT `can_read_work_order(work_order_id)`; `revoke insert, update, delete on order_appointments from authenticated, anon`.
- **`_prova_can_manage(p_order uuid) returns boolean`:** STABLE DEFINER, Global Constraints'teki kural.
- **`_prova_return_by(p_prova uuid) returns date`:** STABLE DEFINER.
- **`_prova_notify_lab(p_order uuid, p_title text, p_body text) returns int`:** DEFINER, uygulama içi, yalnız `_notify_inapp`. Gönderilen sayıyı döner.
- **`_order_client_recipients(p_order uuid) returns setof uuid`:** Hekim profili (`profiles.id = wo.doctor_id`, ya da `doctors.id = wo.doctor_id` olan hekim profili, `_doctor_profile_owns_doctor` kuralıyla) + `_resolve_wo_clinic_id` kliniğinin `clinic_admin` / `clinic_secretary` kullanıcıları; aktif olanlar. `trg_work_order_notify_status`'taki seçimle aynı kapsam.
- Hepsi `revoke all … from public, anon, authenticated`. `_prova_can_manage` ve `_prova_return_by` istemci okumaları için RPC'lerin içinden çağrılır.

- [ ] **Step 1:** Canlı `provas` tanımı, kısıtlar, politikalar ve `order_appointments` yokluğu `.before.txt`'ye yazılır. `.down.sql` yazılır: tabloyu ve fonksiyonları düşürür, sütunları kaldırır, kısıtı eski listeye, `sent_date`'i NOT NULL'a döndürür. `provas` canlıda 0 satır olduğu için güvenlidir; ÖNCE ölçümünde 0 doğrulanır.
- [ ] **Step 2: Probe yaz** (`t1_probe.sql`, `gen_probe.py`):
  - `provas` satır sayısı.
  - `status='planlandı'` ve `sent_date null` ile ekleme hata vermez (SONRA) / verir (ÖNCE).
  - Sahip kimliğiyle `order_appointments` doğrudan INSERT → 42501.
  - Sahip ve klinik yöneticisi için `_prova_can_manage` = t/f; teknisyen = f.
  - Randevusuz provada `_prova_return_by` = `sent_date+2`; gönderimden sonraki onaylı prova randevusunda = randevu günü.
  - `_order_client_recipients` sayısı ≥ 1 (deneme siparişinde).
- [ ] **Step 3: Probe çalıştır.** Beklenen:
  - ÖNCE: kısıt ve tablo yok.
  - SONRA: tüm kontroller yukarıdaki gibi.
  - GERİ ALMA = ÖNCE.
- [ ] **Step 4: Kullanıcı onayı** (AskUserQuestion: ne değişiyor, neyi etkilemez, geri alma).
- [ ] **Step 5:** Uygula, canlıda ölç (kısıt, tablo, RLS açık, `authenticated` yazma yok). Ledger satırı yazılır.

### Task 2: Prova motoru — işaretler, bekleme senkronu, geri al, kurye tetikleyicisi (SQL)

**Files:**
- Create: `supabase/migrations/20261027161000_prova_motor.sql` + down/before
- Probe: `scratchpad/prova/t2_probe.sql`

**Interfaces:**
- **Consumes (Task 1):** `_prova_can_manage`, `_prova_return_by`, `_prova_notify_lab`.
- **Produces — iç fonksiyon (istemciye kapalı):**
  - **`_prova_hold_sync(p_order uuid, p_day date) returns int`:** Döndürdüğü değer uzatılan gün sayısıdır.
    - **Klinikte prova var** (`status in ('gönderildi','onay_bekliyor')`) ve `hold_status is null` ise bekleme açar. Kategori `client_prova`, responsible `client`.
      - `hold_started_at`: `p_day` bugünse `now()`, değilse `(p_day + 12:00)` lab saatiyle.
      - `work_order_holds` satırı eklenir; `held_by = auth.uid()` (NULL olabilir).
    - **Klinikte prova yok** ve `hold_category='client_prova'` ise kapatır.
      - `days = greatest(0, p_day − (hold_started_at at time zone tz)::date)`; `delivery_date += days`.
      - `hold_*` alanları temizlenir.
      - Holds satırı `ended_at` (aynı gün kuralı), `extended_days=days`, `resumed_by=auth.uid()` ile kapanır.
    - **Diğer kategoride açık bekleme** varsa hiçbir şey yapmaz.
- **Produces — RPC'ler** (`grant execute … to authenticated`; hepsi DEFINER, `search_path=public`):
  - **`prova_create(p_order uuid, p_item_id uuid default null, p_item_name text default null, p_type text default null) returns uuid`:** Yalnız lab yönetimi. Durum `planlandı`, `prova_number = max+1`. Teslim edilmiş ya da iptal edilmiş siparişte hata verir.
  - **`prova_mark_sent(p_prova uuid, p_day date default null) returns void`:** Yalnız lab yönetimi. `planlandı` → `gönderildi`, `sent_date = coalesce(p_day, bugün)` (≤ bugün olmalı). `last_action` yazılır, `_prova_hold_sync` çağrılır.
  - **`prova_mark_returned(p_prova uuid, p_day date default null, p_note text default null) returns void`:** Yalnız lab yönetimi. `gönderildi` ya da `onay_bekliyor` → `döndü`, `return_date` (`sent_date` ≤ gün ≤ bugün). `p_note` doluysa `doctor_notes` olur. `last_action` yazılır, `_prova_hold_sync` çağrılır. Uzama > 0 ise T3'ün `_order_appt_risk`'i yeniden değerlendirilir; risk `yetismiyor`'a düştüyse T4 hazır olunca lab'a bildirim gider (bkz. T4 Step 3).
  - **`prova_client_returned(p_prova uuid) returns void`:** Yalnız `_client_owns_order`. `gönderildi` → `onay_bekliyor`, `client_returned_at/by` yazılır. `_prova_notify_lab(order, 'Prova geri gönderildi', '#NO · lab onayı bekliyor')` çağrılır. Sayaç durmaya devam eder.
  - **`prova_undo(p_prova uuid) returns void`:** Yalnız lab yönetimi.
    - `last_action->>'by' = auth.uid()`, `last_action->>'at'` 10 dakikadan yeni ve `source='manual'` olmalı.
    - `last_action.prev` içindeki prova alanları, `work_orders.delivery_date` + `hold_*` ve holds satırı (açtıysa sil, kapattıysa yeniden aç) birebir geri yüklenir. Sonra `last_action = null`.
  - **`prova_set_note(p_prova uuid, p_note text) returns void`:** Yalnız lab yönetimi. `doctor_notes = nullif(trim(p_note), '')`. Dönmüş provaya "+ Hekim notu" için.
  - **`last_action` biçimi:** `{at, by, source:'manual'|'courier', kind:'sent'|'returned', prev:{status, sent_date, return_date, doctor_notes}, order:{delivery_date, hold_status, hold_reason, hold_category, hold_responsible, hold_started_at, hold_by}, hold_row:{id, action:'opened'|'closed'|null}}`.
  - **`resume_order` değişikliği:** Başa `if hold_category = 'client_prova' then raise exception 'Prova beklemesi prova akışıyla kapanır' using errcode='P0001'`. Gövdenin geri kalanı canlı tanımdan birebir kalır.
  - **Tetikleyici `trg_work_orders_prova_reopen`:** `AFTER UPDATE OF hold_status ON work_orders`. Koşul: `OLD.hold_status='on_hold' AND NEW.hold_status IS NULL AND OLD.hold_category IS DISTINCT FROM 'client_prova' AND NEW.status NOT IN ('teslim_edildi','iptal')`. Klinikte prova varsa `_prova_hold_sync(NEW.id, bugün)` çağrılır. Bu bekleme `now()` ile başlar.
  - **Tetikleyici `trg_deliveries_prova_auto`:** `AFTER UPDATE OF status ON deliveries`. Koşul: `NEW.status='teslim_edildi' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.purpose IN ('prova_gidis','prova_donus')`. Gövde `BEGIN … EXCEPTION WHEN OTHERS THEN NULL`; işaret günü `(coalesce(delivered_at, now()) at time zone tz)::date`, `source='courier'`.
    - **gidis:** En küçük numaralı `planlandı` prova işaretlenir; yoksa önce otomatik `planlandı` prova oluşturulur.
    - **donus:** En erken gönderilen `gönderildi`/`onay_bekliyor` prova işaretlenir; yoksa no-op.

- [ ] **Step 1:** Canlı `resume_order`, `work_orders` ve `deliveries` tetikleyici listesi `.before.txt`'ye; `.down.sql` yazılır.
- [ ] **Step 2: Probe yaz** (`t2_probe.sql`). Deneme siparişi: aynı lab'da açık, beklemesiz, teslim tarihi bilinen bir sipariş seçilir. Senaryolar sahip kimliğiyle (`request.jwt.claims` + `set local role authenticated`):
  - **A: tek prova.** `prova_create` → `prova_mark_sent(p_day = bugün−3)`. Beklenen:
    - `hold_category = 'client_prova'`, başlangıç günü `bugün−3`.
    - `resume_order` → P0001.
    - `prova_mark_returned(p_day = bugün)` → `delivery_date` = eski + 3, hold temiz, holds satırı `extended_days = 3`.
  - **B: geçmiş tarih kuralları.** `prova_mark_sent(p_day = bugün+1)` → hata. Dönüş günü < gönderim günü → hata.
  - **C: iki prova.** İki prova gönderilir. Biri döner → bekleme açık. İkincisi döner → tek kayma, holds satırı 1 adet.
  - **D: diğer bekleme.** `hold_order(..., 'client_missing_file')` → prova gönderilir → kategori hâlâ `client_missing_file`. `resume_order` → kategori `client_prova` (tetikleyici yeniden açtı). Prova döner → toplam kayma ≤ takvim günü + 1.
  - **E: kurye.**
    - `prova_gidis` teslimatı oluşturulur, `teslim_edildi`'ye çekilir → prova `gönderildi`, `last_action.source='courier'`.
    - `prova_donus` teslim → `döndü`.
    - Klinikte prova yokken `prova_donus` teslimi → teslimat güncellenir, prova değişmez.
  - **F: geri al.**
    - `prova_mark_returned` → `prova_undo` → `delivery_date` ve hold birebir eski.
    - Başka kullanıcı (müdür kimliği) undo → hata.
    - Kurye işaretinde undo → hata.
  - **G: rol.**
    - Teknisyen `prova_mark_sent` → 42501.
    - Klinik yöneticisi `prova_mark_sent` → 42501.
    - Klinik yöneticisi `prova_client_returned` → `onay_bekliyor` + lab'a 1+ uygulama içi bildirim satırı (`net.http_request_queue`'ya satır eklenmez).
- [ ] **Step 3: Çalıştır.** ÖNCE: fonksiyonlar yok (her senaryo "yok" yazar). SONRA: yukarıdaki beklenenler. GERİ ALMA = ÖNCE.
- [ ] **Step 4:** Kullanıcı onayı.
- [ ] **Step 5:** Uygula, canlıda ölç (fonksiyon var, `authenticated` iç fonksiyonu çalıştıramaz, tetikleyiciler kurulu, sahte veri bırakılmadı). Ledger satırı yazılır.

### Task 3: Randevular + okuma RPC'leri + risk (SQL)

**Files:**
- Create: `supabase/migrations/20261027162000_prova_randevu.sql` + down/before
- Probe: `scratchpad/prova/t3_probe.sql`

**Interfaces:**
- **Consumes:** T1 tablosu ve yardımcıları, T2 durumları.
- **Produces:**
  - **`_order_appt_risk(p_order uuid) returns table(level text, takma_date date, effective_delivery date, projected boolean)`:** STABLE DEFINER, Global Constraints'teki risk kuralı. `projected` = prova beklemesi açık.
  - **`appt_save(p_order uuid, p_appt uuid, p_kind text, p_date date, p_time time) returns uuid`:** `p_appt` NULL ise yeni randevu. `p_date ≥ bugün` olmalı (yeni ya da değişen tarih).
    - Lab yönetimi ya da planlama öncesi sahip hekim/klinik → doğrudan yazar, bekleyen öneriyi siler.
    - Planlama sonrası sahip hekim/klinik → `pending_action` 'ekle' / 'degistir' + `pending_*`, `review_note=null`. Lab'a uygulama içi "Randevu önerisi" bildirimi gider.
    - Diğerleri → 42501.
  - **`appt_remove(p_appt uuid) returns void`:** Aynı kural. Doğrudan → `removed_at=now()`; öneri → `pending_action='sil'`.
  - **`appt_review(p_appt uuid, p_approve boolean, p_note text default null) returns void`:** Yalnız lab yönetimi.
    - Onay: `ekle`/`degistir` → `appt_date/time = pending`; `sil` → `removed_at`. Pending temizlenir, `reviewed_at` yazılır.
    - Red: pending temizlenir, `review_note = p_note`, `reviewed_at` yazılır. Hiç onaylanmamış bir `ekle` reddedilince satır `removed_at` alır.
    - Öneriyi yapana uygulama içi "Randevu önerisi onaylandı/reddedildi" bildirimi gider.
  - Her yazım `siman.trusted_log` ile `log_activity` yazar: `entity_type='work_order'`, `entity_id=order`, action ∈ {`Randevu ekledi`, `Randevu değiştirdi`, `Randevu sildi`, `Randevu önerdi`, `Randevu önerisini onayladı`, `Randevu önerisini reddetti`}, `metadata = {kind, date, time, old_date}`.
  - **`order_prova_snapshot(p_order uuid) returns jsonb`:** STABLE DEFINER, `can_read_work_order` yoksa 42501. Şekil:
    ```
    { viewer:'lab'|'client', can_manage, can_propose, today, delivery_date,
      risk:{level, takma_date, effective_delivery, projected}|null,
      provas:[{id, number, type, item_name, status, sent_date, return_date, return_by, late_days,
               days_at_clinic, client_returned_at, doctor_notes, lab_notes?, can_undo}],
      appointments:[{id, kind, appt_date, appt_time, pending_action, pending_date, pending_time,
                     pending_by_name, review_note, reviewed_at}],
      counter_paused? }
    ```
    `lab_notes` ve `counter_paused` yalnız `viewer='lab'` için döner. `can_undo` T2 undo kuralıyla aynıdır. Kaldırılan randevular dönmez; reddedilmiş son not 7 gün görünür.
  - **`order_prova_flags() returns table(work_order_id uuid, prova_state text, prova_days int, prova_late_days int, risk_level text, effective_delivery date)`:** STABLE DEFINER.
    - Lab kullanıcısı: kendi lab'ının açık siparişleri.
    - Hekim/klinik: `_client_owns_order` siparişleri.
    - Yalnız klinikte provası ya da takma randevusu olan siparişler döner. `prova_state` ∈ {`klinikte`, `onay_bekliyor`, NULL}.

- [ ] **Step 1:** `.before.txt` (yeni nesnelerin yokluğu) ve `.down.sql` yazılır.
- [ ] **Step 2: Probe yaz:**
  - **rol:**
    - Sahip `appt_save` → `appt_date` dolu, pending boş.
    - Planlama başlamış siparişte sahip hekim/klinik `appt_save` → `pending_action='degistir'`, `appt_date` eski, lab'a 1+ bildirim.
    - Planlama öncesi siparişte → doğrudan.
    - Başka klinik / teknisyen → 42501.
  - **review:** Onay → tarih yeni. Red + not → tarih eski, `review_note` dolu.
  - **risk:**
    - takma = teslim günü → `yetismiyor`.
    - takma = bugün+2, teslim < takma → `yaklasiyor`.
    - takma = teslim+5 ve bugün+10 → `yetisir`.
    - Prova klinikte (A senaryosu gibi) → `projected=true` ve `effective_delivery = teslim + max(...)`.
  - **snapshot:** Klinik yöneticisinde `lab_notes` ve `counter_paused` anahtarları yok; sahipte var.
  - **flags:** Deneme siparişi listede, `prova_state='klinikte'`, `prova_days` doğru.
- [ ] **Step 3:** Çalıştır. Beklenen: ÖNCE yok; SONRA yukarıdaki gibi; GERİ ALMA = ÖNCE.
- [ ] **Step 4:** Kullanıcı onayı.
- [ ] **Step 5:** Uygula, ölç, ledger.

### Task 4: Günlük tarama, sabah özeti istisnası, Geçmiş eklemeleri (SQL)

**Files:**
- Create: `supabase/migrations/20261027163000_prova_bildirim.sql` + down/before
- Modify (SQL, canlı tanımdan): `fn_daily_order_watch`, `order_history`, `prova_mark_returned` (risk bildirimi)
- Probe: `scratchpad/prova/t4_probe.sql`

**Interfaces:**
- **Consumes:** T1–T3.
- **Produces:**
  - **`_prova_watch_collect(p_lab uuid default null) returns table(kind text, lab_id uuid, work_order_id uuid, ref_id uuid, level text, late_days int)`:** Saf okuma, gönderim yok.
    - `kind='prova_late'`: Klinikteki, `bugün > return_by` ve `late_notified_at is null` olan provalar.
    - `kind='appt_risk'`: Açık siparişin onaylı gelecek takma randevusunda `level in ('yaklasiyor','yetismiyor')` ve `level` ≠ `risk_notified_level`. Yükselme sayılır: `yaklasiyor` → `yetismiyor` yeniden bildirilir; tersi bildirilmez.
  - **`fn_prova_watch() returns int`:** DEFINER. Collect sonucunu gönderir:
    - `prova_late`: lab'a uygulama içi "Prova N gün gecikti"; kliniğe (`_order_client_recipients`) uygulama içi + `send-email-notification` (kategori `order_status`) ile "Provanın dönmesi gecikti". Sonra `late_notified_at = now()`.
    - `appt_risk`: lab'a uygulama içi "Randevuya yetişmiyor" / "Randevu yaklaşıyor". Sonra `risk_notified_level = level`.
    - Gönderim sayısını döner.
  - **Cron:** `select cron.schedule('prova-watch', '10 8 * * *', 'select public.fn_prova_watch()')`.
  - **`prova_mark_returned` eki:** Uzamadan sonra `_order_appt_risk` `yetismiyor` ve `risk_notified_level` farklıysa lab'a uygulama içi bildirim gider ve seviye yazılır.
  - **`fn_daily_order_watch`:** Bekleme sayımı ve listesi `wo.hold_status='on_hold' AND wo.hold_category IS DISTINCT FROM 'client_prova'` olur. Canlı tanımın geri kalanı birebir korunur. Geciken sayımında prova beklemesi zaten hariç.
  - **`order_history` ekleri** (canlı tanım temel alınır):
    - `prova_client_returned` (`provas.client_returned_at`, kategori `teslim`, `detail {number, item}`).
    - `appointment` (tlogs `entity_type='work_order'` ve action `Randevu…` ile başlayan; `detail {action, kind, date, time, old_date}`, kategori `teslim`). Hekim/klinik de görür.

- [ ] **Step 1:** Canlı `fn_daily_order_watch`, `order_history`, `prova_mark_returned` tanımları `.before.txt`'ye; `.down.sql` = bu tanımlar + yeni nesnelerin düşürülmesi + `cron.unschedule('prova-watch')`.
- [ ] **Step 2: Probe yaz** (`fn_prova_watch` ve `fn_daily_order_watch` ÇAĞRILMAZ):
  - Geri tarihli gönderilmiş prova (bugün−5, randevusuz) → collect'te 1 `prova_late`, `late_days=3`.
  - `late_notified_at` yazılınca → 0.
  - Takma = teslim günü → collect'te `appt_risk` `yetismiyor`.
  - `risk_notified_level='yetismiyor'` → 0.
  - `yaklasiyor` → `yetismiyor` yükselişi → 1.
  - `fn_daily_order_watch` tanımı `client_prova` hariç tutuyor mu: `pg_get_functiondef` içinde metin araması.
  - Prova beklemesi açık deneme siparişi ile özet alt sorgusunun SELECT kopyası → sipariş dahil değil.
  - `order_history`: Klinik yöneticisi kimliğiyle `appointment` ve `prova_client_returned` satırları geliyor.
- [ ] **Step 3:** Çalıştır. ÖNCE / SONRA / GERİ ALMA beklenenleri yukarıdaki gibi.
- [ ] **Step 4:** Kullanıcı onayı (cron ekleniyor; kliniğe e-posta günde en çok bir kez, prova başına bir kez).
- [ ] **Step 5:** Uygula; `cron.job`'da `prova-watch`; ölç; ledger.

### Task 5: İstemci modeli + RPC sarmalayıcıları (TS, test)

**Files:**
- Create: `modules/orders/prova/provaModel.ts`, `modules/orders/prova/provaModel.test.mts`, `modules/orders/prova/api.ts`

**Interfaces — Produces:**
- **`provaModel.ts` tipleri:** `ProvaSnapshot`, `ProvaRow`, `ApptRow`, `RiskLevel = 'yetismiyor'|'yaklasiyor'|'yetisir'`, `ProvaFlag` (T3 şekilleriyle birebir, camelCase değil — RPC alan adları).
- **`activeProva(s: ProvaSnapshot): ProvaRow | null`:** En erken gönderilen `gönderildi`/`onay_bekliyor`; yoksa en küçük numaralı `planlandı`; yoksa null.
- **`nowCard(s: ProvaSnapshot): NowCard`:**
  - Şekil: `{ tone: 'plan'|'clinic'|'late'|'pending'|'done'|'empty', eyebrow: string, big: string, days: string, fill: [number, number, number], steps: [string, string, string], lines: { icon: 'cal'|'pause'|'bell'|'play'|'shift', text: string }[], primary: { label: string, action: 'send'|'return'|'clientReturned'|'confirm'|'note'|'createSend' } | null, secondary: { label: string, purpose: 'prova_gidis'|'prova_donus' } | null }`.
  - Metinler `autoT` ile çevrilir.
  - Lab görünümü: `pause` satırı ("Teslim sayacı duruyor · iş klinikte bekliyor") ve kurye düğmesi yalnız `viewer='lab'`.
  - Hekim görünümü: Klinikte/Gecikti'de `primary.action='clientReturned'` ("Provayı geri gönderdim"); `onay_bekliyor`'da primary yok, satır "Lab onayı bekliyor".
- **`flagFromSnapshot(s: ProvaSnapshot | null): ProvaFlag | null`:** Sipariş detayı hero'su liste RPC'si yerine snapshot'tan beslenir. Dönüş: aktif provanın durumu, gün sayısı, gecikmesi ve risk seviyesi; son prova dönmüşse `prova_state='döndü'`.
- **`heroLabel(flag: ProvaFlag | null): { text: string; dot: 'none'|'amber'|'red'|'green' }`:**
  - Örnekler: "Prova", "Prova · Klinikte 2. gün", "Prova · 1 gün gecikti", "Prova · Lab onayı bekliyor", "Prova · Döndü".
  - Risk `yetismiyor` ise nokta kırmızı.
- **`riskChip(r): { label: string; tone: 'ok'|'warn'|'bad' } | null`:** "Yetişir", "Randevu yaklaşıyor", "Randevuya yetişmiyor"; `projected` ise sonuna " · tahmini <gün ay>".
- **`listBadge(f: ProvaFlag): { label: string; tone: 'warn'|'bad' } | null`:** "Provada · 2. gün" / "Prova 1 gün gecikti" / "Randevuya yetişmiyor" / "Randevu yaklaşıyor". Öncelik: prova gecikmesi > risk > provada.
- **`apptLine(a: ApptRow): { title: string; when: string; pending: string | null }`:** "Prova" / "Takma"; "Cum 30 Eki · 14:30"; "önerilen Pzt 16 Kas · onay bekliyor".
- **`takmaBeforeDelivery(deliveryISO: string | null, appts: { kind: string; date: string }[]): boolean`:** Sihirbaz uyarısı.
- **`api.ts`:**
  - `fetchProvaSnapshot(orderId)`, `fetchProvaFlags()`.
  - `provaCreate`, `provaMarkSent(id, day?)`, `provaMarkReturned(id, day?, note?)`, `provaClientReturned(id)`, `provaUndo(id)`, `provaSetNote(id, note)`.
  - `apptSave(orderId, apptId | null, kind, date, time | null)`, `apptRemove(id)`, `apptReview(id, approve, note?)`.
  - Hepsi `{ ok: boolean; error?: string; data? }` döner.

- [ ] **Step 1: Failing testleri yaz** (`provaModel.test.mts`). Her test spec örnek değerleriyle; bugün `2026-10-29` sabit verilir:
  - **`activeProva önce kliniktekini seçer`:** İki satır (döndü + gönderildi) → gönderildi.
  - **`nowCard klinikte lab`:**
    - Girdi: sent 27 Eki, return_by 30 Eki.
    - Beklenen: tone `clinic`; big "Klinikte"; days "2. gün"; `lines[0].text` "Dönüş için son gün" ile başlar; `lines` içinde `pause` var; `primary.action` `return`; secondary purpose `prova_donus`.
  - **`nowCard gecikti`:** Bugün 31 Eki, late_days 1 → tone `late`, big "1 gün", days "gecikti".
  - **`nowCard hekim`:** Viewer client → `pause` yok, secondary null, primary `clientReturned`.
  - **`nowCard onay_bekliyor`:**
    - Lab: primary `confirm` "Teslim aldım".
    - Client: primary null, lines "Lab onayı bekliyor".
  - **`nowCard boş`:** Prova yok → tone `empty`. Lab primary `createSend`; client primary null.
  - **`heroLabel`:** null → "Prova" / none; klinikte 2 gün → "Prova · Klinikte 2. gün" / amber; late 1 → red.
  - **`flagFromSnapshot`:** Klinikteki prova + risk yetişmiyor → `prova_state` `klinikte`, `risk_level` `yetismiyor`; prova yok, takma yok → null.
  - **`riskChip projected`:** "Randevuya yetişmiyor · tahmini 13 Kas", tone `bad`.
  - **`listBadge öncelik`:** Gecikmiş prova + yetişmiyor → "Prova 1 gün gecikti".
  - **`takmaBeforeDelivery`:** Teslim 2026-11-13, takma 2026-11-13 → true; takma 2026-11-14 → false; takma yok → false.
- [ ] **Step 2:** `node --test modules/orders/prova/provaModel.test.mts` → FAIL (modül yok).
- [ ] **Step 3:** `provaModel.ts` + `api.ts` yazılır.
- [ ] **Step 4:** Test → PASS; tsc 0; paket yeşil.
- [ ] **Step 5:** Ledger.

### Task 6: Prova popup'ı + hero ve mobil giriş + `?tab=prova` (UI)

**Files:**
- Create: `modules/orders/prova/ProvaModal.tsx`, `modules/orders/prova/useProvaSnapshot.ts`
- Modify:
  - `modules/orders/screens/OrderDetailScreenV2.tsx`: state, `stageModals`, hero sol grup PILL_KEYS, ölçüm satırı, `secAvail`, `HIDE_ORDER`, `MENU_DEF`, `?tab=prova` effect.
  - `modules/orders/screens/OrderDetailMobileHandoff.tsx`: `onProva`, `provaDot` prop'ları, üst çubuk ikonu.
  - `core/ui/icons.tsx`: gerekirse ikon eklenir.
- Check script: `scratchpad/prova/ui_check.sh` (grep tabanlı, `ui_check.sh` kalıbı)

**Interfaces:**
- **Consumes:** T5 model + api; T3 snapshot.
- **Produces:**
  - **`ProvaModal`:** `{ visible: boolean; onClose(): void; orderId: string; orderNumber?: string | null; workTitle?: string | null; originRect?: { x: number; y: number; w: number; h: number } | null; onChanged?(): void }`.
  - **`useProvaSnapshot(orderId, enabled)`:** `{ data, loading, error, refetch }`.
- **Davranış (spec 5.2 + prototip):**
  - **Hareket:**
    - Kart `originRect` merkezinden ortaya kritik sönümlü yayla gelir (stiffness 320, damping 36 — OrderHistoryModal); kapanırken aynı yoldan döner, kesilebilir.
    - Yalnız `originRect` yoksa OrderHistoryModal'daki gibi aşağıdan gelir.
    - Hareketi azaltma açıksa solma.
    - Zemin `U.modalOverlay`.
  - **"Şu an" kartı:**
    - `nowCard` çıktısını çizer: ince başlık (Inter Tight 300, `letterSpacing ≈ −0.025×fontSize`), üç parçalı şerit (her parça `Animated.spring` scaleX), ikonlu satırlar, ana + ikincil düğme.
    - Ton zeminleri: klinikte amber, gecikti kırmızı, döndü yeşil, plan mavi. Koyu temada yarı saydam.
  - **İşaret günü:** Ana düğmenin altında "Tarih: bugün" bağlantısı → `core/ui/DatePicker` (en fazla bugün). Seçilen gün `provaMarkSent/Returned`'e geçer.
  - **Geri al:**
    - Başarılı lab işaretinden sonra kartın altında 5 sn cam bildirim: "Döndü olarak işaretlendi · Geri al" (yaylı). Geri al `provaUndo` çağırır.
    - Hata, düğmenin yanında görünür (görünür eylem hatası kuralı).
  - **Döndü'de "+ Hekim notu":** Satır içi metin alanı → `provaSetNote`.
  - **Boş durum ana düğmesi** (`createSend`, "Prova gönder"): `provaCreate` + `provaMarkSent(seçilen gün)` art arda çağrılır.
  - **Kurye düğmeleri:** "Prova kuryesi" / "Dönüş kuryesi" mevcut kurye bacağı oluşturma akışını ilgili `purpose` ile açar. Hangi bileşen olduğunu builder `deliveries purpose` kullanan ekrandan bulur; ruling.
  - **RANDEVULAR:**
    - Satırlar `apptLine` ile; takma satırında `riskChip`.
    - "+ Randevu" ve satıra dokunma küçük bir satır içi düzenleyici açar: tür, tarih, saat, Kaydet/Sil. `apptSave` / `apptRemove` çağrılır.
    - Pending satırda lab için Onayla / Reddet (not alanıyla) → `apptReview`.
    - Hekim için "önerilen · onay bekliyor" ve son red notu.
  - **ÖNCEKİ PROVALAR:** Açılır satırlar (dönmüş provalar). "+ Yeni prova" (lab) → `provaCreate`.
  - **Erişilebilirlik:** Esc / dışarı / ✕ kapatır. Odak açılınca ✕'e, kapanınca tetikleyiciye gider.
- **Hero:**
  - PILL_KEYS'e `'prova'` eklenir (lab/admin + hekim/klinik panelinde, iptal edilmemiş siparişte görünür).
  - `PillBtn` + başta renkli nokta + `heroLabel` metni; GlassTooltip "Prova" / "Provalar ve randevular".
  - `HIDE_ORDER` sonuna `'prova'` eklenir (en son gizlenir).
  - Ölçüm satırına aynı pill eklenir. `MENU_DEF.prova` vardır.
  - `originRect`, pill'in `measureInWindow`'undan alınır.
- **Mobil:** `OrderDetailMobileHandoff` üst çubuğunda Geçmiş'in yanına ikon (nokta rozetli) + GlassTooltip; `onProva` popup'ı açar.
- **`?tab=prova`:** Popup'ı açar (`tab=history` kalıbı). Popup `stageModals` içindedir.

- [ ] **Step 1:** `ui_check.sh` yaz ve çalıştır → FAIL. Kontroller:
  - `stageModals` içinde `<ProvaModal`.
  - `tabParam === 'prova'`.
  - `HIDE_ORDER` son öğe `'prova'`.
  - Ölçüm satırında prova.
  - Handoff'ta `onPress={props.onProva}`.
  - `ProvaModal`'da `U.modalOverlay`, `isReduceMotionEnabled`, `flex-end` yok.
  - Her yeni Pressable'da GlassTooltip.
- [ ] **Step 2:** Bileşen + bağlantılar yazılır.
- [ ] **Step 3:** `ui_check.sh` PASS; tsc 0; paket yeşil.
- [ ] **Step 4: Önizleme (salt okunur hesap: KAYDET/İŞARETLE BASILMAZ):**
  - Masaüstü 1440 / 1040 ve mobil genişlikte pill + popup açılışı, kapanış yolları.
  - Koyu tema.
  - Boş durum (provası olmayan sipariş).
  - Konsol temiz.
  - Ekran görüntüsü.
- [ ] **Step 5:** Ledger.

### Task 7: Ortak yüzeylerde "Provada" (UI, spec 5.6)

**Files:**
- Modify: `modules/orders/holdApi.ts`. Değişiklik: `client_prova` kategorisi `{ key: 'client_prova', label: 'Provada', responsible: 'client', system: true }`; `HOLD_PICKABLE` (system olmayanlar) eklenir.
- Modify: `isProvaHold(o: { hold_status?: string | null; hold_category?: string | null }): boolean` ve `holdBadgeText(o): 'Provada' | 'Duraklatıldı'` eklenir.
- Modify (her biri yalnız prova kategorisi için):
  - `modules/orders/screens/OrdersListScreenV2.tsx` (198, ~1646, ~1907, ~2045)
  - `modules/orders/screens/OrdersKanbanB2Mobile.tsx` (~535)
  - `modules/dashboard/screens/LabDashboardScreen.tsx` (~539)
  - `modules/dashboard/components/RecentOrdersMobile.tsx` (~18)
  - `core/ui/OrderStatusInfo.tsx` (~56)
  - `modules/dashboard/screens/DoctorDashboardScreen.tsx`, `ClinicDashboardScreen.tsx`
  - `modules/orders/components/KanbanBoard.tsx`, `OrdersTable.tsx`
  - `modules/station/...` kanban
  - `modules/tv/api.ts`
  - `modules/denty/tools.ts` (bekleme metni)
  - `OrderDetailScreenV2.tsx`: hold bloğu (~2017) ve "Devam ettir" pill'i prova beklemesinde çizilmez; bekletme modalı `HOLD_PICKABLE` kullanır.
- Test: `modules/orders/holdApi.test.mts` (yoksa oluşturulur)

**Interfaces — Produces:** `isProvaHold`, `holdBadgeText`, `HOLD_PICKABLE` (`modules/orders/holdApi.ts`).

- [ ] **Step 1: Failing test:**
  - `holdBadgeText({hold_status:'on_hold', hold_category:'client_prova'}) === 'Provada'`.
  - `material` → `'Duraklatıldı'`.
  - `HOLD_PICKABLE.some(c => c.key === 'client_prova') === false`.
  - `holdCategoryLabel('client_prova') === 'Provada'`.
- [ ] **Step 2:** Çalıştır → FAIL.
- [ ] **Step 3:** holdApi'ye ekle. `grep -rln "hold_status" modules app core` listesindeki her dosyayı gez. Bekleme metni gösteren her yerde `holdBadgeText`/`isProvaHold` kullanılır; listede gösterilen gün sayısı varsa "Provada · N. gün". Gezilen her dosya ve sonucu ("değişti" / "metin göstermiyor") ledger'a yazılır.
- [ ] **Step 4:** Test PASS; tsc 0; paket yeşil. Önizlemede (varsa prova beklemeli sipariş, yoksa yalnız mevcut beklemeli sipariş) mevcut "Duraklatıldı" görünümünün bit bit aynı kaldığı doğrulanır.
- [ ] **Step 5:** Ledger.

### Task 8: Sihirbazda randevu satırı (UI, spec 5.4)

**Files:**
- Create: `modules/orders/prova/ApptDraftEditor.tsx`
- Modify: `modules/orders/screens/NewOrderScreen.tsx`. Değişiklikler: form state `appointments: DraftAppt[]`; 3. adım "Teslimat" kartında `InlineDateSelect` altı; oluşturma sonrası `apptSave` çağrıları; düzenleme yüklemesi ve kaydı.

**Interfaces:**
- **Consumes:** T5 `takmaBeforeDelivery`, `apptSave`, `apptRemove`, `fetchProvaSnapshot`.
- **Produces:**
  - `DraftAppt = { id?: string; kind: 'prova' | 'takma'; date: string; time: string | null; removed?: boolean }`.
  - `ApptDraftEditor({ value, onChange, deliveryDate, accentColor }: { value: DraftAppt[]; onChange(v: DraftAppt[]): void; deliveryDate: Date | null; accentColor: string })`.
- **Davranış:**
  - **Boş hâl:** Satır "Hastanın randevusu var mı?" + "+ Prova randevusu" / "+ Takma randevusu" bağlantıları (GlassTooltip'li). Boşken başka bir şey çizmez.
  - **Eklenen satır:** tür · tarih (`InlineDateSelect`, en erken bugün) · saat (isteğe bağlı) · ✕.
  - **Uyarı:** `takmaBeforeDelivery` true ise alan altında amber bilgi "Teslim tarihi takma randevusundan sonra". Siparişi engellemez.
  - **Oluşturma:** `createWorkOrder` başarılı olduktan sonra her taslak için `apptSave(order.id, null, …)`. Sipariş planlama öncesi olduğu için doğrudan yazılır. Hata siparişi geri almaz; ekranda "Randevular kaydedilemedi" uyarısı çıkar ve sipariş açılır.
  - **Düzenleme:** Mevcut randevular snapshot'tan yüklenir. Kaydette fark hesaplanır: yeni → `apptSave(null)`, değişen → `apptSave(id)`, silinen → `apptRemove`. Sunucu lab/hekim ve planlama durumuna göre doğrudan ya da öneri yapar. Öneri olduysa kayıt sonrası bildirimde "Randevu değişikliği lab onayına gönderildi" görünür.

- [ ] **Step 1:** `ui_check.sh`'e ekle:
  - `NewOrderScreen` 3. adımında `<ApptDraftEditor`.
  - Oluşturma yolunda `apptSave(`.
  - Düzenleme yolunda fark çağrıları.
  - Editörde GlassTooltip.

  Çalıştır → FAIL.
- [ ] **Step 2:** Yaz.
- [ ] **Step 3:** ui_check PASS; tsc 0; paket yeşil.
- [ ] **Step 4:** Önizleme: Yeni sipariş 3. adımda boş satır, ekle/kaldır, uyarı. Mobil ve koyu tema. Sipariş OLUŞTURULMAZ.
- [ ] **Step 5:** Ledger.

### Task 9: Siparişler filtreleri ve rozetler (UI, spec 5.5)

**Files:**
- Create: `modules/orders/prova/useProvaFlags.ts`. Davranış: `fetchProvaFlags` → `Map<orderId, ProvaFlag>`; odakta sessiz tazeleme; liste yenilenince yeniden çekilir.
- Modify: `modules/orders/screens/OrdersListScreenV2.tsx`. Değişiklikler:
  - `pickChip` ailesine `'prova'` ve `'risk'`; `filtered` koşulu.
  - Masaüstü ve mobil çip şeritleri (~747, ~998 ve başlık bileşenine geçen prop'lar).
  - Satır rozeti (~1539 masaüstü, ~1853 kart).
- Modify: Hekim ve klinik listeleri (`DoctorOrdersMobile.tsx` ve OrdersListScreenV2'nin hekim/klinik dalı): yalnız rozet.
- Modify: `modules/orders/lib/listParams.ts`. `?filter=prova|risk` parse edilir; bildirim ve özet bağlantıları için.

**Interfaces:**
- **Consumes:** T5 `listBadge`, `fetchProvaFlags`; T3 flags.
- **Produces:** `matchesProvaFilter(flag: ProvaFlag | undefined, f: 'prova' | 'risk'): boolean` (`provaModel.ts`'e eklenir, test edilir).
  - `prova`: `prova_state` dolu.
  - `risk`: `risk_level ∈ {yetismiyor, yaklasiyor}`.
- **Davranış:**
  - Çipler yalnız lab ve admin panelinde görünür: "Provada (n)" ve "Randevu riski (n)". Sayılar flags'ten gelir. Mevcut Acil/Geciken çipleriyle birbirini dışlar (`pickChip` kalıbı).
  - Rozet tüm panellerde görünür. Ton: warn amber, bad kırmızı (yarı saydam).
  - Rozete dokununca `router.push('/order/<id>?tab=prova')` (panel-agnostik), satır tıklamasına yayılmaz.

- [ ] **Step 1: Failing test** (`provaModel.test.mts`'e):
  - `matchesProvaFilter({prova_state:'onay_bekliyor'}, 'prova') === true`.
  - `matchesProvaFilter({risk_level:'yetisir'}, 'risk') === false`.
  - `parseOrdersListParams({filter:'prova'})` sonucu prova bayrağını taşır (`listParams` testi varsa oraya).

  Çalıştır → FAIL.
- [ ] **Step 2:** Yaz.
- [ ] **Step 3:** Test PASS; tsc 0; paket yeşil.
- [ ] **Step 4:** Önizleme:
  - Lab listesinde iki çip; sayılar (0 olabilir).
  - Çip seçilince boş durum metni.
  - Hekim panelinde çip yok.
  - Mobil ve koyu tema.
- [ ] **Step 5:** Ledger.

### Task 10: Son temizlik + doğrulama + son inceleme

**Files:**
- Delete: `modules/orders/components/ProvaSection.tsx` (önce `grep -rn "ProvaSection"` → yalnız `components/index.ts` export'u beklenir; export da kaldırılır). `modules/provas/api.ts`, `types.ts` başka yerde kullanılmıyorsa korunur; ruling.
- Modify: `core/i18n/locales/auto.{en,de,fa}.json` (+ `tr/en/de/fa.json` gerekiyorsa)

- [ ] **Step 1:** ProvaSection kaldırılır; tsc 0.
- [ ] **Step 2: Çeviri taraması:** T5–T9'da eklenen tüm düz Türkçe metinler ve `autoT` anahtarları üç sözlüğe eklenir; anahtar sayıları eşit. Farsça için persian-writing kuralları (kısa, resmi-nötr arayüz dili, ZWNJ). Kontrol komutu: üç dosyanın anahtar kümesi farkı boş.
- [ ] **Step 3: Tam doğrulama:**
  - tsc 0.
  - Paket yeşil.
  - Tüm `ui_check` betikleri PASS.
  - Canlıda T1–T4 ölçümleri tekrar (fonksiyon var, cron var, ayrışık veri yok).
- [ ] **Step 4: Son inceleme:** `review-package` ile tüm değişiklik; en yetenekli modelde code-reviewer. Plan + spec + Review Focus + ledger Ruling satırları verilir. Critical/Important tek düzeltme turunda (her biri RED→GREEN), Minor ledger'a.
- [ ] **Step 5:** Ledger kapanışı; hafıza (`project_lab_manager_audit`, yeni `project_prova_tracking`), yol haritası 2. dalga 4 işareti. Deploy YOK (kullanıcı "deploy" demedikçe).
