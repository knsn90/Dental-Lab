# 06 — Privacy & Security Risk Report

Findings are ordered by severity. Each is traceable to a file, line or live database query. Severity reflects **privacy/regulatory impact**, not code quality.

| ID | Severity | Title |
|---|---|---|
| R-01 | **CRITICAL** | No consent is ever recorded — the consent column exists but is never written |
| R-02 | **CRITICAL** | Storage buckets have no tenant isolation; two public buckets hold health data |
| R-03 | **CRITICAL** | 20 database views bypass RLS (`security_invoker` not set) |
| R-04 | **HIGH** | Patient data is processed with no lawful basis and no patient-facing notice |
| R-05 | **HIGH** | No retention policy, no deletion job — data is kept forever |
| R-06 | **HIGH** | Erasure mechanisms are incomplete; personal data survives account deletion |
| R-07 | **HIGH** | Personal names are baked into free-text audit logs and survive anonymisation |
| R-08 | **HIGH** | No DPA, no SCCs, no sub-processor agreements for 14 external recipients |
| R-09 | **HIGH** | Patient health data sent to a US AI provider without consent or anonymisation |
| R-10 | **MEDIUM** | Employee geolocation surveillance without DPIA |
| R-11 | **MEDIUM** | Automated worker scoring feeding pay decisions |
| R-12 | **MEDIUM** | Over-collection: TC kimlik no + nationality mandatory; patient phone collected then discarded |
| R-13 | **MEDIUM** | Patient PII persisted unencrypted in browser/device local storage |
| R-14 | **MEDIUM** | Voice audio transmitted to the browser vendor without disclosure |
| R-15 | **MEDIUM** | OTP codes and third-party credentials stored in plaintext application tables |
| R-16 | **MEDIUM** | E-mails leak recipient IP + approval tokens to an unrelated third party (QRServer) |
| R-17 | **LOW** | Privacy policy contains unfilled placeholders and omits several sub-processors |
| R-18 | **LOW** | Session tokens stored in AsyncStorage/localStorage although `expo-secure-store` is installed |
| R-19 | **LOW** | `purchase-invoices` bucket referenced in code but does not exist |
| R-20 | **LOW** | AI proxy accepts a caller-supplied model and its rate limiter fails open |

---

## R-01 — CRITICAL — No consent is ever recorded

**Evidence.** `public.profiles.kvkk_accepted_at timestamptz` exists in the live schema and is typed in `my-expo-app/lib/types.ts:37`. A repository-wide search for `kvkk_accepted_at` returns **only that type declaration** — there is no `INSERT`, no `UPDATE`, no trigger, no RPC that ever writes it. Confirmed live:

```sql
select count(*) total, count(kvkk_accepted_at) kvkk_set from public.profiles;
-- total: 14, kvkk_set: 0
```

The three registration screens (`RegisterDoctorScreen.tsx`, `RegisterClinicScreen.tsx`, `RegisterLabScreen.tsx`) and `modules/auth/api.ts:23-148` contain **no consent checkbox, no terms-acceptance control, and no link to the privacy policy or terms**. The only links to `siman-legal.vercel.app` are inside the mobile doctor profile screen after login (`DoctorProfileMobile.tsx:29-30, 436-438`).

**Impact.** Every processing activity that requires consent — the AI transfer of health data, WhatsApp notifications, biometric-adjacent scan storage, the international transfers — has **no lawful basis**. There is no versioned acceptance record, so it cannot be shown *which* policy version any user agreed to, or *whether* they agreed at all. KVKK m.5/m.6 and GDPR Art. 7(1) (demonstrability) are both unmet.

**Remediation.** Add a blocking consent step to registration capturing: policy version, terms version, timestamp, IP, and separate granular opt-ins for (a) AI processing, (b) WhatsApp/SMS, (c) international transfer. Store as a `consents` table (append-only), not a single nullable column. Backfill by re-prompting existing users at next login.

---

## R-02 — CRITICAL — Storage buckets have no tenant isolation; public buckets hold health data

**Evidence (live `pg_policies` on schema `storage`).**

