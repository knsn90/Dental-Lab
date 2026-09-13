# 01 — Personal Data Inventory (Kişisel Veri Envanteri)

**Product:** SIMAN — multi-tenant SaaS for dental laboratories & dental clinics
**Controller / Processor role:** SIMAN operator is **Processor** for lab tenants' patient data; **Controller** for its own user account data. (Not stated anywhere in source — legal confirmation required.)
**Source of truth for this document:** live PostgreSQL schema of Supabase project `kjwjxqfdsxkxgcgophdy` (169 relations: 138 base tables + 31 views), plus the repository at `/Users/saber/Desktop/DentalSoftware`.
**Generated:** 2026-07-23
**Method:** `information_schema.columns`, `pg_class`, `pg_policies`, `storage.buckets`, `cron.job` queried live; all application code (`my-expo-app/modules`, `my-expo-app/core`, `my-expo-app/app`, `my-expo-app/supabase/functions`) read directly.

> **Rule applied throughout:** where the source code does not determine an answer, the cell reads **UNKNOWN**. Nothing in this document is inferred from product expectations.

---

## 0. Legend

| Column | Meaning |
|---|---|
| **PD** | Contains Personal Data (Yes / No / Indirect) |
| **SPD** | Contains Special-Category / Sensitive Personal Data — GDPR Art. 9 / KVKK Art. 6 (Yes / No) |
| **Src** | Who provides it: Patient, Clinic, Doctor, Lab, Admin, Auto (system-generated), AI, Third-Party |
| **Access** | Roles able to read it, per RLS policies + application routing |
| **Basis** | Suggested legal basis (Contract / Consent / Legitimate Interest / Legal Obligation / Unknown) |

"Indirect" = not personal on its own, but is a stable identifier or attribute linked 1:1 to an identified natural person elsewhere in the same database (e.g. `actor_id`, `technician_id`).

**Retention: unless a specific row says otherwise, every table below is `UNKNOWN — no deletion, TTL, archival or purge job exists.`** This was verified: `cron.job` contains exactly three jobs (`shift-auto-pause`, `tcmb-daily-rates`, `daily-order-watch`) and none of them deletes data. There is no retention policy anywhere in the codebase.

---

## 1. HIGHEST-RISK TABLE — `work_orders` (Patient / Health data)

This is the single most sensitive table in the system. It holds directly identifying patient data joined to dental treatment data.

| Field | Type | Example (from schema/UI) | PD | SPD | Category | Purpose | Src | Stored in | Access | Retention | Basis |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `id` | uuid | `a3f1…` | Indirect | No | System | Primary key | Auto | DB `work_orders` | All order-scoped roles | UNKNOWN | Contract |
| `order_number` | text | `NXD-2026-0412` | Indirect | No | System | Human order reference | Auto | DB | Lab, Clinic, Doctor, Admin | UNKNOWN | Contract |
| **`patient_name`** | text | `GÜLCİN KAZAZ` | **Yes** | **Yes** (health context) | **Patient Identity / Health** | Identify whose prosthesis is being made | Clinic / Doctor / AI-OCR / Medit | DB; also **printed to PDF**, **sent to Anthropic**, **held in browser `localStorage` draft**, **appears in `order_timing_summary` & `v_unbilled_work_orders` views** | Lab (all staff incl. technicians), Clinic, Doctor, Admin, Platform super-admin, AI (Claude) | UNKNOWN | Contract + Explicit Consent (health) |
| **`patient_id`** | text | `12345678901` (TC Kimlik No or passport) | **Yes** | **Yes** (national ID; KVKK-special handling in TR) | **Patient Identity** | Patient matching / invoicing | Clinic / Doctor (**mandatory** — `NewOrderScreen.tsx:1240` `'TC kimlik zorunlu'`) | DB | Lab, Clinic, Doctor, Admin, Platform admin, AI (`veriOku work_orders`) | UNKNOWN | Legal Obligation? / Consent — **weak; see risk report R-03** |
| **`patient_dob`** | date | `1978-04-11` | **Yes** | **Yes** | Patient Identity / Health | Patient matching; **mandatory field** (`:1238`) | Clinic / Doctor | DB | Same as above | UNKNOWN | Contract + Consent |
| **`patient_gender`** | text | `erkek` / `kadın` | **Yes** | **Yes** | Patient Identity | Prosthesis aesthetics; **mandatory** (`:1239`) | Clinic / Doctor | DB | Same as above | UNKNOWN | Consent |
| **`patient_nationality`** | text | `TR` | **Yes** | **Yes** (ethnic-origin proxy — GDPR Art. 9) | Patient Identity | **mandatory** (`:1241`) | Clinic / Doctor | DB | Same as above | UNKNOWN | **Unknown — no lawful basis identified** |
| `patient_country` | text | `Türkiye` | Yes | No | Location | Address/logistics | Clinic / Doctor | DB | Same | UNKNOWN | Contract |
| `patient_city` | text | `İstanbul` | Yes | No | Location | Logistics | Clinic / Doctor | DB | Same | UNKNOWN | Contract |
| **`tooth_numbers`** | text[] | `{11,12,21}` (FDI) | Yes (linked) | **Yes** | **Dental / Health** | Which teeth are treated | Clinic / Doctor | DB | Same | UNKNOWN | Contract + Consent |
| `work_type` | text | `Zirkonyum Kron` | Yes (linked) | **Yes** (treatment) | Dental | Production routing | Clinic / Doctor | DB | Same | UNKNOWN | Contract |
| `shade` | text | `A3` (Vita) | Yes (linked) | Yes | Dental | Colour matching | Clinic / Doctor | DB | Same | UNKNOWN | Contract |
| `model_type`, `measurement_type`, `machine_type`, `complexity` | text / enum | `dijital` | Yes (linked) | Yes | Dental | Production spec | Clinic / Doctor / Lab | DB | Same | UNKNOWN | Contract |
| `notes` | text | free text — **may contain clinical remarks** | Yes | **Yes** | Dental / Communication | Doctor→lab instruction | Doctor | DB | Lab, Clinic, Doctor, Admin | UNKNOWN | Contract |
| `lab_notes`, `manager_notes`, `delay_reason`, `hold_reason`, `revision_reason` | text | free text | Yes | Possibly | Internal Notes | Internal production notes | Lab / Admin | DB | Lab, Admin (+Clinic if `lab_notes_visible`) | UNKNOWN | Legitimate Interest |
| `lab_notes_visible` | boolean | `false` | No | No | System | Note disclosure toggle | Lab | DB | Lab | UNKNOWN | Legitimate Interest |
| `doctor_id`, `doctors_id` | uuid | FK → `doctors` / `profiles` | Indirect | No | Doctor Information | Attribution | Auto | DB | All order roles | UNKNOWN | Contract |
| `assigned_to` | uuid | FK → `profiles` | Indirect | No | Technician Information | Work assignment | Lab | DB | Lab, Admin | UNKNOWN | Contract (employment) |
| `lab_id` | uuid | tenant key | No | No | System | Tenant isolation | Auto | DB | All | UNKNOWN | Contract |
| `status`, `priority`, `is_urgent`, `is_rush` | enum/text/bool | `Üretimde` | Indirect | No | System | Workflow state | Lab | DB | All order roles | UNKNOWN | Contract |
| `delivery_date`, `delivered_at`, `delivery_method` | date/ts/text | `2026-08-02`, `kurye` | Indirect | No | System | Logistics | Lab / Clinic | DB | All order roles | UNKNOWN | Contract |
| `material_cost`, `sale_price`, `labor_cost`, `overhead_cost`, `discount_amount`, `material_cost_currency` | numeric/text | `1450.00`, `TRY` | No | No | Financial | Costing / margin | Lab / Auto | DB | Lab, Admin | UNKNOWN | Legitimate Interest |
| **`doctor_approval_token`** | text | opaque token | Indirect | No | **Authentication** | **Tokenised public approval link** (`app/doctor-approval`) | Auto | DB; **emitted into e-mail links & QR codes** | Anyone holding the URL | UNKNOWN | Contract |
| `doctor_approval_expires_at`, `doctor_approval_status`, `doctor_approval_decided_by`, `doctor_approval_decided_at`, `doctor_approval_admin_override`, `doctor_approval_required`, `requires_design_approval` | ts/text/uuid/bool | — | Indirect | No | Authentication / Audit | Design sign-off trail | Auto / Doctor / Admin | DB | Lab, Doctor, Admin | UNKNOWN | Contract |
| `external_id`, `external_source` | text | `medit:UUID`, `medit` | Indirect | No | Integration | Medit Link dedupe | Third-Party (Medit) | DB | Lab, Admin | UNKNOWN | Contract |
| `box_id`, `current_stage_id`, `current_stage_name`, `triaged_at/by`, `triage_approved_at/by`, `rework_count`, `revision_*`, `hold_*`, `scan_bodies_delivered`, `tags`, `department`, `input_type` | mixed | — | Indirect | No | System | Production workflow | Lab / Auto | DB | Lab, Admin | UNKNOWN | Contract |
| `is_archived`, `archived_at`, `archived_by` | bool/ts/uuid | — | Indirect | No | System | **Soft-archive only — data is never deleted** | Lab | DB | Lab, Admin | UNKNOWN (indefinite) | Legitimate Interest |
| `created_at`, `updated_at` | timestamptz | — | Indirect | No | System | Audit | Auto | DB | All | UNKNOWN | Legal Obligation |

