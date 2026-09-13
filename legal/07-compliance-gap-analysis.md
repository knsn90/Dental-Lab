# 07 — Compliance Gap Analysis

Every row is answered from the source code. **Present** means it exists and works. **Partial** means it exists but does not fully do what it claims. **Missing** means no implementation was found.

---

## 1. Documentation & governance

| Requirement | Status | Evidence |
|---|---|---|
| **Privacy Policy** | **Partial** | `siman-legal/index.html`, live at `https://siman-legal.vercel.app/`, linked from `DoctorProfileMobile.tsx:29,438`. **Controller identity, address and contact e-mail are still `[placeholders]`.** Omits 12 of the 20 identified recipients. §5's deletion claim does not match the implementation |
| **Terms of Service** | **Partial** | `siman-legal/terms.html` (4.1 KB), linked at `DoctorProfileMobile.tsx:30,436`. Not shown at registration, no version number, no acceptance record |
| **Versioned acceptance of policy/terms** | **Missing** | No version field, no acceptance table, no acceptance timestamp anywhere |
| **Cookie / tracker consent** | **N/A but undocumented** | No cookies beyond the Supabase auth session and no tracking SDKs exist, so a consent banner is not required. **This should be stated explicitly in the policy** so the absence reads as a decision, not an omission |
| **Record of Processing Activities (RoPA / VERBİS)** | **Missing → now drafted** | None existed; `02-processing-activities.md` is the first |
| **Data Processing Agreement (customer-facing)** | **Missing** | SIMAN is Processor for every lab tenant. No DPA template, no signature flow |
| **Sub-processor list & change notice** | **Missing** | Only prose in policy §4, incomplete |
| **DPAs with sub-processors** | **Missing** | Zero contracts in the repository for 20 external recipients |
| **SCCs / transfer mechanism** | **Missing** | Anthropic, Resend, Twilio, Expo, Google, Medit, Vercel, Brandfetch, Clearbit, QRServer all receive data; no mechanism evidenced. KVKK m.9 unmet |
| **DPIA** | **Missing** | Required for: large-scale health data (Art. 35(3)(b)), systematic employee monitoring incl. GPS (Art. 35(3)(c)), AI processing of special-category data |
| **Retention & destruction policy (Saklama ve İmha Politikası)** | **Missing** | Mandatory under the Turkish destruction regulation. No policy, no schedule, no periodic destruction cycle |
| **Breach-notification procedure** | **Missing** | No runbook, no 72-hour process, no breach register |
| **DPO / KVKK contact person** | **Missing** | Policy §1 contact is a `[placeholder]` |
| **VERBİS registration** | **UNKNOWN** | Cannot be determined from source |
| **Data-classification / handling standard** | **Missing** | No internal document |
| **Training records** | **Missing** | N/A to source code |
| **Medical-device / MDR positioning** | **UNKNOWN** | SIMAN orchestrates manufacture of custom-made dental devices. Whether the software is in scope of MDR or Turkish TİTUBB rules is a legal question outside the code |

---

## 2. Consent & lawful basis

| Requirement | Status | Evidence |
|---|---|---|
| **Consent capture at registration** | **Missing** | No checkbox in any of the three register screens; `modules/auth/api.ts:23-148` writes no consent |
| **Consent record storage** | **Broken** | `profiles.kvkk_accepted_at` exists, is typed in `lib/types.ts:37`, and is **never written**. Live: 0 of 14 rows populated |
| **Granular consent (AI / marketing / WhatsApp / transfer)** | **Missing** | `notification_prefs` is a delivery preference, not consent, and the e-mail filter is **opt-OUT** |
| **Consent withdrawal mechanism** | **Missing** | Nothing to withdraw from |
| **Explicit consent for special-category data** | **Missing** | Health, national ID, nationality, biometric-adjacent scans all processed without it |
| **Patient consent capture** | **Missing** | The patient never touches the system |
| **Age verification / children** | **Partial** | Policy §8 states the app is not for under-18s; no technical check. Note: **paediatric dental patients are a real population and their data will be in `work_orders`** — §8 addresses users, not data subjects |
| **Lawful basis documented per activity** | **Missing → now drafted** | `02-processing-activities.md` |

