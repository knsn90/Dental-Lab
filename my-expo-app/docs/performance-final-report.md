# Performance Certification Report — Siman

**Date:** 2026-08-02 · **Target:** production `kjwjxqfdsxkxgcgophdy` · **Deploy:** `dpl_GtCKkdNJxJ2gtnxXuw9ZzTqLduqU`

> **Evidence rule.** Every number below was measured. Where a figure is derived
> rather than observed it is labelled **[extrapolation]** and the measured slope it
> comes from is cited. Sections that could not be measured say so and explain why —
> they are not filled with estimates.

---

## 0. 🔴 Security finding — cross-tenant leak in `order_stages` (found + fixed 2026-08-02)

Found while optimising Realtime RLS. **Not a performance issue — a live data leak.**

The `order_stages_select` policy read:

```sql
auth.uid() IN (SELECT id FROM profiles WHERE user_type IN ('lab','admin'))
```

It never joined to `work_orders`, so it evaluated to `true` for **any** lab or admin
user regardless of tenant.

**Measured on production before the fix:**

| | |
|---|---|
| All `order_stages` rows | 275, every one belonging to lab A |
| Rows visible to lab **B**'s admin (who owns 3 orders in a different lab) | **275 — all of them** |
| Data exposed | stage status, technician assignments, station, start/finish times — another laboratory's entire production flow |

`user_is_lab_or_admin_for_order()` carries the same defect
(`p.user_type = 'admin'` is not lab-scoped). It was **not** changed — other policies
may use it — but the new policy no longer depends on it. **It should be audited.**

**Fix:** 5 permissive SELECT policies → 1, properly tenant-scoped. Verified by a
visibility diff on live data *before* applying (0 same-lab loss, 0 newly opened,
only lab B's admin affected: 275 → 0) and by orphan counts *after* (0 orphans for
every user type).

### Why the existing test said "0 violations"

`multitenant.js` only probed `work_orders` and `stock_items`. `order_stages` was
never checked. **Narrow probe coverage produced false confidence** — worse than no
probe. The test has been extended to 11 tables and, critically, *validated against
the bug itself*: with the leaky policy deliberately restored on staging it now
reports `9,500 orphaned rows → FAIL`; with the fix it reports clean.

Three earlier versions of that probe silently passed while the leak was open:

| Attempt | Why it passed anyway |
|---|---|
| `!inner` embed | An inner join resolves through the parent's RLS, hiding exactly the rows that leak |
| LEFT embed + `limit=200` | Sampling bias — PostgREST returns physical order; the first 200 rows were the caller's own while 9,500 foreign rows sat further in |
| count-difference | `restCount` was not imported; the call threw, `measure()` swallowed it, probe did nothing |

The probe now compares two **exact counts** (no sampling), and a probe that cannot
run increments `tenant_probe_inconclusive` instead of looking like a pass.

---

## 0b. RLS audit across all tables (2026-08-02)

Prompted by §0. Every PERMISSIVE `SELECT` policy in `public` was classified by
whether it contains **any** tenant scoping (`lab_id`, `get_my_lab_id()`,
`auth.uid()` ownership, `clinic_id`, or a join to a tenant parent). 18 policies had
none. Triaged by whether the table actually holds tenant data:

| Verdict | Tables |
|---|---|
| ✅ **Not a leak — global reference data** | `tr_mahalleler` (73,305 Turkish addresses), `permissions` (124), `role_permissions` (232), `disc_yield_ref` / `resin_yield_ref` (11 each) |
| ✅ **Not a leak — platform-admin guarded** | `platform_admins`, `platform_audit_log` (`is_platform_admin()`) |
| ✅ **False positive — scoping my regex missed** | `qr_links` (`is_my_doctor_order()`); verified: other lab's admin sees **0 of 32** |
| ✅ **Inherits the `order_stages` fix** | `stage_activity_events` (24), `stage_state_transitions` (3), `stage_timing_overrides` (0) — their policies do `EXISTS (SELECT 1 FROM order_stages …)`, which is resolved through `order_stages` RLS. Verified: other lab's admin now sees **0**. The §0 fix cascaded to three dependent tables. |
| 🔴 **Real leak — FIXED** | `profiles.clinic_admin_view_lab_users` (below) |
| 🔴 **Real leak — FIXED** | `payment_intents` (below), `delay_log` (below) |
| ✅ **False positive** | `machine_events` — its `EXISTS (… FROM equipment …)` resolves through `equipment`'s policy, which **is** lab-scoped (`my_user_type() IN ('lab','admin') AND lab_id = get_my_lab_id()`) |
| ⚠️ **Left as-is, documented** | `mukellef_cache` — `SELECT true`. Contents are Turkish tax-registry lookups (VKN → company title), i.e. public data, and it is deliberately a *shared* cache written by `modules/efatura/api.ts`. Read access is defensible. **But `INSERT`/`UPDATE` are open to any authenticated user**, so one tenant can poison another's cached tax data. Not changed — tightening writes would break the e-fatura flow and needs a product decision. |

### 🔴 `payment_intents` — readable by ANY caller including anon (fixed)

```sql
-- policy name: payment_intents_public_token_read   roles: {public}
status = ANY(ARRAY['pending','awaiting_3ds','authorized','paid']) AND expires_at > now()
```

The name says "public token read" — **the body never checks `public_token`.** Any
caller matching status + expiry saw the row, and `roles = {public}` includes **anon**.
The anon key is published in the web bundle, so this was an unauthenticated read of
every tenant's payment records: amount, currency, `provider_ref`, **`provider_token`**,
`clinic_id`, `doctor_id`.

*Precision about the evidence:* the table held 0 rows, so no data was actually
exposed. That the policy **would** have matched is a deduction from the policy text —
a test row with `status='pending'`, `expires_at = now()+1d` satisfies it exactly. What
was directly observed is that anon received `HTTP 200` on the endpoint rather than a
denial.

**Why RLS cannot fix this:** a policy sees the row, not what the client filtered by.
Token knowledge can only be enforced by a function that takes the token as an
*argument*. That function already existed and the public payment page already used it:
`fetch_public_payment_intent(p_token)` — `SECURITY DEFINER`, returning a curated column
set that **excludes `provider_token`**. The policy was therefore both redundant and
harmful, and was dropped.

`chargeWithCard()` in `modules/payments/api.ts` was the one remaining direct table read;
it was switched to the same RPC in the same change.

**Verified after the fix, with a real row present:**

| Caller | Result |
|---|---|
| anon, listing `payment_intents` | `[]` ✅ |
| anon, RPC with the **correct** token | returns the intent, **no `provider_token`** ✅ |
| anon, RPC with a wrong token | `[]` ✅ |
| owning lab's user | 1 ✅ |
| **other lab's admin** | **0** ✅ |

⚠️ **Out of scope but needs review before payments go live:** the public payment page
performs `UPDATE payment_intents` and `INSERT payment_attempts` **from the browser**.
For anon these silently fail under RLS. The whole write path belongs in the edge
function (which already runs as service role).

### 🔴 `delay_log` — any authenticated user could read and write every tenant's rows (fixed)