### Fields collected in the UI but NOT persisted to `work_orders`

| Field | Where collected | Where it goes | PD | SPD | Note |
|---|---|---|---|---|---|
| `patient_first_name` / `patient_last_name` | `NewOrderScreen.tsx:192` | concatenated into `patient_name` | Yes | Yes | — |
| **`patient_phone`** | `NewOrderScreen.tsx:159, 3206` | passed to create-order payload (`:1851`), **printed on the order PDF (`:2524`)**, and **persisted in browser `localStorage` draft** — but **`work_orders` has no `patient_phone` column**, so the DB silently discards it | **Yes** | No | **Collected without a destination → data-minimisation violation. See R-08.** |

---

## 2. Identity & Account tables

### 2.1 `auth.users` (Supabase GoTrue — managed schema)

| Field | Type | PD | SPD | Category | Purpose | Src | Stored | Access | Retention | Basis |
|---|---|---|---|---|---|---|---|---|---|---|
| `id` | uuid | Indirect | No | Authentication | Subject identifier | Auto | Supabase Auth | Service-role only | UNKNOWN | Contract |
| `email` | varchar | **Yes** | No | Authentication | Login identifier | User | Supabase Auth (+ mirrored to `profiles.email` by `handle_new_user()`) | Auth service, platform admin (`admin_list_users`) | UNKNOWN | Contract |
| `encrypted_password` | varchar | **Yes** (credential) | No | Authentication | Password hash (bcrypt, GoTrue-managed) | User | Supabase Auth | None (service only) | UNKNOWN | Contract |
| `phone`, `phone_confirmed_at`, `phone_change*` | text/ts | **Yes** | No | Authentication | Phone identity | User | Supabase Auth | Auth service | UNKNOWN | Contract |
| `confirmation_token`, `recovery_token`, `email_change_token_new/current`, `reauthentication_token` | varchar | Yes (credential) | No | Authentication | One-time verification tokens | Auto | Supabase Auth | Auth service | UNKNOWN (GoTrue default) | Contract |
| `raw_user_meta_data` | jsonb | **Yes** | No | Authentication | Signup metadata: `full_name`, `phone`, `clinic_name`, `user_type`, `role`, `lab_id` — written at `modules/auth/api.ts:25/86/134` | User | Supabase Auth | Auth service, `handle_new_user()` trigger | UNKNOWN | Contract |
| `raw_app_meta_data` | jsonb | Indirect | No | Authentication | Provider list | Auto | Supabase Auth | Auth service | UNKNOWN | Contract |
| `last_sign_in_at`, `created_at`, `updated_at`, `confirmed_at`, `email_confirmed_at`, `invited_at` | timestamptz | Indirect | No | Login History | Session/audit | Auto | Supabase Auth | Platform admin via `admin_list_users` | UNKNOWN | Legitimate Interest |
| `banned_until`, `deleted_at`, `is_anonymous`, `is_sso_user`, `is_super_admin`, `aud`, `role` | mixed | Indirect | No | Authentication | Account state | Admin/Auto | Supabase Auth | Auth service | UNKNOWN | Contract |

