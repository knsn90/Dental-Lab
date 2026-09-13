# 09 — Regression Audit

> ## ⚠️ STATUS: PRE-REMEDIATION BASELINE — NOT A POST-REMEDIATION AUDIT
>
> This audit was requested to run *after* the remediations in `08-remediation-roadmap.md` were implemented.
> **They have not been implemented.** Verified 2026-07-23 by three independent checks:
>
> | Check | Expected if remediated | Actual |
> |---|---|---|
> | Roadmap migrations in `my-expo-app/supabase/migrations/` | 11 files matching `20260724_*` | **0** |
> | Git commits since the roadmap was written | ≥1 | **0** (HEAD still `5aa126c`) |
> | Live schema probe (views, buckets, policies, helper fns, new tables) | all changed | **all unchanged** |
>
> Every P0 item is in its original state. Writing a document that says findings were "fixed"
> would be fabrication, so this file instead records what the audit **actually** measured:
> a machine-verified baseline, produced by the same harness the real audit will re-run.
>
> **This is not wasted work — it is the control group.** Every finding now has a
> reproducible assertion with a recorded "before" value. When remediation lands, re-running
> `legal/audit/regression-harness.sql` produces the genuine before/after audit in minutes,
> with evidence rather than assertion.

---

## 1. How to produce the real audit

```bash
psql "$SUPABASE_DB_URL" -f legal/audit/regression-harness.sql
```

Then replace the "Post" column in §4 with the new results. A finding is **Fixed** only when
*every* check under it reports PASS. Any finding with a mixed result is **Partially fixed** —
and in a privacy audit a partial fix on a data-exposure finding should be treated as
**still reproducible** until proven otherwise.

Checks that cannot be evaluated from the database (privacy-policy text, React components,
Edge Function source) are listed in §6 with the exact command or file to inspect.

---

## 2. Baseline result — 2026-07-23

**First run: 26 FAIL · 2 PASS — both PASSes proved vacuous (§3).**
**After hardening the harness: 28 FAIL · 0 PASS. This is the true baseline.**

| Finding | Checks | Result |
|---|---|---|
| R-01 Consent never recorded | 0/2 | **FAIL** |
| R-02 Storage tenant isolation | 0/6 | **FAIL** |
| R-03 Views bypass RLS + anon grants | 0/3 | **FAIL** |
| R-05 Retention | 0/4 | **FAIL** |
| R-06 Erasure completeness | 0/3 | **FAIL** |
| R-07 Names in free-text logs | 0/2 | **FAIL** |
| R-09 AI governance | 0/2 | **FAIL** |
| R-15 Plaintext secrets | 0/2 | **FAIL** |
| R-19 Broken storage path | 0/1 | **FAIL** |
| R-21 Orphaned objects | 0/3 | **FAIL** |

---

## 3. Two PASS results are vacuous — do not count them

The harness reported PASS for `phone_verifications purged past 24h` and
`gps_pings purged past 90d`. Both are false comfort:

| Check | Rows in table | Why it passed |
|---|---|---|
| `phone_verifications` older than 24h | **0 total rows** | The table is empty. Nothing to purge, so nothing stale. Not evidence of retention |
| `gps_pings` older than 90d | **0 total rows** | Same — the courier GPS feature has produced no data yet |

Neither table has a purge job (`retention/purge cron job exists` = **FAIL**, 0 jobs). The moment
either feature is used in production, both checks would flip to FAIL.

**The harness has been hardened and the fix verified.** Both checks now require the table to be
non-empty before they can pass, and self-label when it is not. Confirmed by re-running:

```
phone_verifications not retained beyond 24h [VACUOUS: table empty] | 0 of 0 rows | FAIL
gps_pings not retained beyond 90d [VACUOUS: table empty]           | 0 of 0 rows | FAIL
```

These two can no longer produce a false PASS, which is why the true baseline is 28 FAIL / 0 PASS.

This is exactly the failure mode an automated audit must guard against: an assertion that passes
because the system is empty, not because it is correct.

---

## 4. Finding-by-finding evidence

Legend — **Post** column to be filled by the post-remediation run.

### R-01 · Consent is never recorded

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| `user_consents` table exists | exists | `0` | **FAIL** | _pending_ |
| Consent rows recorded | >0 | `0` of 14 profiles | **FAIL** | _pending_ |

**Evidence:** `select count(kvkk_accepted_at) from profiles` → `0`. The column exists and is typed
at `my-expo-app/lib/types.ts:37`; no code path writes it. No `user_consents` table.
**Verdict: STILL REPRODUCIBLE.**

