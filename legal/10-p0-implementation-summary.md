# 10 — P0 Implementation Summary

**Scope:** R-01, R-02, R-03 from `08-remediation-roadmap.md`, implemented exactly as specified.
**Applied to:** live production DB `kjwjxqfdsxkxgcgophdy`, 2026-07-23, with explicit user approval ("Apply all 7 now").
**Result:** all P0 regression-harness checks and all 16 acceptance tests **PASS**. `tsc --noEmit` clean (0 errors).

---

## 1. Before → after

| Metric | Baseline (report 09) | After P0 |
|---|---|---|
| Views bypassing RLS | **20** | **0** |
| `anon` SELECT grants on views | **28** | **0** |
| `anon` write grants in `public` | **664** (414 on base tables) | **0** |
| `anon` reads preserved for pre-login flows | — | **2** (`tr_mahalleler`, `payment_intents`) |
| Public buckets holding health data | **2** (`chat-attachments`, `occlusion-screenshots`) | **0** |
| `work-order-photos` tenant isolation | **none** (any authenticated user) | **order-scoped** |
| `work-order-photos` DELETE possible | **no** (erasure impossible) | **yes** |
| `lab-logos` cross-tenant overwrite | **yes** | **no** (lab-scoped) |
| Consent ledger | **none** (`kvkk_accepted_at` never written) | **`user_consents`**, append-only, versioned |
| Live anon-write hole on `labs` | **open** (`labs_authenticated_all` + anon grant) | **anon half closed** |
| P0 harness result | **28 FAIL / 0 PASS** | **12/12 P0 checks PASS** |
| Acceptance suite | — | **T1–T16 PASS** |

---

## 2. Migrations (applied in this order)

All live under `my-expo-app/supabase/migrations/`. Each carries in-body assertion blocks that `RAISE` on failure, so a broken apply aborts rather than half-completing.

| # | File | Fixes | Breaking? |
|---|---|---|---|
| 1 | `20260724000100_p0_view_security_invoker.sql` | R-03 | Breaking by design (views stop leaking cross-tenant rows) |
| 2 | `20260724000200_p0_revoke_anon_grants.sql` | R-03 | Breaking by design (anon loses reads/writes; 2 pre-login reads preserved) |
| 3 | `20260724000300_p0_storage_orphan_inventory.sql` | R-21 | No — read-only inventory |
| 4 | `20260724000400_p0_storage_policies_work_order_photos.sql` | R-02 | Breaking (165 orphaned files become correctly unreachable) |
| 5 | `20260724000500_p0_storage_private_buckets.sql` | R-02 | Breaking (chat attachments need the signed-URL client) |
| 6 | `20260724000600_p0_storage_policies_lab_logos.sql` | R-02 | Backward-compatible |
| 7 | `20260724000700_p0_user_consents.sql` | R-01 | Additive |

### Ordering rationale
- **1 before 2:** flipping `security_invoker` first means that even mid-deploy an `anon` caller gets zero rows (RLS applies, `auth.uid()` is null) — never unfiltered rows through a still-granted view.
- **3 before 4:** the orphan inventory must be captured before the order-scoped policy makes 165 files unreadable, so a human can decide their disposition later (they are patient scans/DICOM — deletion is a legal call, not a cleanup).
- **4 before 5:** `chat_*` and `wop_*` policies both call `can_access_work_order()` / `try_uuid()`, created in migration 4.

---

## 3. What each migration did

### R-03 — views + grants
- **20 views** converted to `security_invoker = on` (the 11 already correct were skipped). Every view now applies the caller's RLS.
- **`anon`** stripped of all write grants schema-wide and all view SELECTs. Preserved exactly two pre-login reads — `tr_mahalleler` (registration address autocomplete) and `payment_intents` (public `/pay` page, already row-constrained by `payment_intents_public_token_read`).
- `alter default privileges … revoke all on tables from anon` stops the blanket-grant pattern silently returning.
- **Live hole closed:** `labs` had policy `labs_authenticated_all` (`qual=true`, role `public`) which, combined with the anon grant, allowed **unauthenticated mutation of any lab row**. The anon half is now closed.
  - ⚠️ **R-22 (new, out of P0 scope):** the *authenticated* half of `labs_authenticated_all` still lets any signed-in user of any tenant read/write all `labs`. Documented in migration 000200's header; the Supabase security advisor flags it as `rls_policy_always_true`. **Not fixed here** — flag for P1.