### 2.2 `auth.sessions`

| Field | Type | PD | SPD | Category | Purpose | Src | Access | Retention | Basis |
|---|---|---|---|---|---|---|---|---|---|
| `id`, `user_id`, `factor_id` | uuid | Indirect | No | Authentication | Session binding | Auto | Auth service | UNKNOWN | Contract |
| **`ip`** | inet | **Yes** | No | **Location / System Logs** | Session origin | Auto | Auth service | **UNKNOWN — no purge job** | Legitimate Interest |
| **`user_agent`** | text | **Yes** (device fingerprint) | No | **System Logs / Device** | Session device | Auto | Auth service | UNKNOWN | Legitimate Interest |
| `aal`, `not_after`, `refreshed_at`, `tag`, `scopes`, `oauth_client_id` | mixed | Indirect | No | Authentication | Session state | Auto | Auth service | UNKNOWN | Contract |
| `refresh_token_hmac_key`, `refresh_token_counter` | text/bigint | Indirect (credential) | No | Authentication | Refresh rotation | Auto | Auth service | UNKNOWN | Contract |

### 2.3 `auth.refresh_tokens`

`id`, `token` (credential), `user_id`, `revoked`, `parent`, `session_id`, `created_at`, `updated_at` — **PD: Indirect (credential material). Retention UNKNOWN.** Basis: Contract.

### 2.4 `auth.identities`

`id`, `user_id`, `provider`, `provider_id`, **`identity_data` (jsonb — contains `email`, `sub`, and any OAuth-provider profile claims)**, `email`, `last_sign_in_at`. **PD: Yes.** Basis: Contract. Retention UNKNOWN.
**No OAuth provider is configured in application code** — only e-mail/password + e-mail OTP + phone OTP are used (`modules/auth/api.ts`, `LoginScreen.tsx`, `VerifyEmailScreen.tsx`, `VerifyPhoneScreen.tsx`). Whether OAuth is enabled at the Supabase project level: **UNKNOWN (dashboard setting, not in source).**

### 2.5 `auth.mfa_factors`

`id`, `user_id`, `friendly_name`, `factor_type`, `status`, **`secret` (TOTP seed)**, `phone`, `web_authn_credential` (jsonb), `web_authn_aaguid`, `last_webauthn_challenge_data`, `last_challenged_at`.
**PD: Yes (credential + phone). SPD: No.** — **MFA is never enrolled or enforced anywhere in application code** (no `mfa.enroll` / `mfa.challenge` calls exist). Table is present because Supabase provisions it. Basis: Contract.

### 2.6 `auth.audit_log_entries`

| Field | Type | PD | SPD | Category | Purpose | Retention | Basis |
|---|---|---|---|---|---|---|---|
| `id`, `instance_id` | uuid | Indirect | No | Security Logs | Event ID | UNKNOWN | Legal Obligation |
| **`ip_address`** | varchar | **Yes** | No | **Security Logs / Location** | Auth-event source IP | **UNKNOWN — no purge job** | Legitimate Interest |
| **`payload`** | json | **Yes** (contains actor e-mail, action type) | No | Security Logs | Auth event body | UNKNOWN | Legitimate Interest |
| `created_at` | timestamptz | Indirect | No | Security Logs | — | UNKNOWN | Legal Obligation |

### 2.7 `public.profiles` — the central user record (57 columns)

| Field | Type | Example | PD | SPD | Category | Purpose | Src | Access | Basis |
|---|---|---|---|---|---|---|---|---|---|
| `id` | uuid | FK → `auth.users` | Indirect | No | Authentication | Identity | Auto | 10 RLS policies; self + lab staff + platform admin | Contract |
| `full_name` | text | `Dt. Medet Roger Paydaş` | **Yes** | No | Identity | Display / attribution | User | Self, lab, clinic peers, admin, **AI** | Contract |
| `email` | text | `dt@klinik.com` | **Yes** | No | Authentication / Communication | Login + e-mail notifications (copied from `auth.users` by `handle_new_user()`) | User | Self, lab admin, platform admin | Contract |
| `phone` | text | `+905551112233` | **Yes** | No | Communication | Contact / SMS OTP | User | Self, lab, clinic | Contract |
| **`whatsapp_phone`** | text | `+905551112233` | **Yes** | No | Communication | **WhatsApp notifications via Twilio** (`send-whatsapp-notification/index.ts:132`) | User | Self, lab, **Twilio** | Consent |
| **`tc_kimlik_no`** | text | `12345678901` | **Yes** | **Yes** (national ID) | Identity | HR / identity | User / Admin | Self, lab admin | Legal Obligation? — **UNKNOWN** |
| **`birth_date`** | date | `1985-03-02` | **Yes** | No | Identity | HR | User / Admin | Self, lab admin | Contract (employment) |
| `gender` | text | `kadın` | **Yes** | **Yes** | Identity | UNKNOWN — no processing purpose found in code | User | Self, lab admin | **Unknown** |
| `address`, `city` | text | `Kadıköy / İstanbul` | **Yes** | No | Location | Contact | User | Self, lab admin | Contract |
| **`diploma_no`** | text | `123456` | **Yes** | No | Doctor Information / Professional | Practitioner verification | Doctor | Self, lab admin | Legal Obligation |
| `specialty`, `department` | text | `Protez` | Yes | No | Doctor Information | Routing | User | Self, lab | Contract |
| `avatar_url` | text | public URL in `avatars` bucket | **Yes** (facial image likely) | **Yes if biometric-quality photo** | Uploaded Files / Biometric-adjacent | Profile picture | User | **PUBLIC bucket — world-readable URL** | Consent |
| `user_type`, `role`, `is_active`, `approval_status` | text/bool | `doctor`, `manager`, `pending` | Indirect | No | Authentication | RBAC | Admin | Self, lab, platform admin | Contract |
| `clinic_id`, `clinic_name`, `lab_id`, `doctor_id` | uuid/text | — | Indirect | No | System | Tenant/entity links | Auto | Lab, admin | Contract |
| **`hourly_rate`, `monthly_salary`, `bonus_threshold_orders`, `bonus_per_extra_order`** | numeric/int | `45000.00` | **Yes** | No | **Employee Data / Financial** | Payroll | Admin | Self, lab admin | Contract (employment) |
| **`trust_score`, `doctor_score`, `skill_level`, `total_case_count`, `reject_count`, `completed_count`, `daily_capacity`** | int/text | `82` | **Yes** | No | **Employee Data / Profiling** | **Automated performance scoring of workers** | Auto (system-computed) | Lab admin | **Legitimate Interest — GDPR Art. 22 assessment required, see R-05** |
| `allowed_types`, `allowed_stages`, `skills` | text[] | — | Indirect | No | Employee Data | Work routing | Admin | Lab | Contract |
| `notification_prefs`, `clinic_permissions` | jsonb | — | Indirect | No | System | Preferences / ACL | User / Admin | Self, lab | Contract |
| `language`, `timezone` | text | `tr`, `Europe/Istanbul` | Indirect | No | System | Localisation | User | Self | Contract |
| **`kvkk_accepted_at`** | timestamptz | **`NULL` for 100% of rows (0 of 14 populated — verified live)** | Yes | No | **Consent Record** | Intended KVKK acceptance timestamp | — | — | **BROKEN — column exists, is typed in `lib/types.ts:37`, and is NEVER WRITTEN anywhere in the codebase. See R-01.** |
| `phone_verified` | boolean | `false` | Indirect | No | Authentication | OTP state | Auto | Self, lab | Contract |
| `created_at`, `updated_at` | timestamptz | — | Indirect | No | System | Audit | Auto | All | Legal Obligation |