`work-order-photos` — the bucket holding STL/PLY/OBJ scans, DICOM files and intra-oral photographs:
```
INSERT: (bucket_id = 'work-order-photos') AND (auth.role() = 'authenticated')
SELECT: (bucket_id = 'work-order-photos') AND (auth.role() = 'authenticated')
```
There is **no `lab_id` check, no `work_order_id` check, no ownership check, and no DELETE or UPDATE policy at all**. Any authenticated user of any tenant can read and write every object in this bucket if they know or enumerate the path. The policy is even named *"Users can view photos of accessible orders"* — a name that asserts a restriction the predicate does not implement.

`chat-attachments` — **`public = true`**, no MIME restriction, 100 MB limit. `modules/orders/chatApi.ts:445` calls `getPublicUrl()`. Order-chat attachments — which in a dental-lab workflow routinely include case photographs and design files — are therefore served over **unauthenticated HTTP** to anyone holding the URL.

`occlusion-screenshots` — **`public = true`** and **has zero storage policies of any kind**. Holds rendered occlusion analyses of individual patients' dentition.

`avatars`, `lab-logos` — also `public = true`. `lab-logos` grants INSERT/UPDATE/DELETE to *any* authenticated user with no tenant scoping, so any user on the platform can overwrite or delete any other tenant's logo, including the SIMAN brand asset embedded in every outbound e-mail (`send-email-notification/index.ts:44`).

**Correctly scoped, for contrast:** `employee-docs` (lab-id prefix), `paper-orders` (lab-id via `profiles`), `support-attachments` (ticket-id prefix).

**Impact.** A cross-tenant breach of special-category health data. This is a notifiable personal-data breach class under GDPR Art. 33/34 and KVKK m.12 if exploited. In a multi-tenant SaaS this is the single most consequential finding in the report.

**Remediation.** (1) Flip `chat-attachments` and `occlusion-screenshots` to private and migrate every stored public URL to signed URLs. (2) Rewrite the `work-order-photos` policies to join `work_order_photos`/`work_orders` and enforce `lab_id = get_my_lab_id()` (or clinic/doctor participation). (3) Scope `lab-logos` writes to the owning lab. (4) Add DELETE policies so erasure is possible at all. (5) Audit existing object paths for guessability.

---

## R-03 — CRITICAL — 20 views bypass Row-Level Security

**Evidence.** Postgres views run with the definer's privileges unless `security_invoker` is set. Live query result — **20 of 31 views have it unset**:

`my_clinic_doctors`, `my_clinic_users`, `order_timing_summary`, `stage_timing_confidence`, `v_attendance_monthly`, `v_budget_actuals`, `v_cash_account_summary`, `v_employee_summary`, `v_expiring_documents`, `v_invoice_reminders`, `v_leave_summary`, `v_low_stock`, `v_monthly_finance_summary`, `v_monthly_finance_summary_ccy`, `v_payroll_summary`, `v_performance_summary`, `v_technician_performance_detail`, `v_unbilled_work_orders`, `v_upcoming_due_invoices`, `v_user_salary_summary`.

None of these views carries an RLS policy of its own (views cannot). The most severe among them:

| View | Data exposed if reachable via PostgREST |
|---|---|
| **`order_timing_summary`** | **`patient_name`** + order numbers across **all tenants** |
| **`v_unbilled_work_orders`** | **`patient_name`**, doctor name, clinic name, amounts, **all tenants** |
| **`v_payroll_summary`** | Every employee's name, role, base salary, deductions, net salary, **all tenants** |
| **`v_user_salary_summary`** | Per-user salary, bonus, penalty, net |
| **`v_leave_summary`** | Employee names + **`sick_days`** — health data |
| **`v_employee_summary`** | Names, phones, salaries, advances |
| **`my_clinic_users` / `my_clinic_doctors`** | Names, phones, e-mails, avatars, permissions |
| **`v_clinic_balance`** *(this one HAS `security_invoker=true`)* | — correctly protected |

**Impact.** If any of these views is exposed to the `authenticated` role through PostgREST, a single authenticated user of one tenant can read other tenants' patient names, payroll and health data with a plain `GET /rest/v1/v_payroll_summary`.

