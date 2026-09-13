# 04 — Third-Party Services & Data Flows

**Method:** every `https://` literal in `my-expo-app/{supabase/functions,core,app,lib,components,store,modules}` was extracted and each hit traced to its call site. Package dependencies in `package.json` were reviewed for embedded SDKs.

---

## 1. Sub-processor register

| # | Service | Endpoint(s) in code | What is transmitted | Purpose | PD? | SPD? | Code reference |
|---|---|---|---|---|---|---|---|
| 1 | **Supabase** (Postgres, Auth, Storage, Edge Functions, Realtime) | `kjwjxqfdsxkxgcgophdy.supabase.co` | **Everything** — the entire database, all files, all credentials, all logs | Core hosting | **Yes** | **Yes** | `core/api/supabase.ts`, all edge functions |
| 2 | **Anthropic PBC** (Claude) | `https://api.anthropic.com/v1/messages` | See §2 — chat context incl. **user full name**, tool-result rows incl. **patient names and national IDs**, and **whole document images** | AI assistant + OCR | **Yes** | **Yes** | `denty-brain`, `parse-work-order`, `parse-invoice`, `parse-receipt` |
| 3 | **Resend** | `https://api.resend.com/emails` | Recipient e-mail, subject, full HTML body (order & patient references), lab name/logo | Transactional e-mail | **Yes** | **Yes** (body can carry patient name) | `send-email-notification/index.ts:42` |
| 4 | **Twilio** → **Meta / WhatsApp** | `https://api.twilio.com/…/Messages` | `whatsapp_phone`, template SID, template variables (order/patient references) | WhatsApp notifications | **Yes** | Possibly | `send-whatsapp-notification/index.ts:176-190` |
| 5 | **Expo** → **Apple APNs / Google FCM** | `https://exp.host/--/api/v2/push/send` | Expo push token + notification title/body | Mobile push | **Yes** | Possibly (body) | `send-expo-push/index.ts:159` |
| 6 | **Browser push services** (Google FCM / Mozilla autopush / Apple) | VAPID subscription endpoint supplied by the browser | Encrypted push payload | Web push | **Yes** | Possibly | `send-web-push/index.ts` |
| 7 | **NetGSM** | `https://api.netgsm.com.tr`, `https://www.netgsm.com.tr` | Phone number + OTP text | SMS OTP (default provider) | **Yes** | No | `send-otp/index.ts:67-79` |
| 8 | **İleti Merkezi** | `https://api.iletimerkezi.com` | Phone number + OTP text | SMS OTP (alternative) | **Yes** | No | `send-otp/index.ts:91-108` |
| 9 | **Mutlucell** | `https://smsgw.mutlucell.com`, `https://www.mutlucell.com.tr` | Phone number + OTP text | SMS OTP (alternative) | **Yes** | No | `send-otp/index.ts:123-134` |
| 10 | **Nilvera** → **GİB (Turkish Revenue Administration)** | `https://api.nilvera.com`, `https://sandbox-api.nilvera.com` | Full UBL e-invoice: buyer **VKN/TCKN**, legal title, address, tax office, line items | Statutory e-invoicing | **Yes** | No | `efatura-send/index.ts:135` — **the base-URL line is commented out; whether the integration is live is UNKNOWN** |
| 11 | **iyzico** | `https://sandbox-api.iyzipay.com`, `IYZICO_BASE_URL` | Payment intent: amount, currency, installments, buyer references | Card payment | **Yes** | No | `payments-charge/index.ts:12`; raw bodies stored in `payment_attempts` |
| 12 | **BanaBiKurye** | `https://robot.banabikurye.com/api/business/1.8`, `https://robotapitest.banabikurye.com/…` | Order number, **doctor `full_name` + `phone`**, **clinic `name` + `address`** | Courier dispatch | **Yes** | Indirect (a dental-lab delivery implies treatment) | `banabikurye-dispatch/index.ts:31-32, 224-236` |
| 13 | **Google Places API** | `https://places.googleapis.com/v1/places:searchText` | The **destination address string** for geocoding | Courier address resolution | **Yes** | No | `banabikurye-dispatch/index.ts:245` |
| 14 | **Medit Link** (inbound) | Webhook from `data.meditlink.com` | **Receives: patient `name`, `uuid`, `code`, scan files, case metadata** | Scanner integration | **Yes** | **Yes** | `medit-webhook/index.ts:119-407` |
| 15 | **Brandfetch** | `https://api.brandfetch.io/v2/search/{query}` | **Clinic name** | Logo discovery | **Yes** (business contact data) | No | `clinic-logo-search/index.ts:99` |
| 16 | **Clearbit Logo** | `https://logo.clearbit.com/{domain}` | Clinic **website domain** | Logo fetch | Indirect | No | `clinic-logo-search/index.ts:94, 104` |
| 17 | **Google Favicon service** | `https://www.google.com/s2/favicons?sz=256&domain=…` | Clinic **website domain** | Logo fallback | Indirect | No | `clinic-logo-search/index.ts:95, 104` |
| 18 | **QRServer (goqr.me)** | `https://api.qrserver.com/v1/create-qr-code/?…&data={link}` | **The full approval/action link, URL-encoded into a `<img src>` inside an outbound e-mail** | QR code rendering in e-mails | **Yes** — link may embed `doctor_approval_token`; also leaks the recipient's IP and mail-client user agent to a third party on every open | **Indirect** | `send-email-notification/index.ts:421` |
| 19 | **TCMB** (Turkish Central Bank) | `https://www.tcmb.gov.tr` | Nothing personal | FX rates | No | No | `tcmb-rates/index.ts`, cron `tcmb-daily-rates` |
| 20 | **Google Fonts** | `https://fonts.googleapis.com` | Web-client IP + user agent at page load | Typography | **Yes (IP)** | No | `scripts/inject-fonts.js` / web build |
| 21 | **Vercel** | deployment host for `siman.app`, `siman-legal.vercel.app` | HTTP request metadata (IP, user agent) of every web visitor | Web hosting/CDN | **Yes** | No | `vercel.json`, `package.json` `deploy` script |
| 22 | **esm.sh / deno.land** | `https://esm.sh`, `https://deno.land/std@…` | Nothing personal — **but these are runtime module CDNs fetched by edge functions at cold start, i.e. an unpinned third-party code-supply dependency** | Deno module resolution | No | No | all edge functions |
| 23 | **Unsplash / Shopify CDN / vendor sites** (`images.unsplash.com`, `cdn.shopify.com`, `sprintray.com`, `zirkonzahn.com`, `medit.com`, `nexadent.net`) | static image/link references | Client IP on image load | Marketing/UI imagery | Indirect (IP) | No | `modules/integrations/*`, UI assets |

