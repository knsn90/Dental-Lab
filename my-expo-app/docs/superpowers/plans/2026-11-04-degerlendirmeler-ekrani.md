# Değerlendirmeler ekranı ve düşük puan takibi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Düşük puan kaydedildiği anda lab yöneticilerine uygulama içi + push + WhatsApp ile ulaşsın. Yönetici "Arandı" işaretleyip not düşebilsin. 48 saat aranmayan iş için bir kez hatırlatma gitsin. Sağlık Kurumları'nda yalnız yöneticilerin gördüğü "Değerlendirmeler" sekmesi ayın ortalamasını, klinik başına 6 aylık seyri ve düşük puanları göstersin.

**Architecture:**
- İş başına tek takip satırı (`review_followups`) puan durumunu, uyarı/dönem zamanlarını ve arama kaydını tutar. Okuma yalnız aynı lab'ın yöneticisine açıktır; yazma yalnız SECURITY DEFINER fonksiyonlarla olur.
- `order_reviews` üzerindeki AFTER tetikleyici ve `review_wa_record_answer` aynı idempotent değerlendiriciyi (`_review_low_evaluate`) çağırır. Uyarıya o karar verir. Eski `_review_alert_lab` çağrısı kalkar, böylece bir olay için tek uyarı gider.
- Ekran tek RPC'den (`get_review_dashboard`) beslenir. Sıralama, fark, çizgi noktaları ve etiketler saf TS modülünde (`dashboardRules.ts`) hesaplanır. Arama kaydı `review_followup_set_call` RPC'siyle yazılır. Saatlik cron hatırlatmayı gönderir.

**Tech Stack:** Supabase (Postgres, RLS, SECURITY DEFINER RPC, pg_cron, pg_net), Deno edge function (`send-whatsapp-meta`), Expo + React Native + react-native-web + react-native-svg, `node --test` (`.test.mts` / `.test.ts`), i18n (tr/en/de/fa).

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-04-degerlendirmeler-ekrani-design.md`. Kullanıcı onayı: "onaylıyorum, planı yaz".

Tüm yollar `my-expo-app/` köküne görelidir.

## Global Constraints

### Kurallar ve değerler

- **Düşük:** etkin en düşük puan ≤ 3. Etkin en düşük = `least(overall, fit, occlusion, contacts, esthetics, surface, on_time)` (boşlar sayılmaz) ve, `review_requests.answer IN (1,3)` ise, o cevap. Sabit adı `REVIEW_LOW_MAX = 3`.
- **WhatsApp düğmeleri:** 5 = `Sorunsuz`, 3 = `Küçük düzeltme`, 1 = `Sorun var`.
- **Kısa puan etiketleri** (rozet, bildirim gövdesi, WhatsApp `puanlar`; SQL ve TS'de birebir aynı): `overall` Genel · `fit` Uyum · `occlusion` Oklüzyon · `contacts` Kontakt · `esthetics` Estetik · `surface` Yüzey · `on_time` Zamanında teslim. Değerlendirme uygulamadan verilmişse (`source='app'`) ve WhatsApp cevabı 1/3 ise ek rozet `WhatsApp <puan>`. Rozet sırası yukarıdaki sıradır, WhatsApp en sonda. Biçim `Genel 3, Uyum 2`.
- **Uyarı ne zaman gider:** etkin en düşük ≤ 3 ve (`alert_min` boş ya da etkin en düşük < `alert_min`). İyileşme uyarı göndermez.
- **"Aranmadı" (açık):** `cur_min ≤ 3 AND (called_at IS NULL OR called_at < period_started_at)`. **"Önceki arama":** açık ve `called_at` dolu.
- **Dönem:** uyarı giderken iş açık değilse `period_started_at = now()`, `reminder_sent_at = NULL`. Açıksa dönem değişmez. Etkin en düşük 3'ün üstüne çıkarsa `alert_min = NULL` (arama kaydı silinmez).
- **Hatırlatma:** açık, `period_started_at ≤ now() - 48 saat`, bu dönemde hatırlatma gitmemiş (`reminder_sent_at IS NULL OR reminder_sent_at < period_started_at`). Yalnız Türkiye saatiyle 09:00–19:59 arasında gönderilir (gece WhatsApp gitmesin; plan kararı, kullanıcıya bildirilir). Cron `37 * * * *`.
- **Kategoriler** (müşteri kategorileri `new_order/delivery/approval/payment/account` DIŞINDA):
  - `review_low`: uygulama içi + push + web push (`_notify_inapp_push`), WhatsApp `dusuk_puan_lab`. E-posta yok.
  - `review_problem`: yalnız WhatsApp cevabı **1** uyarıyı tetiklediğinde. `_notify_channels` (zil + e-posta + push + web push + Twilio) + WhatsApp `is_sorunu_lab`. Başlık bugünkü gibi `Hekim sorun bildirdi`.
  - `review_low_reminder`: `_notify_inapp_push` + WhatsApp `dusuk_puan_hatirlatma`.
  - `review_minor` artık yazılmaz; tip, varsayılan ve ikon eski bildirimler için kalır.
- **Alıcılar** (lab yöneticisi kümesi, puan isteğiyle aynı): `profiles.lab_id = <iş lab'ı> AND coalesce(is_active,true) AND (user_type='admin' OR (user_type='lab' AND role='manager'))`. İstemcide aynı küme: `user_type==='admin' || (user_type==='lab' && role==='manager')`.
- **Bildirim hedefi:** `resource_type='review_followup'`, `resource_id=<work_order_id>`, `action_url` alıcıya göre: admin → `/(admin)/clinics?tab=reviews&focus=<wo>`, diğer → `/(lab)/clinics?tab=reviews&focus=<wo>` (öncül: `20261017193000` onay bildirimleri aynı kalıbı kullanıyor).
- **Bildirim içeriği:** hasta adı ve hekim yorumu YOK. Payload anahtarları: `orderNumber`, `clinic`, `doctor`, `workType`, `scores` (kısa etiketli metin). Klinik yoksa `clinic` = hekimin adı.
- **Ay:** `date_trunc('month', order_reviews.created_at AT TIME ZONE 'Europe/Istanbul')`. Gelecek ay reddedilir. Ortalama = `overall` ortalaması, bir ondalık.
- **Klinik anahtarı:** hekimin kliniği varsa `c:<clinic_id>` (ad `clinics.name`), yoksa `d:<doctor_id>` (ad `doctors.full_name`).
- **Puan alma oranı:** seçili ayda teslim edilmiş (`status='teslim_edildi'`, `delivered_at` TR ayında) ve `delivered_at + 14 gün ≤ now()` işler payda; `order_reviews.created_at < delivered_at + 14 gün` olanlar pay. Payda 0 → `null` ("—").
- **Arama notu:** en fazla 1000 karakter; boş not `NULL` kaydedilir.
- **Metinler:** birebir Görev 1'de onaylanan metinler.

