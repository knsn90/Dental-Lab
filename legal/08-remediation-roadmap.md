# 08 — Prioritised Remediation Roadmap

**Companion to:** `01-data-inventory.md` … `07-compliance-gap-analysis.md`
**Generated:** 2026-07-23
**Target project:** Supabase `kjwjxqfdsxkxgcgophdy`, app `my-expo-app`

Every SQL statement below was written against **predicates and helper functions read from the live database**, not from memory. Where a fix depends on a fact I could not establish, the step says so and tells you how to establish it.

---

## 0. Two findings changed severity during roadmap preparation

### 0.1 R-03 escalates: all 20 RLS-bypassing views are granted to `anon`

`06-risk-report.md` rated R-03 CRITICAL but noted the severity depended on the `GRANT`s, which had not been enumerated. They have now been. Live result from `information_schema.role_table_grants`:

**All 20 views without `security_invoker` carry `SELECT` for both `anon` and `authenticated`** — in fact they carry the full `INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` set, which is the signature of a blanket `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated`.

`anon` is the role attached to the **publishable anon key, which is embedded in the shipped web bundle and mobile binaries**. Combined with a view that does not enforce RLS, this means:

| View | Readable by | Contents |
|---|---|---|
| `v_payroll_summary` | **anon** | every employee's name, role, base salary, deductions, net salary — all tenants |
| `order_timing_summary` | **anon** | **`patient_name`** + order numbers — all tenants |
| `v_unbilled_work_orders` | **anon** | **`patient_name`**, doctor name, clinic name, amounts — all tenants |
| `v_leave_summary` | **anon** | employee names + `sick_days` (health data) |
| `v_user_salary_summary`, `v_employee_summary`, `my_clinic_users`, `my_clinic_doctors`, +12 more | **anon** | salaries, names, phones, e-mails |

**I could not complete an empirical HTTP fetch to confirm exploitability — the sandbox blocked the outbound `curl`.** The grant evidence is strong but it is not the same as a reproduced read. Run this yourself before deciding the incident-response posture (substitute your anon key):

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
  'https://kjwjxqfdsxkxgcgophdy.supabase.co/rest/v1/v_payroll_summary?select=*&limit=1' \
  -H "apikey: $SUPABASE_ANON_KEY"