### 2.8 `public.doctors`

`id`, `clinic_id`, `lab_id`, **`full_name`**, **`phone`**, **`tckn`**, `specialty`, `notes`, `is_active`, `created_at`, `updated_at`.
**PD: Yes. SPD: Yes (`tckn` = national ID).** Category: Doctor Information. Source: Clinic / Lab. Access: 8 RLS policies — lab staff, clinic staff, platform admin, **AI (`veriOku doctors`, `hekimAra`)**, and **BanaBiKurye edge function reads `full_name, phone` and transmits to the courier API**. Basis: Contract. Retention: UNKNOWN.

### 2.9 `public.clinics`

`id`, `lab_id`, `name`, `address`, `phone`, `email`, `contact_person`, `notes`, `category`, `clinic_type`, **`vkn`** (tax ID), `tax_office`, `efatura_registered`, `efatura_alias`, `efatura_checked_at`, `billing_mode`, `default_payment_terms_days`, `logo_url`, `is_active`, timestamps.
**PD: Yes** (`contact_person`, `phone`, `email`, `address` identify natural persons; `vkn` identifies a sole trader). **SPD: No.** Category: Clinic Information / Billing. Source: Clinic / Lab. Access: 5 RLS policies + **AI (`veriOku clinics`)** + **BanaBiKurye (name, address)** + **Nilvera e-Fatura (vkn, title)**. Basis: Contract. Retention: UNKNOWN.

### 2.10 `public.employees` + HR cluster

| Table | PD-bearing fields | PD | SPD | Category | Basis |
|---|---|---|---|---|---|
| `employees` | `full_name`, `phone`, `email`, **`tc_no`**, `base_salary`, `start_date`, `end_date`, `role`, `notes` | Yes | **Yes** (`tc_no`) | Employee Data | Contract (employment) + Legal Obligation |
| `employee_payroll` | `base_salary`, `gross_salary`, `net_salary`, `sgk_employee`, `sgk_employer`, deductions, `absent_days`, `late_count`, `leave_days`, `overtime_minutes` | Yes | No | Employee Data / Financial | Legal Obligation (SGK) |
| `payroll_items`, `payroll_settings`, `salary_payments`, `salary_adjustments` | amounts, reasons, `period` | Yes | No | Employee Data / Financial | Legal Obligation |
| `employee_advances`, `employee_advance_requests` | `amount`, `reason`, `reject_reason`, `approved_by` | Yes | No | Employee Data / Financial | Contract |
| **`employee_leaves`** | `leave_type`, `reason`, `reject_reason`, `start_date`, `end_date` | **Yes** | **Yes — `leave_type` can be `hastalık`/sick leave, and `v_leave_summary` exposes `sick_days`; `reason` is free text that may state a medical condition** | **Employee Data / Health** | Legal Obligation + Explicit Consent |
| **`employee_attendance`** | `check_in`, `check_out`, `work_minutes`, `overtime_minutes`, `check_in_method`, **`check_in_lat`, `check_in_lng`, `check_out_lat`, `check_out_lng`**, `recorded_by` | **Yes** | No | **Employee Data / Location — geolocation surveillance of staff** | **Legitimate Interest — requires DPIA & works-council/employee notice. See R-06** |
| **`employee_documents`** | `doc_type`, `title`, `file_path` (→ `employee-docs` bucket), `file_name`, `mime_type`, `file_size`, `valid_from`, `valid_until` | **Yes** | **Yes — doc_type is uncontrolled free text; medical certificates, criminal-record extracts and ID copies can be stored here** | Employee Data / Uploaded Files | Legal Obligation |
| `employee_performance`, `performance_bonuses`, `performance_rules`, `bonus_*` (9 tables), `v_performance_summary`, `v_technician_performance*` | scores, rates, `revenue_generated`, `quality_pass_rate`, `on_time_rate` | Yes | No | **Employee Data / Profiling** | **Legitimate Interest — Art. 22 assessment required** |
| `v_attendance_monthly`, `v_leave_summary`, `v_expiring_documents`, `v_employee_summary`, `v_payroll_summary`, `v_employee_salary_ccy`, `v_employee_advances_ccy` | aggregates of the above | Yes | Yes (leave/health) | Employee Data | as above |
| `user_permissions`, `user_stage_skills`, `user_station_skills`, `role_permissions`, `permissions` | `user_id`, `permission_key`, `granted_by`, `note` | Indirect | No | Authentication / Employee Data | Contract |