### Veritabanı

- **Beş adım** (her DB görevi):
  1. Canlı tanım + yetkiler `supabase/rollbacks/<ad>.before.txt`'ye.
  2. `supabase/rollbacks/<ad>.down.sql`.
  3. Rol rol deneme, `RAISE EXCEPTION 'PROBE …'` ile biter (deneme dosyası oturumun scratchpad klasöründe; repoya girmez, önceki DB işleriyle aynı).
  4. Kullanıcıdan AskUserQuestion ile açık "Onaylıyorum, uygula".
  5. `cd my-expo-app && supabase db query --linked -f <mutlak yol>` ile uygula, hemen canlıda ölç.
- **Denemelerde gönderici ÇAĞRILMAZ:** `_notify_channels`, `_notify_inapp_push`, `_review_dispatch`, `fn_review_request_tick`, `fn_review_low_reminder_tick`, `fn_daily_order_watch`, `fn_prova_watch`, `fn_scan_schedule_digest`, `_prova_notify_lab`, e-posta göndericileri. Gönderen yolu sınanırken `_notify_channels` ve `_notify_inapp_push` aynı işlem içinde `CREATE OR REPLACE` ile yalnız bir sayaç tablosuna (`CREATE TEMP TABLE _sent(...)`) satır yazıp `gen_random_uuid()` dönen taslağa çevrilir. `trg_whatsapp_meta_notify` deneme işleminde `ALTER TABLE notifications DISABLE TRIGGER` ile kapatılır. İşlem geri alındığı için canlı tanım değişmez.
- **Yeni tablo:** RLS AÇIK; `REVOKE INSERT, UPDATE, DELETE ON … FROM anon, authenticated`.
- **Yeni fonksiyon:** `SET search_path TO 'public'`. İç fonksiyonlarda `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated`. İstemci RPC'lerinde `GRANT EXECUTE … TO authenticated`.
- **Canlı fonksiyonu değiştirirken** (`review_wa_record_answer`, `trg_whatsapp_meta_notify`): tanım `.before.txt`'den alınır, yalnız planın söylediği satır değişir. `md5(pg_get_functiondef)` uygulama sonrası göç dosyasıyla karşılaştırılır.
- **Tetikleyici puan kaydını ASLA engellemez:** gövde `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING …; END`.

### Edge fonksiyon

- `send-whatsapp-meta` yalnız Meta `dusuk_puan_lab` ya da `dusuk_puan_hatirlatma` onaylandıktan sonra yayınlanır: `supabase functions deploy send-whatsapp-meta --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api`.
- `NOTIFY_FN_SECRET` ve anon anahtar hiçbir çıktıda yazdırılmaz.
- Saf modüller Deno/esm.sh içe aktarmaz; `node --test` ile koşar.

### Arayüz

- **Dört dil AYNI ANDA:** düz Türkçe `<Text>` → `core/i18n/locales/auto.{en,de,fa}.json` (birebir `trim()` anahtar). Şablon dizeler, sabit dizilerdeki etiketler ve `SvgText` `autoT()` ile sarılır. Veritabanından gelen bildirim başlıkları da auto sözlüğe eklenir. Farsça için `persian-writing` skill'i. Üç sözlüğün anahtar kümesi eşit kalır.
- **Görünüm:** panel paleti `usePanelTheme()`; koyu tema `useInkUI` / `useMobileTokens` (açık tema bit-bit aynı). Hero `WhiteHero`; tablolar `MobileTableX` + `MobileTableRowX` + `MobileTableInitialX`; boş durum `EmptyStateX`; popup `U.modalOverlay` / `U.modalCard`; her ikon-butonda `GlassTooltip`; beyaz butonlar `U.plainBtn`; durum rozetleri `U.chipTones`; ikonlar yalnız `core/ui/icons`. Sol renkli kenarlı kart YOK. Sekme gömülü olduğu için yatay dolgu eklenmez (ClinicsScreen içerik kabı veriyor).
- **Hata** düğmenin/alanın yanında görünür.
- **Hareket:** basınca hafif küçülme; `prefers-reduced-motion`'da animasyon yok.
- **Kapsam:** Sağlık Kurumları ekranı lab ve Yönetim panellerinde paylaşılıyor (`app/(lab)/clinics.tsx`, `app/(admin)/clinics.tsx`, `app/(admin)/doctors.tsx`). Kullanıcı iki panelde görünmesini onayladı. Yeni sekme dışındaki sekmeler değişmez.

### Kontroller, commit, yayın

- **Her görev sonunda:**
  - Test takımı: `cd my-expo-app && find modules core app supabase/functions -name "*.test.mts" -o -name "*.test.ts" | grep -v node_modules | xargs node --test` → `fail 0`.
  - `npx tsc --noEmit --incremental false` → 0 hata.
- **Commit:** main'de, mesaj sonunda `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Yayın:** push ve web deploy YALNIZ kullanıcı isteyince.

## Review Focus

1. **"Sorun var" çift uyarı:** WhatsApp cevabı `order_reviews`'e yazınca tetikleyici, ardından `review_wa_record_answer` değerlendiriciyi yeniden çağırır. Yönetici başına tam bir bildirim (`review_problem`) oluşmalı, ayrıca `review_low` oluşmamalı. → Görev 3 denemesi b.
2. **Arandıktan sonra kötüleşme:** iş 3 iken arandı, hekim 1'e indirdi → yeni uyarı, iş yeniden açık, eski arama "Önceki arama" olarak döner, 48 saat sonra yeni dönemin hatırlatması gidebilir. → Görev 3 denemesi d, Görev 5 denemesi c.
3. **Yönetici olmayan erişim:** teknisyen, muhasebe, klinik/hekim kullanıcısı ve başka lab'ın yöneticisi `review_followups`'ı doğrudan okuyamaz (0 satır), RPC'ler 42501 verir. → Görev 2 denemesi c, Görev 4 denemesi a.
4. **Ay sınırı Türkiye saati:** ayın son günü 21:30 UTC'de (TR 00:30, ertesi ay) verilen puan ertesi ayda sayılır; gelecek ay istenince 22023. → Görev 4 denemesi c, Görev 6 `shiftMonth` testi.
5. **Kliniksiz hekim ve telefonsuz satır:** kliniği olmayan hekim kendi satırı olur (`d:` anahtarı); klinik ve hekim telefonu yoksa "Kliniği ara" pasif ve tooltip `Telefon kayıtlı değil`. → Görev 4 denemesi d (sunucu numarayı seçer), Görev 6 `callPhone` testi (boş/boşluklu numara pasif sayılır).