Both `SELECT` and `INSERT` were `auth.role() = 'authenticated'` — no tenant scoping at
all. 0 rows today and **no code references it**, but the policy would leak the moment
the feature is used. Rescoped through `work_orders` (the same pattern the `stage_*`
tables use, resolved by `work_orders` RLS).

### 🔴 `profiles.clinic_admin_view_lab_users` — cross-tenant PII (fixed)

```sql
is_clinic_admin() AND user_type = ANY(ARRAY['lab','admin'])   -- no lab scoping
```

A clinic admin could read **every** laboratory's staff. Measured: 12 profiles across
**2 different labs** — name, e-mail, phone and role of people at a company the clinic
has no relationship with. KVKK-relevant personal data.

Fixed by scoping to labs the clinic is actually connected to (`clinics.lab_id` ∪
approved `clinic_lab_memberships`). Diff measured before applying: **5 pairs lost, all
cross-lab; 0 gained.** After: clinic admin sees **11 profiles across 1 lab**; lab
manager unchanged at 9.

### 🔴 `my_role_key()` — couriers were granted manager permissions (fixed)

Surfaced by the `client_errors` policy test (§7). The function's fallback

```sql
WHEN p.user_type = 'lab' THEN 'lab_manager'   -- "lab user without a role"
```

captured **every** lab role that is not `manager` or `technician` — including
`courier`.

**Measured on production:**

| | Before | After |
|---|---|---|
| Courier's resolved role | `lab_manager` | `courier` |
| Courier's permissions | **60** | **8** |
| Included | `approve_orders`, `cancel_orders`, `assign_orders`, `approve_design`, `manage_approvals`, `approve_leave`, `manage_attendance`, … | `manage_deliveries`, `mark_delivered`, `view_deliveries`, `view_orders`, `send_messages`, `manage_messages`, `view_employees`, `view_team` |

A `courier` role with exactly those 8 permissions **already existed** in
`role_permissions` — `my_role_key()` simply never returned `'courier'`, so the
correct configuration was unreachable dead config.

**Breakage assessment before applying:** the courier panel performs **no** permission
checks; its route guard is role-based (`user_type='lab' AND role='courier'`); the only
permissions gated anywhere in the code are `manage_settings` and the stock permissions,
none of which are in the courier's 8 and none of whose screens a courier visits.
Role-resolution diff across all 17 users: **1 row changes** (the single courier);
lab manager stays at 60, technician at 23 — both verified after applying.

### ✅ `user_is_lab_or_admin_for_order()` — defect now inert

Its `admin` branch is not lab-scoped, which was the same class of bug as §0. After the
`order_stages` consolidation it is referenced by **0 policies** — the consolidation
removed its last user. The defect is therefore no longer reachable through RLS. Left in
place (dropping a function is a separate cleanup) but it should not be reused as-is.

### ⚠️ Incident — I broke production for ~2 minutes doing this

The first attempt queried `clinic_lab_memberships` **directly inside the policy**.
That table's own policy reads `profiles`, so:

```
profiles policy → clinic_lab_memberships policy → profiles policy → …
ERROR: 42P17 infinite recursion detected in policy for relation "profiles"
```

`profiles` is read on every login, so **all authentication failed** until I reverted.
Detected immediately by the post-apply verification query, reverted in the next
migration, and confirmed restored (lab manager 9 profiles, `/rest/v1/profiles` → 401
not 500, `siman.app` → 200).

The working fix routes the same lookup through a new `SECURITY DEFINER` helper,
`my_connected_lab_ids()`, which bypasses RLS on those tables and therefore cannot
recurse — the same pattern `my_clinic_id()` has used safely for years.

**Lesson recorded:** an RLS policy must never query a table whose own policy reads
the first table. Any cross-table lookup inside a policy belongs in a
`SECURITY DEFINER` function. Verification must run **immediately** after apply, on
the exact table being changed — that is the only reason this was caught in seconds
rather than by a user.

---

## 0c. Write-policy audit — `INSERT` / `UPDATE` / `DELETE` (2026-08-02)

§0b covered only `SELECT`. This pass applied the same classification to write
policies. **It found the most severe issue of the whole engagement.**

### 🔴🔴 `labs` — any authenticated user could modify or delete ANY laboratory (fixed)

```sql
-- policy: labs_authenticated_all   cmd=ALL   roles={authenticated}
USING (true)   WITH CHECK (true)
```

`ALL` covers SELECT, INSERT, UPDATE **and DELETE**, with no predicate whatsoever.

**Proven on production** (inside a transaction, rolled back): signed in as lab A's
manager, `UPDATE public.labs SET name = … WHERE id <> get_my_lab_id()` **succeeded**
and returned lab B's row. The `DELETE` case was not executed — the same `USING (true)`
governs it, so permission follows from the policy definition plus the demonstrated
`UPDATE`.

A second consequence: because both `labs` policies were PERMISSIVE, `SELECT` was
effectively `true OR (id = get_my_lab_id())` = **`true`**, so every user could read
every laboratory's record.

**Fix — tenant dimension only.** `labs_authenticated_all` dropped; a scoped `UPDATE`
policy added. **The role dimension was deliberately left alone**: the settings screens
(`GeneralSection`, `WorkHoursSection`) perform no permission or role check, so
narrowing roles could have broken a working flow. Which role may edit lab settings is
a separate product decision.

No `INSERT` policy was added — lab creation goes through `create_lab_tenant()`, which
is `SECURITY DEFINER`. No `DELETE` policy — that path runs as service role in the
`delete-account` edge function.

**Verified after the fix:**

| Test | Before | After |
|---|---|---|
| Update **another** lab | ✅ succeeded | **0 rows** ✅ |
| Update **own** lab | ✅ | ✅ still works |
| Labs visible | **2** | **1** ✅ |

### ✅ `medit_patients` — resolved by removing the whole Medit integration

Both `medit_patients` and `order_boxes` had `ALL` policies of just `is_lab_user()` —
any lab user of any tenant could read and write every row — and **neither table has a
tenant column at all**, so no policy could fix them.

For `medit_patients` (4 rows of **patient names**) the owner chose to remove the Medit
integration rather than reshape the schema. Verified dormant before removal:

| Check | Result |
|---|---|
| Last sync | **2026-05-18** (~2.5 months earlier) |
| Orders with `external_source='medit_link'` | **0** |
| `machine_events` | 0 |
| Machine adapter in `machines/registry.ts` | already commented out |

Removed: the `medit_patients` table, the `medit-webhook` edge function (which was
**ACTIVE with `verify_jwt: false`** — a dormant unauthenticated public endpoint, i.e.
attack surface for nothing), `MeditCompleteModal.tsx`, and its banner/state/derivation
in `OrderDetailScreenV2`. The `needsTriage` guard `&& !meditNeedsCompletion` was
dropped too — with zero `medit_link` orders it was always `true`, so behaviour is
unchanged. Verified: `tsc` clean, webhook returns **404**.

Deliberately kept: the `'medit'` member of the `MachineKind` union (stored data may
reference it), the commented-out adapter in the future-work list, i18n strings, and the
Medit **product images** in `lib/catalogPdf.ts` — those belong to the equipment sales
catalogue, not the data integration.

### ✅ `order_boxes` — locked down