---

## 3. Data subject rights

| Right | Status | Evidence |
|---|---|---|
| **Access (Art. 15)** | **Partial** | Users see their own data through the UI. `admin_export_lab_data` is admin-only, tenant-scoped, and **silently truncates `work_orders` and `invoices` to 5 000 rows each**. No self-service export |
| **Portability (Art. 20)** | **Missing** | No machine-readable self-service export |
| **Rectification (Art. 16)** | **Present for users** / **Missing for patients** | Profile and order edit screens exist; patients have no channel |
| **Erasure (Art. 17)** | **Partial** | `delete-account` covers the account holder; leaves storage objects, `activity_logs`, `order_messages`, notification history and authored patient data. `admin_anonymize_user` only clears `full_name` and `phone`. `admin_purge_lab_pii` touches four tables and no files. **Desktop-web has no delete control** |
| **Restriction (Art. 18)** | **Missing** | No mechanism |
| **Objection (Art. 21)** | **Missing** | No mechanism |
| **Art. 22 — automated decisions** | **Missing** | `trust_score`, `doctor_score`, `employee_performance.score` and bonus computation feed pay; no notice, no explanation, no contest route |
| **Rights request intake** | **Missing** | Policy §6 says "write to the contact address" — which is a `[placeholder]` |
| **Response-deadline tracking** | **Missing** | No case management |

---

## 4. Security & access control

| Control | Status | Evidence |
|---|---|---|
| **RLS enabled on all base tables** | **Present** | 138 of 138 |
| **RLS policies correct on views** | **Failing** | 20 of 31 views lack `security_invoker` — see R-03 |
| **Storage tenant isolation** | **Failing** | `work-order-photos` open to all authenticated users; `chat-attachments`, `occlusion-screenshots`, `avatars`, `lab-logos` public — see R-02 |
| **Storage isolation done right** | **Present (3 buckets)** | `employee-docs`, `paper-orders`, `support-attachments` |
| **Encryption in transit** | **Present** | HTTPS everywhere; Supabase-managed TLS |
| **Encryption at rest** | **Present (platform-level)** | Supabase/AWS disk encryption. **No column-level encryption for `provider_credentials.credentials`, `phone_verifications.code`, `profiles.tc_kimlik_no`, `employees.tc_no`, `doctors.tckn`** |
| **Secrets management** | **Partial** | Edge-function env vars are correct; `provider_credentials` holds third-party API keys in a plain `jsonb` application column |
| **MFA** | **Missing** | `auth.mfa_factors` exists (Supabase-provisioned) but the app never enrols or enforces it. For a system holding health data this is a material gap |
| **Password policy** | **UNKNOWN** | Supabase dashboard setting, not in source |
| **Session timeout** | **Partial** | `lab_settings.auto_logout_minutes` exists as a column; whether it is enforced client-side is **UNKNOWN** |
| **Rate limiting** | **Partial** | Only the AI quota, and it **fails open**. No rate limit found on auth, OTP or file upload |
| **Audit logging** | **Present but flawed** | `activity_logs` + `platform_audit_log` + `auth.audit_log_entries`. `log_activity()` swallows all exceptions, so failures are silent; names are embedded in free text |
| **Cross-tenant admin access controls** | **Present but unbounded** | `is_platform_admin()` gates the `admin_*` RPCs; those admins can read every tenant's health data with no per-access justification or approval |
| **Penetration test / security review** | **UNKNOWN** | No artefacts in the repository |
| **Backup & restore, backup encryption, backup retention** | **UNKNOWN** | Supabase-managed; no configuration in source |
| **Vulnerability management for edge functions** | **Weak** | Every function imports from `https://esm.sh` and `https://deno.land/std@…` at cold start — an unpinned third-party code-supply dependency |