---

### Task 1: Uyarı ve şablon metinleri — kullanıcı onayı

Meta onayı günler sürer ve değişken adları edge koduyla eşleşmeli; ilk iş budur.

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-degerlendirmeler-ekrani-design.md` — sona "§14 Onaylanan metinler" eklenir, durum satırına "metinler §14" eklenir.

**Interfaces:**
- Produces (birebir; sonraki görevler buradan kopyalar):
  - Şablon değişkenleri sabit: `dusuk_puan_lab` → `siparis_no`, `is_turu`, `hekim`, `klinik`, `puanlar`; `dusuk_puan_hatirlatma` → `siparis_no`, `klinik`.
  - Uygulama içi başlıklar: `Düşük puan`, `Düşük puan 2 gündür aranmadı`, (`review_problem`) `Hekim sorun bildirdi`.
  - Gövde: uyarı `<sipariş no> · <klinik> · <hekim> · <iş türü> · <puanlar>`; hatırlatma `<sipariş no> · <klinik> · <puanlar>`.

- [ ] **Step 1: Metinleri kullanıcıya sun** — AskUserQuestion, iki şablon için spec §9 metni ile bu düzeltilmiş öneriyi yan yana göster (gerekçe: kliniği olmayan hekimde "Dr X kliniğinden Dr X" çıkıyor; hatırlatma cümlesi bozuk):
  - `dusuk_puan_lab`: `Düşük puan: {{hekim}} ({{klinik}}), {{siparis_no}} numaralı {{is_turu}} işine düşük puan verdi: {{puanlar}}. Ayrıntılar Siman'da Değerlendirmeler ekranında.`
  - `dusuk_puan_hatirlatma`: `Hatırlatma: {{klinik}} için {{siparis_no}} numaralı işteki düşük puan 2 gündür aranmadı. Siman'da Değerlendirmeler ekranından "Arandı" olarak işaretleyebilirsiniz.`
  - Seçenekler: "Önerilen metinler (Önerilen)" / "Spec'teki metinler" / Diğer ile düzeltme. Değişken adları değişmez. Meta kuralı: gövde değişkenle başlayıp bitmez.
- [ ] **Step 2: Spec'e yaz** — onaylanan metinleri §14'e koy, durum satırını güncelle.
- [ ] **Step 3: Meta başvuru bloğu** — iki şablonun adı, kategorisi (UTILITY), dili (`tr`), gövdesi ve her değişken için örnek değer tek blokta kullanıcıya verilir. Başvuruyu kullanıcı kendi Meta hesabından yapar.
- [ ] **Step 4: Commit** — `docs(puan): düşük puan uyarı ve hatırlatma metinleri onaylandı`

### Task 2: DB şeması — takip tablosu ve yardımcılar

**Files:**
- Create: `supabase/migrations/20261104120000_dusuk_puan_sema.sql`
- Create: `supabase/rollbacks/20261104120000_dusuk_puan_sema.before.txt`, `.down.sql`