```

`200` with a non-empty body confirms unauthenticated cross-tenant disclosure of payroll and patient data. That is a reportable personal-data breach under GDPR Art. 33 (72 hours) and KVKK m.12, and it changes P0 from "harden" to "contain, then assess notification." **Treat R-03 as the first thing you fix.**

### 0.2 New finding R-21: 165 orphaned files in `work-order-photos`

Path analysis of `storage.objects` (266 objects in the bucket) returned:

| Prefix pattern | Objects | Resolvable |
|---|---|---|
| `orders/{work_order_id}/…` | 194 | **only 45 have a matching `work_orders` row — 149 are orphaned** |
| `drafts/{user_id}/…` | 67 | prefix resolves to a `profiles` row in 67 of 67 |
| bare `{uuid}/…` (legacy) | 7 | **0 resolve to an order — unattributable** |

Also: `work_order_photos` has 58 metadata rows against 266 objects, and `chat-attachments` has 21 objects of which **9 do not resolve to a live order**.

This matters twice over. It is a **retention finding** — 165 files of patient scans and photographs persist with no owning record, unreachable by any erasure routine because nothing points at them. And it is a **migration blocker**: the join-based storage policy in P0-2 would render those 165 objects unreadable the moment it is applied. They must be inventoried and dispositioned **before** the policy lands, not after.

---

## 1. Migration order

Apply strictly in this sequence. Each migration is idempotent and each has a stated rollback.

| # | File | Fixes | Breaking? | Effort |
|---|---|---|---|---|
| 1 | `20260724_0001_view_security_invoker.sql` | R-03 | **Breaking (intended)** | 0.5 d + 1 d QA |
| 2 | `20260724_0002_revoke_anon_grants.sql` | R-03 | **Breaking (intended)** | 0.5 d |
| 3 | `20260724_0003_storage_orphan_inventory.sql` | R-21 | No — read-only | 0.5 d |
| 4 | `20260724_0004_storage_policies_wop.sql` | R-02 | **Breaking** | 1 d + 2 d QA |
| 5 | `20260724_0005_storage_policies_chat.sql` | R-02 | **Breaking** | 1 d |
| 6 | `20260724_0006_storage_policies_logos.sql` | R-02 | Backward-compatible | 0.5 d |
| 7 | `20260724_0007_consents_table.sql` | R-01 | Additive | 1 d |
| 8 | `20260724_0008_secrets_hardening.sql` | R-15 | **Breaking (OTP)** | 1.5 d |
| 9 | `20260724_0009_retention_jobs.sql` | R-05 | **Destructive** | 2 d |
| 10 | `20260724_0010_erasure_complete.sql` | R-06 | Additive | 2 d |
| 11 | `20260724_0011_activity_log_structured.sql` | R-07 | Backward-compatible | 1.5 d |

Repository convention (from `project_supabase_mcp_unauthorized` and `project_edge_function_deploy`): migrations live in `my-expo-app/supabase/migrations/`; edge functions deploy with
`supabase functions deploy <name> --project-ref kjwjxqfdsxkxgcgophdy --workdir my-expo-app --use-api`.

---

# P0 — Contain (days 1–5)

## P0-1 · R-03 · Views bypass RLS and are granted to `anon`

**Effort:** 0.5 d migration + 1 d regression QA · **Breaking: yes, intentionally**

### Affected

- **Migrations:** `20260724_0001_view_security_invoker.sql`, `20260724_0002_revoke_anon_grants.sql`
- **DB objects:** the 20 views listed below
- **React consumers to re-test:** `modules/payroll/*`, `modules/hr/*`, `modules/performance/*`, `modules/finance/*`, `modules/invoices/screens/ClinicBalanceScreen.tsx`, `modules/stock/*`, `modules/clinic/*`, `modules/dashboard/*`
- **Edge Functions:** none read these views directly — they use the service role, which is unaffected by `security_invoker`

### Step 1 — flip `security_invoker`

```sql
-- 20260724_0001_view_security_invoker.sql
do $$
declare v text;
begin
  foreach v in array array[
    'my_clinic_doctors','my_clinic_users','order_timing_summary','stage_timing_confidence',
    'v_attendance_monthly','v_budget_actuals','v_cash_account_summary','v_employee_summary',
    'v_expiring_documents','v_invoice_reminders','v_leave_summary','v_low_stock',
    'v_monthly_finance_summary','v_monthly_finance_summary_ccy','v_payroll_summary',
    'v_performance_summary','v_technician_performance_detail','v_unbilled_work_orders',
    'v_upcoming_due_invoices','v_user_salary_summary'
  ] loop
    execute format('alter view public.%I set (security_invoker = on)', v);
  end loop;
end $$;
```

### Step 2 — revoke the blanket grants

```sql
-- 20260724_0002_revoke_anon_grants.sql
do $$
declare v text;
begin
  foreach v in array array[ /* same 20 names */ ] loop
    execute format('revoke all on public.%I from anon', v);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', v);
    execute format('grant select on public.%I to authenticated', v);
  end loop;
end $$;

-- stop the pattern recurring
alter default privileges in schema public revoke all on tables from anon;
```

### Why this order

Flipping `security_invoker` first means that even during the window between the two migrations, an `anon` caller gets zero rows (RLS applies, `auth.uid()` is null). Revoking first would leave `authenticated` users briefly reading unfiltered data through views that still bypass RLS.

### Breaking-change analysis

`security_invoker = on` makes each view apply the caller's RLS. Any screen that previously received cross-tenant rows now receives only its own. **This is the fix, but it will surface as "data disappeared" bugs** in any screen that was silently relying on the leak. The 11 views already running `security_invoker` (`v_clinic_balance`, `v_active_orders_kanban`, `v_technician_performance`, `supplier_balances`, `bottleneck_stations`, `machine_live_status`, `station_performance_summary`, `v_clinic_balance_ccy`, `v_employee_advances_ccy`, `v_employee_salary_ccy`, `v_station_analytics`) prove the pattern works in this codebase.

Watch specifically for views whose base tables are reached through a join the RLS policy does not cover — `v_payroll_summary` joins `employee_payroll` to `employees`; if `employees` RLS is `lab_id = get_my_lab_id()` and `employee_payroll` is too, the view is fine. Verify per view with a real non-admin session before shipping.

### Verification

```sql
select c.relname,
       coalesce((select option_value from pg_options_to_table(c.reloptions)
                 where option_name='security_invoker'),'NOT SET') as inv,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='v' order by inv, c.relname;