### Services explicitly NOT present

Verified absent from the entire codebase — no import, no SDK, no endpoint: **Sentry, Firebase, Google Analytics, PostHog, Mixpanel, Amplitude, Segment, Datadog, LogRocket, FullStory, Hotjar, Stripe, Cloudflare (as an app-level service), OpenAI, Google Gemini, any advertising or attribution SDK.**
This supports the privacy policy's claim that *"Uygulamada reklam veya izleme (tracking) amaçlı hiçbir analitik yazılım bulunmaz."*

---

## 2. Hosting locations & international transfers

| Service | Region | Basis for transfer | Status |
|---|---|---|---|
| Supabase | **UNKNOWN** — no region is declared in `app.json`, `.env.local`, `vercel.json`, `eas.json` or any config file in the repository | — | **Must be determined from the Supabase dashboard** |
| Anthropic | US (api.anthropic.com) | — | **No DPA / SCCs in repository** |
| Resend | US | — | **No DPA in repository** |
| Twilio | US | — | **No DPA in repository** |
| Expo | US | — | **No DPA in repository** |
| Google (Places, Favicons, Fonts) | US/global | — | **No DPA in repository** |
| Brandfetch, Clearbit, QRServer | US/EU | — | **No DPA in repository** |
| iyzico, Nilvera, NetGSM, İleti Merkezi, Mutlucell, BanaBiKurye, TCMB | Türkiye | Domestic | — |
| Medit | KR/US | — | **No DPA in repository** |
| Vercel | Global edge | — | **No DPA in repository** |

**Not a single Data Processing Agreement, Standard Contractual Clause set, transfer impact assessment or sub-processor notice exists in this repository.** For KVKK, transfers abroad additionally require either explicit consent, a binding-rules/undertaking mechanism, or an adequacy decision — none is evidenced.