### 2.11 `public.technicians`, `public.couriers`, `public.warehouses`, `public.brands`, `public.suppliers`

| Table | PD-bearing fields | PD | SPD | Category | Src | Basis |
|---|---|---|---|---|---|---|
| `technicians` | `name`, `specialty`, `phone`, `notes` | Yes | No | Technician Information | Lab | Contract |
| `couriers` | `profile_id`, `full_name`, `phone`, `company_name`, `courier_type`, `tracking_url_template` | Yes | No | Employee/Contractor Data | Lab | Contract |
| `warehouses` | `responsible`, `phone`, `location` | Yes | No | Employee Data | Lab | Contract |
| `brands` | `contact_person`, `phone`, `email`, `supplier`, `website` | Yes | No | Supplier Contact | Lab | Contract |
| `suppliers` | `contact_person`, `phone`, `email`, `address`, **`tax_no`**, `tax_office`, **`iban`**, `bank_name` | **Yes** | No | Supplier / Financial | Lab | Contract |
| `supplier_transactions` | `iban`, `bank_name`, `reference_no`, `description`, amounts | **Yes** | No | Financial | Lab | Contract / Legal Obligation |
| `supplier_balances` (view) | aggregate | Yes | No | Financial | Auto | Legitimate Interest |

---

## 3. Communication & Content tables

| Table | Field(s) | PD | SPD | Category | Purpose | Src | Access | Basis |
|---|---|---|---|---|---|---|---|---|
| **`order_messages`** | `content` (free text — routinely contains patient names & clinical instructions), `sender_id`, `attachment_url`, `attachment_type`, `attachment_name`, `attachment_size`, `read_at`, `approval_status`, `approved_by`, `message_type` | **Yes** | **Yes (clinical free text)** | Communication / Uploaded Files | Order chat | Clinic / Doctor / Lab | 7 RLS policies; order participants + **AI (`veriOku order_messages`, `mesajGonder`)** | Contract |
| `support_tickets` | `subject`, `context` (jsonb), `resolution`, `checklist`, `error_code`, `stage_key`, `work_order_id` | Yes | Possibly (order context) | Communication / Support | Support | User | User, assignee, platform admin, **AI (`veriOku support_tickets`, `destekTalebiAc`)** | Contract |
| `support_messages` | `body`, `attachments` (jsonb), `sender_role`, **`is_internal`** | Yes | Possibly | Communication / Internal Notes | Support thread | User / Support | Ticket parties; `is_internal` = staff-only | Contract |
| `support_attachments` | `storage_path`, `file_name`, `mime_type`, `file_size`, `preview_url`, `metadata`, `uploader_id` | Yes | Possibly | Uploaded Files | Support evidence | User | Ticket parties | Contract |
| `support_status_history` | `actor_id`, `from/to_status`, `note` | Indirect | No | Audit | SLA trail | Auto | Support | Legitimate Interest |
| **`notifications`** | `title`, `body` (**contains patient/order identifiers**), `payload` (jsonb), `category`, `resource_type/id`, `action_url`, `delivered` (jsonb), `read_at` | **Yes** | **Yes (body can carry patient name)** | Communication | In-app notification | Auto | Recipient user; 4 RLS policies | Contract / Legitimate Interest |
| **`email_notifications`** | `email_to`, `subject`, `template`, **`payload` (jsonb — full notification body)**, `status`, `provider` (`resend`), `provider_id`, `error`, `sent_at` | **Yes** | **Yes** | Communication / External Service | E-mail audit trail | Auto | Service role | Contract |
| **`whatsapp_notifications`** | `phone_to`, `template`, `payload`, `category`, `provider` (`twilio`), `provider_id`, `status`, `error` | **Yes** | Possibly | Communication / External Service | WhatsApp audit trail | Auto | Service role | Consent |
| **`push_tokens`** | `token` (Expo/FCM/APNs), `platform`, `device_id`, **`user_agent`**, `last_seen_at` | **Yes** (device identifier) | No | Authentication / Device | Push delivery | Auto (client) | Self; 4 RLS policies | Consent |
| `lab_notes` | `note`, `author_id` | Yes | No | Internal Notes | Lab memo | Lab | **RLS enabled with 0 policies → no one can read via PostgREST** | Legitimate Interest |
| `platform_announcements` | `title`, `body`, `created_by`, `audience_lab` | Indirect | No | Communication | Platform broadcast | Platform admin | RLS, 0 policies | Legitimate Interest |
| `payment_reminders` | `recipient`, `subject`, `body`, `message`, `channel`, `tone`, `sent_by`, amounts | **Yes** | No | Communication / Billing | Dunning | Lab | Lab, admin | Legitimate Interest |
| `reminder_templates` | `subject`, `body`, `tone` | No | No | Config | Templates | Lab | Lab | Contract |

---

## 4. Order-lifecycle, clinical & production tables