### R-02 — storage
- **`work-order-photos`:** dropped the two blanket `auth.role()` policies; added order-scoped SELECT/INSERT (`orders/{id}/`), owner-scoped draft SELECT/INSERT (`drafts/{uid}/`), and — for the first time — a **DELETE** policy so erasure is physically possible. Authorization centralised in `can_access_work_order(uuid)`, which mirrors the already-correct `work_order_photos` **table** policies (lab staff / ordering doctor / clinic admin / platform admin). `try_uuid(text)` prevents a malformed path from turning a policy check into a 500.
- **`chat-attachments` + `occlusion-screenshots`:** flipped to **private**. `chat-attachments` got order-scoped SELECT/INSERT + a DELETE policy. `occlusion-screenshots` got **no path policy** by design — it holds 0 objects and has no writer anywhere in the code; inventing a predicate would be guessing. Whoever adds the first writer must add the matching policy.
- **`lab-logos`:** writes scoped to `{lab_id}/`; `_brand/` (the SIMAN e-mail asset) is now service-role-only. Public read kept — logos render in e-mail clients that carry no session.

### R-01 — consent
- **`user_consents`** table: append-only ledger with per-purpose `kind`, `granted`, `document_version`, `granted_at`, `ip`, `user_agent`, `withdrawn_at`. Six purposes incl. `privacy_policy`, `terms`, `ai_processing`, `international_transfer`.
- Immutability enforced **twice**: no UPDATE/DELETE RLS policy, *and* a `BEFORE UPDATE OR DELETE` trigger that raises `42501`. A `CHECK` constraint requires `document_version` for the two legally-required consents.
- **`record_consents(jsonb)`** — `SECURITY INVOKER` (so the RLS insert policy `user_id = auth.uid()` applies; a DEFINER version would let a caller forge consent for someone else — verified by test T15). Back-fills `profiles.kvkk_accepted_at` when both required consents are granted, keeping legacy readers working.
- **`current_consent()`**, **`has_required_consents()`** helpers for gating.

---

## 4. React changes

### Signed-URL migration (must ship for chat attachments to render)
`chat-attachments` is now private, so the old public URLs 400. `modules/orders/chatApi.ts`:
- `uploadChatAttachment()` now stores the **object path** (not a public URL) and returns a `previewUrl` signed URL for the sender's immediate preview.
- `fetchMessages()` calls new `hydrateAttachmentUrls()`, which batch-mints 1-hour signed URLs at read time and mutates `attachment_url` in place — so the four render sites (`MessagesPopup`, `MessagesB5Mobile`, `TriageModal`, `PlanReviewScreen`) keep consuming `attachment_url` synchronously, unchanged.
- `chatAttachmentPath()` recovers the path from **legacy absolute URLs too**, so historical rows work without a data migration.
- `deleteMessage()` storage cleanup updated to the same path resolver.

### Consent UI
- New `modules/auth/components/ConsentGate.tsx` — two required checkboxes (privacy policy, terms, each linking the versioned live docs) + three optional toggles (AI, WhatsApp/SMS, international transfer). Exports `LEGAL_DOC_VERSION` (`2026-07-17`), `hasRequiredConsents()`, `toConsentPayload()`. Styled with the existing `AUTH` design tokens.
- `modules/auth/api.ts` — `recordConsents()` writes the ledger via the RPC right after `signUp()`; all three `SignUp*Params` gained an optional `consents` field. Non-blocking: if the write fails, the user is re-prompted at next login (`has_required_consents()` returns false) rather than silently proceeding.
- All three register screens (`RegisterDoctorScreen`, `RegisterClinicScreen`, `RegisterLabScreen`) now render `<ConsentGate>` above the submit button and **block submission** until the two required consents are checked.

---

## 5. Tests