**Interfaces:**
- **Produces — tablo `review_followups`:**
  - `work_order_id uuid PRIMARY KEY REFERENCES work_orders(id) ON DELETE CASCADE`
  - `lab_id uuid NOT NULL REFERENCES labs(id) ON DELETE CASCADE`
  - `cur_min smallint NULL`, `alert_min smallint NULL`
  - `first_alert_at`, `last_alert_at`, `period_started_at`, `reminder_sent_at` — `timestamptz NULL`
  - `called_at timestamptz NULL`, `called_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`, `called_min smallint NULL`
  - `call_note text NULL CHECK (char_length(call_note) <= 1000)`, `note_updated_at timestamptz NULL`, `note_updated_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
  - `created_at`, `updated_at` — `timestamptz NOT NULL DEFAULT now()`
  - İndeks: `(lab_id, cur_min)`.
  - Politika `review_followups_select` (SELECT, authenticated): `lab_id = get_my_lab_id() AND (my_user_type() = 'admin' OR is_lab_manager())`. Yazma politikası yok.
- **Produces — `_review_low_min(p_work_order uuid) RETURNS smallint`** (STABLE): Global Constraints'teki etkin en düşük; ne değerlendirme ne düşük WhatsApp cevabı varsa `NULL`.
- **Produces — `_review_low_scores_text(p_work_order uuid) RETURNS text`** (STABLE): kısa etiketli düşük puanlar, `Genel 3, Uyum 2` biçimi, kurallar Global Constraints'te.
- **Produces — `_review_low_url(p_user_type text, p_work_order uuid) RETURNS text`** (IMMUTABLE): admin → `/(admin)/clinics?tab=reviews&focus=<wo>`, diğer → `/(lab)/clinics?tab=reviews&focus=<wo>`.
- **Produces — `_notify_inapp_push(p_user_id uuid, p_category text, p_title text, p_body text, p_resource_type text, p_resource_id uuid, p_action_url text, p_payload jsonb) RETURNS uuid`:** `_notify_channels`'ın kopyası; tek fark gönderilen edge listesi `ARRAY['send-expo-push','send-web-push']`. Başlık/anahtar bloğu `_notify_channels`'tan kopyalanır, çıktıya yazdırılmaz.

- [ ] **Step 1: before.txt** — canlıdan: `review_followups`'ın olmadığı (`to_regclass`), dört fonksiyon adının boş olduğu, `_notify_channels` tanımının md5'i.
- [ ] **Step 2: Ön koşul** — `SELECT count(*) FROM order_reviews WHERE least(overall,fit,occlusion,contacts,esthetics,surface,on_time) <= 3` ve `SELECT count(*) FROM review_requests WHERE answer IN (1,3)` canlıda 0 olmalı (geriye dönük doldurma yok). 0 değilse DUR, kullanıcıya sor.
- [ ] **Step 3: Göç ve down.sql** — down: dört fonksiyon ve tablo `DROP … IF EXISTS`.
- [ ] **Step 4: Deneme** (göç + aşağıdakiler, sonda `RAISE EXCEPTION 'PROBE ok'`):
  - a. `_review_low_min`: `overall=5, fit=2` → 2; yalnız `overall=4` → NULL değil 4; değerlendirme `overall=5` + istek `answer=3` → 3; hiçbir şey yok → NULL.
  - b. `_review_low_scores_text`: `overall=3, fit=2, on_time=3` → `Genel 3, Uyum 2, Zamanında teslim 3`; `source='app' overall=5` + `answer=1` → `WhatsApp 1`; `source='whatsapp' overall=1` + `answer=1` → `Genel 1`.
  - c. RLS: `set local role authenticated` + `request.jwt.claims` ile sırayla lab yöneticisi (satırı görür), aynı lab teknisyeni (0 satır), klinik kullanıcısı (0 satır), başka lab'ın yöneticisi (0 satır); hepsinde `INSERT` → `permission denied`.
  - d. `_review_low_url('admin', x)` ve `('lab', x)` beklenen dizeler.
- [ ] **Step 5: Onay ve uygulama** — AskUserQuestion "Onaylıyorum, uygula"; uygula; canlıda tablo + politika + dört fonksiyonun varlığını ve `relrowsecurity = true`'yu ölç.
- [ ] **Step 6: Commit** — `feat(puan): düşük puan takip tablosu ve yardımcıları (DB)`

### Task 3: Değerlendirici, uyarı, tetikleyici ve WhatsApp birleştirmesi

**Files:**
- Create: `supabase/migrations/20261104130000_dusuk_puan_uyari.sql`
- Create: `supabase/rollbacks/20261104130000_dusuk_puan_uyari.before.txt`, `.down.sql`

**Interfaces:**
- Consumes: Görev 2'nin tablosu ve dört yardımcısı.
- **Produces — `_review_low_alert(p_work_order uuid, p_category text) RETURNS integer`:** alıcı kümesinde döner, gönderilen sayısını verir.
  - `review_low` → `_notify_inapp_push(u, 'review_low', 'Düşük puan', <uyarı gövdesi>, 'review_followup', wo, _review_low_url(user_type, wo), payload)`.
  - `review_problem` → aynı argümanlarla `_notify_channels`, başlık `Hekim sorun bildirdi`.
  - `review_low_reminder` → `_notify_inapp_push`, başlık `Düşük puan 2 gündür aranmadı`, hatırlatma gövdesi.
  - Gövde ve payload Global Constraints'teki gibi; iş türü `_review_work_type_label(work_type)`.
- **Produces — `_review_low_evaluate(p_work_order uuid) RETURNS text`:** dönüş `alerted | unchanged | cleared | none`.
  - Satırı `FOR UPDATE` kilitler (yoksa ve düşükse oluşturur, `lab_id` = `work_orders.lab_id`).
  - Kurallar Global Constraints'te (uyarı, dönem, `cur_min`, `alert_min`).
  - Kategori: `current_setting('siman.review_wa_answer', true) = '1'` ise `review_problem`, aksi `review_low`.
- **Produces — tetikleyici `trg_order_reviews_low`:** `AFTER INSERT OR DELETE OR UPDATE OF overall, fit, occlusion, contacts, esthetics, surface, on_time ON order_reviews FOR EACH ROW`, fonksiyon `_trg_order_reviews_low()` SECURITY DEFINER. DELETE'te `OLD.work_order_id`. Gövde hata yutar (`RAISE WARNING`), `RETURN NULL`.
- **Modifies — `review_wa_record_answer`:** yalnız iki değişiklik.
  1. `INSERT INTO order_reviews` satırından hemen önce `PERFORM set_config('siman.review_wa_answer', p_score::text, true);`.
  2. `PERFORM public._review_alert_lab(r.id, v_alert);` yerine `PERFORM public._review_low_evaluate(r.work_order_id);` (aynı BEGIN/EXCEPTION içinde). `v_alert` hesabı ve dönüş JSON'u aynı kalır. `_review_alert_lab` silinmez.
- **Modifies — `trg_whatsapp_meta_notify`:** kategori listesine `'review_low','review_low_reminder'` eklenir; başka satır değişmez.

- [ ] **Step 1: before.txt** — `review_wa_record_answer` ve `trg_whatsapp_meta_notify` tam tanımı + md5 + yetkileri; `order_reviews` tetikleyici listesi.
- [ ] **Step 2: Göç ve down.sql** — down: iki canlı fonksiyon before.txt tanımına döner; tetikleyici, `_trg_order_reviews_low`, `_review_low_evaluate`, `_review_low_alert` düşer.
- [ ] **Step 3: Deneme** (Global Constraints'teki taslak göndericilerle; her durumda `_sent` sayılır):
  - a. Uygulamadan `overall=5, fit=2` INSERT → yönetici başına 1 `review_low`, satır açık, `period_started_at` dolu, gövdede yorum ve hasta adı YOK (yoruma işaret dizesi yazılır, gövdede aranır).
  - b. Puan isteği + `review_wa_record_answer(req, 1, phone, lab)` → yönetici başına tam 1 `review_problem`, 0 `review_low`; aynı çağrı tekrar → yeni bildirim yok.
  - c. Uygulama puanı `overall=5` varken WhatsApp 3 → 1 `review_low`; değerlendirme satırı ezilmemiş (`overall=5, source='app'`).
  - d. Açık iş `called_at = now()` yapılır; puan 3 → 1 UPDATE → yeni uyarı, `period_started_at > called_at` (açık + önceki arama).
  - e. Puan 3 → 2 (açık, aranmamış) → uyarı gider, `period_started_at` değişmez.
  - f. Puan 3 → 5 → `cleared`, `alert_min NULL`, bildirim yok, `called_*` korunur.
  - g. `_review_low_alert`'in içinde hata (`_notify_inapp_push` taslağı `RAISE`) → `order_reviews` INSERT yine başarılı.
  - h. Teknisyen/klinik kullanıcısı alıcı listesinde yok; başka lab yöneticisine bildirim yok.
- [ ] **Step 4: Onay ve uygulama** — AskUserQuestion; uygula; canlıda tetikleyiciyi ve iki değişen fonksiyonun md5'inin göç dosyasıyla eşleştiğini ölç.
- [ ] **Step 5: Commit** — `feat(puan): düşük puan uyarısı tek yoldan, WhatsApp cevabı birleşti (DB)`

### Task 4: Ekran ve arama RPC'leri

**Files:**
- Create: `supabase/migrations/20261104140000_degerlendirme_ekrani_rpc.sql`
- Create: `supabase/rollbacks/20261104140000_degerlendirme_ekrani_rpc.before.txt`, `.down.sql`

**Interfaces:**
- Consumes: Görev 2 tablosu, `_review_low_min`, `_review_work_type_label`.
- **Produces — `get_review_dashboard(p_month date DEFAULT NULL, p_focus uuid DEFAULT NULL) RETURNS jsonb`** (STABLE SECURITY DEFINER, `GRANT authenticated`):
  - Yönetici değilse ya da lab yoksa `42501`. `p_month` geleceğe düşüyorsa `22023`.
  - Ay: `p_month` verilmişse onun ayı; yoksa `p_focus` verilmişse o işin değerlendirme ayı; yoksa bu ay (TR).
  - Dönüş şekli birebir Görev 6'daki `ReviewDashboard` tipi (snake_case anahtarlar):
    - `month`: `'YYYY-MM-01'`.
    - `summary`: `avg`, `count`, `low_count`, `prev_avg`, `rate` (`{delivered, reviewed}` ya da `null`), `has_any` (lab'ın hiç değerlendirmesi var mı).
    - `clinics[]`: son 6 ayda (seçili ay dahil) değerlendirmesi olan her klinik anahtarı için `key`, `kind`, `name`, `series` (6 öğe, eskiden yeniye aylık ortalama ya da null), `counts` (6), `month_avg`, `month_count`, `month_low`, `prev3_avg` (seçili aydan önceki 3 takvim ayının tüm puanlarının ortalaması).
    - `reviews[]`: seçili ayın tüm değerlendirmeleri — `work_order_id`, `order_number`, `clinic_key`, `clinic_name`, `doctor_name`, `work_type_label`, `created_at`, `source`, yedi puan, `comment`, `wa_answer`, `cur_min`.
    - `lows[]`: `cur_min ≤ 3` olan takip satırlarından seçili ayda verilmiş olanlar ile ayı ne olursa olsun açık olanlar. `reviews[]` alanlarına ek: `phone` (klinik telefonu, yoksa hekim telefonu, yoksa null), `period_started_at`, `called_at`, `called_by_name`, `call_note`, `note_updated_at`, `note_updated_by_name`, `is_open`, `previous_call`.
  - Kliniksiz hekim `d:<doctor_id>`; çok-lab'lı klinikte yalnız bu lab'ın işleri.
- **Produces — `review_followup_set_call(p_work_order uuid, p_action text, p_note text DEFAULT NULL) RETURNS jsonb`** (SECURITY DEFINER, `GRANT authenticated`):
  - Yönetici değil → `42501`; satır yok ya da başka lab → `P0002`; `p_action` `mark|note|unmark` dışı ya da not > 1000 karakter → `22023`; `mark` için `cur_min > 3` → `22023`; `note` için `called_at IS NULL` → `22023`.
  - `mark`: `called_at=now(), called_by=auth.uid(), called_min=cur_min`, not alanları + `note_updated_*`.
  - `note`: yalnız not alanları.
  - `unmark`: `called_*`, `call_note`, `note_updated_*` NULL.
  - Dönüş: o satırın `lows[]` öğesindeki arama alanları (`called_at`, `called_by_name`, `call_note`, `note_updated_at`, `note_updated_by_name`, `is_open`, `previous_call`).

- [ ] **Step 1: before.txt** — iki fonksiyon adının canlıda olmadığı.
- [ ] **Step 2: Göç ve down.sql**.
- [ ] **Step 3: Deneme** (deneme verisi işlem içinde eklenir):
  - a. Teknisyen, muhasebe rolü, klinik kullanıcısı, başka lab yöneticisi → her iki RPC `42501`; başka lab'ın işine `set_call` → `P0002`.
  - b. Yönetici: iki klinik, 7 aya yayılmış puanlar → `series` 6 öğe, boş ay `null`; `prev3_avg` 3 ayın tüm puanlarının ortalaması (ay ortalamalarının ortalaması DEĞİL — ay başına farklı sayıda puanla sınanır); 7 ay önce puanı olan ama son 6 ayda olmayan klinik listede yok.
  - c. `created_at = '2026-10-31 21:30+00'` → `p_month '2026-11-01'`'de sayılır, `'2026-10-01'`'de sayılmaz; `p_month` gelecek ay → `22023`; `p_focus` ile `p_month NULL` → işin ayı.
  - d. Kliniksiz hekim `d:` anahtarı; telefonsuz klinik + telefonlu hekim → `phone` hekiminki; ikisi de yok → `null`.
  - e. Eski ayda açık düşük puan bu ayın `lows[]`'unda var; eski ayda aranmış olan yok.
  - f. `mark` → `is_open=false`; `note` metni değişir, `called_at` aynı; `unmark` → `is_open=true, previous_call=false`; 1001 karakterlik not → `22023`.
  - g. `rate`: 14 günü dolmamış teslim paydada yok; hiç dolmuş teslim yoksa `null`.
- [ ] **Step 4: Onay ve uygulama** — AskUserQuestion; uygula; canlıda yönetici kimliğiyle `get_review_dashboard()` çağrılıp anahtarların ve 6 canlı değerlendirmenin sayıldığı ölçülür (çıktıda isim yazdırılmaz, yalnız sayılar).
- [ ] **Step 5: Commit** — `feat(puan): Değerlendirmeler ekranı ve arama kaydı RPC'leri (DB)`