| Table | PD-bearing fields | PD | SPD | Category | Access | Basis |
|---|---|---|---|---|---|---|
| **`work_order_photos`** | `storage_path` (→ `work-order-photos` bucket: intra-oral photos, STL/PLY/OBJ scans, DICOM), `uploaded_by`, `caption`, `external_id`, `external_source` | **Yes** | **Yes — biometric-adjacent 3D dental scans + intra-oral imagery** | **Uploaded Files / Health / Biometric** | 7 RLS policies on the table, **but the storage bucket policy grants ALL authenticated users read+write (see R-02)** | Contract + Explicit Consent |
| **`stage_photos`** | `storage_path`, `uploaded_by`, `caption`, `stage_id`, `work_order_id` | **Yes** | **Yes** | Uploaded Files / Health | Lab, admin | Contract |
| **`order_reviews`** | `rater_id`, `rater_role`, `comment`, `lab_reply`, ratings (`overall`, `fit`, `occlusion`, `contacts`, `esthetics`, `surface`, `on_time`), **`photos`, `clinical_photos` (text[])** | **Yes** | **Yes — `clinical_photos` are intra-oral clinical images** | Health / Uploaded Files / Communication | Order parties, **AI (`veriOku order_reviews`)** | Contract + Consent |
| **`design_qc_checks`** | `margin_ok`, `die_spacing_ok`, `contacts_ok`, `occlusion_ok`, `anatomy_ok`, `stl_export_ok`, `notes`, `doctor_note`, `checked_by`, `doctor_id`, `doctor_approved*` | Yes (linked) | **Yes (clinical QC)** | Dental / Health | Lab, doctor | Contract |
| `order_items` | `name`, `notes`, `tooth_numbers`, `price`, `currency`, `lane` | Yes (linked) | **Yes** | Dental / Billing | Order parties, AI (lab-side) | Contract |
| `order_stages` | `technician_id`, `technician_note`, `manager_note`, `skipped_reason`, `skipped_by`, `approved_by`, timing fields | Yes (staff) | Indirect (health-linked) | Technician Information / System | 9 RLS policies | Contract |
| `provas` | `doctor_notes`, `lab_notes`, `prova_type`, `scheduled_date`, `created_by` | Yes | **Yes (clinical try-in notes)** | Dental / Health | Order parties, AI (lab-side) | Contract |
| `status_history` | `changed_by`, `old_status`, `new_status`, `note` | Indirect | No | Audit | Order parties | Legal Obligation |
| `order_events` | `actor_id`, `event_type`, `metadata` (jsonb) | Indirect | No | Audit | Lab, admin | Legitimate Interest |
| `stage_activity_events`, `stage_state_transitions`, `stage_work_segments`, `stage_timing_overrides`, `machine_events` | `actor_id`, `payload`, timings | Indirect | No | System Logs / Employee monitoring | Lab, admin | Legitimate Interest |
| `stage_material_consumptions` | `technician_id`, `item_name`, `note`, costs | Indirect | No | Employee / Inventory | Lab | Contract |
| `checklist_log`, `delay_log`, `reject_log`, `stage_log`, `case_steps`, `approvals`, `work_order_holds` | `checked_by`/`set_by`/`rejected_by`/`owner_id`/`assigned_to`/`held_by`/`requested_by`/`approved_by`, `reason`, `notes`, `rejection_reason` | Indirect + free text | Possibly | Audit / Internal Notes | Lab, admin | Legitimate Interest |
| `order_change_requests`, `order_cancellation_requests` | `requested_by`, **`requester_name`**, `proposed_fields` (jsonb — **can contain patient identity changes**), `proposed_items`, `note`, `reason_detail`, `reviewed_by`, `review_note` | **Yes** | **Yes** | Communication / Health | Order parties, lab | Contract |
| `order_boxes`, `qr_links` | `box_code`, `qr_payload`, `short_code`, `target_id`, `created_by`, `scan_count`, `last_scan_at` | Indirect | No | System / Physical tracking | Lab | Contract |
| **`medit_patients`** | `uuid`, **`name`**, `code`, `date_created`, `date_updated`, `deleted_at`, `synced_at` | **Yes** | **Yes** | **Patient Identity / Health** | **Third-Party (Medit Link webhook — `medit-webhook/index.ts:175`)** | Service-role write; 1 RLS policy | Contract + Consent |
| **`pending_paper_orders`** | **`sender_phone`**, **`sender_name`**, `channel_msg_id`, `photo_url`, `photo_storage_path` (→ `paper-orders` bucket), **`ocr_data` (jsonb — full Claude OCR output incl. patient name)**, **`patient_name`**, `confidence_avg`, `reviewed_by`, `reject_reason` | **Yes** | **Yes** | **Patient Identity / Health / AI** | Inbound webhook (WhatsApp/e-mail) + **Anthropic Claude OCR** | Lab, admin; 2 RLS policies | Contract + Consent |
| **`deliveries`** | **`recipient_name`**, `recipient_note`, **`signature_path`** (handwritten signature image), **`destination_name`**, **`destination_address`**, **`destination_phone`**, `external_tracking_no`, `courier_id`, `cancel_reason`, `notes`, fees | **Yes** | **Signature = biometric-adjacent** | **Location / Biometric / Uploaded Files** | Lab, courier, admin; 4 RLS policies; **transmitted to BanaBiKurye** | Contract |
| **`gps_pings`** | **`lat`, `lng`, `accuracy_m`, `speed_kmh`, `recorded_at`, `delivery_id`** | **Yes** (tracks a courier, an identified natural person) | No | **Location — continuous courier tracking** | Auto (courier device) | Lab, admin; 2 RLS policies | **Legitimate Interest — DPIA required. See R-06** |
| `storage_cleanup_queue` | `work_order_id`, `bucket`, `queued_at`, `processed_at`, `error_message` | Indirect | No | System | **Deletion queue — but no consumer job exists in `cron.job`. See R-07** | Legal Obligation |

---

## 5. Financial & billing tables