-- expected: every row inv='on', anon_select=false
```

### Rollback

`alter view public.<name> set (security_invoker = off);` — but only as an emergency measure, and only for the specific view that broke a screen. Never roll back the `anon` revoke.

---

## P0-2 · R-02 · `work-order-photos` has no tenant isolation

**Effort:** 1 d + 2 d QA · **Breaking: yes** · **Depends on: P0-1b (orphan inventory)**

### Affected

- **Storage policies:** `"Authenticated users can upload photos"` (INSERT), `"Users can view photos of accessible orders"` (SELECT) — both to be dropped
- **Migrations:** `20260724_0003_storage_orphan_inventory.sql`, `20260724_0004_storage_policies_wop.sql`
- **React:** `modules/orders/screens/NewOrderScreen.tsx` (upload paths `:1439`, `:1579`, `:7696`), `modules/orders/components/StageFileUpload.tsx`, `modules/orders/utils/uploadFaceScanResult.ts`, `modules/triage/api.ts`, `modules/reviews/api.ts`, `modules/approvals/DesignApprovalInbox.tsx`, `modules/denty/tools.ts`, `core/storage/uploadWithProgress.ts`
- **Edge Functions:** `medit-webhook` (service role — unaffected)

### The good news

The **`work_order_photos` table** RLS is already correct and is the model to copy. Live predicates:

```
photos_select_lab      SELECT  is_lab_user() AND lab_id = get_my_lab_id()
photos_select_doctor   SELECT  EXISTS (select 1 from work_orders wo
                                       where wo.id = work_order_photos.work_order_id
                                         and wo.doctor_id = auth.uid())
clinic_admin_view_clinic_photos SELECT  is_clinic_admin() AND my_clinic_id() IS NOT NULL
                                        AND EXISTS (…doctor's clinic = my_clinic_id()…)
photos_insert_lab / photos_insert_doctor / clinic_admin_insert_clinic_photos
photos_delete_lab      DELETE  is_lab_user() AND lab_id = get_my_lab_id()
```

Helper functions confirmed present: `get_my_lab_id()`, `is_lab_user()`, `is_clinic_admin()`, `my_clinic_id()`, `is_platform_admin()` — all `STABLE SECURITY DEFINER` with `search_path=public`.

So this is not a design problem. The storage layer simply never mirrored the table layer.

### Step 1 — inventory the orphans first (do not skip)

```sql
-- 20260724_0003_storage_orphan_inventory.sql  (read-only, creates a work table)
create table if not exists public.storage_orphan_audit (
  id bigserial primary key,
  bucket_id text not null,
  object_name text not null,
  path_shape text not null,      -- 'orders' | 'drafts' | 'legacy'
  resolves boolean not null,
  size_bytes bigint,
  created_at timestamptz,
  disposition text,              -- to be filled by a human: 'keep'|'delete'|'reattach'
  noted_at timestamptz not null default now()
);

insert into public.storage_orphan_audit
  (bucket_id, object_name, path_shape, resolves, size_bytes, created_at)
select o.bucket_id, o.name,
       case when split_part(o.name,'/',1) in ('orders','drafts')
            then split_part(o.name,'/',1) else 'legacy' end,
       case
         when split_part(o.name,'/',1)='orders'
           then exists (select 1 from public.work_orders w
                        where w.id::text = split_part(o.name,'/',2))
         when split_part(o.name,'/',1)='drafts'
           then exists (select 1 from public.profiles p
                        where p.id::text = split_part(o.name,'/',2))
         else false
       end,
       (o.metadata->>'size')::bigint, o.created_at
from storage.objects o
where o.bucket_id in ('work-order-photos','chat-attachments')
  and not exists (select 1 from public.storage_orphan_audit a
                  where a.bucket_id=o.bucket_id and a.object_name=o.name);
```

Expected from current data: **149** `orders/` orphans, **7** `legacy` unattributable, **9** `chat-attachments` orphans. Someone must set `disposition` on each before P0-2 Step 2 ships — these are patient scans and photographs, so "delete" is a decision with legal weight, not a cleanup chore. Route it through whoever will own the retention policy (P1-4).

### Step 2 — replace the storage policies

```sql
-- 20260724_0004_storage_policies_wop.sql
drop policy if exists "Authenticated users can upload photos" on storage.objects;
drop policy if exists "Users can view photos of accessible orders" on storage.objects;

-- helper: can the caller reach this work order?
create or replace function public.can_access_work_order(p_order uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from work_orders wo
    where wo.id = p_order
      and (
        (is_lab_user() and wo.lab_id = get_my_lab_id())
        or wo.doctor_id = auth.uid()
        or (is_clinic_admin() and my_clinic_id() is not null and (
              exists (select 1 from profiles p_doc
                      where p_doc.id = wo.doctor_id and p_doc.clinic_id = my_clinic_id())
           or exists (select 1 from doctors d_doc
                      where d_doc.id = wo.doctor_id and d_doc.clinic_id = my_clinic_id()))
        )
        or is_platform_admin()
      )
  );
$$;

-- orders/{work_order_id}/…  → order-scoped
create policy wop_select_orders on storage.objects for select to authenticated
using (
  bucket_id = 'work-order-photos'
  and split_part(name,'/',1) = 'orders'
  and public.can_access_work_order(nullif(split_part(name,'/',2),'')::uuid)
);

create policy wop_insert_orders on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-order-photos'
  and split_part(name,'/',1) = 'orders'
  and public.can_access_work_order(nullif(split_part(name,'/',2),'')::uuid)
);