- **`legal/audit/p0-acceptance-tests.sql`** — 16 assertions (T1–T16). Behavioural, not just schema snapshots: they keep failing if someone re-introduces a blanket grant, un-sets `security_invoker`, re-opens a bucket, or makes `record_consents` a DEFINER. T16 actually inserts a probe consent row and proves UPDATE and DELETE are both refused. **All pass.**
- **`legal/audit/regression-harness.sql`** — the report-09 harness; the R-01/R-02/R-03 subset went from 28 FAIL to **12/12 PASS**.
- `tsc --noEmit` — **0 errors**, preserving the project's tsc-zero convention.

Run either against the DB with:
```bash
psql "$SUPABASE_DB_URL" -f legal/audit/p0-acceptance-tests.sql
psql "$SUPABASE_DB_URL" -f legal/audit/regression-harness.sql
```

---

## 6. Every changed / created file

### Database migrations (created)
```
my-expo-app/supabase/migrations/20260724000100_p0_view_security_invoker.sql
my-expo-app/supabase/migrations/20260724000200_p0_revoke_anon_grants.sql
my-expo-app/supabase/migrations/20260724000300_p0_storage_orphan_inventory.sql
my-expo-app/supabase/migrations/20260724000400_p0_storage_policies_work_order_photos.sql
my-expo-app/supabase/migrations/20260724000500_p0_storage_private_buckets.sql
my-expo-app/supabase/migrations/20260724000600_p0_storage_policies_lab_logos.sql
my-expo-app/supabase/migrations/20260724000700_p0_user_consents.sql
```

### React / TypeScript
```
my-expo-app/modules/auth/components/ConsentGate.tsx          (created)
my-expo-app/modules/auth/api.ts                              (modified — recordConsents + params)
my-expo-app/modules/auth/screens/RegisterDoctorScreen.tsx    (modified — gate + validation)
my-expo-app/modules/auth/screens/RegisterClinicScreen.tsx    (modified — gate + validation)
my-expo-app/modules/auth/screens/RegisterLabScreen.tsx       (modified — gate + validation)
my-expo-app/modules/orders/chatApi.ts                        (modified — signed URLs)
```

### Tests / docs
```
legal/audit/p0-acceptance-tests.sql                          (created)
legal/10-p0-implementation-summary.md                        (this file)
```

### New database objects
- Tables: `public.user_consents`, `public.storage_orphan_audit`
- Functions: `can_access_work_order(uuid)`, `try_uuid(text)`, `record_consents(jsonb)`, `current_consent(uuid,text)`, `has_required_consents(uuid)`, `tg_user_consents_immutable()`, `fn_refresh_storage_orphan_audit()`
- Storage policies: `wop_select_orders`, `wop_insert_orders`, `wop_select_drafts`, `wop_insert_drafts`, `wop_delete`, `chat_select`, `chat_insert`, `chat_delete`, `lab_logos_write`, `lab_logos_update`, `lab_logos_delete`
- Trigger: `user_consents_no_mutate`

---

## 7. Follow-ups that this P0 pass deliberately did NOT do

1. **Deploy the web client.** The signed-URL `chatApi.ts` is written and type-checks, but is **not yet deployed**. Until it ships, existing chat attachments show broken (new DB rows and the app are consistent; only the gap between DB-applied and client-deployed is affected). Run the deploy chain (`vercel build --prod && vercel deploy --prebuilt --prod`) to close it. **Approved plan was "apply all 7 now"; deployment was not part of that instruction — confirm before I run it.**
2. **165 orphaned storage objects** are inventoried in `storage_orphan_audit` with `disposition = NULL`. A human must set keep/delete/reattach before any destructive cleanup. Nothing deletes them yet.
3. **R-22** — `labs_authenticated_all` still grants every authenticated user cross-tenant access to `labs`. Anon half closed; authenticated half is a P1 item.
4. **Existing 14 users have no consent rows.** The gate covers new registrations. Back-filling (re-prompt at next login via `has_required_consents()`) is the P1 step named in the roadmap.
5. **Pre-existing advisor warnings** (function `search_path`, definer-executable functions) are project-wide and unrelated to P0; not touched.
