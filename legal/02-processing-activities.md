# 02 — Record of Processing Activities (RoPA / VERBİS)

**Scope:** SIMAN multi-tenant SaaS. Every activity below was identified from source code; file references are given so counsel can verify each entry.

**Controller/Processor split (as evidenced by the code — legal confirmation required):**
- Each **dental laboratory tenant** (`labs` row) is the **Controller** for patient data in its own tenant.
- Each **clinic/doctor** entering patient data acts as **Controller or Joint Controller** for that data.
- The **SIMAN operator** acts as **Processor** for tenant patient data, and as **Controller** for its own account/authentication/billing data (`platform_*` tables, `auth.*`).
- **No Data Processing Agreement, no Controller/Processor designation, and no sub-processor list exists in the repository** other than the plain-language list in `siman-legal/index.html` §4.

---

## RoPA-01 — User account creation & authentication

| Item | Detail |
|---|---|
| **Purpose** | Create and authenticate lab/clinic/doctor/technician/courier accounts |
| **Categories of data subject** | Lab employees, clinic staff, dentists, couriers, platform admins |
| **Personal data** | E-mail, password (bcrypt hash), full name, phone, clinic name, `user_type`, `role`; on approval also TC kimlik no, birth date, gender, address, city, diploma no, specialty, avatar |
| **Special category** | Yes — `tc_kimlik_no` (national ID), `gender` |
| **Source** | Data subject (self-registration) or lab admin (`admin-create-user` edge function) |
| **Where processed** | `supabase.auth.signUp()` → `auth.users` → trigger `handle_new_user()` → `public.profiles` |
| **Code** | `modules/auth/api.ts:23-148`; `modules/auth/screens/RegisterDoctorScreen.tsx`, `RegisterClinicScreen.tsx`, `RegisterLabScreen.tsx`; DB function `handle_new_user()` |
| **Recipients** | Supabase (hosting/auth). E-mail verification codes are delivered by Supabase's own mail service. |
| **International transfer** | Yes — Supabase hosting region **UNKNOWN** (not declared in `app.json`, `.env.local` or any config in the repo) |
| **Retention** | UNKNOWN — no deletion job |
| **Legal basis** | Contract (Art. 6(1)(b)); `tc_kimlik_no` requires **Explicit Consent or a statutory duty** — none is recorded |
| **Automated decision-making** | Yes, partial: `approval_status='pending'` set automatically; a human lab admin approves |
| **Gap** | **No consent capture. `profiles.kvkk_accepted_at` is never written.** No terms-acceptance versioning. |

## RoPA-02 — E-mail OTP login & password reset

| Item | Detail |
|---|---|
| **Purpose** | Passwordless-assisted login and credential recovery |
| **Personal data** | E-mail, one-time token, IP address, user agent, timestamps |
| **Where** | `supabase.auth.verifyOtp()`, `resetPasswordForEmail()`; `auth.audit_log_entries` (IP + payload), `auth.sessions` (`ip`, `user_agent`) |
| **Code** | `modules/auth/screens/LoginScreen.tsx:158-180, 290`; `VerifyEmailScreen.tsx:69-127`; `modules/platform/api.ts` `sendPasswordReset()` |
| **Note** | `LoginScreen.tsx` performs `verifyOtp()` **then** `signInWithPassword()` and signs the user out if the password is wrong — an unusual two-step flow worth documenting for security review |
| **Recipients** | Supabase |
| **Retention** | UNKNOWN — `auth.audit_log_entries` is never pruned |
| **Legal basis** | Contract; log retention = Legitimate Interest / Legal Obligation |

## RoPA-03 — Phone (SMS) OTP verification