**Note on scope.** Reachability depends on the `GRANT`s on each view, which this audit did not enumerate. If `anon`/`authenticated` lack `SELECT`, exposure is limited to service-role paths. **That must be verified before the severity is downgraded.** The project's own convention (recorded in its notes) is that views should be `security_invoker` — 11 views already are, so the 20 are drift, not design.

**Remediation.** `ALTER VIEW <name> SET (security_invoker = on);` for all 20, then re-test each consuming screen. Additionally `REVOKE SELECT ... FROM anon` on every view that is not deliberately public.

---

## R-04 — HIGH — Patient data processed with no lawful basis and no patient-facing notice

**Evidence.** `work_orders` stores patient full name, TC kimlik/passport number, date of birth, gender and nationality — and `modules/orders/screens/NewOrderScreen.tsx:1238-1241` makes **DOB, gender, TC kimlik and nationality all mandatory**:

```
if (!form.patient_dob)                      e.patient_dob        = 'Doğum tarihi zorunlu';
if (form.patient_gender === 'belirtilmedi') e.patient_gender     = 'Cinsiyet seçin';
if (!form.patient_id?.trim())               e.patient_id         = 'TC kimlik zorunlu';
if (!form.patient_nationality)              e.patient_nationality = 'Uyruk seçin';
```

The patient is **never a user of SIMAN**. They cannot log in, receive no notice, give no consent inside the system, and have no route to exercise access, rectification, erasure, restriction or objection. `siman-legal/index.html` addresses only *"diş laboratuvarı, klinik ve hekim kullanıcıları"* — patients are named in §2 as a data category but are given no rights channel.

Nationality is a proxy for ethnic origin (GDPR Art. 9(1)); no processing purpose for it appears anywhere in the codebase.

**Impact.** Processing of Art. 9 / KVKK m.6 special-category data at scale with no identified basis, no transparency and no rights mechanism.