---

## 5. Data lifecycle

| Requirement | Status | Evidence |
|---|---|---|
| **Retention schedule** | **Missing** | No table has one |
| **Automated deletion** | **Missing** | 3 cron jobs, none deletes |
| **Storage lifecycle rules** | **Missing** | `storage_cleanup_queue` has no consumer |
| **Archival ≠ deletion** | **Noted** | `work_orders.is_archived` is a UI flag only |
| **Log rotation** | **Missing** | `auth.audit_log_entries` (IPs), `gps_pings`, `activity_logs`, `stage_activity_events` grow unbounded |
| **OTP expiry cleanup** | **Missing** | `phone_verifications` rows persist with plaintext codes |
| **Financial-record retention (TR: 10 yrs)** | **Not implemented** | No enforcement either way — nothing is deleted, so nothing is lost, but there is no policy |
| **Payroll/SGK retention** | **Not implemented** | Same |
| **Anonymisation-after-retention** | **Missing** | Only manual admin functions |

---

## 6. Transparency

| Requirement | Status |
|---|---|
| Privacy notice reachable before signup | **Missing** — links appear only post-login, in the mobile profile |
| Privacy notice reachable in-app | **Partial** — mobile doctor profile only; desktop web has no link |
| AI-processing notice at point of use | **Missing** |
| Notice of international transfer | **Partial** — §4 names six recipients, no transfer-mechanism statement |
| Notice of employee monitoring (GPS/attendance/performance) | **Missing** |
| Notice to patients | **Missing** |
| Recipient list complete | **Missing** — 12 of 20 undisclosed |
| Retention periods published | **Missing** — §5 says "as long as needed", no periods |
| Contact for rights requests | **Missing** — `[placeholder]` |
| Supervisory-authority complaint right named | **Missing** — §6 omits the right to lodge a complaint with KVKK/a DPA |

---

## 7. Prioritised remediation plan

### P0 — before any further production use (days)

1. **Fix `work-order-photos` storage policies** to enforce tenant/order scoping (R-02). Highest-impact single change in this report.
2. **Make `chat-attachments` and `occlusion-screenshots` private**; migrate to signed URLs (R-02).
3. **Set `security_invoker = on` on all 20 affected views**, and `REVOKE SELECT` from `anon` where not needed (R-03).
4. **Fill the privacy-policy placeholders** with the real controller identity, address and contact e-mail (R-17).
5. **Remove the QRServer `<img>` from outbound e-mails** — it leaks approval tokens and recipient IPs to an uncontracted third party (R-16).
6. **Scope `lab-logos` write policies** to the owning lab (R-02).

### P1 — before onboarding new tenants (2-4 weeks)

7. **Implement consent capture** at registration: a `consents` table (append-only) recording policy version, terms version, timestamp, IP, and separate opt-ins for AI processing, WhatsApp/SMS and international transfer. Backfill existing users at next login (R-01).
8. **Execute a DPA with Anthropic** including zero-retention terms; add a per-tenant AI kill switch via `lab_feature_flags`; add an in-app AI notice (R-09).
9. **Complete the erasure routine** — every table and every bucket — and add the desktop-web delete entry point (R-06).
10. **Write and implement the retention policy** as pg_cron jobs; build the `storage_cleanup_queue` consumer (R-05).
11. **Hash `phone_verifications.code`; move `provider_credentials.credentials` into Vault/`pgsodium`** (R-15).
12. **Execute DPAs with the remaining sub-processors**; publish a complete versioned sub-processor list (R-08).
13. **Move the order draft into `expo-secure-store` and clear it on sign-out** (R-13).

### P2 — before scale (1-3 months)