-- drafts/{user_id}/… → owner-scoped (verified: prefix resolves to profiles.id in 67/67)
create policy wop_select_drafts on storage.objects for select to authenticated
using (
  bucket_id = 'work-order-photos'
  and split_part(name,'/',1) = 'drafts'
  and split_part(name,'/',2) = auth.uid()::text
);

create policy wop_insert_drafts on storage.objects for insert to authenticated
with check (
  bucket_id = 'work-order-photos'
  and split_part(name,'/',1) = 'drafts'
  and split_part(name,'/',2) = auth.uid()::text
);

-- deletion: previously IMPOSSIBLE (no policy existed) — required for erasure
create policy wop_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'work-order-photos'
  and (
    (split_part(name,'/',1)='orders'
       and public.can_access_work_order(nullif(split_part(name,'/',2),'')::uuid)
       and is_lab_user())
    or (split_part(name,'/',1)='drafts' and split_part(name,'/',2)=auth.uid()::text)
    or is_platform_admin()
  )
);
```

`nullif(...,'')::uuid` guards against a malformed path throwing `invalid input syntax for type uuid` and turning a policy evaluation into a 500.

### Breaking-change analysis

| Change | Impact |
|---|---|
| Cross-tenant reads stop | **Intended.** No legitimate flow depended on this |
| 149 `orders/` orphans become unreadable | **Real breakage** — mitigated by Step 1 disposition |
| 7 `legacy` bare-uuid objects become unreadable | **Real breakage** — no policy matches them; they must be re-pathed or deleted in Step 1 |
| DELETE becomes possible | **New capability**, required by P1-5 erasure |
| Upload paths | Unchanged — the client already writes `orders/{id}/…` and `drafts/{uid}/…` |

### Verification

Sign in as a technician of lab A and attempt to read an object under an order belonging to lab B. Expect `400`/empty. Repeat as a doctor for another doctor's order, and as a clinic admin for a doctor outside their clinic.

---

## P0-3 · R-02 · `chat-attachments` and `occlusion-screenshots` are public buckets

**Effort:** 1 d · **Breaking: yes — stored public URLs stop resolving**

### Affected

- **React:** `modules/orders/chatApi.ts:419` (`const BUCKET='chat-attachments'`), `:440-445` (upload → `getPublicUrl()`), `:407-411` (delete)
- **DB:** `order_messages.attachment_url` (existing rows hold public URLs), `storage.buckets`
- **Migration:** `20260724_0005_storage_policies_chat.sql`

### The subtlety that makes this breaking

`order_messages.attachment_url` currently stores **permanent public URLs**. Flipping the bucket to private makes every historical URL 400. Signed URLs expire, so they cannot simply be written into that column. The correct shape is to **store the object path and mint a signed URL at render time**.

### Step 1 — code change first, deploy, then flip the bucket

```ts
// modules/orders/chatApi.ts — replace getPublicUrl at :445
const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
if (error) throw error;
// store the PATH, not a URL
return { attachment_url: path, attachment_type: file.type, attachment_name: file.name };