| Table | PD-bearing fields | PD | SPD | Category | Basis |
|---|---|---|---|---|---|
| `invoices` | `doctor_id`, `clinic_id`, `invoice_number`, `notes`, `created_by`, amounts, **`efatura_uuid`, `efatura_status`, `efatura_error`, `efatura_type`, `efatura_provider`, `efatura_sent_at`, `efatura_etag`** | Yes (via clinic/doctor) | No | Billing / Financial | **Legal Obligation** (TR: 10-yr commercial-book retention — **not implemented in code**) |
| `invoice_items`, `invoice_orders` | `description`, `order_item_id` (→ dental work) | Yes (linked) | Indirect health | Billing / Dental | Legal Obligation |
| `payments` | `reference_no`, `notes`, `received_by`, amounts, currency | Yes | No | Financial | Legal Obligation |
| **`payment_submissions`** | **`sender_name`**, **`bank_name`**, `reference_no`, **`receipt_url`** (uploaded bank receipt image), `notes`, `reject_reason`, `submitted_by`, `reviewed_by` | **Yes** | No | Financial / Uploaded Files | Contract |
| **`payment_intents`** | `public_token`, `provider` (`iyzico`), `provider_ref`, **`provider_token`**, `amount`, `installments`, `commission_*`, `error_code/message`, `clinic_id`, `doctor_id` | **Yes** (payer-linked) | No | Financial / Authentication | Contract |
| **`payment_attempts`** | **`request_body` (jsonb)**, **`response_body` (jsonb)**, `http_status`, `error_code`, `error_message` | **Yes — raw payment-provider request/response bodies are stored verbatim; whether these contain cardholder data is UNKNOWN and must be verified before any PCI-DSS assertion** | No | Financial | **Contract — see R-09** |
| `webhook_events` | `provider_ref`, `provider`, `received_at` | Indirect | No | Financial / Audit | Contract |
| **`efatura_logs`** | **`request_body` (jsonb — full UBL invoice incl. buyer VKN/TCKN, name, address)**, **`response_body` (jsonb)**, `http_status`, `efatura_uuid`, `error_*`, `created_by` | **Yes** | No | Billing / Legal / External Service | Legal Obligation |
| **`mukellef_cache`** | `vkn`, `is_registered`, `alias`, **`title`** (legal name — a natural person for sole traders), `tax_office`, `provider`, `checked_at` | **Yes** | No | Billing / Third-Party lookup | Legal Obligation |
| **`provider_credentials`** | **`credentials` (jsonb — third-party API keys/secrets in the application database)**, `provider`, `environment`, `display_name`, `last_test_*` | No (not personal) | No | **Secrets** | **Contract — see R-10 (secrets at rest in an app table)** |
| `checks` | `check_number`, `bank_name`, `clinic_id`, amounts, dates | Yes (via clinic) | No | Financial | Legal Obligation |
| `cash_accounts` | `name`, `bank_name`, **`iban`**, `account_type` | **Yes** | No | Financial | Legal Obligation |
| `cash_movements`, `expenses`, `recurring_expenses`, `budgets` | `description`, `notes`, `created_by`, amounts | Indirect | No | Financial | Legal Obligation |
| `purchase_invoices` | `supplier_name`, `invoice_number`, **`invoice_file_url`**, `notes`, `created_by` | Yes | No | Financial / Uploaded Files | Legal Obligation |
| `clinic_discounts`, `clinic_price_overrides`, `promotions`, `lab_services`, `materials`, `categories` | `notes`, `clinic_ids` | Indirect | No | Billing / Config | Contract |
| `currency_rates`, `plan_definitions`, `platform_invoices` | amounts, `created_by`, `note` | Indirect | No | Financial | Contract |
| `v_clinic_balance`, `v_clinic_balance_ccy`, `v_invoice_reminders`, `v_upcoming_due_invoices`, `v_unbilled_work_orders`, `v_budget_actuals`, `v_cash_account_summary`, `v_monthly_finance_summary*`, `v_user_salary_summary` | aggregates + **`v_unbilled_work_orders.patient_name`** | Yes | **Yes (that one view carries patient names)** | Financial / Patient Identity | Legal Obligation |

---

## 6. Inventory / operations (low personal-data density)

`stock_items`, `stock_movements` (`technician_name`, `user_id`), `stock_locations`, `material_requests` (`requester_id`, `manager_note`, `admin_note`, `reject_reason`, `attachment_url`), `material_request_items`, `material_request_events` (`actor_id`, `note`, `payload`), `material_request_catalog`, `equipment` (`assigned_to`, `serial_number`, **`credentials_ref`**, `endpoint_url`, `last_error_message`), `machine_live_status`, `bottleneck_stations`, `station_performance_summary`, `v_low_stock`, `v_station_analytics`, `lab_stations`, `lab_shifts`, `lab_skills`, `workflow_templates`, `case_type_stage_presets`.

**PD:** Indirect only (actor/technician identifiers, free-text notes). **SPD:** No. **Basis:** Contract / Legitimate Interest. **Retention:** UNKNOWN.

---

## 7. Tenant, platform & security tables

| Table | PD-bearing fields | PD | SPD | Category | Basis |
|---|---|---|---|---|---|
| `labs` | `name`, `address`, `phone`, `email`, **`tax_number`**, `owner_id`, `logo_url`, `website`, **`location_lat`, `location_lng`, `location_radius`** (geo-fence for staff check-in), **`checkin_token`**, `plan`, `trial_ends_at`, `limit_overrides` | **Yes** | No | Clinic/Lab Information / Location | Contract |
| `lab_settings`, `lab_feature_flags`, `platform_feature_flags`, `platform_integrations`, `platform_settings` | config, `updated_by` | Indirect | No | Config | Contract |
| `clinic_invitations` | **`email`**, **`token`**, `invited_by`, `status`, `expires_at` | **Yes** | No | Authentication / Communication | Contract |
| `clinic_lab_memberships` | `member_profile_id`, `approved_by`, `initiated_by`, `status` | Indirect | No | Authentication | Contract |
| `lab_connect_codes` | `code`, `created_by`, `max_uses`, `uses`, `expires_at` | Indirect (credential) | No | Authentication | Contract |
| **`tenant_api_keys`** | `key_prefix`, **`key_hash`**, `name`, `created_by`, `last_used_at`, `revoked_at` | Indirect (credential) | No | Authentication | Contract |
| **`phone_verifications`** | **`phone`**, **`code`** (**OTP stored in plaintext — see R-11**), `verified`, `attempts`, `expires_at`, `user_id` | **Yes** | No | **Authentication** | Contract |
| `platform_admins` | `user_id`, `note` | Indirect | No | Authentication | Contract |
| **`platform_audit_log`** | `actor_id`, `action` (e.g. `anonymize_user`, `purge_lab_pii`, `export_lab`), `target_lab`, **`detail` (jsonb)** | **Yes** | No | **Audit / Security Logs** | Legal Obligation |
| **`activity_logs`** | `actor_id`, **`actor_name`**, `actor_type`, **`action` (free text that embeds full names — verified live: `"Hekim oluşturuldu: Dr. Ahmet Yılmaz"`, `"Hesap pasif edildi: Enes Balaban"`, `"Profil bilgileri güncellendi: Dt. Medet Roger Paydaş"`)**, `entity_type`, `entity_id`, **`entity_label`**, `metadata` (jsonb), `lab_id` | **Yes** | Possibly (order-linked) | **Audit / Activity Logs** | **Legitimate Interest — see R-04: names are baked into free text and survive `admin_anonymize_user`** |
| **`denty_usage`** | `user_id`, `gun` (date), `istek` (request count) | **Yes** | No | **AI usage metering** | Legitimate Interest |
| `tr_mahalleler` | Turkish address reference data (`il`, `ilce`, `mahalle`, `posta_kodu`) | **No** — public reference dataset | No | Reference | Legitimate Interest |
| `my_clinic_users` (view) | `full_name`, `phone`, `email`, `avatar_url`, `clinic_permissions` | **Yes** | No | Clinic/Doctor Information | Contract |
| `my_clinic_doctors` (view) | `full_name`, `phone`, `avatar_url` | **Yes** | No | Doctor Information | Contract |
| `order_timing_summary` (view) | **`patient_name`**, `order_number`, timings | **Yes** | **Yes** | Patient Identity | Contract |