### R-02 · Storage tenant isolation

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| No public bucket holds health data | private | **`chat-attachments, occlusion-screenshots`** | **FAIL** | _pending_ |
| Blanket `auth.role()` policies removed | 0 | `2` still present | **FAIL** | _pending_ |
| Order-scoped policies present | ≥3 | `0` | **FAIL** | _pending_ |
| `can_access_work_order()` helper | exists | `0` | **FAIL** | _pending_ |
| DELETE possible on `work-order-photos` | ≥1 policy | `0` | **FAIL** | _pending_ |
| `lab-logos` writes scoped to lab | scoped | `3` unscoped policies | **FAIL** | _pending_ |

**Evidence:** the two original policies — `"Authenticated users can upload photos"` and
`"Users can view photos of accessible orders"` — are still present with predicate
`bucket_id = 'work-order-photos' AND auth.role() = 'authenticated'`. Still no tenant scoping,
still no DELETE policy, so erasure of clinical files remains impossible.
**Verdict: STILL REPRODUCIBLE.**

### R-03 · Views bypass RLS and are granted to `anon`

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| All views enforce `security_invoker` | 0 bypassing | **`20`** | **FAIL** | _pending_ |
| `anon` has no SELECT on any view | 0 grants | **`28`** | **FAIL** | _pending_ |
| `anon` has no write grants in `public` | 0 grants | **`664`** | **FAIL** | _pending_ |

**The exploitable intersection is now exact.** A targeted query confirmed:

```
exploitable_views (no security_invoker AND has_table_privilege('anon','SELECT')) = 20
```

**All 20 RLS-bypassing views are readable by `anon`** — no partial overlap, no mitigating gap.
That set includes `v_payroll_summary` (every salary), `order_timing_summary` and
`v_unbilled_work_orders` (both carry `patient_name`), and `v_leave_summary` (`sick_days`).

**Correction to a number in report 06/08.** I previously described the grant problem in terms of
the 20 views. The harness surfaced that it is broader: `anon` holds **664** write grants across the
`public` schema, of which **414 are on base tables**. That figure needs the right caveat rather
than alarm — **RLS is enabled on all 138 base tables (0 with RLS disabled)**, so those writes are
refused at the policy layer. They are a defence-in-depth failure and a misconfiguration to clean
up, **not** an open write path. The genuine exposure remains the 20 views, where RLS does not apply.

**Not yet reproduced over HTTP.** The sandbox blocked outbound `curl` on both attempts, so I have
grant-level proof but not a reproduced anonymous read. Run this to close the gap:

```bash
curl -s -o /dev/null -w '%{http_code} %{size_download}\n' \
  'https://kjwjxqfdsxkxgcgophdy.supabase.co/rest/v1/v_payroll_summary?select=*&limit=1' \
  -H "apikey: $SUPABASE_ANON_KEY"
```

`200` + non-zero size = confirmed unauthenticated cross-tenant disclosure → Art. 33 clock starts.
**Verdict: STILL REPRODUCIBLE (database-level proven; HTTP-level unverified).**

### R-05 · Retention

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| Retention/purge cron job exists | ≥1 | `0` | **FAIL** | _pending_ |
| `storage_cleanup_queue` consumed | no backlog | **`13` unprocessed** | **FAIL** | _pending_ |
| `phone_verifications` purged | 0 stale | `0` | **VACUOUS** (table empty) | _pending_ |
| `gps_pings` purged | 0 stale | `0` | **VACUOUS** (table empty) | _pending_ |

**New evidence:** `storage_cleanup_queue` holds **13 rows with `processed_at IS NULL`** — direct
confirmation that the queue is written to and never drained, exactly as report 03 predicted.
`cron.job` still contains only `shift-auto-pause`, `tcmb-daily-rates`, `daily-order-watch`.
**Verdict: STILL REPRODUCIBLE.**

### R-06 · Erasure completeness

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| `admin_anonymize_user` clears TCKN | clears | **`no (name+phone only)`** | **FAIL** | _pending_ |
| `admin_purge_lab_pii` covers messages | covers | **`no`** | **FAIL** | _pending_ |
| Unified `erase_subject()` exists | exists | `0` | **FAIL** | _pending_ |

**Evidence:** the harness introspects the live function bodies via `pg_get_functiondef()`.
`admin_anonymize_user` still contains only the single `UPDATE profiles SET full_name=…, phone=NULL,
is_active=false`. `admin_purge_lab_pii` contains no reference to `order_messages`.
**Verdict: STILL REPRODUCIBLE.**

### R-07 · Names embedded in free-text audit logs

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| `activity_logs.action` free of names | 0 rows | **`92` rows match `: Name Surname`** | **FAIL** | _pending_ |
| `log_activity()` no longer swallows errors | ok | **`swallows`** | **FAIL** | _pending_ |