0 rows and **zero code references** — a dead table. Its `is_lab_user()` policy was
dropped; RLS stays on, so only the service role can reach it. If the feature is ever
built, it needs `lab_id` first.

### ✅ Correct write policies confirmed

| Policy | Why it is fine |
|---|---|
| `order_events_no_direct_insert` | `WITH CHECK (false)` — deliberately blocks all direct inserts |
| `work_orders` doctor INSERT/UPDATE | scoped by `doctor_owns_order_doctor(doctor_id)` |

### ⚠️ Global permission catalogues — direct write path closed, root cause open

`permissions_admin_write` and `role_permissions_admin_write` were
`my_user_type() = 'admin'` with no tenant scoping. These tables are **global** (124 and
232 rows, no `lab_id`), so any single lab's admin could edit the permission catalogue
for **every** tenant.

Verified that **no code writes to these tables directly** — every write goes through
`set_role_permissions()`, which is `SECURITY DEFINER` (bypasses RLS) and performs its
own admin check. The table-level write policies were therefore redundant and were
dropped. Verified after: admin still reads both catalogues (124 / 232) and still has
104 permissions; a direct `UPDATE` now affects **0 rows**; the RPC path still works.

**This does not fix the root cause.** `set_role_permissions()` still writes globally
(`DELETE FROM role_permissions WHERE role_key = p_role`), so lab A's admin changing the
`technician` role still changes it for lab B. The real fix is `lab_id` on
`role_permissions` (NULL = global default, set = per-lab override), a matching change in
`get_my_permissions()`, and a backfill. That reshapes the permission engine — the
widest-blast-radius subsystem in the app — and is a product decision, not a policy patch.

> **Closed 2026-08-02** — see §0d. The root cause described above is now fixed.

---

## 0d. 🔴 Three open items closed (2026-08-02)

The three items previously logged as "needs a product decision" were authorised and
implemented. Migrations: `rbac_role_permissions_lab_scoping`,
`secure_mukellef_cache_writes`, `secure_payment_write_path`, `fix_payment_token_comment`.

### 0d.1 `role_permissions` is now lab-scoped

Measured first: `user_type = 'admin'` is **3 people across 2 different labs** — it is a
per-lab role, not a platform super-admin. So `set_role_permissions()`'s only guard
(`my_user_type() = 'admin'`) let any lab's admin rewrite, and `DELETE`, the permission
set of every tenant.

Design (additive, no behaviour change for existing rows):

| `lab_id` | meaning |
|---|---|
| `NULL` | platform default — the 232 pre-existing rows, untouched |
| set | that lab's wholesale override |

`lab_role_permission_overrides (lab_id, role_key)` marks "this lab customised this role".
Without it an override that grants **zero** permissions is indistinguishable from
"no override", and the resolver would silently fall back to defaults.

`resolve_role_permissions(role, lab)` picks the lab's rows when a marker exists, else the
`NULL` rows. `has_permission`, `get_my_permissions`, `get_role_permissions` all route
through it. `set_role_permissions()` now writes and deletes **only** `lab_id = get_my_lab_id()`.

**Blast radius, measured before applying:** `has_permission()` appears in **0 RLS policies
and 0 other functions** — this layer governs UI visibility only, never data access.

**Verification (live):**

| Test | Result |
|---|---|
| Platform defaults after migration | 104 / 60 / 21 / 21 / 18 / 8 — identical to before |
| Lab B admin sets `lab_manager` → 1 permission | B lab: 60 → **1** |
| Lab A's `lab_manager` during that attack | **60 — unchanged** |
| Platform default `lab_manager` during that attack | **60 — unchanged** |
| `get_my_permissions()` per user | admin 104 · lab_manager 60 · technician 24 (21 role + 3 personal grants) · courier 8 |
| lab_manager calls `set_role_permissions` | rejected — `Only admins can modify permissions` |
| User with no `lab_id` calls it | rejected — `Lab bağlamı yok` |

### 0d.2 `mukellef_cache` writes closed

Global shared GİB cache (no `lab_id`, `vkn` UNIQUE) whose write policies asked only for
`auth.uid() IS NOT NULL`. Any courier or technician at any lab could flip `is_registered`
for any VKN; `decide_efatura_type()` reads it, so poisoning it changes the
e_fatura/e_arsiv decision **for every tenant**.

Direct `INSERT`/`UPDATE`/`DELETE` revoked. Writes go through `upsert_mukellef_cache()`,
which requires `send_einvoice` or `manage_finance`. `manage_invoices` was rejected as the
gate because it is also held by `clinic_admin` and `doctor`. `SELECT` narrowed from
`anon` to `authenticated`. Client updated (`modules/efatura/api.ts`).

| Test | Result |
|---|---|
| Technician direct `INSERT` | `permission denied for table mukellef_cache` |
| Technician via RPC | `Bu işlem için e-fatura yetkisi gerekli` |
| Admin via RPC | succeeded |

### 0d.3 🔴 Payment confirmation was forgeable — the most serious finding to date

Not on the original list; found while closing the browser-write item.

`confirm_payment_intent(p_intent_id uuid)` was `SECURITY DEFINER` with `EXECUTE` granted
to **`anon`**. Its only argument is the intent UUID — **no token, session, or amount
check**. It marks the intent paid, inserts a `payments` row, and raises
`invoices.paid_amount`, setting `status = 'odendi'`.

The exploit is not theoretical: `fetch_public_payment_intent(token)` returns `intent_id`,
so anyone holding a legitimate payment link could mark the invoice paid **without paying**.
`generate_payment_token()` additionally used non-cryptographic `random()`.

Not exploitable at the time of the fix: `provider_credentials` holds **0** rows with
`type = 'payment'` and `payment_intents` holds **0** rows — payments were never live.

Changes:

- `confirm_payment_intent` — `EXECUTE` revoked from `anon`, `authenticated`, `public`; granted to `service_role` only
- `generate_payment_token` — `extensions.gen_random_bytes(20)`, ~100 bits
- `payment_intents` — the `ALL` policy split into `SELECT` + `INSERT`; `UPDATE`/`DELETE` revoked from the browser
- `payment_attempts` — read-only for the lab; writes are `service_role` (edge function)
- `refund_payment_intent()` RPC — lab ownership + `manage_finance`, so the refund UI keeps working
- `payments-charge` edge function — gained a server-side `demo` provider and a `confirm` action that only runs when the lab has an explicit `demo` POS row; real providers confirm solely via signature-verified `payments-callback`
- Client — `chargeWithCard` and `confirmPayment` now call the edge function; the old browser-side charge path was deleted, not commented out

| Test | Result |
|---|---|
| `anon` calls `confirm_payment_intent` | `permission denied for function` |
| Lab admin calls it | `permission denied for function` |
| Lab admin `UPDATE payment_intents` | `permission denied for table` |
| Lab admin `INSERT payment_attempts` | `permission denied for table` |
| Creating a payment link (`INSERT` + `RETURNING`) | still works |
| `tsc --noEmit` | 0 errors |
| Edge function bundle | 8.1 kB, no syntax errors |

### 0d.4 🔴 NEW, OPEN — `supplier_balances` bypasses RLS entirely

Surfaced by the security advisor while verifying the above. The view is
`SECURITY DEFINER` (no `security_invoker`) **and has no `lab_id` filter**, so it ignores
RLS on `suppliers` and `supplier_transactions`.

