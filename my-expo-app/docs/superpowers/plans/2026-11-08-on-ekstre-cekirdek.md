# Ön Ekstre Çekirdeği Implementation Plan (3/5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lab "Hekim/klinik onayıyla kesinleştir" ayarını açınca taslak faturalar ekstrede "onay bekliyor" görünsün. Klinik/hekim kalemlere not ve itiraz yazabilsin, yönetici hekim panelden onaylasın, lab da gerektiğinde klinik adına gerekçeli onay kaydetsin. Onaylanan taslaklar kesinleşsin ve klinik + para birimi başına tek aylık faturada birleşsin.

**Architecture:**
- **"Onay bekliyor" bir veritabanı durumu değildir.** Lab'ın ayarı açıkken her `status='taslak'` fatura onay bekler; ayar kapanınca aynı taslaklar normal taslağa döner (K9).
- **Yeni tablolar** (hepsi RLS'li):
  - `statement_item_notes`: kalem başına mesaj dizisi.
  - `statement_item_disputes`: kalem başına itiraz durumu.
  - `statement_approvals`: onay kaydı (kim, ne zaman, hangi yol, gerekçe).
- **Okuma ve yazma SECURITY DEFINER RPC'lerle yapılır.** Bu RPC'ler kapsamı kendisi denetler; klinik kullanıcı yalnız kendi kliniğini görür.
- **Ayar açıkken taslak→kesildi geçişi sunucuda kapalıdır.** Yalnız onay RPC'leri, transaction-yerel bir bayrakla bu geçişi yapabilir.
- **Onay anı:**
  - Seçilen taslaklar takvim ayı ve para birimi başına tek bir faturada birleşir. Kalemler taşınır, `invoice_orders` bağları yazılır, boşalan taslaklar silinir.
  - Birleşen fatura kesinleşir (tarih bugün, vade süresi korunur). Plan 2'nin otomatik alacak tetikleyicisi kendiliğinden çalışır.
- **İstemci tarafı:**
  - Saf yardımcılar `modules/invoices/lib/preStatement.ts` dosyasında.
  - Klinik/hekim paneline "Ön ekstre" ekranı eklenir.
  - Lab ekstresine üç rakam, "Ön ekstre — onay bekliyor" bölümü ve itiraz yanıtı eklenir.
  - Fatura detayında, ayar açıkken "Kesildi İşaretle" yerine "Klinik adına onay kaydet" çıkar.
  - Finans Ayarları'na ayar anahtarı eklenir.

**Tech Stack:** Supabase Postgres (plpgsql, migration + `supabase/rollbacks/<ad>.before.txt|.down.sql` + rolled-back probe), Expo/RNW TS, `node --test` (.test.mts), i18n `core/i18n/locales/auto.{en,de,fa}.json`.

**Spec:** `my-expo-app/docs/superpowers/specs/2026-11-06-on-ekstre-onay-design.md`
- Bu planın kapsamı: §2.1–2.6, §2.11, §2.14'ün ekran kısmı, §5, K2, K3, K5, K6, K8, K9 ve "onaylayan kişi" kullanıcı kararı.
- Plan 4'e kalanlar: onay bağlantısı ve karekod, ay sonu gönderimi, PDF, çok işli ekranın gruplama ve filtreleri.
- Plan 5'e kalan: e-fatura.

## Global Constraints

- **Komutlar:**
  - DB: `cd my-expo-app && supabase db query --linked -f <abs> [-o csv]`
  - Test: `find modules core app supabase/functions \( -name "*.test.mts" -o -name "*.test.ts" \) | grep -v node_modules | xargs node --test` (taban 595/595)
  - Tip kontrolü: `npx tsc --noEmit --incremental false`. ÖN PLANDA çalıştır, bitişini bekle, aynı anda iki tsc açma; sonuç 0 hata olmalı.
- **Her DB değişikliği beş adımla gider:**
  1. Değişen her nesnenin canlı tanımı ve `proacl` değeri `supabase/rollbacks/<ad>.before.txt` dosyasına alınır.
  2. Migration `supabase/migrations/<ad>.sql` dosyasına yazılır; `supabase/rollbacks/<ad>.down.sql` hazırlanır.
  3. `BEGIN … ROLLBACK` içinde probe çalıştırılır.
  4. **DUR:** kontrolör kullanıcıdan "Onaylıyorum, uygula" yanıtını alır.
  5. Uygula, ölç, commit et.
- **Göndericiler probe'larda ASLA çağrılmaz:** `_send_payment_reminder_core`, `send_payment_reminder*`, `run_auto_payment_reminders`, `send_payment_reminders_bulk` ve **`notifications` tablosuna INSERT** (tetikleyici `trg_whatsapp_meta_notify` WhatsApp gönderir).
  - Bildirim üreten kod `siman.skip_notify='on'` (transaction-yerel) bayrağına uyar. Probe'lar bu bayrağı açar ve `notifications` satır sayısının değişmediğini doğrular.
- **Yetki ve kişisel veri:**
  - Kimlik taklidi yalnız `set_config('request.jwt.claims', …, true)` ile yapılır; parola girilmez.
  - KVKK: çıktıda kişi adı ya da tutar yer almaz, yalnız sayımlar.
  - Ön ekstre kaleminde hasta adı yerine baş harfleri döner (§5 KVKK).
- **Tablo ve fonksiyon kuralları:**
  - Yeni tablo RLS'siz olmaz.
  - Yeni SECURITY DEFINER fonksiyonlarda `SET search_path = public` bulunur ve `revoke … from public, anon` yapılır.
  - Tenant: `lab_id` daima `labs`'a referans verir.
- **İstemci kuralları:**
  - node ile test edilen lib dosyalarında yerel içe aktarma yalnız `import type` olur.
  - Testlerde `setLanguage` çağrılmaz.
- **Arayüz kuralları (CLAUDE.md):**
  - tr/en/de/fa ve koyu tema aynı anda yapılır.
  - Kenar boşluğu `PAGE_PADDING`; popup'lar `U.modalOverlay` ile ortalanır.
  - İkon butonlarında `GlassTooltip` kullanılır.
  - Hata mesajı butonun yanında gösterilir.
  - Sol kenarı renkli kart kullanılmaz.
  - Yalnız HugeIcons (`core/ui/icons`).
- **Sözlük ve dokunulmaz dosyalar:**
  - Sözlükler yalnız hunk bazında stage edilir ("Tam kafa"/head-scan satırları başka oturumundur).
  - Dokunulmaz: `modules/ar-scanner/**`, `modules/viewer-3d/**`, `modules/orders/components/FaceScanQuickAction.tsx`.
- **Davranış korunur:** Ayar kapalıyken bugünkü akış birebir aynıdır (§3). Taslak tutar bakiye, hatırlatma ve gecikme hesaplarına girmez (§4).
- **Commit:** main üzerinde, push yok. Mesaj `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` satırıyla biter.

## Review Focus

1. **Onaydan hemen önce düzenlenen taslak (K6).**
   - Hekim ekranı açtıktan sonra lab bir taslağı düzenlerse, o taslak bu onayla kesinleşmez. Sonuçta "değişti, yeniden bakın" olarak döner.
   - Onay RPC'si istemcinin gördüğü `updated_at` değerini karşılaştırır.
2. **Yetki sınırı.**
   - Klinik içindeki yönetici olmayan hekim not yazabilir ama onaylayamaz.
   - Başka kliniğin ya da başka lab'ın taslağı RPC'ye verilirse sessiz atlanmaz, `PS_SCOPE` hatası döner.
   - Lab onayı gerekçesiz yapılamaz (`PS_REASON_REQUIRED`).
3. **Kısmi onay ve itiraz (K2).**
   - "İtirazsız kalemleri onayla" modunda, açık ya da yanıtlanmış itirazı olan kalemin bütün faturası taslakta kalır ve birleşmeye girmez.
   - "Çözüldü" durumundaki kalem tekrar onaylanabilir.
4. **Ayar açıkken onaysız kesme yolu yok.**
   - İstemcinin doğrudan `status='kesildi'` UPDATE'i `INV_APPROVAL_REQUIRED` hatası alır; buton yanında okunur metin gösterilir.
   - Ayar kapalıyken aynı UPDATE bugünkü gibi çalışır.
   - Mevcut kısmi→kesildi gibi sistem geçişleri etkilenmez.
5. **Birleştirme bütünlüğü.**
   - Birleşen faturanın toplamı kaynak taslakların toplamına eşittir (fatura-üstü indirim yoksa).
   - Her iş emri `invoice_orders`'ta tek aktif bağa sahiptir; `invoice_orders_one_active` tetikleyicisi hata vermez.
   - Farklı para birimindeki taslaklar ayrı faturalara gider, farklı aylar da ayrı faturalara.

---

### Task 1: Ayar, not/itiraz şeması ve okuma RPC'leri (DB)

**Files:**
- Create: `supabase/migrations/20261109100000_on_ekstre_sema.sql`
- Create: `supabase/rollbacks/20261109100000_on_ekstre_sema.before.txt`
- Create: `supabase/rollbacks/20261109100000_on_ekstre_sema.down.sql`
- Probe (commit edilmez): scratchpad `p3t1/probe.sql`

**Interfaces — Produces:**
- **Ayar sütunu:** `lab_settings.invoice_approval_enabled boolean not null default false`. Yazma yetkisi mevcut lab_settings RLS'iyle aynıdır.
- **`public._ps_actor(p_clinic_id uuid) returns text`** (STABLE, SECURITY DEFINER). Dönüş değerleri:
  - `'lab'`: çağıran bu kliniğin lab'ında `manage_finance` yetkisine sahip.
  - `'approver'`: `profiles.user_type='clinic_admin'` ve `profiles.clinic_id = p_clinic_id`. Kliniği olmayan bağımsız hekim için hekimin kendi kliniği (kliniğe bağlı hekim bilgisi `doctors`/`profiles.doctor_id` üzerinden çözülür; implementer canlı yapıyı rapora yazar).
  - `'viewer'`: aynı klinikte yönetici olmayan hekim.
  - `null`: hiçbiri.
- **Tablo `statement_item_disputes`:**
  - Sütunlar: `invoice_item_id uuid primary key references invoice_items on delete cascade`, `invoice_id uuid not null`, `lab_id uuid not null references labs`, `clinic_id uuid not null`, `status text not null check (status in ('acik','yanitlandi','cozuldu'))`, `updated_at timestamptz not null default now()`.
  - RLS: lab üyeleri ve `_ps_actor` null olmayan klinik kullanıcıları SELECT yapabilir. INSERT/UPDATE/DELETE yalnız RPC'ler üzerinden.
- **Tablo `statement_item_notes`:**
  - Sütunlar: `id uuid pk default gen_random_uuid()`, `invoice_item_id uuid not null references invoice_items on delete cascade`, `invoice_id uuid not null`, `lab_id uuid not null references labs`, `clinic_id uuid not null`, `author_id uuid not null`, `author_side text not null check (author_side in ('clinic','lab'))`, `body text not null check (length(btrim(body)) between 1 and 2000)`, `created_at timestamptz not null default now()`.
  - RLS aynı biçimde.
- **`public.get_pre_statement(p_clinic_id uuid) returns jsonb`** (STABLE, SECURITY DEFINER).
  - `_ps_actor` null ise `PS_SCOPE` (42501) hatası verir.
  - Dönen alanlar:
    - `enabled`: lab ayarı.
    - `actor`: `_ps_actor` sonucu.
    - `summary`: para birimi başına dizi `{currency, finalized_balance, overdue, pending}`. `finalized_balance` ve `overdue` mevcut `v_clinic_balance_ccy`'den (`balance`, `overdue_net`) gelir; `pending` taslakların `total` toplamıdır. Taslaklar ayar kapalıyken de sayılır.
    - `invoices`: bu kliniğin taslakları, issue_date/created_at artan. Her biri `{id, invoice_number, currency, issue_date, created_at, updated_at, total, items:[{id, description, quantity, unit_price, total, order_no, patient_initials, doctor_name, dispute_status, notes:[{id, author_side, body, created_at}]}]}`.
  - Hasta adı yalnız baş harflerle döner.
- **`public.add_statement_note(p_invoice_item_id uuid, p_body text) returns jsonb`** (SECURITY DEFINER).
  - Kalemin faturası `taslak` değilse `PS_NOT_DRAFT` hatası verir.
  - Not satırı yazar. Klinik tarafı itirazı `acik` yapar (yoksa oluşturur); lab tarafı `yanitlandi` yapar (yalnız itiraz satırı varsa).
  - Klinik notunda lab'ın `manage_finance` kullanıcılarına uygulama içi bildirim gider (K3): kategori `'payment'`, başlık `'Ön ekstre notu'`, gövdede klinik adı ve fatura no, `action_url` `/statement/<clinic_id>`. `siman.skip_notify='on'` ise bildirim yazılmaz.
  - Dönüş: `{note_id, dispute_status}`.
- **`public.resolve_statement_dispute(p_invoice_item_id uuid) returns jsonb`**: yalnız `'lab'` aktörü çağırabilir; itirazı `cozuldu` yapar.
- **Hata kodları:** `PS_SCOPE`, `PS_NOT_DRAFT`, `PS_BODY` (boş ya da uzun gövde). ERRCODE 22023, yetki için 42501.

- [ ] **Step 1: Yakala**
  - Etkilenen nesnelerin tanımlarını ve ACL'lerini `.before.txt`'ye yaz: lab_settings politikaları, `v_clinic_balance_ccy` (salt referans).
  - Canlıda klinik yönetici ve bağımsız hekim eşleşmesinin nasıl kurulduğunu raporla (yalnız sayımlar).
  - `profiles.user_type` değerleri: admin, clinic_admin, doctor, lab.
- [ ] **Step 2: Migration ve down yaz.**
- [ ] **Step 3: Probe (BEGIN … ROLLBACK, `siman.skip_notify='on'`)**
  - Sentetik lab dışı veri kullanılmaz: demo lab'ında sentetik klinik, iki hekim (biri `clinic_admin`), iki taslak ve kesilmiş bir fatura kurulur.
  - PASS/FAIL kontrolleri:
    - `actor_roles`: lab kullanıcısı `'lab'`, klinik yöneticisi `'approver'`, yönetici olmayan hekim `'viewer'`, başka klinik kullanıcısı `null` alır.
    - `get_scope`: başka klinik `PS_SCOPE` alır; dönen kalemlerde hasta adı tam olarak geçmez.
    - `summary_pending`: `pending` taslak toplamına eşit; `finalized_balance` view ile aynı.
    - `note_opens_dispute`: viewer notu itirazı `acik` yapar; lab notu `yanitlandi` yapar; resolve `cozuldu` yapar; viewer resolve deneyince `PS_SCOPE` alır.
    - `note_on_issued`: kesilmiş faturanın kalemine not `PS_NOT_DRAFT` alır.
    - `body_check`: boş gövde `PS_BODY` alır.
    - `no_notification_rows`: probe boyunca `notifications` sayısı değişmez.
    - `rls_direct`: `authenticated` rolüyle tablolara doğrudan INSERT reddedilir; SELECT yalnız kapsamdaki satırları döner.
    - `acl`: yeni fonksiyonlar anon'a kapalıdır.
  - Beklenen: tümü PASS.
- [ ] **Step 4: DUR.** Kontrolör onay alır.
- [ ] **Step 5: Uygula ve ölç.** Nesneler ve ACL'ler mevcut; probe'un salt-okur kısmı canlıda PASS.
- [ ] **Step 6: Commit:** `feat(on-ekstre): ayar, kalem notu/itiraz şeması ve okuma RPC'leri`

---

### Task 2: Onay, aylık birleştirme ve onaysız kesme kilidi (DB)

**Files:**
- Create: `supabase/migrations/20261109101000_on_ekstre_onay.sql`, `supabase/rollbacks/20261109101000_on_ekstre_onay.{before.txt,down.sql}`
- Probe: scratchpad `p3t2/probe.sql`

**Interfaces:**
- **Consumes:** Task 1'deki `_ps_actor`, tablolar ve ayar sütunu. Ayrıca mevcut `invoice_orders`, `invoice_orders_one_active`, `set_invoice_number` / `_trg_bulk_invoice_number`, `clinics.default_payment_terms_days`.
- **Produces:**
  - **Tablo `statement_approvals`:**
    - Sütunlar: `id uuid pk`, `lab_id uuid not null references labs`, `clinic_id uuid not null`, `approved_by uuid not null`, `via text not null check (via in ('panel','link','lab'))`, `mode text not null check (mode in ('all','undisputed'))`, `reason text`, `source_invoice_ids uuid[] not null`, `result_invoice_ids uuid[] not null`, `skipped jsonb not null default '[]'`, `created_at timestamptz default now()`.
    - Kural: `check (via <> 'lab' or length(btrim(coalesce(reason,''))) > 0)`.
    - RLS: lab üyeleri ve kliniğin `_ps_actor` kullanıcıları SELECT yapabilir; yazma yalnız RPC ile.
  - **`public._ps_finalize(p_clinic_id uuid, p_invoices jsonb, p_mode text, p_via text, p_reason text) returns jsonb`** (iç, SECURITY DEFINER, anon/authenticated'a kapalı).
    - `p_invoices = [{id, updated_at}]`.
    - Her öğe bu kliniğin, bu lab'ın `taslak` faturası değilse `PS_SCOPE` verir (tüm çağrı geri alınır).
    - Atlananlar `skipped` dizisine girer:
      - `updated_at` değeri istemcininkinden farklı olanlar → `reason:'changed'`.
      - `p_mode='undisputed'` iken `acik` ya da `yanitlandi` itirazlı kalemi olanlar → `reason:'disputed'`.
    - Kalanlar `(date_trunc('month', coalesce(issue_date, created_at::date)), currency)` başına gruplanır. Her grup için:
      - Tek taslak varsa olduğu gibi kesinleşir.
      - Birden çoksa en eski taslak hedef olur. Diğer taslakların `invoice_items` satırları hedefe taşınır (`invoice_id` güncellenir, `sort_order` korunarak sona eklenir). Kaynak taslakların `work_order_id` / `invoice_orders` bağları hedefe yazılır. Boşalan taslaklar silinir. Hedefin toplamları `recalc_invoice_totals` ile yeniden hesaplanır.
      - Fatura üstü indirimi olan taslak birleşmeye girmez, tek başına kesinleşir (ruling — indirimin hangi tabana uygulanacağı belirsizleşmesin).
      - Kesinleştirme: `set_config('siman.approval_issue','on', true)` açılır, ardından `status='kesildi'`, `issue_date = lab_today(lab)`, `due_date = issue_date + coalesce(clinics.default_payment_terms_days, eski due_date − eski issue_date, 30)` uygulanır (K8).
      - `mode='all'` iken kesinleşen faturaların açık itirazları `cozuldu` olur.
    - Bir `statement_approvals` satırı yazılır.
    - Lab'a uygulama içi bildirim gider ('Ön ekstre onaylandı'); `siman.skip_notify` bayrağına uyar. `via='lab'` iken bildirim yazılmaz.
    - Dönüş: `{approval_id, issued:[{invoice_id, invoice_number, currency, total}], skipped:[{invoice_id, reason}]}`.
  - **`public.approve_pre_statement(p_clinic_id uuid, p_invoices jsonb, p_mode text) returns jsonb`.**
    - Yalnız `_ps_actor = 'approver'` çağırabilir; değilse `PS_SCOPE`.
    - Ayar kapalıysa `PS_DISABLED`.
    - Çekirdeği `via='panel'` ile çağırır.
  - **`public.record_clinic_approval(p_clinic_id uuid, p_invoices jsonb, p_mode text, p_reason text) returns jsonb`.**
    - Yalnız `'lab'` çağırabilir. Gerekçe boşsa `PS_REASON_REQUIRED`.
    - Ayar kapalıyken de çalışır; ayar kapalıyken lab bu yol yerine bugünkü "Kesildi İşaretle"yi kullanır, istemci butonu göstermez.
    - Çekirdeği `via='lab'` ile çağırır.
  - **Tetikleyici `zz_invoice_approval_gate`** (BEFORE UPDATE OF status OR INSERT ON invoices).
    - Lab'ın `invoice_approval_enabled` değeri true iken iki geçişi engeller: `taslak` → `kesildi`/`kismi_odendi`/`odendi`, ve doğrudan `taslak` dışı durumla INSERT.
    - Bu geçişlerde `current_setting('siman.approval_issue', true)` 'on' değilse `INV_APPROVAL_REQUIRED` (42501) verir.
    - İptal ve diğer geçişler serbesttir.
    - Ad sıralaması `zzz_invoice_issued_lock` ile çakışmamalı; implementer seçimini açıklar.
- Kalem taşıma `zzz_invoice_items_issued_lock`'a takılmaz, çünkü hedef ve kaynak henüz taslaktır. Kesinleştirme kalemler taşındıktan SONRA yapılır.

- [ ] **Step 1: Yakala**
  - `invoice_orders_one_active`, `set_invoice_number`, `_trg_bulk_invoice_number`, `recalc_invoice_totals`, `create_bulk_invoice` (salt referans) ve invoices/invoice_items tetikleyici listesi `.before.txt`'ye alınır.
  - Canlıda taslak→kesildi geçişini yapan istemci dışı yolları listele (`recalc_invoice_payment_state` taslaktan başlamaz). `fn_generate_monthly_invoices` taslak üretir mi, doğrula.
  - Bildirim yolundaki tetikleyiciler: `trg_whatsapp_meta_notify` vardır, probe bildirim yazmaz.
- [ ] **Step 2: Migration ve down yaz.**
- [ ] **Step 3: Probe (BEGIN … ROLLBACK, `siman.skip_notify='on'`)**
  - Kurulum: demo lab'ında ayar açık, sentetik klinik ve aşağıdaki taslaklar.
  - PASS/FAIL kontrolleri:
    - `gate_blocks_direct`: ayar açıkken taslak→kesildi UPDATE'i `INV_APPROVAL_REQUIRED` verir; ayar kapalıyken aynı UPDATE geçer.
    - `gate_system_paths`: kesilmiş faturaya ödeme yazılınca `kismi_odendi`/`odendi` geçişleri hatasız çalışır.
    - `merge_same_month_ccy`: aynı ay ve TRY'de üç taslak (birinde iki kalem) tek faturada birleşir. Kalem sayısı 4, toplam = Σ kaynak, `invoice_orders`'ta üç bağ var, kaynak taslaklar silinmiş, sonuç `kesildi`, `issue_date` = lab_today.
    - `split_by_ccy_month`: EUR taslak ve geçen ayın taslağı ayrı faturalar olur.
    - `undisputed_mode`: `acik` itirazlı kalemi olan taslak `skipped(disputed)` olur ve taslak kalır. `cozuldu` itirazlı taslak kesinleşir.
    - `all_mode`: itirazlı taslak da kesinleşir ve itiraz `cozuldu` olur.
    - `changed_skip`: istemci `updated_at` değeri eskiyse `skipped(changed)`.
    - `scope`: başka kliniğin taslak id'si `PS_SCOPE` verir ve hiçbir değişiklik kalmaz.
    - `viewer_cannot_approve`: viewer `PS_SCOPE` alır; lab gerekçesiz `PS_REASON_REQUIRED` alır; lab gerekçeli `via='lab'` kaydı ve gerekçe yazar.
    - `disabled`: ayar kapalıyken `approve_pre_statement` `PS_DISABLED` verir.
    - `discount_not_merged`: fatura üstü indirimli taslak tek başına kesinleşir.
    - `receipt_credit_applies`: alacaklı fişi olan klinikte birleşen faturaya plan 2 tetikleyicisi ödeme yazar.
    - `no_notification_rows`, `acl`.
  - Beklenen: tümü PASS.
- [ ] **Step 4: DUR.** Kontrolör onay alır.
- [ ] **Step 5: Uygula ve ölç.** Canlıda ayar her lab için `false` (varsayılan); davranış değişmez. Ayarı açık lab sayısı 0 olmalı.
- [ ] **Step 6: Commit:** `feat(on-ekstre): onay, aylık birleştirme ve onaysız kesme kilidi`

---

### Task 3: İstemci saf kuralları ve API

**Files:**
- Create: `modules/invoices/lib/preStatement.ts`, `modules/invoices/lib/preStatement.test.mts`
- Create: `modules/invoices/preStatementApi.ts` (Supabase RPC sarmalayıcıları)
- Modify: `modules/invoices/types.ts` (tipler)

**Interfaces:**
- **Consumes:** Task 1 ve Task 2'deki RPC imzaları ile JSON biçimleri.
- **Produces (types.ts):**
  - `PreStatement`, `PreStatementInvoice`, `PreStatementItem`, `PreStatementNote` (Task 1'deki JSON alanlarıyla birebir).
  - `DisputeStatus = 'acik' | 'yanitlandi' | 'cozuldu'`
  - `PsActor = 'lab' | 'approver' | 'viewer'`
  - `ApprovalResult = { approval_id: string; issued: {invoice_id: string; invoice_number: string | null; currency: string; total: number}[]; skipped: {invoice_id: string; reason: 'changed' | 'disputed'}[] }`
- **Produces (preStatement.ts):**
  - `canApprove(actor: PsActor | null, enabled: boolean): boolean` — yalnız `approver && enabled`.
  - `invoiceHasOpenDispute(inv: PreStatementInvoice): boolean` — `acik` veya `yanitlandi`.
  - `approvalPayload(invoices: PreStatementInvoice[]): {id: string; updated_at: string}[]`
  - `undisputedCount(invoices): number`
  - `disputeLabel(s: DisputeStatus): string` — Türkçe kaynak metin: 'İtiraz' / 'Yanıtlandı' / 'Çözüldü'.
  - `preStatementErrorText(msg: string): string | null`. Eşleme:
    - `PS_SCOPE` → 'Bu ekstreye erişiminiz yok'
    - `PS_NOT_DRAFT` → 'Bu kalemin faturası kesinleşmiş'
    - `PS_BODY` → 'Not 1–2000 karakter olmalı'
    - `PS_DISABLED` → 'Lab bu ayarı kapattı'
    - `PS_REASON_REQUIRED` → 'Gerekçe zorunlu'
    - `INV_APPROVAL_REQUIRED` → 'Bu lab'da fatura klinik onayıyla kesinleşir; "Klinik adına onay kaydet"i kullanın'
    - diğer → null
  - `summarizeApproval(r: ApprovalResult): { issued: number; changed: number; disputed: number }`
- **Produces (preStatementApi.ts):**
  - `fetchPreStatement(clinicId): Promise<PreStatement>`
  - `addStatementNote(itemId, body)`
  - `resolveStatementDispute(itemId)`
  - `approvePreStatement(clinicId, invoices, mode)`
  - `recordClinicApproval(clinicId, invoices, mode, reason)`
  - Hatalar `Error(message)` olarak fırlatılır.
- `invoiceStatusErrorText` (`modules/invoices/lib/statementDiscount.ts`) `INV_APPROVAL_REQUIRED` kodunu tanır ve aynı metni verir.

- [ ] **Step 1: Failing test** (`preStatement.test.mts`). Her fonksiyon için en az bir pozitif ve bir negatif örnek:
  - `canApprove('viewer', true)` false, `canApprove('approver', false)` false.
  - `invoiceHasOpenDispute` `yanitlandi` için true, `cozuldu` için false.
  - `approvalPayload` id ve updated_at değerlerini korur.
  - `preStatementErrorText('… PS_REASON_REQUIRED …')` → 'Gerekçe zorunlu'.
  - `summarizeApproval` sayımları doğru verir.
- [ ] **Step 2:** `node --test modules/invoices/lib/preStatement.test.mts` → FAIL.
- [ ] **Step 3: Uygula.** Ayrıca `statementDiscount.test.mts` içine `INV_APPROVAL_REQUIRED` testi eklenir.
- [ ] **Step 4:** Testler PASS; tam suite yeşil; tsc 0 hata.
- [ ] **Step 5: Commit:** `feat(on-ekstre): saf kurallar ve API`

---

### Task 4: Klinik/hekim paneli — Ön ekstre ekranı

**Files:**
- Create: `modules/finance-clinic/screens/PreStatementScreen.tsx`
- Create: `modules/finance-clinic/components/StatementNoteSheet.tsx`
- Modify: `modules/finance-clinic/screens/FinanceHubScreen.tsx`. "Ön ekstre" sekmesi eklenir; klinik ve hekim panelleri bu hub'ı paylaşır.
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** Task 3 API ve kuralları.
- **Ekran içeriği:**
  - **Üstte üç rakam** (para birimi başına): kesinleşmiş bakiye, vadesi geçen, onay bekleyen. KPICardX kullanılır.
  - **Taslak listesi:** her taslak fatura satırı açılır ve kalemleri gösterir. Kalem satırında tarih, sipariş no, hasta baş harfleri, iş, adet, birim fiyat ve tutar bulunur; varsa itiraz rozeti (`U.chipTones`) ve not sayısı.
  - **Not:** kaleme dokununca `StatementNoteSheet` ortalanmış popup olarak açılır (`U.modalOverlay`). Mesaj dizisi ve yazma alanı içerir; gönder → `addStatementNote`.
  - **Onay butonları** yalnız `canApprove` true iken görünür: "İtirazsız kalemleri onayla (N)" ve "Tümünü onayla". Onay öncesi ortalanmış bir onay diyaloğu çıkar.
  - **Sonuç:** "N fatura kesinleşti". `changed` > 0 ise "Bazı faturalar siz bakarken değişti; yeniden gözden geçirin" yazar ve liste yenilenir.
  - **Bilgi satırları:**
    - Viewer'a: "Onayı klinik yöneticisi verir".
    - Ayar kapalıysa: sekme "Onay bekleyen fatura yok" boş durumunu gösterir; taslaklar görünmez (ayar kapalıyken bugünkü gibi).
  - Hatalar butonun yanında `preStatementErrorText` metniyle gösterilir.
  - Koyu tema token'larla yapılır; `PAGE_PADDING`; mobil ve masaüstü ayrı düşünülür (mobilde kart liste, masaüstünde tablo).

- [ ] **Step 1:** Ekranın veri dönüştürme mantığı Task 3'teki saf fonksiyonlarla yapılır. Ekranda yeni saf mantık gerekiyorsa önce `preStatement.ts`'e test edilerek eklenir.
- [ ] **Step 2: Uygula.**
- [ ] **Step 3: Doğrula**
  - Tam suite yeşil; tsc 0 hata.
  - Web önizlemede sahte Supabase test düzeniyle (bkz. memory "Sahte Supabase tarayıcı test düzeni") ya da demo hesabıyla jwt taklidi yapmadan ekran açılır.
  - Açık ve koyu temada ekran görüntüsü alınır.
  - Canlı hesapta kaydet/onay butonuna BASILMAZ.
- [ ] **Step 4: Commit:** `feat(on-ekstre): klinik/hekim panelinde ön ekstre`. Sözlükler `git add -p` ile.

---

### Task 5: Lab tarafı — ekstrede ön ekstre, itiraz yanıtı, klinik adına onay, ayar

**Files:**
- Modify: `modules/invoices/screens/ClinicStatementScreen.tsx`. Üste üç rakam ve en alta çerçeveli "Ön ekstre — onay bekliyor" bölümü gelir. Bölümün içeriği:
  - taslak kalemleri, itiraz rozetleri ve not dizisi;
  - lab yanıtı ve "Çözüldü" düğmesi;
  - "Klinik adına onay kaydet" düğmesi.

  Açık itiraz sayısı ekstrenin ÜSTÜNDE bir uyarı şeridinde görünür (§2.3).
- Create: `modules/invoices/components/LabApprovalModal.tsx`. Mod seçimi ve zorunlu gerekçe alanı içerir (placeholder örneği: "05.11.2026 telefon görüşmesine göre").
- Modify: `modules/invoices/screens/InvoiceDetailScreen.tsx`. Ayar açıkken `taslak` faturada "Kesildi İşaretle" yerine "Klinik adına onay kaydet" çıkar; bu düğme yalnız bu faturayı içeren `LabApprovalModal`'ı açar (K5).
- Modify: `modules/settings/sections/FinanceSection.tsx`. "Hekim/klinik onayıyla kesinleştir" anahtarı ve açıklama satırı eklenir. Açıklama: "Açıkken taslaklar klinik onayına kadar kesinleşmez; Kesildi İşaretle yerine Klinik adına onay kaydet çıkar."
- Create: `modules/invoices/components/StatementApprovalBadge.tsx`. Onay geçmişinde `via='lab'` kaydı "Lab tarafından kaydedildi · tarih · gerekçe" diye ayrı görünür. Hekim onayıyla aynı görünmez (anti-hedef 2).
- Modify: `core/i18n/locales/auto.{en,de,fa}.json`

**Interfaces:**
- **Consumes:** Task 3 API.
- `get_pre_statement` lab tarafında da kullanılır (`actor='lab'`). Onay geçmişi `statement_approvals` tablosundan RLS ile okunur: `select via, reason, created_at, approved_by from statement_approvals where clinic_id=… order by created_at desc limit 5`.

- [ ] **Step 1:** `StatementApprovalBadge` metnini üreten saf fonksiyon `approvalBadgeText(a: {via, reason, created_at}, fmtDate, tr): string` olarak `preStatement.ts`'e eklenir.
  - Test: `via='lab'` → `'Lab tarafından kaydedildi · 05.11.2026 · <gerekçe>'`
  - Test: `via='panel'` → `'Klinik onayladı · 05.11.2026'`
- [ ] **Step 2:** Test FAIL → uygula → PASS.
- [ ] **Step 3: Ekranları uygula.**
  - Ayar kapalıyken bölüm, şerit ve buton değişimi görünmez; açık temada ekran bit-bit aynıdır.
  - Ayar açıkken üç rakam görünür.
- [ ] **Step 4: Doğrula.**
  - Tam suite yeşil; tsc 0 hata.
  - Önizlemede açık ve koyu tema görüntüleri alınır.
  - Canlıda ayar AÇILMAZ ve kaydet butonuna basılmaz.
- [ ] **Step 5: Commit:** `feat(on-ekstre): lab ekstresinde ön ekstre, itiraz yanıtı ve klinik adına onay`. Sözlükler `git add -p` ile.