**Evidence:** 92 of ~185 log rows carry an embedded personal name in the free-text `action` column
(`"Hekim oluşturuldu: Dr. Ahmet Yılmaz"` shape). `log_activity()` still ends
`EXCEPTION WHEN OTHERS THEN RETURN NULL`, so audit-write failures remain silent.
**Verdict: STILL REPRODUCIBLE.**

### R-09 · AI governance

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| Per-tenant AI kill switch | `ai_assistant` flag | `0` | **FAIL** | _pending_ |
| AI disclosure log exists | exists | `0` | **FAIL** | _pending_ |

No way to disable the assistant per tenant; no record of what was disclosed to Anthropic, so an
Art. 15 request about AI processing still cannot be answered. **Verdict: STILL REPRODUCIBLE.**

### R-15 · Plaintext secrets

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| `phone_verifications.code` dropped | absent | **`1` (still present)** | **FAIL** | _pending_ |
| `code_hash` present | exists | `0` | **FAIL** | _pending_ |

**Verdict: STILL REPRODUCIBLE.**

### R-19 · Broken storage path

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| `purchase-invoices` bucket exists | exists | `0` | **FAIL** | _pending_ |

`modules/purchases/components/PurchaseFormModal.tsx` still uploads to a bucket that does not exist.
**Verdict: STILL REPRODUCIBLE.**

### R-21 · Orphaned storage objects

| Check | Expected | Baseline | Status | Post |
|---|---|---|---|---|
| No orphans under `orders/` | 0 | **`149`** | **FAIL** | _pending_ |
| No legacy-prefix objects | 0 | **`7`** | **FAIL** | _pending_ |
| No orphaned chat-attachments | 0 | **`9`** | **FAIL** | _pending_ |

**165 files** of patient scans, DICOM and clinical photographs with no owning database record.
Unreachable by any erasure routine and a hard blocker for the P0-2 storage-policy migration.
**Verdict: STILL REPRODUCIBLE.**

---

## 5. Findings the harness deliberately does not cover

Not every finding is machine-checkable, and pretending otherwise would give false assurance.
These require manual verification in the post-remediation run:

| Finding | Why not automatable | How to verify |
|---|---|---|
| R-04 Patient lawful basis / notice | Legal determination | Review executed clinic agreements + patient notice |
| R-08 DPAs and SCCs | Contracts | Confirm executed DPAs exist for all 20 recipients |
| R-10 DPIA | Document | Confirm signed DPIA covering health + GPS + AI |
| R-11 Art. 22 human review | Process, not schema | Interview + document the approval step |
| R-16 QRServer in e-mail | Edge Function source | `grep -n qrserver my-expo-app/supabase/functions/send-email-notification/index.ts` → expect no match |
| R-17 Policy placeholders | HTML text | `grep -c '\[' siman-legal/index.html` → expect 0 bracketed placeholders |
| R-12 Over-collection | React validation | `grep -n 'zorunlu' my-expo-app/modules/orders/screens/NewOrderScreen.tsx:1238-1241` |
| R-13 Draft in localStorage | React | `grep -n 'DRAFT_KEY' NewOrderScreen.tsx` → expect `expo-secure-store` |
| R-14 Web Speech transfer | React + policy | Confirm disclosure text exists |
| R-18 Session storage | Client config | `grep -n 'storage' my-expo-app/core/api/supabase.ts` |
| R-20 AI proxy hardening | Edge Function source | Confirm model allowlist + quota fails closed in `denty-brain/index.ts` |
| R-03 anonymous HTTP read | Blocked in sandbox | The `curl` in §4 |

A shell companion covering the greppable subset belongs at `legal/audit/regression-harness.sh`
and should be written alongside the first remediation PR, so the two run together in CI.

---

## 6. What this baseline is good for

1. **It is the control group.** Every "before" number here is machine-produced, timestamped and
   reproducible — not a claim in prose. Post-remediation deltas will be evidence.
2. **It caught a vacuous-pass trap** (§3) before that trap could produce a falsely reassuring
   audit later.
3. **It sharpened R-03** from "20 views, grants unenumerated" to "all 20 RLS-bypassing views are
   `anon`-readable; 414 table write grants exist but are contained by RLS."
4. **It surfaced hard numbers** the roadmap can now be sequenced against: 13 unconsumed cleanup-queue
   rows, 92 log rows with embedded names, 165 orphaned clinical files.
5. **It can run in CI** from the first remediation PR onward, so a regression re-opening a
   closed finding fails the build rather than waiting for the next audit cycle.

## 7. Recommended next step

Do not re-request this audit until at least P0-1 through P0-4 have merged and deployed. The
harness is committed and ready; re-running it is a single command. In the meantime the one thing
worth doing today is the anonymous-read `curl` in §4 — it is the only open question that could
convert this from a remediation backlog into an active incident.