| Reader | via RLS-protected `suppliers` | via `supplier_balances` view |
|---|---|---|
| Technician (lab A) | **0 rows** | **9 rows** |
| Admin (lab B) | 9 rows (see below) | 9 rows |

Exposed: supplier name, balance, purchase/payment/return totals, transaction counts.

Two distinct root causes:

1. **All 9 suppliers have `lab_id = NULL`** — orphan rows in a multi-tenant table. Every
   related record (27 `supplier_transactions`, 14 `purchase_invoices`) belongs to lab
   `243ef1db`, so that is where they belong.
2. `v_monthly_finance_summary` and `v_monthly_finance_summary_ccy` carry the same
   `SECURITY DEFINER` flag but filter on `get_my_lab_id()` internally, so they are **safe** —
   only `supplier_balances` leaks.

**Fixed (authorised 2026-08-02)** — migration `fix_supplier_balances_rls_bypass`:

1. The 9 orphans were assigned `lab_id = 243ef1db…` (where every one of their
   transactions already lived).
2. `alter view supplier_balances set (security_invoker = true)`.

Both had to ship together. `security_invoker` alone would have emptied the supplier
screen for **everyone**, because `p.lab_id = NULL` is never true — a working feature would
have broken.

**Verification (live, after):**

| Reader | Before (view) | After (view) | RLS-protected `suppliers` |
|---|---|---|---|
| Technician, lab A | 9 | 9 | 9 — now consistent |
| Manager, lab A | 9 | 9, balance ₺848.609,95 | 9 — screen still works |
| `clinic_admin` | 9 | **0** | 0 |
| Doctor | 9 | **0** | 0 |
| Admin, lab B | 9 | 9 — *still leaking, see §0d.5* | 9 |

The view no longer bypasses RLS: it now returns exactly what the policies allow. The
remaining lab-B exposure is not the view's fault — it is the admin escape hatch below.

### 0d.5 🔴 OPEN — systemic: the `user_type = 'admin'` escape hatch

`suppliers_read` is `p.lab_id = suppliers.lab_id OR p.user_type = 'admin'`. Since "admin"
is per-lab (§0d.1 — 3 people, 2 labs), the second branch lets **any lab's admin read every
lab's rows**.

The pattern appears in **62 policies across 37 tables** (excluding the 
`platform_admins` checks, which are correct). 22 of those tables carry `lab_id`, so they
could be tested directly: logged in as lab B's admin, count rows with a non-NULL `lab_id`
belonging to some other lab.

**Measured leaks — 11 tables:**

| Table | Other labs' rows visible to lab B's admin |
|---|---|
| `workflow_templates` | 41 |
| `supplier_transactions` | 27 |
| `lab_services` | 26 |
| `deliveries` | 25 |
| `order_items` | 19 |
| `pending_paper_orders` | 15 |
| `purchase_invoices` | 14 |
| `lab_skills` | 14 |
| `suppliers` | 9 |
| `currency_rates` | 3 |
| `whatsapp_sessions` | 1 |

This exposes another laboratory's price list, supplier ledger, purchase invoices,
deliveries, order line items, and WhatsApp session — i.e. commercially sensitive data.

**A first pass over-counted.** `currency_rates` initially showed 107 because the filter
was `lab_id IS DISTINCT FROM <lab>`, which is true for NULL as well; 104 of its rows are
NULL-`lab_id` global exchange rates and are *meant* to be shared. Re-measured with
`lab_id IS NOT NULL AND lab_id <> <lab>`, the real figure is 3.

The remaining 15 tables have no `lab_id` and need per-table join analysis
(`order_stages`, `lab_stations`, `support_messages`, `technicians`, `user_permissions`,
`salary_adjustments`, `gps_pings`, `stage_log`, `stage_material_consumptions`,
`reject_log`, `checklist_log`, `design_qc_checks`, `order_events`, `support_attachments`,
`support_status_history`).

**FIXED 2026-08-02** — migrations `tenant_guard_admin_escape_batch1…4`.

#### Method: a RESTRICTIVE guard, not 62 rewrites

Rewriting 62 policy bodies by hand — several of them deeply nested — would have been the
likeliest way to introduce a new hole while closing this one. Instead each table got one
`RESTRICTIVE` policy named `tenant_guard`. Postgres **ANDs** restrictive policies with the
existing permissive ones, so no existing policy's meaning was touched and rollback is a
single `DROP POLICY` per table.

```sql
create policy tenant_guard on <table>
  as restrictive for all to authenticated
  using (
    is_platform_admin()                       -- 1) real super-admin
    or (select get_my_lab_id()) is null       -- 2) clinic / doctor users
    or <table>.lab_id is null                 -- 3) global rows
    or <table>.lab_id = (select get_my_lab_id())
  )
  with check ( … same … );
```

Branch 2 is the one that makes this safe. A plain `lab_id = get_my_lab_id()` would have
locked out every clinic and doctor, because their `profiles.lab_id` is NULL (measured: 5
clinic_admins + 2 doctors, all NULL) and `NULL = NULL` is not true — the clinic panel would
have gone blank. With branch 2 the guard is unconditionally true for them, so their access
is provably unchanged and remains governed by the existing `doctor_id` / `clinic_id`
policies. The only population actually constrained is users **with** a `lab_id` — lab
staff and lab admins, exactly the leak population.

Branch 3 keeps genuinely shared rows shared, e.g. the 104 NULL-`lab_id` global exchange
rates in `currency_rates`.

#### Coverage

| Batch | Tables | Path |
|---|---|---|
| 1 | 15 lab-owned config/finance tables | direct `lab_id` |
| 2 | `approvals`, `deliveries`, `order_items`, `order_messages`, `provas`, `stage_work_segments` | direct `lab_id` |
| 3 | `stage_log`, `lab_stations`, `user_permissions` | via `SECURITY DEFINER` helpers |
| 4 | `checklist_log`, `design_qc_checks`, `reject_log`, `order_events`, `stage_material_consumptions`, `gps_pings`, `salary_adjustments` | via helpers |

Batch 3/4 tables have no `lab_id`, so the guard must consult another table. Querying
`profiles` or `work_orders` directly from a policy body triggers *their* policies — the
exact mistake that produced `42P17 infinite recursion` on `profiles` earlier and cut every
login for ~2 minutes. So the lookups go through `order_lab_id()`, `user_lab_id()` and
`delivery_lab_id()`, which are `SECURITY DEFINER` and therefore bypass RLS entirely,
making recursion impossible.

#### Result (measured, live)

| | Foreign rows visible to lab B's admin |
|---|---|
| Before | **354** (194 across `lab_id` tables + 138 `stage_log` + 17 `lab_stations` + 5 `user_permissions`) |
| After | **0** |

Nothing was broken — verified per user type after every batch:

| Reader | Check | Result |
|---|---|---|
| Clinic admin | `lab_services` | 32 / 32 — unaffected |
| Doctor | `lab_services`, `order_messages`, `order_items` | 32, 65, 15 — unaffected |
| Lab A manager | `deliveries` / `order_messages` / `stage_work_segments` | 25/25 · 66/66 · 40/40 |
| Lab A manager | `lab_services` | 26 of 32 — the other 6 are lab B's |
| Lab A technician | `lab_stations` / `user_permissions` | 17 / 3 (own grants) |
| Lab A **admin** | `user_permissions` / `stage_log` / `lab_stations` | 5/5 · 138/138 · 17/17 |