// new: resolve at render time
export async function signedChatUrl(path: string, expiresIn = 3600): Promise<string | null> {
  if (/^https?:\/\//.test(path)) {                 // legacy absolute URL — migrate lazily
    const marker = `/${BUCKET}/`;
    const i = path.indexOf(marker);
    if (i === -1) return path;
    path = path.slice(i + marker.length);
  }
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return error ? null : data.signedUrl;
}
```

The legacy branch means old rows keep working without a data migration — the path is recovered from the stored URL. Ship this, confirm it renders, **then** flip the bucket.

### Step 2 — flip and scope

```sql
-- 20260724_0005_storage_policies_chat.sql
update storage.buckets set public = false
 where id in ('chat-attachments','occlusion-screenshots');

drop policy if exists chat_attach_select on storage.objects;
drop policy if exists chat_attach_insert on storage.objects;

-- chat-attachments path = {work_order_id}/{ts}_{name}  (verified: 12/21 resolve)
create policy chat_select on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and public.can_access_work_order(nullif(split_part(name,'/',1),'')::uuid)
);

create policy chat_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and public.can_access_work_order(nullif(split_part(name,'/',1),'')::uuid)
);

create policy chat_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and (owner = auth.uid() or is_platform_admin())
);

-- occlusion-screenshots: no policies exist at all; service-role writes only.
create policy occl_select on storage.objects for select to authenticated
using (
  bucket_id = 'occlusion-screenshots'
  and public.can_access_work_order(nullif(split_part(name,'/',1),'')::uuid)
);
```

**Caveat on `occlusion-screenshots`:** I could not establish its path convention — the bucket is empty of resolvable samples. Confirm the writer's path shape before applying `occl_select`, or the policy will match nothing. Grep the 3D viewer upload site first.

**Caveat on `chat_delete`:** `owner` is populated on only 12 of 21 objects, so owner-based deletion will not reach the 9 objects with a null owner. Platform admins can still remove them.

---

## P0-4 · R-02 · `lab-logos` writable by any tenant

**Effort:** 0.5 d · **Backward-compatible**

```sql
-- 20260724_0006_storage_policies_logos.sql
drop policy if exists lab_logos_upload_authenticated on storage.objects;
drop policy if exists lab_logos_update_authenticated on storage.objects;
drop policy if exists lab_logos_delete_authenticated on storage.objects;

-- path = {lab_id}/…  plus the reserved _brand/ prefix (verified from live objects)
create policy lab_logos_write on storage.objects for insert to authenticated
with check (
  bucket_id = 'lab-logos'
  and split_part(name,'/',1) = get_my_lab_id()::text
);

create policy lab_logos_update on storage.objects for update to authenticated
using (bucket_id='lab-logos' and split_part(name,'/',1) = get_my_lab_id()::text);

create policy lab_logos_delete on storage.objects for delete to authenticated
using (bucket_id='lab-logos' and split_part(name,'/',1) = get_my_lab_id()::text);
-- lab_logos_read_public stays: logos are embedded in outbound e-mail and must stay public.
-- _brand/ is now writable only by the service role, protecting the asset at
-- send-email-notification/index.ts:44.
```

**React:** `modules/settings/sections/GeneralSection.tsx` must upload to `{lab_id}/…`. Confirm it already does — live objects show `243ef1db-…/logo-*.png`, which suggests yes.

---

## P0-5 · R-16 · E-mail leaks approval tokens to QRServer

**Effort:** 2 h · **Backward-compatible**

**File:** `my-expo-app/supabase/functions/send-email-notification/index.ts:421`

Currently every e-mail open sends the recipient's IP, user agent **and the full action link — including `doctor_approval_token`** — to `api.qrserver.com`.

Simplest correct fix is to delete the QR block and keep the text link:

```ts
// remove the <img src="https://api.qrserver.com/..."> entirely
// keep the existing anchor:  <a href="${link}">…</a>
```

If the QR is genuinely needed for a scan-from-desk workflow, generate it in the function and attach it as a CID inline image, or render an SVG QR server-side — but do not send the link to a third party.

Deploy:
```
supabase functions deploy send-email-notification \
  --project-ref kjwjxqfdsxkxgcgophdy --workdir my-expo-app --use-api