### Task 5: 48 saat hatırlatması

**Files:**
- Create: `supabase/migrations/20261104150000_dusuk_puan_hatirlatma.sql`
- Create: `supabase/rollbacks/20261104150000_dusuk_puan_hatirlatma.before.txt`, `.down.sql`

**Interfaces:**
- Consumes: `_review_low_alert(wo, 'review_low_reminder')`, Görev 2 tablosu.
- **Produces — `_review_low_reminder_window(p_at timestamptz) RETURNS boolean`** (STABLE): `extract(hour FROM p_at AT TIME ZONE 'Europe/Istanbul') BETWEEN 9 AND 19`.
- **Produces — `fn_review_low_reminder_tick() RETURNS integer`** (SECURITY DEFINER; `REVOKE` PUBLIC/anon/authenticated): `_review_low_reminder_window(now())` yanlışsa 0 döner. Aksi hâlde Global Constraints'teki koşulları uygular; her uygun satır için hatırlatır ve `reminder_sent_at = now()` yazar; gönderilen iş sayısını döner. Bir satırdaki hata diğerlerini durdurmaz (satır başına BEGIN/EXCEPTION).
- **Produces — cron `review-low-reminder-tick`:** `37 * * * *`, `SELECT public.fn_review_low_reminder_tick()`.

- [ ] **Step 1: before.txt** — `cron.job` listesinde adın olmadığı.
- [ ] **Step 2: Göç ve down.sql** — down: `cron.unschedule('review-low-reminder-tick')` + fonksiyon düşer.
- [ ] **Step 3: Deneme** (`now()` sabitlenemediği için zamanlar satırda geriye çekilir; a–c için işlem içinde `_review_low_reminder_window` her zaman `true` dönen taslağa çevrilir):
  - a. Açık, `period_started_at = now() - 49 saat` → 1 hatırlatma; ikinci çağrı → 0.
  - b. 47 saat → 0; aranmış → 0; `cur_min = 4` → 0.
  - c. Aranmış iş kötüleşip yeni dönem başlamış, eski dönemde hatırlatma gitmiş, yeni dönemden 49 saat geçmiş → 1.
  - d. Asıl tanımla: `_review_low_reminder_window('2026-11-04 05:59+00')` (TR 08:59) → false; `'2026-11-04 06:00+00'` (TR 09:00) → true; `'2026-11-04 17:00+00'` (TR 20:00) → false. Taslak `false` dönerken tick → 0.