`material_request_catalog` and `case_type_stage_presets` returned 0 for everyone — both
are empty tables (0 rows), not a regression.

#### Cost

| Query | Guard type | Measured |
|---|---|---|
| `order_messages`, 50 rows | direct `lab_id` compare | 2.74 ms |
| `stage_log`, 100 rows | per-row `order_lab_id()` | 5.53 ms |

The helper-based guard adds roughly **55 µs per row**. That is acceptable today because
every table using it is low-volume or empty, while the high-traffic tables
(`order_messages`, `order_items`, `deliveries`, `order_stages`) all use the cheap direct
compare. **If `stage_material_consumptions` or `order_events` grow**, give them a `lab_id`
column and switch them to the direct form rather than paying the per-row call.

#### Deliberately left open

- **`support_messages`, `support_attachments`, `support_status_history`** — here
  `user_type = 'admin'` means *the support desk operator*, not a lab admin; the ticket flow
  is lab → platform. A lab-scoped guard would stop the support desk from reading tickets at
  all. The correct fix is to replace `user_type = 'admin'` with `is_platform_admin()` in
  those three policies, but that changes **who runs the support desk** — a product decision.
  Until then, any lab's admin can read every lab's tickets and internal notes.
- **`technicians`** — has no tenant column at all (`id, name, specialty, phone, notes,
  created_at`). Cannot be guarded without a schema change. Currently 0 rows.