```

---

## P0-6 · R-17 · Live privacy policy has placeholder controller identity

**Effort:** 1 h (once legal supplies the text) · **Not a code change**

**File:** `siman-legal/index.html` — replace `[Şirket / işletme ünvanı]`, `[Açık adres]`, `[gizlilik@siman.app]`; delete the yellow "Yayın öncesi doldurulacak" banner; add the 12 missing recipients from `04-third-party-data-flow.md` §1; correct §5 so the deletion claim matches what P1-5 actually implements; add the KVKK/DPA complaint right to §6; add a version number to both pages.

Deploy: `cd siman-legal && vercel deploy --prod --yes`.

---

# P1 — Lawful basis and lifecycle (weeks 2–5)

## P1-1 · R-01 · Consent is never recorded

**Effort:** 1 d migration + 2 d UI · **Additive, then blocking**

### Affected
- **Migration:** `20260724_0007_consents_table.sql`
- **React:** `modules/auth/screens/RegisterDoctorScreen.tsx`, `RegisterClinicScreen.tsx`, `RegisterLabScreen.tsx`, `modules/auth/api.ts:23-148`
- **New component:** `modules/auth/components/ConsentGate.tsx`

### Why a table, not the existing column

`profiles.kvkk_accepted_at` is a single nullable timestamp. It cannot record *which version* was accepted, cannot express granular opt-ins, and cannot survive withdrawal-then-reconsent. GDPR Art. 7(1) requires you to *demonstrate* consent. Keep the column (something may read it) but stop treating it as the record.

```sql
-- 20260724_0007_consents_table.sql
create table if not exists public.user_consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in
                  ('privacy_policy','terms','ai_processing','marketing_whatsapp',
                   'marketing_sms','international_transfer')),
  granted       boolean not null,
  document_version text,
  granted_at    timestamptz not null default now(),
  ip            inet,
  user_agent    text,
  withdrawn_at  timestamptz
);
create index if not exists user_consents_user_kind_idx
  on public.user_consents(user_id, kind, granted_at desc);

alter table public.user_consents enable row level security;

create policy consents_self_read on public.user_consents
  for select to authenticated using (user_id = auth.uid() or is_platform_admin());
create policy consents_self_insert on public.user_consents
  for insert to authenticated with check (user_id = auth.uid());
-- deliberately NO update/delete policy: consent history is append-only.

create or replace function public.current_consent(p_user uuid, p_kind text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select granted and withdrawn_at is null
    from user_consents
    where user_id = p_user and kind = p_kind
    order by granted_at desc limit 1
  ), false);