---

## 3. Data-flow diagrams

### 3.1 Master flow — a digital case

```
PATIENT (never a system user, never notified)
   │  provides identity + consents verbally in the clinic (UNRECORDED)
   ▼
CLINIC / DOCTOR  ──── intra-oral scanner ────►  MEDIT LINK (KR/US)
   │                                                  │  webhook: patient name, uuid, scan files
   │  NewOrderScreen form                             ▼
   │  (name, TC no*, DOB*, gender*, nationality*,   SUPABASE Edge Fn `medit-webhook`
   │   phone, teeth, work type, shade, notes)         │
   │  * = mandatory                                   │
   ├──► browser localStorage `newOrderDraft:v1` ◄─────┘   (plaintext PII on device, no TTL)
   │
   ├──► [file picker] STL / PLY / OBJ / DCM / ZIP / JPEG / PDF
   │         │
   │         ▼
   │    SUPABASE STORAGE  bucket `work-order-photos`  (private flag,
   │         │             BUT policy = any authenticated user, any tenant)
   │         └──► metadata row `work_order_photos`
   │
   ▼
SUPABASE POSTGRES  `work_orders` + `order_items`
   │   RLS by lab_id
   │
   ├──► `activity_logs`  ("İş emri oluşturdu" + actor_name)
   ├──► `notifications`  ──┬──► RESEND (e-mail)  ──► recipient inbox
   │                       │        └──► QRSERVER.COM (renders QR from the link)
   │                       ├──► EXPO push ──► APNs / FCM ──► device
   │                       ├──► WEB PUSH ──► browser push service
   │                       └──► TWILIO ──► META/WHATSAPP ──► phone
   │
   ▼
LABORATORY
   │  triage → `order_stages` (per station, per technician)
   │  chat  → `order_messages` + `chat-attachments`  ⚠ PUBLIC BUCKET
   │  QC    → `design_qc_checks`, `stage_photos`
   │  3D viewer → `occlusion-screenshots`  ⚠ PUBLIC BUCKET
   │
   ├──► AI ASSISTANT "Simanty"
   │      user question + system prompt (user full name, route, open order)
   │      + tool results (patient_name, TC no, invoice/balance rows)
   │         │
   │         ▼
   │      Edge Fn `denty-brain` (holds ANTHROPIC_API_KEY, JWT check, daily quota)
   │         │
   │         ▼
   │      ANTHROPIC api.anthropic.com  — model claude-sonnet-4-5
   │         │  (NO anonymisation, NO consent, retention UNKNOWN)
   │         ▼
   │      response → tool loop (≤6) → confirmation card for write actions
   │
   ▼
PRODUCTION  → `stage_material_consumptions`, `stock_movements`, `machine_events`
   │
   ▼
DELIVERY
   │  `deliveries` (recipient_name, signature, destination address/phone)
   │  `gps_pings` (lat/lng/speed of the courier, continuous)
   │      │
   │      └──► BANABIKURYE (doctor name+phone, clinic name+address)
   │              └──► GOOGLE PLACES (address geocoding)
   ▼
BILLING
   │  `invoices` → `invoice_items` → `payments`
   │      ├──► NILVERA ──► GİB  (buyer VKN/TCKN, title, address)  [status UNKNOWN]
   │      └──► IYZICO   (payment intent; raw bodies kept in `payment_attempts`)
   ▼
ARCHIVE
   `work_orders.is_archived = true`   ← a boolean flag only
   `storage_cleanup_queue`            ← enqueued, NEVER CONSUMED
   ═══════════════════════════════════════════════════
   NO DELETION EVER OCCURS. Retention = INDEFINITE.
```

### 3.2 Paper-order flow (AI OCR)