| Item | Detail |
|---|---|
| **Purpose** | Verify a user's mobile number |
| **Personal data** | Phone number (normalised), 6-digit code, attempt counter, expiry, `user_id` |
| **Where** | `public.phone_verifications`; SMS delivered by an external gateway |
| **Code** | `supabase/functions/send-otp/index.ts` (lines 36-237), `supabase/functions/verify-otp/index.ts`; `modules/auth/screens/VerifyPhoneScreen.tsx` |
| **Recipients (sub-processors)** | Whichever gateway `SMS_PROVIDER` selects: **NetGSM** (`api.netgsm.com.tr`, default), **İleti Merkezi** (`api.iletimerkezi.com`), **Mutlucell** (`smsgw.mutlucell.com`) |
| **Retention** | **UNKNOWN — rows are never deleted; the OTP `code` is stored in plaintext** |
| **Legal basis** | Contract |
| **Gap** | Plaintext OTP at rest; no purge of expired verifications |

## RoPA-04 — Order (work order) creation with patient data

| Item | Detail |
|---|---|
| **Purpose** | Record which prosthetic device is being manufactured for which patient |
| **Data subject** | **Patients of the clinic (natural persons who are not users of the system and have no account)** |
| **Personal data** | Patient full name, TC kimlik/passport no, date of birth, gender, nationality, country, city; (phone collected in UI, discarded by DB) |
| **Special category** | **Yes — health data (dental treatment), national ID, nationality** |
| **Source** | Clinic or doctor typing into the form; or AI-OCR of a paper form; or Medit Link webhook |
| **Where** | `public.work_orders`, `public.order_items`; **also browser `localStorage` draft**; **also rendered into a printable PDF** |
| **Code** | `modules/orders/screens/NewOrderScreen.tsx` (fields `:156-202`, validation `:1238-1241` — name, DOB, gender, **TC kimlik and nationality are all mandatory**, submit `:1847-1866`, draft persistence `:240,885,889`, PDF `:2522-2524`) |
| **Recipients** | Lab staff (all technicians on the order), lab admin, platform super-admin, **Anthropic (when the AI assistant reads the order)**, e-mail/push/WhatsApp recipients where the notification body carries the patient name |
| **Retention** | UNKNOWN — indefinite; `is_archived` is a soft flag only |
| **Legal basis** | Contract (lab↔clinic) + **Explicit Consent of the patient (Art. 9(2)(a) GDPR / KVKK m.6)** |
| **Gap** | **The patient never interacts with SIMAN. There is no patient-facing notice, no consent record, and no mechanism for a patient to exercise access/erasure. Mandatory collection of national ID + nationality is not minimised (Art. 5(1)(c)).** |

## RoPA-05 — Upload of 3D scans, intra-oral photos and design files

| Item | Detail |
|---|---|
| **Purpose** | Transfer the digital impression and clinical imagery from clinic to laboratory for manufacture |
| **Personal data** | STL / PLY / OBJ / DCM (DICOM) / ZIP / STEP files, JPEG/PNG/HEIC/WEBP photographs, PDF prescriptions |
| **Special category** | **Yes — health data; 3D dental/facial scans are biometric-adjacent and may qualify as biometric data under GDPR Art. 4(14) where used for identification** |
| **Where** | Bucket `work-order-photos` (private, 200 MB limit); metadata in `work_order_photos`, `stage_photos` |
| **Code** | `modules/orders/screens/NewOrderScreen.tsx:1439,1579,7696` (accept lists), `modules/orders/components/StageFileUpload.tsx`, `modules/orders/utils/uploadFaceScanResult.ts`, `modules/triage/api.ts`, `modules/reviews/api.ts`, `modules/approvals/DesignApprovalInbox.tsx`, `core/storage/uploadWithProgress.ts` |
| **Recipients** | Lab staff, clinic, doctor; **any authenticated SIMAN user across all tenants** (see risk R-02) |
| **Retention** | UNKNOWN — `storage_cleanup_queue` exists but has no consumer job |
| **Legal basis** | Contract + Explicit Consent |

## RoPA-06 — AI assistant "Simanty" / "Denty"