$$;
```

### UI

Add a blocking `ConsentGate` to all three register screens: two required checkboxes (privacy policy, terms — each linking to `siman-legal.vercel.app` with the version shown) and separate optional toggles for AI processing, WhatsApp/SMS, international transfer. Write one `user_consents` row per decision immediately after `signUp()` succeeds. For the 14 existing users, gate at next login until they answer.

**Note the ordering dependency:** the AI consent toggle is only meaningful once P1-2 gives it something to switch off.

## P1-2 · R-09 · AI kill switch and disclosure logging

**Effort:** 2 d · **Backward-compatible**

- **Edge Function:** `my-expo-app/supabase/functions/denty-brain/index.ts`
- **React:** `modules/denty/context.ts` (mount gate), `modules/settings/*` (tenant toggle)

Three changes:

1. **Per-tenant switch** using the existing `lab_feature_flags(lab_id, key, enabled)` table — key `ai_assistant`. Check it server-side in `denty-brain` before the Anthropic call and hide the assistant client-side in `context.ts` when off.
2. **Model allowlist** — `denty-brain` currently accepts `body.model` unvalidated. Constrain to a set constant.
3. **Fail closed on quota** — the `denty_consume_quota` call is wrapped in `try { … } catch (_) { /* no limit */ }` and skipped entirely when `SUPABASE_SERVICE_ROLE_KEY` is absent. Invert: if the quota check cannot run, refuse.
4. **Disclosure log** — a new `ai_disclosure_log(user_id, lab_id, tool_names[], table_names[], row_count, model, created_at)` row per turn. Without this, an Art. 15 request about AI processing has no answer. Log the *shape* of what was sent, not the payload — logging the payload would duplicate the health data.

## P1-3 · R-15 · Plaintext OTPs and third-party credentials

**Effort:** 1.5 d · **Breaking for the OTP flow**

- **Migration:** `20260724_0008_secrets_hardening.sql`
- **Edge Functions:** `send-otp/index.ts` (hash before insert), `verify-otp/index.ts` (compare hashes)

```sql
create extension if not exists pgcrypto;
alter table public.phone_verifications add column if not exists code_hash text;
-- send-otp writes crypt(code, gen_salt('bf')); verify-otp compares with crypt()
-- after both functions are deployed and a full OTP cycle is confirmed:
--   alter table public.phone_verifications drop column code;
```

Deploy `send-otp` and `verify-otp` **together** — a mismatch breaks phone verification for everyone.

For `provider_credentials.credentials` (per-tenant e-Fatura and payment API keys in a plain `jsonb` column, read at `efatura-send/index.ts:60` and `payments-charge/index.ts:68`): move to Supabase Vault, or encrypt with `pgsodium` and decrypt inside a `SECURITY DEFINER` accessor. This is a **1-day change on its own** and touches both edge functions; sequence it after the OTP work so you are not deploying four functions at once.

## P1-4 · R-05 / R-21 · Retention

**Effort:** 2 d · **Destructive — requires signed-off retention schedule first**

- **Migration:** `20260724_0009_retention_jobs.sql`
- **New Edge Function:** `storage-retention-worker` (consumes `storage_cleanup_queue`, which currently has no consumer at all)

Do not write these jobs until legal has signed the retention schedule. Suggested starting points, all **UNKNOWN until confirmed**:

| Data | Suggested | Constraint |
|---|---|---|
| `phone_verifications` | 24 h | none |
| `gps_pings` | 30–90 d | employee monitoring proportionality |
| `auth.audit_log_entries`, `auth.sessions` | 12 mo | security investigation needs |
| `activity_logs`, `order_events`, `stage_activity_events` | 12–24 mo | audit obligations |
| `email_notifications`, `whatsapp_notifications` | 6–12 mo | delivery-dispute window |
| `payment_attempts`, `efatura_logs` | 10 yr | **TR commercial-book retention** |
| `invoices`, `payments`, payroll | 10 yr / labour law | **statutory** |
| `work_orders` + patient data | UNKNOWN | **the hard question — medical-record retention vs. minimisation** |
| Storage objects | follow the owning record | needs P0-2 orphan disposition first |

Pattern:
```sql
select cron.schedule('retention-daily','0 3 * * *', $$
  delete from public.phone_verifications where created_at < now() - interval '24 hours';
  delete from public.gps_pings         where recorded_at < now() - interval '90 days';
  -- …one line per signed-off rule…
$$);
```

## P1-5 · R-06 · Complete the erasure routine

**Effort:** 2 d · **Additive** · **Depends on P0-2 (DELETE policies must exist first)**

- **Migration:** `20260724_0010_erasure_complete.sql`
- **Edge Function:** `delete-account/index.ts` — extend
- **React:** `modules/profile/screens/ProfileScreen.tsx` — add the missing desktop-web delete control (currently only `DoctorProfileMobile.tsx` has one)

`admin_anonymize_user` is currently three lines and leaves `email`, `tc_kimlik_no`, `birth_date`, `gender`, `address`, `city`, `diploma_no`, `avatar_url`, `whatsapp_phone` intact. `admin_purge_lab_pii` touches four tables and **no storage objects**. `delete-account` deletes no files.

Build one `erase_subject(p_user uuid, p_mode text)` routine that enumerates every table in `01-data-inventory.md` holding subject-linked data, plus a storage sweep across all eight buckets, and writes the affected row/object counts to `platform_audit_log`. Then have all three entry points call it.

## P1-6 · R-08 · Vendor contracts

**Effort:** legal-led, 2–4 weeks elapsed · **No code**

Twenty external recipients, zero contracts. Priority order by data sensitivity: **Anthropic** (patient health data — negotiate zero-retention), **Supabase** (everything), **Resend**, **Twilio**, **Expo**, **Medit**, then the rest. Also establish the **Supabase hosting region** — it is not declared in `app.json`, `.env.local`, `vercel.json` or `eas.json`, and it determines whether an international transfer occurs at all.

---

# P2 — Structural (weeks 6–12)

| ID | Fix | Files | Effort | Breaking |
|---|---|---|---|---|
| P2-1 · R-10 | DPIA for health data + employee GPS/attendance + AI | none (document) | 1 wk legal | No |
| P2-2 · R-07 | Restructure `activity_logs`: names into `entity_label`/`metadata`, redactable on erasure; stop `log_activity()` swallowing all exceptions (`EXCEPTION WHEN OTHERS THEN RETURN NULL` hides audit-write failures) | `20260724_0011_activity_log_structured.sql`, all `log_activity()` call sites | 1.5 d | Backward-compatible |
| P2-3 · R-12 | Make `patient_id` (TC kimlik) and `patient_nationality` optional; remove or justify `patient_gender`; resolve `patient_phone` — currently collected at `:159`, submitted at `:1851`, printed to PDF at `:2524`, cached in `localStorage`, and **discarded by the DB because no column exists** | `NewOrderScreen.tsx:1238-1241`, `:1851`, `:2524` | 0.5 d | Backward-compatible |
| P2-4 · R-13 | Move `newOrderDraft:v1` into `expo-secure-store` (already a dependency); clear on sign-out; add TTL | `NewOrderScreen.tsx:240,626,832,885,889,898` | 1 d | Backward-compatible |
| P2-5 · MFA | Enrol + enforce for lab admins and platform admins. `auth.mfa_factors` exists but the app never calls `mfa.enroll`/`mfa.challenge` | `modules/auth/*`, `modules/settings/*` | 3 d | Additive |
| P2-6 · R-18 | Supabase session into `expo-secure-store` on native | `core/api/supabase.ts` | 0.5 d | Users re-login once |
| P2-7 · R-14 | Disclose or replace the Web Speech API transfer — Chrome/Edge stream dictated audio (often naming patients) to Google | `modules/denty/useSpeechRecognition.ts`, privacy policy | 0.5 d | No |
| P2-8 · R-11 | Document human review in performance scoring; expose scores to the employee; add a contest route | `modules/performance/*`, `modules/hr/*` | 2 d | Additive |
| P2-9 · R-04 | Patient-rights channel via the lab; patient-notice template for clinics | new module + document | 1 wk | Additive |
| P2-10 · R-19 | Create the missing `purchase-invoices` bucket (referenced at `modules/purchases/components/PurchaseFormModal.tsx`, does not exist); establish where `deliveries.signature_path` and `payment_submissions.receipt_url` actually write — **no `storage.from()` call was found for either** | migration + those modules | 1 d | Fixes a broken path |
| P2-11 | Pin edge-function imports — every function fetches `https://esm.sh` / `https://deno.land/std@…` at cold start | all 24 functions | 1 d | No |
| P2-12 | Self-service Art. 15/20 export; remove the silent 5 000-row truncation in `admin_export_lab_data` | new RPC + UI | 3 d | Additive |

---

## Effort summary

| Phase | Engineering | Legal/ops | Elapsed |
|---|---|---|---|
| **P0** | ~5 d | 1 d (policy text) | **1 week** |
| **P1** | ~10 d | 2–4 wk (contracts, retention sign-off) | **4 weeks** |
| **P2** | ~18 d | 2 wk (DPIA) | **6 weeks** |
| **Total** | **~33 engineering days** | | **~11 weeks** |

P0 is small — five days of work — because the hard architecture is already right. `work_order_photos` table RLS, the `employee-docs`/`paper-orders`/`support-attachments` storage policies, and the 11 views already running `security_invoker` are all correct and are the templates the fixes copy. What you are repairing is drift, not design.

## Sequencing constraints

```
P0-1 (views) ─────────────────► independent, do first
P0-1b (orphan inventory) ─────► MUST precede P0-2
       └─ human disposition of 165 files ─┐
P0-2 (work-order-photos) ◄───────────────┘
       └──────────────────────► P1-5 (erasure needs DELETE policies)
P0-3 (chat) : code deploy ────► then bucket flip. Never the reverse.
P1-1 (consent table) ─────────► P1-2 AI toggle gives the AI consent meaning
P1-3 : deploy send-otp + verify-otp TOGETHER
P1-4 (retention) ◄──── blocked on signed retention schedule
```

## Before you start

Confirm the anon-key read in §0.1. If it returns data, this stops being a remediation project and starts being an incident: contain (P0-1 immediately), preserve logs, assess Art. 33 notification within 72 hours of becoming aware, and only then resume the roadmap.