14. **Conduct and document the DPIA** covering health data, employee GPS/attendance monitoring, and AI (R-10).
15. **Enable and require MFA** for lab admins and platform admins at minimum.
16. **Build a data-subject-rights intake and fulfilment workflow**, including self-service export (Art. 15/20) and a patient-rights channel via the lab (R-04).
17. **Restructure `activity_logs`** so names live in structured columns, and make them redactable on anonymisation (R-07).
18. **Make TC kimlik and nationality optional**; remove or justify `patient_gender` and `profiles.gender`; resolve `patient_phone` (R-12).
19. **Publish an employee monitoring notice**; shorten `gps_pings` retention (R-10).
20. **Document the human-review step in performance scoring**; give employees visibility and a contest route (R-11).
21. **Disclose the Web Speech API transfer** or replace it with on-device recognition (R-14).
22. **Produce the customer-facing DPA** for lab tenants and a breach-notification runbook (R-08).
23. **Pin edge-function imports** to immutable versions instead of live CDN fetches.
24. **Fix the `purchase-invoices` bucket**; determine where delivery signatures and payment receipts actually go (R-19).
25. **Add a model allowlist and make the AI quota fail closed** (R-20).

---

## 8. Summary scorecard

| Domain | Score | Note |
|---|---|---|
| Data inventory & mapping | **0 → complete** | Did not exist; produced by this exercise |
| Consent management | **0 / 10** | Column exists, is never written, 0 of 14 rows populated |
| Lawful basis | **2 / 10** | Contract is defensible for operations; **no basis at all for health data, AI, or international transfers** |
| Transparency | **3 / 10** | Policy and terms exist but carry placeholders, omit 12 recipients, and are unreachable pre-signup |
| Data subject rights | **3 / 10** | Access/rectification usable; erasure partial; restriction/objection/portability absent; patients have no channel |
| Retention | **0 / 10** | Nothing is ever deleted |
| Security — RLS on tables | **8 / 10** | Comprehensive and mostly well-built |
| Security — RLS on views | **3 / 10** | 20 of 31 bypass RLS |
| Security — storage | **2 / 10** | Two public buckets with health data; the main clinical bucket has no tenant isolation |
| Security — secrets | **6 / 10** | Env vars handled correctly; three plaintext-secret tables |
| Vendor management | **1 / 10** | 20 recipients, 0 contracts |
| AI governance | **2 / 10** | Good engineering controls (JWT, RLS-bound tools, human gating); **zero legal controls** |
| Logging & audit | **6 / 10** | Broad coverage; silent failures; names in free text; no retention |
| Absence of tracking | **10 / 10** | Genuinely no analytics, advertising or session-replay SDKs — a real strength |

---

## 9. Items that could not be determined from source — legal/ops must supply

1. **Supabase hosting region** — decisive for whether any transfer occurs at all. Not declared in `app.json`, `.env.local`, `vercel.json`, `eas.json` or any config file.
2. **Supabase plan and backup retention/encryption settings.**
3. **Whether OAuth providers are enabled** at the Supabase project level (`auth.identities` exists, but no OAuth code path does).
4. **Supabase password policy, session lifetime and rate-limit settings** (dashboard-only).
5. **Whether `lab_settings.auto_logout_minutes` is enforced.**
6. **Anthropic commercial agreement terms** — retention, training exclusion, region.
7. **Whether the Nilvera e-Fatura integration is live** — the base-URL line is commented out at `efatura-send/index.ts:135`.
8. **Whether `payment_attempts.request_body` ever contains cardholder data** — must be verified against a live payload before the "no card data" claim is repeated in any legal document.
9. **The destination bucket for `deliveries.signature_path` and `payment_submissions.receipt_url`** — no `storage.from()` call was found for either.
10. **Whether performance-score approval is substantive human review** (Art. 22).
11. **The legal identity of the data controller** — still a placeholder in the published policy.
12. **VERBİS registration status.**
13. **Whether SIMAN is in scope of MDR / Turkish medical-device software rules.**
14. **`GRANT`s on the 20 non-`security_invoker` views** — determines whether R-03 is exploitable or latent.