**Remediation.** Decide and document the Controller/Processor split; require the clinic to obtain and evidence patient explicit consent; provide a patient-notice template the clinic must serve; build a patient-rights intake route (even if fulfilled by the lab on the patient's behalf); make TC kimlik and nationality optional unless a statutory duty is identified and cited.

---

## R-05 — HIGH — No retention policy; nothing is ever deleted

**Evidence.** Live `cron.job` contains exactly three jobs:

| jobid | schedule | jobname | command |
|---|---|---|---|
| 1 | `*/5 * * * *` | `shift-auto-pause` | `SELECT public.auto_manage_shift_pauses();` |
| 2 | `30 13 * * 1-5` | `tcmb-daily-rates` | HTTP POST to the `tcmb-rates` function |
| 4 | `0 8 * * *` | `daily-order-watch` | `SELECT public.fn_daily_order_watch();` |

**None deletes anything.** No TTL, no partition drop, no archival job, no storage lifecycle rule exists anywhere in the repository. `work_orders.is_archived` is a boolean flag that hides rows in the UI. `storage_cleanup_queue` is populated but **has no consumer** — its `processed_at` column will never be set.

Consequently `auth.audit_log_entries` (IP addresses), `auth.sessions` (IP + user agent), `gps_pings` (courier movement trails), `phone_verifications` (plaintext OTPs), `activity_logs`, `email_notifications`, `whatsapp_notifications`, `payment_attempts` (raw provider payloads) and every storage object grow without bound and are retained indefinitely.

**Impact.** GDPR Art. 5(1)(e) storage-limitation breach; KVKK m.7 (deletion/destruction/anonymisation obligation) and the Turkish *Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik* — which requires a documented **Saklama ve İmha Politikası** and a periodic destruction cycle (every 6 months) — are both unmet.

**Remediation.** Draft the retention schedule per table (financial: 10 yrs TR commercial-book; SGK/payroll: per labour law; operational logs: 6-12 months; GPS pings: 30-90 days; OTPs: minutes; auth logs: 12 months), then implement it as pg_cron jobs plus a storage lifecycle worker that finally consumes `storage_cleanup_queue`.

---

## R-06 — HIGH — Erasure is incomplete; personal data survives account deletion

**Evidence.** Three erasure mechanisms exist; all three are partial.

**(a) `delete-account` edge function** (`supabase/functions/delete-account/index.ts`): verifies the caller, blocks deletion of the last lab owner/admin (`:47-81`), nulls `approved_by`/`created_by`/`granted_by` references (`:96-99`), anonymises the linked `doctors` row to `'Silinmiş hesap'` (`:101-108`), then `auth.admin.deleteUser()` (`:114`) and an explicit `profiles` delete (`:118`).
**Survives:** every storage object (avatar, uploaded scans, chat files), `activity_logs` (including `actor_name` and names inside free-text `action`), `order_messages.content`, `email_notifications` (address + full body + payload), `whatsapp_notifications` (phone + payload), `auth.audit_log_entries` (IP addresses), `phone_verifications`, and all `work_orders` patient data the user authored.
**Reachable only from the mobile doctor profile** (`DoctorProfileMobile.tsx`); the desktop-web `ProfileScreen.tsx` has no delete control.

**(b) `admin_anonymize_user(p_user)`** — the entire body is:
```sql
UPDATE profiles SET full_name='Silinmiş kullanıcı', phone=NULL, is_active=false WHERE id=p_user;
```
**Leaves intact:** `email`, `tc_kimlik_no`, `birth_date`, `gender`, `address`, `city`, `diploma_no`, `avatar_url`, `whatsapp_phone`, and every historical record naming the person.

**(c) `admin_purge_lab_pii(p_lab, p_confirm_name)`** — overwrites `profiles.full_name/phone`, `work_orders.patient_name/patient_id/patient_dob/patient_nationality/patient_country/patient_city`, `clinics.name/phone/contact_person`, `doctors.full_name/phone`, and deactivates the lab.
**Leaves intact:** all storage objects, `order_messages`, `activity_logs`, `notifications`, `medit_patients.name`, `pending_paper_orders.patient_name` + `ocr_data`, `order_reviews.clinical_photos`, `deliveries.recipient_name`/`destination_*`/`signature_path`, `employees.tc_no`, `employee_documents`, `gps_pings`, `phone_verifications`, `email_notifications`, `whatsapp_notifications`.

**Impact.** An Art. 17 / KVKK m.7 erasure request cannot be honoured. The system will report success while retaining the data.

**Remediation.** Build a single, tested erasure routine that enumerates every table and bucket holding data linked to the subject. Add the desktop-web delete entry point. Log each erasure to `platform_audit_log` with the affected row/object counts.

---

## R-07 — HIGH — Personal names baked into free-text audit logs

**Evidence.** `activity_logs.action` is uncontrolled free text into which the application interpolates names. Verified from live data:

```
"Hekim oluşturuldu: Dr. Ahmet Yılmaz"
"Hesap pasif edildi: Enes Balaban"
"Profil bilgileri güncellendi: Dt. Medet Roger Paydaş"
"Klinik güncellendi: Melis Ağız ve Diş Sağlığı Polikliniği"
"Hekim silindi: Dr. Aylin Şahiner"
```

The table also stores `actor_name` denormalised (written by `log_activity()`, a `SECURITY DEFINER` function that copies `profiles.full_name` at write time) and `entity_label`.

**Impact.** Anonymisation is structurally defeated: nulling `profiles.full_name` does not touch the historical copies, and the free-text form makes automated redaction unreliable. `log_activity()` also swallows all errors (`EXCEPTION WHEN OTHERS THEN RETURN NULL`), so audit-log write failures are silent — the audit trail cannot be relied on for completeness.

**Remediation.** Move names out of `action` into `entity_label`/`metadata` as structured references; on anonymisation, rewrite `actor_name` and `entity_label` and redact `action` for the affected subject. Consider a shorter retention for `activity_logs`.

---

## R-08 — HIGH — No DPA, no SCCs, no sub-processor agreements

**Evidence.** The repository contains no `DPA`, `dpa.md`, sub-processor list, SCC annex, transfer impact assessment or record of any processor contract. The only document is `siman-legal/index.html` §4, which names six recipients in prose. Fourteen external recipients were identified in `04-third-party-data-flow.md`, including **eight not mentioned in the policy at all**: Brandfetch, Clearbit, Google Favicons, Google Places, QRServer, NetGSM/İleti Merkezi/Mutlucell, Medit, Vercel.

**Impact.** GDPR Art. 28(3) requires a written processor contract for each; Art. 30(1)(d) requires the recipient list; Chapter V requires a transfer mechanism for each US/third-country recipient. KVKK m.9 requires explicit consent or an undertaking for transfers abroad. None is evidenced.

**Remediation.** Execute DPAs with all sub-processors; publish a versioned sub-processor list with a change-notification commitment; complete a TIA for each third-country transfer; offer a customer-facing DPA to lab tenants (SIMAN is their Processor).

---

## R-09 — HIGH — Health data sent to a US AI provider without consent or anonymisation

Fully documented in `05-ai-data-processing.md`. Summary: patient names, national IDs and clinical detail reach `claude-sonnet-4-5` at `api.anthropic.com` through four code paths (`denty-brain`, `parse-work-order`, `parse-invoice`, `parse-receipt`) with **no anonymisation, no consent, no opt-out, no per-tenant kill switch, and no audit log of what was disclosed**. `parse-work-order` transmits entire photographs of handwritten patient prescriptions.

**Remediation.** Obtain an Anthropic DPA with zero-retention terms; add explicit consent for AI processing; add a per-tenant AI disable flag (`lab_feature_flags` already exists as a mechanism); pseudonymise patient identifiers before transmission where the task does not require them; log every AI disclosure so Art. 15 requests can be answered.

---

## R-10 — MEDIUM — Employee geolocation surveillance without DPIA

**Evidence.** `employee_attendance.check_in_lat/lng` and `check_out_lat/lng` are captured by `app/checkin.tsx:76-78` (`Location.requestForegroundPermissionsAsync()` → `getCurrentPositionAsync()`), validated against a geo-fence in `labs.location_lat/location_lng/location_radius`. Separately, `gps_pings` records `lat`, `lng`, `accuracy_m`, `speed_kmh` per delivery — a continuous movement trail of an identified courier — with no retention limit.

**Impact.** Systematic monitoring of employees is an Art. 35(3)(c) DPIA trigger. Turkish KVKK guidance on workplace monitoring requires necessity, proportionality and prior notice. Neither a DPIA nor an employee notice exists in the repository.

**Remediation.** Conduct and document a DPIA; issue an employee monitoring notice; set a short retention for `gps_pings`; store only the geo-fence pass/fail rather than raw coordinates where that suffices.

---

## R-11 — MEDIUM — Automated worker scoring feeding pay

**Evidence.** `profiles.trust_score`, `profiles.doctor_score`, `profiles.skill_level`, `profiles.reject_count`, `employee_performance.score`/`quality_pass_rate`/`on_time_rate`/`revenue_generated`, and the nine-table `bonus_*` cluster (`bonus_policies`, `bonus_thresholds`, `bonus_quality_rules`, `bonus_difficulty_rules`, `bonus_stage_rates`, `bonus_runs` with `policy_snapshot`/`breakdown` jsonb, `performance_bonuses` with `transferred_to_payroll` → `payroll_id`). Scores computed from `order_stages` timing and rework counts flow into bonus pools and then into payroll.

**Impact.** If any pay outcome is produced without meaningful human intervention, GDPR Art. 22 applies (right to human review, explanation, contest). `employee_performance.is_locked` and `bonus_runs.approved_by`/`posted_by` suggest a human approval step exists — **but whether that approval is substantive review or a rubber stamp is UNKNOWN from the code**. The EU AI Act may classify worker-evaluation systems as high-risk (Annex III).

**Remediation.** Document the human-review step; give employees visibility of their own scores and the computation; provide a contest channel; assess AI Act applicability.

---

## R-12 — MEDIUM — Over-collection and orphaned collection

**(a) Mandatory over-collection.** TC kimlik/passport number and nationality are mandatory for every order (`NewOrderScreen.tsx:1240-1241`). No purpose for nationality appears anywhere in the codebase. `profiles.gender` likewise has no identified processing purpose. GDPR Art. 5(1)(c).

**(b) Orphaned collection — `patient_phone`.** The field is declared (`:159`), rendered as an input (`:3206-3207`), included in the submit payload (`:1851`), **printed onto the order PDF** (`:2524`), and **written into the `localStorage` draft** — but `work_orders` has **no `patient_phone` column**, so PostgREST discards it. The result is a patient phone number collected from clinic staff, displayed, printed and cached on-device, that serves no purpose and reaches no system of record.

**Remediation.** Make TC kimlik and nationality optional pending a documented statutory basis; remove `patient_gender` or document its purpose; either add the `patient_phone` column with a stated purpose or remove the field entirely.

---

## R-13 — MEDIUM — Patient PII cached unencrypted on the device

**Evidence.** `NewOrderScreen.tsx:240` `const DRAFT_KEY = 'newOrderDraft:v1'`; written at `:885` (`localStorage.setItem`) and `:889` (`AsyncStorage.setItem`), read at `:626`, `:832`, `:898`. The serialised draft carries patient first/last name, TC/passport number, date of birth, gender, nationality, phone, tooth numbers, work type and notes.

Neither `localStorage` (web) nor `AsyncStorage` (native, unencrypted on both platforms) is a protected store. The draft is cleared only on successful submit or explicit discard — **it survives logout**, so the next person to use a shared clinic workstation can read the previous patient's identity data.

**Remediation.** Move the draft into `expo-secure-store` (already a dependency) on native and encrypt or eliminate the web draft; clear all drafts on sign-out; set a short TTL.

---

## R-14 — MEDIUM — Voice audio sent to the browser vendor undisclosed

**Evidence.** `modules/denty/useSpeechRecognition.ts` uses `window.SpeechRecognition` / `webkitSpeechRecognition`. In Chrome and Edge this API is **not on-device** — audio is streamed to Google's speech servers for transcription. Users dictate to the AI assistant, and those dictations routinely contain patient names.

The only disclosure is the browser's own microphone permission prompt. Neither the privacy policy nor the in-app UI mentions that voice data leaves the device or reaches Google. Voice is personal data and, where used for identification, biometric data.

**Remediation.** Disclose the browser-vendor transfer in the privacy policy and in-app before first use; or replace with an on-device recogniser; or gate the feature behind explicit consent.

---

## R-15 — MEDIUM — Secrets in plaintext application tables

| Item | Where | Issue |
|---|---|---|
| `phone_verifications.code` | Public table | **SMS OTP stored in plaintext**, never purged. Anyone with read access to the row can complete the verification. Should be hashed and short-lived |
| `provider_credentials.credentials` (jsonb) | Public table | **Per-tenant third-party API keys for e-Fatura and payment providers held in the application database**. Read by `efatura-send/index.ts:60` and `payments-charge/index.ts:68`. No column-level encryption (`pgsodium`/Vault) is visible — the column is plain `jsonb`. Compromise of a service-role key or a SQL-injection path exposes every tenant's payment and tax credentials |
| `labs.checkin_token`, `work_orders.doctor_approval_token`, `clinic_invitations.token`, `lab_connect_codes.code`, `payment_intents.public_token`, `qr_links.short_code` | Public tables | Plaintext bearer capabilities. `doctor_approval_token` in particular grants an unauthenticated party the ability to approve a design; it is embedded in e-mail links and QR codes |

**Remediation.** Hash OTPs; move `provider_credentials` into Supabase Vault or encrypt with `pgsodium`; hash or shorten the lifetime of bearer tokens; ensure `doctor_approval_expires_at` is enforced server-side.

---

## R-16 — MEDIUM — Outbound e-mails leak to an unrelated third party

**Evidence.** `supabase/functions/send-email-notification/index.ts:421` embeds:

```html
<img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&…&data=${encodeURIComponent(link)}" …>
```

Every time a recipient opens the e-mail, their mail client requests this image from **api.qrserver.com (goqr.me)** — a third party with no contract, disclosed nowhere. That request carries the recipient's **IP address and user agent**, and the **`data` query parameter contains the full action link**, which for approval e-mails embeds `doctor_approval_token`.

**Impact.** An undisclosed processor receives an authentication capability plus a read on the recipient's location and device. This also functions as an unintended open-tracking pixel.

**Remediation.** Generate the QR server-side and attach it as an inline CID image, or drop the QR entirely.

---

## R-17 — LOW — Privacy policy has unfilled placeholders and omits sub-processors

**Evidence.** `siman-legal/index.html` carries an explicit warning banner: *"Yayın öncesi doldurulacak: Veri sorumlusu ünvanı, adres ve iletişim e-postası aşağıda [köşeli parantez] ile işaretlidir."* The live document still reads:
- Veri sorumlusu: **`[Şirket / işletme ünvanı]`**
- Adres: **`[Açık adres]`**
- İletişim: **`[gizlilik@siman.app]`**

The page is live at `https://siman-legal.vercel.app/` and is linked from the app.

§4 lists six recipients. Missing: **NetGSM/İleti Merkezi/Mutlucell, Nilvera, iyzico (named only generically as "Ödeme sağlayıcısı"), BanaBiKurye, Google Places, Brandfetch, Clearbit, Google Favicons, QRServer, Medit, Vercel, Google Fonts.**

§5 states account deletion removes personal information and that business records may be *"kimliksizleştirilerek"* retained — a claim R-06 shows to be inaccurate as implemented.

**Remediation.** Fill the placeholders with the real controller identity before any further distribution; complete the recipient list; correct §5 to match reality (or fix the implementation so the claim becomes true); add a version number and effective date to both documents.

---

## R-18 — LOW — Session tokens not in secure storage

`expo-secure-store` is installed (`package.json`) but is not used for the Supabase session. `@supabase/supabase-js` persists the access JWT and refresh token in `AsyncStorage` on native and `localStorage` on web. On a rooted/jailbroken device or via web XSS these are readable. Given the health data behind them, Keychain/Keystore storage is warranted.

---

## R-19 — LOW — Broken storage path

`modules/purchases/components/PurchaseFormModal.tsx` calls `supabase.storage.from('purchase-invoices')`, but no such bucket exists in `storage.buckets`. Purchase-invoice uploads fail. `purchase_invoices.invoice_file_url` therefore either stays empty or points somewhere undetermined — **UNKNOWN**. Similarly, no `storage.from()` call was found for `deliveries.signature_path` or `payment_submissions.receipt_url`, so the destination bucket for delivery signatures and bank receipts is **UNKNOWN**.

---

## R-20 — LOW — AI proxy weaknesses

`supabase/functions/denty-brain/index.ts`: the model is taken from `body.model ?? 'claude-sonnet-4-5'` with **no allowlist**, so a modified client can select any Anthropic model. The daily quota (`denty_consume_quota`, default 120/user/day) is wrapped in `try { … } catch (_) { /* no limit applied */ }` and is skipped entirely when `SUPABASE_SERVICE_ROLE_KEY` is absent — **it fails open**, so a cost/exfiltration control is silently disabled on misconfiguration.

---

## Positive findings

These are worth recording, because they narrow the exposure:

- **No advertising, analytics, crash-reporting or session-replay SDK exists anywhere in the codebase.** Verified absence of Sentry, Firebase, GA, PostHog, Mixpanel, Amplitude, Segment, LogRocket, FullStory and all attribution SDKs. The privacy policy's tracking claim is accurate.
- **RLS is enabled on all 138 base tables.** Eleven have zero policies, which is deny-all for `anon`/`authenticated` — a safe default, not a hole.
- **AI tools execute client-side under the user's own session**, so RLS and permission grants genuinely bound what the assistant can read.
- **AI write actions are human-gated** behind explicit confirmation cards.
- **`ANTHROPIC_API_KEY` and all provider secrets are held server-side** in edge-function environments and never shipped to the client.
- **`employee-docs`, `paper-orders` and `support-attachments` bucket policies are correctly scoped** — proof that the team knows how to write tenant-isolated storage policies, which makes R-02 a fixable drift rather than an architectural flaw.
- **`delete-account` handles the last-admin edge case** and preserves referential integrity by nulling references rather than orphaning rows.
- **A privacy policy and terms of service exist and are linked from the app** — incomplete, but present, which is more than most projects at this stage.