- **`profiles`** — measured, does **not** leak (lab B's admin sees 0 foreign profiles);
  already fixed by `20260731090000`. Left untouched deliberately rather than take risk on
  the table whose policies broke every login once.
- **`order_stages`** — measured, does not leak; fixed earlier (§0).

---

## 1. Certification verdict

**The system is NOT certified for production at the requested scale, because the
required load evidence does not exist.** This is a gap in measurement, not a known
defect: the launch-blocking defect found earlier has been fixed and verified.

| | |
|---|---|
| **Certified for** | Current production load (1 active tenant, 22 orders) — measured |
| **Not certified for** | 100 / 300 / 1,000 / 3,000 / 5,000 / 10,000 concurrent users |
| **Why not** | No load test at those levels has been run against a production-equivalent instance. See §9. |
| **Blocking defect status** | ✅ Fixed and verified (RLS consolidation + dashboard RPCs, 2026-08-02) |
| **Highest remaining risk** | **The public payment page writes to the database from the browser** (§0b). Also: `mukellef_cache` writes are open to any tenant. |
| **Second risk** | **Realtime — 72 % of DB time.** Per-event RLS improved for 56 % of events; publication trim blocked (§5). |

---

## 2. Deploy verification (measured)

```
Production: https://dental-ot9ddlywz-sunplus.vercel.app [11s]
Aliased:    https://siman.app [14s]
readyState: READY
```

| Check | Result |
|---|---|
| `GET https://siman.app/` | **HTTP 200**, 0.434 s, 9,150 bytes |
| JS bundle referenced in HTML | `entry-41d50c52e6aa88a14bb628f8147f758a.js` ✅ |
| Bundle served | **HTTP 200**, **8,429,155 bytes** (8.4 MB) |
| `dist/` output | 28 MB, 108 files |

Not the empty-build failure mode (which presents as a 404 with a 252 KB `dist`).

**Build incident worth recording:** the first two `expo export` runs died silently.
Cause was host memory — the machine had **~81 MB free** with an `expo start --web`
dev server that had been running 11 h 20 m. Stopping it freed ~1 GB and the build
completed. `scripts/vercel-build.sh` already sets `--max-old-space-size=8192`; the
constraint was physical RAM, not the heap cap.

---

## 3. Phase 1 — Current state verified

| Optimization | Verification method | Result |
|---|---|---|
| RLS consolidation active | `pg_policies` count | `work_orders`: **8 policies, 1 SELECT** (was 11 / 4) ✅ |
| RLS helpers hoisted | `EXPLAIN ANALYZE` as `authenticated` | All helpers show as `InitPlan … rows=1 loops=1` ✅ |
| Dashboard RPCs exist + are `SECURITY DEFINER` | `pg_proc.prosecdef` | both `true` ✅ |
| RPC tenant guard | executed as 4 user types | lab 19 · other lab 3 · doctor **0 rows** · clinic_admin **0 rows** ✅ |
| Dashboard fallback works | code review + `tsc` | `if (!aggErr && Array.isArray(agg)) … else <old query>` ✅ |
| Upload optimization | `grep` + `tsc --noEmit` | `base64-arraybuffer` absent from `lib/photos.ts`; size caps on 5 paths ✅ |
| FK indexes | `pg_constraint` vs `pg_index` | **0 unindexed FKs**, **0 invalid indexes** ✅ |

**Reproducibility:** the RLS before/after benchmark is reproducible — the exact
`EXPLAIN` recipe is in `docs/db-optimizations.sql` §VERIFICATION. The 100k-row branch
benchmark is **not** currently reproducible: that branch was deleted after the run.
`tests/performance/seed/seed-tenants.sql` recreates the dataset.

---

## 4. Phase 8 — Database benchmark (measured, production)

`EXPLAIN (ANALYZE, BUFFERS)` as `role authenticated`, real lab-manager JWT,
`statement_timeout = 8s`:

| Query | Exec | Planning | Buffers | Plan |
|---|---|---|---|---|
| Dashboard pipeline (`status <> 'iptal'`) | **0.931 ms** | 3.95 ms | **13** | Seq Scan + 5 InitPlans |
| Orders list, `ORDER BY created_at DESC LIMIT 50` | **0.982 ms** | 4.08 ms | **16** | Sort (quicksort, 31 kB) + Seq Scan |
| Badge count `status = 'uretimde'` | **0.861 ms** | 3.86 ms | **13** | Seq Scan + 5 InitPlans |

### Checklist — answered honestly

| Requirement | Verdict | Evidence |
|---|---|---|
| No sequential scans | ⚠️ **Seq scans remain** | On a 22-row table a seq scan is the *correct* plan. But the OR-chain still prevents the planner from using `idx_work_orders_lab_status_date` — at 100k rows on the branch it was still a Seq Scan, just a cheap one (41 ms). **P0 made helper cost O(1); it did not make the query index-driven.** |
| No missing indexes | ✅ | 0 unindexed FKs (was 143) |
| No N+1 | ⚠️ **Partly** | Dashboard: 0 unbounded queries (fixed). Order detail: still **8–12 requests** per open |
| No unnecessary sorts | ✅ | quicksort, 31 kB, in memory |
| No hash spills | ✅ | none in the measured plans |
| **No temporary files** | ❌ **FAIL** | **116,219 temp files / 401 GB written** since 2026-05-07 |
| No `statement_timeout` hits | ✅ | none post-fix |

### Database-wide counters

| Metric | Value |
|---|---|
| Cache hit ratio | **100.00 %** (2,362,506,534 hit / 2,493 read) |
| Deadlocks | **0** |
| Transactions | 5,018,713 commit / 283,523 rollback (**5.35 %** rollback) |
| Temp files | **116,219 / 401 GB** |
| Database size | 56 MB |
| Replication slot lag | **5,112 bytes** (both slots active, healthy) |
| Stats window | since 2026-05-07 |

### The 401 GB temp-file finding

401 GB of disk writes on a **56 MB** database. `work_mem = 3.5 MB` is the enabler.

What is attributable from current `pg_stat_statements`:

| Statement | Calls | Temp written | Per call |
|---|---|---|---|
| PostgREST **function introspection** | 79 | 604 MB | **7.8 MB** |
| PostgREST function introspection (variant) | 16 | 124 MB | 8.0 MB |

Only ~760 MB is attributable — `pg_stat_statements` evicts entries, so the remaining
~400 GB cannot be pinned to a specific statement from the current snapshot. The
dominant suspect by volume is the Realtime walrus pair (1,088,313 calls); at even
0.4 MB spill each that accounts for the bulk, but **that is inference, not
measurement**, and is flagged as such.

*(Three single-call entries in that table — 18 MB, 4.4 MB, 4.2 MB — are my own
diagnostic queries against `pg_stat_statements`, not application traffic.)*

**Recommendation:** raise `work_mem` (requires a compute tier change) and reduce
schema-reload frequency. Disk IOPS is a metered, burst-credited resource on Supabase;
401 GB of avoidable writes consumes it.

---

## 5. Phase 6 — Realtime benchmark (measured)

Realtime is **72 % of all database time** (5,720,075 ms of 7,941,022 ms;
1,088,313 walrus calls; max single call 5,572 ms).

### WAL traffic by published table

Change events = `n_tup_ins + n_tup_upd + n_tup_del`, since 2026-05-07.

| # | Table | Change events | Share | Live rows | Keep live? |
|---|---|---|---|---|---|
| 1 | `notifications` | **3,333** | 31.9 % | 1,796 | ✅ yes — the notification bell |
| 2 | `order_stages` | **2,356** | 22.5 % | 275 | ✅ yes — production board |
| 3 | `work_orders` | **1,440** | 13.8 % | 22 | ✅ yes — order lists |
| 4 | `activity_logs` | **937** | 9.0 % | 605 | ❌ **remove** — audit log, nobody watches live |
| 5 | `stock_items` | 704 | 6.7 % | 92 | ✅ yes — low-stock alerts |
| 6 | `deliveries` | 668 | 6.4 % | 25 | ✅ yes — courier tracking |
| 7 | `stock_movements` | 305 | 2.9 % | 119 | ❌ **remove** — `stock_items` already publishes the resulting qty |
| 8 | `profiles` | 233 | 2.2 % | 17 | ❌ **remove** — refetch on focus |
| 9 | `order_messages` | 192 | 1.8 % | 66 | ✅ yes — chat |
| 10 | `stage_activity_events` | 134 | 1.3 % | 24 | ❌ **remove** — derived feed |
| 11 | `whatsapp_sessions` | 52 | 0.5 % | 1 | ❌ **remove** — server-side only |
| 12 | `equipment` | 49 | 0.5 % | 14 | ❌ **remove** — low change rate |
| 13 | `pending_paper_orders` | 31 | 0.3 % | 15 | ✅ marginal |
| 14 | `gps_pings` | 12 | 0.1 % | 0 | ⚠️ **keep but watch** — near-zero today, highest write rate at scale |
| 15 | `material_requests` | 3 | 0.0 % | 1 | marginal |
| 16 | `approvals` | **0** | 0 % | 0 | ❌ **remove** — never fires |
| 17 | `case_steps` | **0** | 0 % | 0 | ❌ **remove** — never fires |
| | **Total** | **10,449** | | | |

### ⚠️ Correction 2 (2026-08-02) — the "remove" column above was wrong

The `Keep live?` column was filled in from change-event volume plus a guess about
whether anyone watches each table live. **I then checked the client code, and every
one of the eight tables marked ❌ has an active subscriber:**

| Table | Subscribed by |
|---|---|
| `activity_logs` | `LogsSection.tsx`, `app/(admin)/logs.tsx` |
| `stock_movements` | `StockMovementsScreen.tsx` |
| `profiles` | `PendingApprovalsScreen.tsx`, `usePendingApprovals.ts` |
| `stage_activity_events` | `ActivityFeed.tsx` |
| `whatsapp_sessions` | `WhatsAppSupportScreen.tsx` |
| `equipment` | `MachineStatusCard.tsx` |
| `approvals` | `usePendingApprovals.ts` |
| `case_steps` | `useCaseSteps.ts` |

Removing any of them from the publication would silently break live updates on a
working screen. **Nothing was removed.** Publication trimming is now a per-table
product decision — for each one, someone has to accept that the screen refreshes on
focus instead of live. It is not a safe mechanical optimisation.

This also means the "~16 % of WAL work" saving is **not currently available** without
a product trade-off.

### ⚠️ Correction to an earlier claim

An earlier revision of `performance-report.md` implied that trimming the publication
would meaningfully attack the 72 % Realtime cost. **The measurement does not support
that.** The eight removal candidates total **1,710 of 10,449 events = 16.4 %**.
The top three tables are 68 % and all genuinely need live push.

**Estimated improvement from publication trimming: ~16 % of WAL decode work**
**[extrapolation** from the event-share table above; the true saving is larger because
removing a table also removes its client subscriptions, but the subscriber multiplier
was not measured**]**.

The real lever is not event count — it is **events × subscribers × per-event RLS cost**.
P0 reduced the per-event RLS cost for `work_orders`; the same `(select …)` treatment
has **not** been applied to `notifications`, `order_stages`, `profiles`, or
`doctors`, which together are 56 % of events.

### Not measured

Realtime latency, broadcast latency, subscription/reconnect latency, channel
create/destroy cost, max concurrent channels, max events/sec, max clients/channel.
These need a load generator holding thousands of WebSockets against a
production-equivalent instance. `tests/performance/api/notifications.js:flowRealtimeSubscribe`
implements the measurement; it has not been run at scale. See §9.

One channel-lifecycle datum **is** measured: `realtime.subscription` showed
**32,022 inserts / 31,984 deletes for 38 live rows** — mount/unmount churn caused by
the random-suffix channel patch in `lib/supabase.ts:172`.

---

## 6. Phase 7 — Connection pool (measured)

| Metric | Value |
|---|---|
| `max_connections` | **60** |
| In use at idle | **23** (38.3 %) |
| Active | 2 |
| Idle | 13 |
| Idle in transaction | **0** ✅ |
| Waiting on `Client` | 14 |
| Waiting on any event | 22 |
| Free headroom | **37** |

An earlier sample the previous day read 36/60 (60 %). The instance therefore idles
somewhere between **23 and 36 connections**, leaving **24–37 free** before any user
traffic. Realtime, PostgREST, GoTrue, Storage, pg_cron and pg_net all draw from this
pool.

**Load-bearing consequence:** one dashboard open issued 13–15 concurrent PostgREST
requests before the P1 fix and ~10 after. At ~10 connections per concurrent dashboard
load, **37 free connections supports roughly 3–4 simultaneous dashboard opens** before
Supavisor starts queueing. Supavisor queues rather than erroring, so this shows up as
latency, not 5xx.

### Not measured

Connection acquisition time, pool saturation point, connection wait time under load,
peak concurrent queries, connection reuse rate, and the 100/200/500-connection
simulations. All require load generation (§9) and, for the pool-size variants, a
compute tier change. **No PgBouncer/Supavisor tuning recommendation is made here,
because recommending a pool size without measuring saturation would be a guess.**

---

## 7. Phase 11 — Observability audit (measured) — ⚠️ **PARTIALLY CLOSED 2026-08-02**

### ✅ Step 1 shipped: client error sink

Errors no longer die in `console.error`. `public.client_errors` + `core/observability/reportError.ts`
are live, wired into all **five** error paths in `RootErrorBoundary.tsx`:
`componentDidCatch`, `ErrorUtils.setGlobalHandler`, `process.on('unhandledRejection')`,
and the two web `window` listeners (which previously only handled chunk errors and
dropped everything else).

**This is a floor, not APM.** No grouping UI, no sourcemap resolution, no release
tracking, no alerting. Sentry remains the recommendation; this works today without an
account or a native rebuild, and doubles as a fallback when a third-party sink is
unreachable.

Safeguards, because a crash loop must not flood the table:

| Guard | Value |
|---|---|
| Rate limit | 10 reports / 60 s per client |
| Dedup | same fingerprint suppressed for 5 min |
| Fingerprint | message with uuid/timestamp/number stripped + first stack frame |
| Column caps | enforced client-side **and** by DB `CHECK` (message 2 000, stack 8 000) |
| Failure mode | fully fire-and-forget; never throws, never awaits, silent on network error |

**RLS verified by execution — and two defects were found and fixed during that test:**

| Probe | Expected | Result |
|---|---|---|
| lab manager, same lab | see | ✅ 1 |
| admin, same lab | see | ✅ 1 |
| **technician, same lab** | **not see** | ❌ **1** → fixed → ✅ 0 |
| **courier, same lab** | **not see** | ❌ **1** → fixed → ✅ 0 |
| admin, **other lab** | not see | ✅ 0 |
| doctor | not see | ✅ 0 |
| clinic admin | not see | ✅ 0 |

Both defects mattered: stack traces and Postgres error messages can leak row data,
so under KVKK they must not be readable by every lab employee.

### ⚠️ Pre-existing finding surfaced by that test — `my_role_key()` treats couriers as managers

The courier leak was caused by this branch in `public.my_role_key()`:

```sql
WHEN p.user_type = 'lab' THEN 'lab_manager'   -- "lab user without a role" fallback
```

Any lab user whose `role` is neither `manager` nor `technician` — **including
`courier`** — resolves to `lab_manager`. `my_role_key()` feeds `role_permissions`,
i.e. **the whole permission system**. Couriers are plausibly receiving
manager-level permissions elsewhere in the product.

**`my_role_key()` was deliberately NOT changed** — its blast radius covers every
permission check in the app and it needs its own review and approval. The
`client_errors` policy was rewritten to read `user_type`/`role` directly instead of
depending on that fallback.

**Recommend auditing this separately.** It is a security finding, not a performance one.

### Retention

No cron job was added (that needs approval). Suggested 30 days:

```sql
delete from public.client_errors where created_at < now() - interval '30 days';
```

### ❌ Still missing

| Tool | Present? |
|---|---|
| Sentry | ❌ no |
| Prometheus / `prom-client` | ❌ no |
| OpenTelemetry | ❌ no |
| Datadog / New Relic / Elastic APM | ❌ no |
| PostHog / LogRocket / Bugsnag | ❌ no |
| Grafana dashboards | ❌ no |
| Alerting on the SLOs | ❌ no |
| Distributed tracing | ❌ no |

### Original audit (before the fix)

| Tool | Present? |
|---|---|
| Sentry | ❌ no |
| Prometheus / `prom-client` | ❌ no |
| OpenTelemetry | ❌ no |
| Datadog | ❌ no |
| New Relic | ❌ no |
| PostHog | ❌ no |
| LogRocket | ❌ no |
| Bugsnag | ❌ no |
| Elastic APM | ❌ no |
| Grafana dashboards | ❌ no |
| Alerting | ❌ no |

`grep` for `Sentry|captureException|OpenTelemetry|prom-client|trace.getTracer` across
`modules/ core/ lib/ app/`: **zero matches.**

**Where client errors go today:** `core/ui/RootErrorBoundary.tsx` catches render
crashes, global errors and unhandled rejections — and writes all of them to
`console.error` (lines 66, 176, 188). **They go nowhere else.** A crash in a dental lab
in Turkey produces no signal for the team. There are **147** raw `console.*` calls in
application code.

**What does exist:** `activity_logs` (in-app audit trail), `platform_audit_log`, and
Supabase's built-in dashboard (`pg_stat_statements`, Postgres logs, advisors).

**Status after the 2026-08-02 fix:** client crashes are now captured and queryable.
The requirement "ensure every bottleneck can be detected automatically" is **still not
met** — there is no alerting, no tracing, and no metrics pipeline. What changed is that
crashes are no longer silently discarded.

Remaining to close the gap: Sentry (or equivalent) for grouping/sourcemaps/alerting,
Supabase log drains to a queryable store, and alerts wired to the SLOs in
`performance-targets.md` §1–§8.

---

## 8. Phase 13 — Production readiness by user count

Answered strictly from evidence. "No evidence" is stated where that is the truth.

| Users | Verdict | Basis |
|---|---|---|
| **Current (≈5–20)** | ✅ **PASS** | Measured on production: all hot queries < 1 ms, cache hit 100 %, 0 deadlocks, 0 timeouts, 37 free connections |
| **100** | ⚠️ **WARNING** | **No load test at 100 users against a production-equivalent instance exists.** The only load data (branch, 20–40 VU) predates the dashboard fix and showed dashboard p95 3,976 ms. That number is now stale in the *favourable* direction, but re-measurement is required before claiming PASS. |
| **300** | ⚠️ **WARNING** | No evidence. Connection arithmetic (§6) suggests Supavisor queueing well before this. |
| **1,000** | ❌ **FAIL** | 60 connections cannot serve 1,000 concurrent users on this tier. Not a code limit — a plan limit. |
| **3,000** | ❌ **FAIL** | Same. |
| **5,000** | ❌ **FAIL** | Same. |
| **10,000** | ❌ **FAIL** | Same, plus Realtime fan-out at 72 % of DB time with one tenant. |

**The data ceiling — which was the launch blocker — is gone.** Measured at 0.1075 ms
per row before the fix, the 8 s `statement_timeout` was hit at ~74,000 total orders
(≈15 labs). After the fix the same query ran 41 ms at 100,000 rows, which puts the
equivalent ceiling near **19 million orders [extrapolation** from the measured 41 ms /
100k linear slope**]**.

**What now limits scale is connections and Realtime, not query cost.**

---

## 9. What was NOT measured, and why

These are Phases 2, 3, 4, 5, 9, 10, and 12 of the brief. They are unmeasured, not
estimated.

| Phase | Requirement | Blocker |
|---|---|---|
| 2 | 100 / 300 / 1,000 / 3,000 / 5,000 users | No staging environment (the branch used for the earlier benchmark was deleted after the run). Both production and a new branch are **60-connection micro instances** — testing 5,000 users there measures the tier's limit, not the product's. A single laptop also cannot credibly generate 5,000 VUs; the result would be bounded by the load generator. |
| 3 | Stress to failure beyond 5,000 | Same. `stress.js` refuses to run against production by design. |
| 4 | Spike 10→5,000→10 | Same. |
| 5 | 24 / 48 / 72 h soak | 6 days of continuous wall-clock. Cannot complete in a session. `soak.js` + `scripts/perf-db-watch.mjs` are ready to run. |
| 9 | Uploads 5–150 MB, interrupted, parallel, retry | Needs a non-production Storage bucket; write tests are blocked against production by `config.js` by design. `api/uploads.js` implements all of it. |
| 10 | Weighted role mix + daily traffic curve | Requires the same staging environment. The role weights are implemented in `load.js`. |
| 12 | Before/after graphs | The "before" state exists only on the deleted branch. On production, `pg_stat_statements` accumulates pre- and post-fix calls into the same rows and cannot be separated without a counter reset, which would destroy the historical baseline. The genuine before/after measurements that **do** exist are the `EXPLAIN` pairs in §4 and `performance-report.md` §3. |
| 6 (partial) | Realtime latency / channel limits | Needs thousands of concurrent WebSockets against a production-equivalent instance. |
| 7 (partial) | Pool saturation, 100/200/500 pools | Needs load generation and a tier change. |

**To close these:** a persistent staging project sized like the intended production
tier, plus a load generator that is not the developer laptop (k6 Cloud, or a small
fleet). Everything else — scripts, seed data, thresholds, CI wiring — already exists in
`tests/performance/`.

---

## 10. Remaining bottlenecks, ranked by measured cost

| # | Bottleneck | Measured | Fix |
|---|---|---|---|
| 1 | **Realtime WAL processing** | **72 %** of all DB time; 1,088,313 calls; max 5,572 ms | ✅ `(select …)` applied to `notifications` + `order_stages` RLS (56 % of events) on 2026-08-02. ⏸ Publication trim blocked — all 8 candidates have live subscribers (§5). ⏸ Channel-suffix churn (32k subscription inserts for 38 rows) not yet addressed. |
| 2 | **Observability still incomplete** | Crash capture shipped; **no alerting, tracing or metrics** | Sentry + log drains + SLO alerts |
| 3 | **Temp-file spill** | 116,219 files / **401 GB** on a 56 MB DB | Raise `work_mem` (tier change); reduce schema reloads |
| 4 | **Connection ceiling** | 60 max, **23–36 used at idle** | Compute tier upgrade; reduce per-screen request fan-out |
| 5 | RLS still not index-driven | Seq Scan remains; 41 ms at 100k rows | Split policies by role via `TO` clauses, or JWT claims (§P0b) to remove the OR chain |
| 6 | Order-detail N+1 | 8–12 requests per open | Aggregate RPC, same pattern as the dashboard fix |
| 7 | Trigger cascade on write | 13 triggers on `work_orders`; ~37 `activity_logs` rows/order | pgmq for notification dispatch |
| 8 | Migrations do not replay | Branch creation reported `MIGRATIONS_FAILED`, 0 of 310 applied | Connect the Supabase Git integration — **DR gap** |

---

## 11. Production readiness score

| Dimension | Score | Basis |
|---|---|---|
| Query performance | **7 / 10** | All hot queries < 1 ms; 100 % cache hit; 0 deadlocks; 0 timeouts — **but measured on 22 rows**, which is a weak basis. The 100k-row branch figure (41 ms) is the more meaningful one and it is a single query. |
| Indexing | **7 / 10** | 0 unindexed FKs, 0 invalid indexes — but 64 indexes were already unused before this work and the 145 added have no usage history yet. Re-score after `pg_stat_user_indexes` has a few weeks of data. |
| Tenant isolation | **7 / 10** | **Read AND write policies now audited (§0b, §0c).** 5 leaks fixed: `order_stages`, `profiles`, `payment_intents` (anon-readable), `delay_log`, and **`labs` — where any authenticated user could update or delete any laboratory**. Score *lowered* from 8.5 after the write audit found that: the read-only audit had given false confidence. Still open: `medit_patients` / `order_boxes` (no tenant column), global permission catalogues writable by any admin, browser-side payment writes, `mukellef_cache` writes. |
| Data-volume scalability | **8 / 10** | Ceiling moved from ~74k to ~19M orders **[extrapolation]**; still not index-driven |
| Concurrency scalability | **3 / 10** | 60 connections, 23–36 used at idle; **unmeasured above 40 VU** |
| Realtime efficiency | **2 / 10** | 72 % of DB time with one tenant |
| Disk I/O efficiency | **4 / 10** | 401 GB temp writes on a 56 MB database |
| **Observability** | **3 / 10** | Client crashes now captured in `client_errors` (2026-08-02). Still no alerting, tracing, metrics, or sourcemaps. |
| Load-test evidence | **2 / 10** | Smoke + 40-VU multi-tenant only; Phases 2–5 unmeasured |
| Disaster recovery | **3 / 10** | Migrations do not replay from scratch |
| **Overall** | **5.3 / 10** | **Sound at current load. Not certifiable at scale.** Note the overall figure is an *unweighted mean of dimensions I chose* — it is a summary, not a measurement, and it treats disaster recovery as equal in weight to query performance. Read the dimensions, not the average. |

---

## 12. Recommended order of work

1. ~~**RLS + permission audit.**~~ ✅ **Done 2026-08-02 (§0b)** — 4 leaks and 1
   privilege escalation found and fixed. Remaining security work: move the public
   payment page's writes server-side, and decide on `mukellef_cache` write access.
2. ~~**Observability — crash capture.**~~ ✅ **Done 2026-08-02.** Next layer: Sentry
   for grouping/sourcemaps/alerting, plus log drains.
3. ~~**Persistent staging environment.**~~ ✅ **Created 2026-08-02** —
   `iluffzlykfyrfnvtftwd`, 20 tenants / 200 users / 10k orders / 10k stages, ~$9.70/mo.
   ⚠️ Micro tier (60 connections), so it unblocks isolation, RLS and data-volume
   testing but **not** meaningful concurrency testing above ~300 VUs.
4. **Realtime**: `(select …)` on `notifications` + `order_stages` RLS, trim the 8
   dead/low-value publication tables, fix the channel-suffix churn.
5. **Connect the Supabase Git integration** (1 hour, closes the DR gap).
6. **Compute tier upgrade** before any real multi-tenant launch — raises
   `max_connections` and `work_mem` together, addressing bottlenecks 3 and 4.
7. Order-detail aggregate RPC; pgmq for notifications.

---

*Related: [performance-report.md](performance-report.md) · [performance-analysis.md](performance-analysis.md) · [performance-targets.md](performance-targets.md) · [performance-userflows.md](performance-userflows.md) · [performance-runs.md](performance-runs.md) · [db-optimizations.sql](db-optimizations.sql)*