- [ ] **Step 4: Onay ve uygulama** — AskUserQuestion; uygula; `cron.job`'da satırı ölç.
- [ ] **Step 5: Commit** — `feat(puan): 2 gün aranmayan düşük puana hatırlatma (DB + cron)`

### Task 6: Saf kurallar modülü

**Files:**
- Create: `modules/reviews/dashboardRules.ts`
- Create: `modules/reviews/dashboardRules.test.mts`
- Modify: `modules/reviews/types.ts` — tipler

**Interfaces:**
- Consumes: Görev 4'ün dönüş şekli.
- **Produces — tipler (`types.ts`):** `ScoreKey = 'overall'|'fit'|'occlusion'|'contacts'|'esthetics'|'surface'|'on_time'`; `ReviewDashboardSummary`, `ReviewClinicRow`, `ReviewDashRow`, `ReviewLowRow`, `ReviewDashboard`, `ReviewCallAction = 'mark'|'note'|'unmark'`, `ReviewCallState` — alanlar Görev 4'te sayılanlarla birebir.
- **Produces — `dashboardRules.ts`:**
  - `REVIEW_LOW_MAX = 3`
  - `SCORE_SHORT_LABELS: Record<ScoreKey, string>` (Global Constraints)
  - `waButtonLabel(answer: number | null): 'Sorunsuz' | 'Küçük düzeltme' | 'Sorun var' | null`
  - `lowChips(row: ReviewDashRow): { key: ScoreKey | 'whatsapp'; label: string; score: number }[]`
  - `canSeeReviewDashboard(p: { user_type?: string | null; role?: string | null } | null): boolean`
  - `avgDelta(cur: number | null, prev: number | null): number | null` (bir ondalığa yuvarlı)
  - `sortClinicRows(rows: ReviewClinicRow[]): ReviewClinicRow[]` — önce bu ay puanı ve `prev3_avg`'si olanlar, farkı en küçük (en çok düşen) önce; sonra bu ay puanı olup `prev3_avg`'si olmayanlar ("yeni"), ada göre; en sonda bu ay puanı olmayanlar, ada göre.
  - `sparkSegments(series: (number | null)[], w: number, h: number): { x: number; y: number }[][]` — 1–5 ölçeği, boş ay segmenti böler.
  - `sortLows(rows: ReviewLowRow[]): ReviewLowRow[]` — açıklar `period_started_at` artan, sonra arananlar `called_at` azalan.
  - `defaultLowFilter(rows: ReviewLowRow[]): 'open' | 'all'`
  - `daysUncalled(periodStartedAt: string | null, now: Date): number | null` — 48 saatten azsa null, aksi tam gün.
  - `callPhone(row: ReviewLowRow): string | null` — kırpılmış `row.phone`, boşsa null.
  - `shiftMonth(month: string, delta: number): string`, `isFutureMonth(month: string, now: Date): boolean` — TR saatine göre.
  - `formatAvg(n: number | null, locale: string): string` — tek ondalık, dilin ondalık ayırıcısı, null → `—`.