---

## 8. Client-side / device-local storage (not in the database)

| Key | Where | Contents | PD | SPD | Retention | Note |
|---|---|---|---|---|---|---|
| **`newOrderDraft:v1`** | Web `localStorage` + native `AsyncStorage` (`NewOrderScreen.tsx:240, 885, 889`) | **Full unsent order draft: patient first/last name, TC/passport no, DOB, gender, nationality, phone, tooth numbers, work type, notes** | **Yes** | **Yes** | **Persists until the order is submitted or the draft is manually discarded — survives logout. See R-12** | Unencrypted plaintext JSON on the device |
| `new_order_form` | `sessionStorage` | same shape | Yes | Yes | Session | — |
| `new_order_draft_prompted` | `sessionStorage` | `'1'` | No | No | Session | — |
| `lastPanel` | AsyncStorage | last panel route | No | No | Until logout | Optimistic routing |
| `priceList:hiddenCats` | AsyncStorage | UI preference | No | No | Indefinite | — |
| Supabase session (JWT + refresh token) | `AsyncStorage` (native) / `localStorage` (web), managed by `@supabase/supabase-js` | **access token (JWT with `sub`, `email`, `role`), refresh token** | **Yes** | No | Until sign-out | **Not stored in `expo-secure-store`** — `expo-secure-store` is a dependency but is not used for the auth session. See R-13 |
| Denty chat history | `modules/denty/store/dentyStore` (Zustand, in-memory) | user messages, tool results — **may contain patient names** | Yes | Yes | Process lifetime | Not persisted to disk |

---

## 9. Data collected via device permissions

| Permission | Where declared/requested | Data | PD | SPD | Purpose | Basis |
|---|---|---|---|---|---|---|
| Camera (`expo-camera`) | order photo capture, barcode/QR scan, `modules/ar-scanner` | **Intra-oral / prosthesis photographs** | Yes | **Yes** | Order documentation | Consent |
| Photo library (`expo-image-picker`) | order & review photo upload | photos | Yes | Yes | Order documentation | Consent |
| Documents (`expo-document-picker`) | STL/PLY/OBJ/DCM/ZIP/PDF upload | 3D dental scans | Yes | **Yes (biometric-adjacent)** | Production input | Consent |
| **Location (`expo-location`)** | `app/checkin.tsx:76-78` — `requestForegroundPermissionsAsync()` then `getCurrentPositionAsync()` | **Staff check-in coordinates → `employee_attendance.check_in_lat/lng`**; courier tracking → `gps_pings` | **Yes** | No | Geo-fenced attendance (`labs.location_lat/lng/radius`) | **Legitimate Interest — DPIA required** |
| **Microphone (Web Speech API)** | `modules/denty/useSpeechRecognition.ts` | **Voice audio → transcribed by the browser's speech engine (Chrome sends audio to Google's servers)** | **Yes (voice)** | **Yes (voice is biometric-adjacent; content may name patients)** | Voice input to the AI assistant | **Consent — currently only the browser's own permission prompt; no in-app disclosure. See R-14** |
| Notifications (`expo-notifications`) | push registration | Expo push token, `device_id`, `user_agent` | Yes | No | Push delivery | Consent |
| Network / Device (`expo-network`, `expo-device`) | diagnostics | device model, network state | Indirect | No | UNKNOWN — no persistence to DB found | Legitimate Interest |

---

## 10. Summary counts

| Metric | Value |
|---|---|
| Base tables in `public` | 138 |
| Views in `public` | 31 |
| Tables containing **direct** personal data | 63 |
| Tables containing **special-category (health/biometric/national-ID)** data | **21** — `work_orders`, `work_order_photos`, `stage_photos`, `order_reviews`, `order_messages`, `design_qc_checks`, `provas`, `order_items`, `medit_patients`, `pending_paper_orders`, `order_change_requests`, `order_timing_summary`, `v_unbilled_work_orders`, `deliveries`, `doctors`, `profiles`, `employees`, `employee_leaves`, `employee_documents`, `v_leave_summary`, `checklist_log` |
| Storage buckets | 8 (4 public, 4 private) |
| Edge Functions | 24 |
| Tables with RLS enabled | 138 of 138 base tables |
| Tables with RLS enabled but **0 policies** | 11 (`lab_feature_flags`, `lab_notes`, `plan_definitions`, `platform_announcements`, `platform_feature_flags`, `platform_integrations`, `platform_invoices`, `platform_settings`, `storage_cleanup_queue`, `tenant_api_keys`, `webhook_events`) — effectively deny-all to `anon`/`authenticated`; reachable only via service role / `SECURITY DEFINER` RPCs |
| Views **without** `security_invoker` (run as owner, bypass RLS) | **20** — see 06-risk-report R-02 |
| Retention / deletion cron jobs | **0** |
| Consent records captured | **0** (`profiles.kvkk_accepted_at` = NULL in 100% of rows) |