```
CLINIC writes a handwritten prescription by hand
   │  photographs it, sends via an external messaging channel
   ▼
Edge Fn `inbound-paper-order`   (auth: INBOUND_WEBHOOK_SECRET)
   │  captures sender_phone, sender_name, channel_msg_id, photo
   ├──► STORAGE bucket `paper-orders` (private, tenant-scoped ✅)
   ▼
Edge Fn `parse-work-order`
   │  base64 image/PDF  ──────────────────────────────────►  ANTHROPIC
   │                                                          claude-sonnet-4-5
   │  ◄── {patient_name, doctor_name, dates, teeth, shade,
   │       per-field confidence, alternative name spellings}
   ▼
`pending_paper_orders`  (patient_name, ocr_data jsonb = FULL model output,
                         sender_phone, sender_name, confidence_avg)
   │  human review by lab staff
   ▼
approved → `work_orders`
```

### 3.3 Authentication flow

```
USER
 ├─ Register: email + password + full_name + phone (+ clinic_name, address, clinic_type)
 │    └─► supabase.auth.signUp()  → auth.users.raw_user_meta_data
 │           └─ trigger handle_new_user() → public.profiles (email copied)
 │                 └─ profiles.approval_status='pending', is_active=false
 │                 └─ side effects: creates a `clinics` row and a `doctors` row
 │    ⚠ NO consent checkbox, NO terms acceptance, kvkk_accepted_at never written
 │
 ├─ Login: verifyOtp(email token) THEN signInWithPassword() [signOut if password wrong]
 │    └─► auth.sessions (ip, user_agent), auth.audit_log_entries (ip_address, payload)
 │    └─► activity_logs "Giriş yaptı"
 │
 ├─ Phone verify: send-otp → NetGSM/İletiMerkezi/Mutlucell
 │    └─► phone_verifications (phone, code IN PLAINTEXT, attempts, expires_at)
 │
 ├─ Password reset: resetPasswordForEmail() → Supabase mail
 │
 ├─ Session storage: JWT + refresh token in AsyncStorage / localStorage
 │    ⚠ expo-secure-store is a dependency but is NOT used for the session
 │
 └─ MFA: auth.mfa_factors table exists (Supabase-provisioned); NEVER USED by the app
```

### 3.4 Deletion flow (as actually implemented)

```
USER taps "Hesabımı Sil"  (mobile doctor profile only; desktop web has no such control)
   ▼
Edge Fn `delete-account`
   ├─ block if caller is the last lab owner/admin
   ├─ NULL out approved_by / created_by / granted_by references
   ├─ doctors row → full_name='Silinmiş hesap', is_active=false
   ├─ auth.admin.deleteUser()  → cascade deletes notifications, push_tokens,
   │                              permissions, memberships, profiles row
   └─ explicit delete from profiles
   ═════════════ WHAT SURVIVES ═════════════
   • every file in every storage bucket (avatar, scans, chat files, HR docs)
   • activity_logs — actor_name AND full names inside free-text `action`
   • order_messages content
   • email_notifications / whatsapp_notifications (address + body + payload)
   • work_orders patient data authored by this user
   • auth.audit_log_entries (IP addresses)
   • phone_verifications
```

---

## 4. Secret handling

| Secret | Where held | Risk |
|---|---|---|
| `ANTHROPIC_API_KEY` | Edge-function env (`denty-brain`, `parse-*`) | Correct — never reaches the client |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge-function env | Correct |
| `RESEND_API_KEY`, `TWILIO_*`, `EXPO_ACCESS_TOKEN`, `VAPID_*`, `SMS_*`, `MEDIT_*`, `INBOUND_WEBHOOK_SECRET`, `NOTIFY_FN_SECRET`, `IYZICO_*` | Edge-function env | Correct |
| **`provider_credentials.credentials` (jsonb)** | **A regular application table in Postgres** — holds per-tenant third-party API keys for e-Fatura and payments, read by `efatura-send:60` and `payments-charge:68` | **Third-party credentials stored in the application database. Whether they are encrypted at the column level is UNKNOWN — the column is plain `jsonb` with no `pgsodium`/Vault wrapper visible.** |
| `equipment.credentials_ref` | Application table | A reference, not the secret itself — acceptable |
| `tenant_api_keys.key_hash` | Application table | Hashed — acceptable |
| **`phone_verifications.code`** | Application table | **Plaintext OTP** |
| `labs.checkin_token`, `work_orders.doctor_approval_token`, `clinic_invitations.token`, `lab_connect_codes.code`, `qr_links.short_code`, `payment_intents.public_token` | Application tables | Bearer tokens in plaintext; each grants some capability to whoever holds the URL |