| Item | Detail |
|---|---|
| **Purpose** | In-app conversational assistant: navigation, read-only queries, order creation, support tickets, chat messages |
| **Personal data sent to the model** | The system prompt (contains the logged-in user's **full name**, user type, role, current route, open order ID, attached filenames); the user's chat messages; and **the verbatim result rows of every read-only tool call** — which include patient names, order details, invoice and balance data, clinic and doctor records, employee records |
| **Special category** | **Yes** |
| **Model / Provider** | **`claude-sonnet-4-5` at `https://api.anthropic.com/v1/messages` — Anthropic PBC** |
| **Code** | `supabase/functions/denty-brain/index.ts` (proxy, holds `ANTHROPIC_API_KEY`, enforces JWT + `denty_consume_quota` daily limit of `DENTY_DAILY_LIMIT`, default 120); `modules/denty/api.ts` (agent loop, `DENTY_MODEL='claude-sonnet-4-5'`, `max_tokens:1024`, `MAX_TOOL_LOOPS=6`); `modules/denty/context.ts` (system-prompt builder); `modules/denty/tools.ts` (tool catalogue) |
| **Tables the AI can read (`veriOku`, `tools.ts:49-68`)** | `work_orders` (search key = **`patient_name`**), `invoices`, `payments`, `v_clinic_balance`, `clinics`, `doctors`, `support_tickets`, `order_messages`, `notifications`, `order_stages`; lab-side only: `order_items`, `stock_items`, `lab_stations`, `provas`, `order_reviews`; admin only: `expenses`, `employees`; lab/admin/courier: `deliveries` |
| **Tools that write** | `siparisOlustur` (create order incl. all patient fields), `siparisDuzenle` (edit — schema at `tools.ts:282-288` explicitly accepts `hasta_ad_soyad`, `tc_pasaport`, `dogum_tarihi`, `cinsiyet`, `uyruk`), `siparisIptal`, `destekTalebiAc`, `mesajGonder`. All are gated behind a user confirmation card (`api.ts:75-92`) |
| **Anonymisation** | **None.** Patient names and national IDs are transmitted in clear |
| **Consent** | **None obtained.** The assistant is available in all panels with no AI-specific notice or opt-in |
| **Usage metering** | `public.denty_usage` (`user_id`, `gun`, `istek`) |
| **Retention at Anthropic** | UNKNOWN — depends on the Anthropic commercial agreement, which is not in the repository |
| **Legal basis** | **Unknown.** Requires an Anthropic DPA, an Art. 9 basis for the health data, and a transparency notice |

## RoPA-07 — AI OCR of paper work orders

| Item | Detail |
|---|---|
| **Purpose** | Convert a photographed handwritten laboratory prescription into a structured order |
| **Personal data sent** | The **entire image or PDF, base64-encoded**, containing handwritten patient name, doctor name, dates, tooth chart, shade |
| **Special category** | **Yes** |
| **Model / Provider** | `claude-sonnet-4-5` — Anthropic |
| **Code** | `supabase/functions/parse-work-order/index.ts` — input `{file_base64, mime_type}` (`:414-424`), accepted MIME `application/pdf, image/jpeg, image/png, image/webp, image/gif` (`:418`), Claude call `:98-107`, prompt explicitly extracts `patient_name` (`:264-265`, `:309`) and returns per-field confidence and name alternatives (`:287`, `:374`) |
| **Where stored** | `pending_paper_orders` (`ocr_data` jsonb = the full model output, `patient_name`, `photo_storage_path`, `sender_phone`, `sender_name`); image in the `paper-orders` bucket |
| **Ingest path** | `supabase/functions/inbound-paper-order/index.ts` — an inbound webhook (secret `INBOUND_WEBHOOK_SECRET`) receiving a photo plus **sender phone and name**, i.e. an external messaging channel |
| **Consent** | None |
| **Legal basis** | Unknown |

## RoPA-08 — AI OCR of purchase invoices and payment receipts

| Item | Detail |
|---|---|
| **Purpose** | Auto-fill supplier invoices and payment records |
| **Personal data sent** | Full invoice/receipt image or PDF: supplier legal name, tax number, addresses, bank details, amounts; a receipt may carry the payer's name |
| **Model / Provider** | `claude-sonnet-4-5` — Anthropic |
| **Code** | `supabase/functions/parse-invoice/index.ts:199-207, 366, 380`; `supabase/functions/parse-receipt/index.ts:68-76, 241` |
| **Where stored** | `purchase_invoices`, `payment_submissions` |
| **Legal basis** | Legitimate Interest (business documents) — but the transfer to Anthropic still requires a DPA and transfer mechanism |

## RoPA-09 — Order chat / messaging

| Item | Detail |
|---|---|
| **Purpose** | Clinic↔lab communication about a case |
| **Personal data** | Free-text message bodies (routinely naming patients and clinical detail), sender identity, read receipts, file attachments |
| **Special category** | Yes |
| **Where** | `order_messages` table; attachments in the **`chat-attachments` bucket — which is PUBLIC** |
| **Code** | `modules/orders/chatApi.ts:419` (`const BUCKET='chat-attachments'`), `:440-445` (upload then **`getPublicUrl()`**) |
| **Recipients** | Order participants; **anyone on the internet holding or guessing the object URL** |
| **Retention** | UNKNOWN |
| **Legal basis** | Contract |

## RoPA-10 — Notifications (in-app, push, e-mail, WhatsApp, web-push)

| Channel | Personal data | Sub-processor | Code | Basis |
|---|---|---|---|---|
| In-app | `notifications.title/body/payload` — body can contain patient name & order number | — | `core/notifications/dispatch.ts` | Contract |
| **Push (mobile)** | Expo push token, `device_id`, `user_agent`, notification title/body | **Expo (`exp.host` / `expo.dev`), which relays via Apple APNs and Google FCM** | `supabase/functions/send-expo-push/index.ts:159`; `core/notifications/nativePush.ts`; `push_tokens` table | Consent |
| **Web push** | VAPID subscription endpoint, notification body | The browser vendor's push service (Google FCM / Mozilla / Apple) | `supabase/functions/send-web-push/index.ts` (VAPID keys, subject `mailto:noreply@siman.app`) | Consent |
| **E-mail** | Recipient e-mail address, subject, full HTML body (patient/order details), lab name & logo | **Resend (`api.resend.com`)**; **and `api.qrserver.com` — an unrelated third party — is called to render a QR code, embedding the link (which may contain an approval token) in the query string of an external image request** | `supabase/functions/send-email-notification/index.ts:42, 421`; `email_notifications` table | Contract / Legitimate Interest |
| **WhatsApp** | `whatsapp_phone`, template SID, template variables (order/patient references) | **Twilio (`api.twilio.com`) → Meta/WhatsApp** | `supabase/functions/send-whatsapp-notification/index.ts:42-51, 132-190`; `whatsapp_notifications` table | Consent |
| **SMS** | Phone number, OTP text | NetGSM / İleti Merkezi / Mutlucell | `supabase/functions/send-otp/index.ts` | Contract |

**Preference filter:** `notification_prefs` on `profiles`. Per the project's own notes the e-mail filter is **opt-OUT** — a category absent from a user's preferences results in mail being sent to everyone. Documented here because it affects the lawfulness of marketing-adjacent categories.

## RoPA-11 — Support ticketing

Purpose: user support. Data: `subject`, message bodies, `context` jsonb (**captures the current screen and often the order id**), `error_code`, attachments (`support-attachments`, private, up to 100 MB, wide MIME allowlist including `model/stl` and `video/*`), `is_internal` staff-only notes, SLA fields.
Recipients: ticket owner, assignee, **platform super-admin across all tenants**. Code: `modules/support/*`, tables `support_tickets`, `support_messages`, `support_attachments`, `support_status_history`. Basis: Contract. Retention: UNKNOWN.

## RoPA-12 — Delivery & courier logistics

| Item | Detail |
|---|---|
| **Purpose** | Dispatch, track and prove delivery of finished prosthetic work |
| **Personal data** | `recipient_name`, `recipient_note`, **`signature_path` (captured handwritten signature)**, `destination_name/address/phone`, courier identity, external tracking numbers, fees |
| **Continuous tracking** | `gps_pings` — `lat`, `lng`, `accuracy_m`, `speed_kmh`, `recorded_at` per delivery, i.e. **a movement trail of an identified courier** |
| **Sub-processors** | **BanaBiKurye** (`robot.banabikurye.com` / `robotapitest…`) — receives order number, **doctor full name and phone**, clinic name and address; **Google Places API** (`places.googleapis.com/v1/places:searchText`) — receives the destination address string for geocoding |
| **Code** | `supabase/functions/banabikurye-dispatch/index.ts:31-32, 224-245` |
| **Retention** | UNKNOWN — GPS pings are never pruned |
| **Legal basis** | Contract; GPS tracking of staff = Legitimate Interest **requiring a DPIA** |

## RoPA-13 — Employee attendance, payroll, performance & bonus

| Item | Detail |
|---|---|
| **Purpose** | Time & attendance, payroll calculation incl. SGK, leave management, performance scoring, bonus pools |
| **Personal data** | Check-in/out times and **geolocation**, work/overtime minutes, absence and lateness counts, salaries, SGK employee/employer contributions, advances, leave type & reason, uploaded HR documents, per-employee performance scores, bonus allocations |
| **Special category** | **Yes** — sick leave (`employee_leaves.leave_type`, `v_leave_summary.sick_days`), free-text `reason`, and whatever is stored in `employee-docs` |
| **Where** | `employee_attendance`, `employee_payroll`, `payroll_items`, `payroll_settings`, `salary_payments`, `salary_adjustments`, `employee_advances(+_requests)`, `employee_leaves`, `employee_documents`, `employee_performance`, `performance_bonuses`, `performance_rules`, `bonus_policies` + 8 related bonus tables, `bonus_runs` (`policy_snapshot`, `breakdown` jsonb) |
| **Geo-fence** | `labs.location_lat/lng/location_radius` + `labs.checkin_token`; captured at `app/checkin.tsx:76-78` |
| **Retention** | UNKNOWN — Turkish labour/SGK law implies multi-year statutory retention, **but nothing is implemented** |
| **Legal basis** | Contract (employment) + Legal Obligation (SGK/tax); geolocation = Legitimate Interest **requiring DPIA and employee notice** |
| **Automated decision-making** | `employee_performance.score`, `profiles.trust_score`, `profiles.doctor_score`, bonus computation from `bonus_runs` — **automated scoring feeding pay. GDPR Art. 22 applies if any decision is taken without meaningful human review; `employee_performance.is_locked` suggests periods are frozen after approval, implying at least one human step, but this is not conclusive from the code.** |

## RoPA-14 — Invoicing, e-Fatura and payments

| Item | Detail |
|---|---|
| **Purpose** | Issue invoices, transmit legal e-invoices, collect payment |
| **Personal data** | Invoice header/lines linked to clinic & doctor, amounts, currency, **buyer VKN/TCKN, legal title, tax office** (via `mukellef_cache` and the e-invoice payload) |
| **e-Fatura sub-processor** | **Nilvera** (`api.nilvera.com` / `sandbox-api.nilvera.com`) — note: the base-URL line is **commented out** at `efatura-send/index.ts:135`, so whether the live integration is currently active is **UNKNOWN**. Downstream recipient: **GİB (Turkish Revenue Administration)** |
| **Payment sub-processor** | **iyzico** (`sandbox-api.iyzipay.com`; production base URL from `IYZICO_BASE_URL`) |
| **Raw payloads stored** | `efatura_logs.request_body/response_body`, `payment_attempts.request_body/response_body` — verbatim third-party request/response bodies persisted in the application database |
| **Card data** | The privacy policy asserts card data is never held by the app. **The code does not contradict this** — `payments-charge` posts to the provider — **but `payment_attempts` stores the raw request body, so this assertion must be verified against a live payload before it is repeated in any legal document.** |
| **Code** | `supabase/functions/efatura-send/index.ts`, `payments-charge/index.ts`, `payments-callback/index.ts` |
| **Retention** | Turkish law: 10 years for commercial books. **Not implemented.** |
| **Legal basis** | Legal Obligation + Contract |

## RoPA-15 — Medit Link scanner integration (inbound patient data)

| Item | Detail |
|---|---|
| **Purpose** | Receive intra-oral scan cases directly from Medit scanners |
| **Personal data received** | **Patient `name`, `uuid`, `code`, creation/update timestamps**; scan files attached to work orders |
| **Special category** | Yes |
| **Direction** | **Inbound** — Medit → SIMAN, via webhook authenticated by `MEDIT_WEBHOOK_TOKEN` + `MEDIT_SIGNING_SECRET` |
| **Where** | `medit_patients`; `work_orders` (`external_id`, `external_source='medit'`); `work_order_photos`; `deliveries` |
| **Code** | `supabase/functions/medit-webhook/index.ts:119-130` (auth), `:175-204` (patient upsert incl. soft-delete `deleted_at`), `:217-407` (order & photo sync) |
| **Tenant assignment** | Falls back to `MEDIT_DEFAULT_LAB_ID` — **a single env var, so mis-routing across tenants is possible if unset or wrong** |
| **Legal basis** | Contract; SIMAN is Processor. **A DPA with Medit and with the clinic is required and not present.** |

## RoPA-16 — Clinic logo enrichment (outbound third-party lookup)

Purpose: find a clinic's logo. Data sent: **the clinic's name and/or website domain** to **Brandfetch** (`api.brandfetch.io/v2/search/…`), **Clearbit** (`logo.clearbit.com/{domain}`) and **Google favicons** (`www.google.com/s2/favicons?domain=…`). The retrieved image is stored in the **public `avatars`** bucket and written to `clinics.logo_url`.
Code: `supabase/functions/clinic-logo-search/index.ts:70-104`. Basis: Legitimate Interest. **These three recipients are not disclosed in the privacy policy.**

## RoPA-17 — Central currency rates

Purpose: daily FX. Data: none personal. Recipient: **TCMB** (`www.tcmb.gov.tr`). Code: `supabase/functions/tcmb-rates/index.ts`, cron job `tcmb-daily-rates` (`30 13 * * 1-5`). Basis: Legitimate Interest.

## RoPA-18 — Activity, audit and security logging

| Log | Contents | Retention | Basis |
|---|---|---|---|
| `activity_logs` | `actor_id`, `actor_name`, `actor_type`, free-text `action` **embedding full names**, `entity_type/id/label`, `metadata`, `lab_id`; written by `SECURITY DEFINER` function `log_activity()` and triggers | UNKNOWN | Legitimate Interest |
| `platform_audit_log` | Cross-tenant super-admin actions: `export_lab`, `purge_lab_pii`, `anonymize_user`, `detail` jsonb | UNKNOWN | Legal Obligation |
| `auth.audit_log_entries` | **IP address** + auth event payload | UNKNOWN | Legitimate Interest |
| `auth.sessions` | **IP + user agent** per session | UNKNOWN | Legitimate Interest |
| `order_events`, `status_history`, `stage_state_transitions`, `stage_activity_events`, `stage_timing_overrides`, `reject_log`, `delay_log`, `checklist_log`, `material_request_events`, `bonus_rule_history`, `support_status_history` | actor + state-change trails | UNKNOWN | Legitimate Interest |
| `efatura_logs`, `payment_attempts`, `webhook_events`, `email_notifications`, `whatsapp_notifications` | third-party request/response bodies and delivery receipts | UNKNOWN | Legal Obligation / Contract |
| **Absent** | **No application error-tracking, crash-reporting, product-analytics or session-replay service is integrated. Verified: no Sentry, Firebase, PostHog, Mixpanel, Amplitude, Segment, Google Analytics or advertising SDK appears anywhere in the codebase.** | — | — |

## RoPA-19 — Cross-tenant platform administration

| Item | Detail |
|---|---|
| **Purpose** | Operate the SaaS: manage tenants, users, plans, invoices, feature flags, announcements |
| **Who** | Members of `platform_admins`, gated by `is_platform_admin()` |
| **Scope of access** | **All tenants, all data.** RPCs: `admin_list_users` (returns e-mail, lab, role, `last_sign_in_at`, `email_confirmed` for every user on the platform), `admin_set_user_active`, `admin_set_user_role`, `admin_move_user_lab`, `admin_anonymize_user`, `admin_export_lab_data`, `admin_purge_lab_pii`, `admin_lab_billing`, `admin_*_invoice`, `admin_get/set_settings`, `admin_lab_usage` |
| **Code** | `modules/platform/api.ts`, `app/(platform)/*` |
| **Legal basis** | Legitimate Interest (service operation) |
| **Gap** | **A Processor with unrestricted read access to all tenants' patient health data. This must be disclosed in the DPA, with the technical/organisational measures and the sub-processor's staff confidentiality undertakings.** |

## RoPA-20 — Data subject rights operations implemented in code

| Right | Implementation | Completeness |
|---|---|---|
| **Erasure — self-service** | `supabase/functions/delete-account/index.ts`: verifies caller, blocks deletion of the last lab owner/admin, nulls `approved_by`/`created_by`/`granted_by` references, anonymises the linked `doctors` row to `'Silinmiş hesap'`, then `auth.admin.deleteUser()` (cascade) and an explicit `profiles` delete. UI entry point: `modules/profile/screens/DoctorProfileMobile.tsx` | **Partial.** Covers the account holder. **Does not touch: patient rows in `work_orders`, uploaded files in any bucket, `activity_logs` (which keeps `actor_name` and names inside free-text `action`), `order_messages` content, `notifications`, `email_notifications`, `whatsapp_notifications`. The desktop-web `ProfileScreen` has no delete entry point.** |
| **Erasure — admin, whole tenant** | `admin_purge_lab_pii(p_lab, p_confirm_name)`: overwrites `profiles.full_name/phone`, `work_orders.patient_name/patient_id/patient_dob/patient_nationality/patient_country/patient_city`, `clinics.name/phone/contact_person`, `doctors.full_name/phone`; deactivates the lab | **Partial.** **Does not purge storage buckets, `order_messages`, `activity_logs`, `notifications`, `medit_patients`, `pending_paper_orders.ocr_data`, `order_reviews.clinical_photos`, `deliveries.recipient_name/signature_path`, `employees.tc_no`, `employee_documents`, `gps_pings`, `phone_verifications`.** |
| **Erasure — admin, one user** | `admin_anonymize_user(p_user)`: sets `full_name='Silinmiş kullanıcı'`, `phone=NULL`, `is_active=false` | **Partial** — leaves `email`, `tc_kimlik_no`, `birth_date`, `address`, `avatar_url`, and every historical log entry containing the name |
| **Portability / Access** | `admin_export_lab_data(p_lab)` → jsonb of lab, profiles, clinics, doctors, **work_orders capped at 5 000 rows**, **invoices capped at 5 000 rows**, platform_invoices | **Admin-only, tenant-scoped, silently truncated.** There is **no data-subject-initiated export** and no export of files, messages, or logs |
| **Rectification** | Ordinary edit screens | Adequate for users; **no route for a patient** |
| **Restriction / Objection** | Not implemented | **Missing** |
| **Consent withdrawal** | Not implemented (no consent is recorded in the first place) | **Missing** |