- [ ] **Step 1: Testleri yaz** — `dashboardRules.test.mts`, en az:
  - `lowChips`: `{overall:3, fit:2, on_time:3, source:'app'}` → `['Genel 3','Uyum 2','Zamanında teslim 3']`; `{overall:5, source:'app', wa_answer:1}` → `['WhatsApp 1']`; `{overall:1, source:'whatsapp', wa_answer:1}` → `['Genel 1']`; `{overall:4}` → `[]`.
  - `canSeeReviewDashboard`: admin → true; lab+manager → true; lab+technician, lab+accountant, doctor, clinic_admin, null → false.
  - `sortClinicRows`: `[{A: -0.3}, {B: -1.2}, {C: +0.2}, {D: yeni}, {E: bu ay yok}]` → `B, A, C, D, E`.
  - `sparkSegments([4, null, 5, 5, null, 3], 60, 20)` → 3 segment; 5 → `y=0`, 1 → `y=h`.
  - `sortLows`: açık (eski, yeni) önce eskisi; aranmış (eski, yeni) yenisi önce; açıklar arananlardan önce.
  - `daysUncalled`: 47 saat → null; 49 saat → 2; 73 saat → 3.
  - `callPhone`: `phone: '0532 000 00 00'` → aynı dize (kırpılmış); `phone: '  '` → null; `phone: null` → null. (Klinik/hekim önceliğini sunucu seçer, Görev 4 denemesi d.)
  - `shiftMonth('2026-01-01', -1)` → `'2025-12-01'`; `isFutureMonth('2026-12-01', new Date('2026-11-30T21:30:00Z'))` → true; `isFutureMonth('2026-12-01', new Date('2026-11-30T22:30:00Z'))` → false (TR'de Aralık başladı).
  - `formatAvg(4.56, 'tr')` → `4,6`; `('en')` → `4.6`; null → `—`.
  - `avgDelta(3.4, 4.6)` → `-1.2`.
- [ ] **Step 2: Koş, düştüğünü gör** — `node --test modules/reviews/dashboardRules.test.mts` → modül bulunamadı hatası.
- [ ] **Step 3: Tipleri ve modülü yaz.**
- [ ] **Step 4: Koş, geçtiğini gör** — aynı komut → `fail 0`.
- [ ] **Step 5: Takım + tsc, commit** — `feat(puan): Değerlendirmeler ekranı saf kuralları + test`

### Task 7: Bildirim tesisatı (kategoriler, ayarlar, zil)

**Files:**
- Modify: `core/store/notificationPrefsDefaults.ts` — tip birliği + varsayılanlar
- Modify: `core/store/notificationPrefsDefaults.test.mts` — `META_TEMPLATED`
- Modify: `core/ui/mobile/NotificationsSheet.tsx` — `CATEGORY_CFG` + dokunma dalı
- Modify: `modules/settings/sections/NotificationsSection.tsx` — satırlar ve gizleme kümeleri
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- Produces: `NotificationCategory` birliğine `'review_low' | 'review_low_reminder'`. Varsayılan ikisi için `{ in_app: true, browser_push: true, email: false, whatsapp: true }`.

- [ ] **Step 1: Testi değiştir** — `META_TEMPLATED`'a `'review_low', 'review_low_reminder'` ekle.
- [ ] **Step 2: Koş, düştüğünü gör** — `node --test core/store/notificationPrefsDefaults.test.mts` → `review_low` için hata.
- [ ] **Step 3: Varsayılanları ekle**, testi geçir.
- [ ] **Step 4: Zil (mobil sayfa)** — `CATEGORY_CFG`: `review_low` → `{ icon: AlertTriangle, color: '#DC2626', label: 'Düşük Puan' }`, `review_low_reminder` → `{ icon: AlarmClock, color: '#E89B2A', label: 'Aranmadı Hatırlatması' }`. Dokunma: `n.resource_type === 'review_followup' && n.action_url` ise `router.push(n.action_url)` (`useRouter` bu bileşene eklenir); `work_order` dalı aynı kalır. Masaüstü `NotificationPopover` zaten `action_url`'e gidiyor, değişmez.
- [ ] **Step 5: Ayarlar** — `review_minor` satırı yerine `review_low` (`Düşük puan` / `Genel ya da alt puan 3 ve altı`); yeni satır `review_low_reminder` (`Düşük puan aranmadı` / `2 gün aranmayan düşük puan için bir kez`). `review_problem` satırı kalır. İki yeni kategori `hideForClient` ve `hideForTechnician` kümelerine eklenir.
- [ ] **Step 6: Sözlük** — yeni etiketler, alt metinler ve DB başlıkları (`Düşük puan`, `Düşük puan 2 gündür aranmadı`) üç auto sözlüğe; `modules/reviews/reviewI18n.test.mts`'e bu dizeler için ayrı bir test eklenir ve geçer.
- [ ] **Step 7: Takım + tsc, commit** — `feat(puan): düşük puan bildirim kategorileri ve ayarları`

### Task 8: `send-whatsapp-meta` lab şablonları

**Files:**
- Create: `supabase/functions/send-whatsapp-meta/reviewLowTemplates.ts`
- Create: `supabase/functions/send-whatsapp-meta/reviewLowTemplates.test.ts`
- Modify: `supabase/functions/send-whatsapp-meta/index.ts` — `LAB_TEMPLATES` + kaynak çözümü

**Interfaces:**
- Consumes: Görev 1'in değişken adları; Görev 3'ün payload anahtarları.
- **Produces — `reviewLowLabParams(category: 'review_low' | 'review_low_reminder', p: Record<string, unknown>): { name: string; text: string }[]`** ve `REVIEW_LOW_TEMPLATE_NAMES = { review_low: 'dusuk_puan_lab', review_low_reminder: 'dusuk_puan_hatirlatma' }`. Ham metin döner; `index.ts` her `text`'i mevcut `clean()`'den geçirir.

- [ ] **Step 1: Test** — `review_low` + `{orderNumber:'2481', clinic:'K', doctor:'H', workType:'Zirkonya', scores:'Genel 3'}` → adlar sırayla `siparis_no, is_turu, hekim, klinik, puanlar` ve değerler; `review_low_reminder` → `siparis_no, klinik`; eksik alan → `—`.
- [ ] **Step 2: Koş, düştüğünü gör** — `node --test supabase/functions/send-whatsapp-meta/reviewLowTemplates.test.ts`.
- [ ] **Step 3: Modülü yaz, testi geçir.**
- [ ] **Step 4: index.ts** — `LAB_TEMPLATES`'e iki giriş (`name` modülden, `lang: 'tr'`, `params: p => reviewLowLabParams(cat, p).map(x => ({ name: x.name, text: clean(x.text) }))`). `resource_type === 'review_followup'` iş emri gibi çözülür (lab ve denetim satırındaki `work_order_id`).
- [ ] **Step 5: Takım + tsc, commit** — `feat(puan): düşük puan WhatsApp lab şablonları (yayın Meta onayından sonra)`
- [ ] **Step 6: Yayın kapısı** — yayın bu görevde YAPILMAZ. Kullanıcı Meta onayını bildirince Global Constraints'teki komutla yayınlanır; ilk gerçek uyarıda `whatsapp_notifications` denetim satırı ölçülür.

### Task 9: Veri katmanı, hero ve klinik tablosu

**Files:**
- Modify: `modules/reviews/api.ts` — iki fonksiyon
- Create: `modules/reviews/components/dashboard/ReviewsDashboard.tsx`
- Create: `modules/reviews/components/dashboard/ReviewSparkline.tsx`
- Create: `modules/reviews/components/dashboard/ReviewClinicsTable.tsx`
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`, `modules/reviews/reviewI18n.test.mts`

**Interfaces:**
- Consumes: Görev 4 RPC'leri; Görev 6 tipleri ve kuralları.
- **Produces — `api.ts`:** `getReviewDashboard(month?: string | null, focus?: string | null): Promise<{ data: ReviewDashboard | null; error: any }>`; `setReviewFollowupCall(workOrderId: string, action: ReviewCallAction, note?: string | null): Promise<{ data: ReviewCallState | null; error: any }>`.
- **Produces — `ReviewsDashboard({ focusWorkOrderId?: string | null })`:** veriyi çeker, ay ve klinik süzgeci durumunu tutar, hero + `ReviewClinicsTable` + (Görev 10'da) `ReviewLowList` çizer. Klinik süzgeci seçiliyken düşük puanlar alanı yerine o kliniğin ay değerlendirmeleri listelenir (satır görünümü Görev 10'daki satırın salt-okunur hâli), üstte süzgeci kaldıran pill.
- **Produces — `ReviewSparkline({ series, positive }: { series: (number | null)[]; positive: boolean | null })`:** `sparkSegments` ile `react-native-svg` çizgisi; son nokta kırmızı/yeşil/içi boş gri.

- [ ] **Step 1: i18n testi** — `reviewI18n.test.mts`'e hero ve tablo etiketleri (`Ortalama`, `Değerlendirme`, `Düşük puan`, `Puan alma`, `Klinikler`, `En çok düşen en üstte`, `Bu ay puan yok`, `yeni`, `Henüz değerlendirme yok`, `WhatsApp puan isteğini Ayarlar > Entegrasyonlar'dan açabilirsiniz.`, `Ayarlara git`, `Bu ayın teslimlerinin 14 günü henüz dolmadı`, `Geçen aya göre`, `Yeniden dene`) için test ekle; düştüğünü gör.
- [ ] **Step 2: api.ts** — iki fonksiyonu yaz (`supabase.rpc`).
- [ ] **Step 3: Bileşenler** — spec §7.1, §7.2, §7.5 düzeni:
  - Hero: kicker `Değerlendirmeler · <Ay Yıl>`, başlık `Ortalama <formatAvg>`, fark satırı, `<n> işe puan verildi`, üç rakam, ay seçici (gelecek ay oku pasif).
  - Tablo: `sortClinicRows` sırası, `MobileTableInitialX`, ad + `<n> değerlendirme · <k> düşük`, sparkline, ay ortalaması + `↓/↑` fark, satıra dokununca süzgeç.
  - `summary.has_any === false` → `EmptyStateX`: başlık `Henüz değerlendirme yok`, alt metin `WhatsApp puan isteğini Ayarlar > Entegrasyonlar'dan açabilirsiniz.`, düğme `Ayarlara git` → `/<aktif grup>/settings?tab=integrations` (ayar kartı orada; yalnız yöneticiye açık, ekranı gören zaten yönetici).
  - Seçili ayda puan yok → hero başlığı `Bu ay puan yok`; tablolar kendi boş satırını gösterir.
  - Yükleniyor durumu; hata metni `Yeniden dene` düğmesinin yanında.
- [ ] **Step 4: Sözlük** — tüm yeni dizeler üç auto sözlüğe; i18n testi geçer.
- [ ] **Step 5: Takım + tsc, commit** — `feat(puan): Değerlendirmeler ekranı hero ve klinik tablosu`

### Task 10: Düşük puan listesi, arama penceresi ve sekme

**Files:**
- Create: `modules/reviews/components/dashboard/ReviewLowList.tsx`
- Create: `modules/reviews/components/dashboard/ReviewCallModal.tsx`
- Modify: `modules/reviews/components/dashboard/ReviewsDashboard.tsx` — listeyi bağla
- Modify: `modules/clinics/screens/ClinicsScreen.tsx` — sekme, parametreler, içerik dalı
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`, `modules/reviews/reviewI18n.test.mts`

**Interfaces:**
- Consumes: Görev 6 (`sortLows`, `defaultLowFilter`, `daysUncalled`, `lowChips`, `waButtonLabel`, `callPhone`, `canSeeReviewDashboard`), Görev 9 (`ReviewsDashboard`, `setReviewFollowupCall`).
- **Produces — `ReviewLowList({ rows, focusWorkOrderId, onChanged })`** ve **`ReviewCallModal({ row, mode: 'mark' | 'edit', onClose, onSaved })`**.

- [ ] **Step 1: i18n testi** — liste ve pencere etiketleri (`Düşük puanlar`, `Genel puan ya da herhangi bir alt puan 3 ve altı`, `Aranmadı`, `Tümü`, `Kliniği ara`, `Arandı`, `Siparişe git`, `Notu düzenle`, `Önceki arama`, `gündür aranmadı`, `Telefon kayıtlı değil`, Görev 1 pencere metinleri, `Değerlendirmeler`) için test ekle; düştüğünü gör.
- [ ] **Step 2: Liste** — spec §7.3: süzgeç pill'leri (seçili olan geniş, CLAUDE.md §1c), `sortLows`, kırmızı kare (`cur_min`), `#<no> · <klinik>`, `daysUncalled` etiketi (`${n} ${autoT('gündür aranmadı')}`), alt satır (WhatsApp ise `WhatsApp'tan "<düğme>"`), `lowChips` rozetleri (`U.chipTones.danger`), yorumun ilk satırı italik, düğmeler. Arandıysa yeşil `Arandı · kişi · tarih` + not kutusu (düz soluk zemin), `Notu düzenle` + `Siparişe git`. Önceki arama soluk satır. `focusWorkOrderId` satırı vurgulanır ve görünür kaydırılır; aranmışsa süzgeç `Tümü` açılır.
  - Kliniği ara: native ve dar web'de `Linking.openURL('tel:…')`; masaüstü web'de numarayı gösteren küçük popover + kopyala. Numara yoksa pasif + `GlassTooltip` `Telefon kayıtlı değil`.
  - Siparişe git: panel-agnostik. Aktif grup `useSegments()[0]` (yoksa `(lab)`), hedef `/<grup>/order/<work_order_id>` (memory "Panel-agnostik route").
- [ ] **Step 3: Pencere** — `U.modalOverlay` / `U.modalCard`; başlık, `#<no> · <klinik> · <iş türü>`, not alanı (`maxLength 1000`), `Vazgeç` / `Kaydet`; düzenleme kipinde ek `İşareti kaldır`. Kaydetme hatası düğmenin yanında. Başarıda listede satır yerinde güncellenir (yeniden çekme gerekmez), hero sayıları değişmez.
- [ ] **Step 4: Sekme** — `ClinicsScreen`:
  - `canSeeReviewDashboard(profile)` (`useAuthStore`) doğruysa `TAB_FILTERS` sonuna `{ key: 'reviews', label: 'Değerlendirmeler' }`; `activeTab` tipine `'reviews'`.
  - `useLocalSearchParams`'a `tab`, `focus` eklenir; `tab === 'reviews'` ve yetkiliyse sekme seçilir, değilse varsayılan kalır.
  - İçerik: `activeTab === 'reviews' ? <ReviewsDashboard focusWorkOrderId={focus} /> : …` (arama/süzgeç satırı zaten bu dalın dışında kalır).
- [ ] **Step 5: Sözlük** — yeni dizeler; i18n testi geçer.
- [ ] **Step 6: Takım + tsc**.
- [ ] **Step 7: Tarayıcı doğrulaması** (mock'lu tarayıcı düzeni, memory "Sahte Supabase tarayıcı test düzeni"; canlı hesapta hiçbir kayıt düğmesine basılmaz):
  - Lab yöneticisi (lab paneli) ve admin (Yönetim paneli) için `/clinics?tab=reviews&focus=<wo>` doğru panelde sekmeyi ve vurgulu satırı açar.
  - Teknisyen profilinde sekme yok; `?tab=reviews` varsayılan sekmeye düşer.
  - Açık + koyu tema, 375px ve 1280px ekran görüntüsü; Farsça'da RTL düzen ve Türkçe kalan dize yok.
  - `read_console_messages` hatasız.
- [ ] **Step 8: Commit** — `feat(puan): düşük puan listesi, arama kaydı ve Sağlık Kurumları sekmesi`

### Task 11: Uçtan uca doğrulama ve kayıt

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-degerlendirmeler-ekrani-design.md` — durum satırı
- Create: memory `project_review_dashboard.md` + `MEMORY.md` satırı

- [ ] **Step 1: Canlı ölçüm (salt okuma)** — `review_followups` RLS açık, tetikleyici ve cron var, iki değişen fonksiyonun md5'i göç dosyalarıyla eşit. Çıktıda isim ve tutar yok.
- [ ] **Step 2: Spec durumu** — "DB + web hazır; WhatsApp şablonları Meta onayı bekliyor; edge yayını onaydan sonra".
- [ ] **Step 3: Memory** — tablo, kategoriler, değerlendirici tek yol, `_review_alert_lab` artık çağrılmıyor, edge yayın kapısı.
- [ ] **Step 4: Commit** — `docs(puan): Değerlendirmeler ekranı durumu`
