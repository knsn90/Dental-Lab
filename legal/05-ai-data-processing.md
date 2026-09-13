# 05 — AI Data Processing

**Every AI feature in SIMAN uses one provider and one model family: Anthropic's `claude-sonnet-4-5` over `https://api.anthropic.com/v1/messages`.** No other AI/ML provider, no on-device model, no embedding store, no vector database and no training pipeline exists in the codebase.

Four distinct AI features were found. Each is documented below against the questions required.

---

## AI-1 — "Simanty" / "Denty" conversational assistant

### What data is sent?

**A. The system prompt** — rebuilt on every message by `modules/denty/context.ts:98-180`. It always contains:

| Item | Source | Personal? |
|---|---|---|
| The logged-in user's **full name** | `profiles.full_name` (`context.ts:69`) | **Yes** |
| `user_type` and `role` | `profiles` | Indirect |
| Active panel and **current route path** | `expo-router` segments | Indirect (behavioural) |
| **Open order ID** (`orderId`) when a case is on screen | route params | Indirect → resolves to a patient |
| Permission flags (`orders`, `support`, `messages`) | `permissionStore` | No |
| Today's date/weekday | client clock | No |
| **Names of every file the user has attached** via the 📎 control | `dentyStore.attachments` | **Yes** (filenames routinely contain patient names) |
| **Names and types of every 3D layer loaded in the open viewer** | `viewerBridge.getLayers()` | **Yes** (scan filenames) |

**B. The full conversation history** — every user message verbatim, plus all prior assistant turns (`api.ts:104`).

**C. The verbatim result of every read-only tool call.** This is the largest exposure. `modules/denty/tools.ts:49-68` defines the permitted read set:

| Tool / table | Search key | Personal data returned to the model |
|---|---|---|
| `veriOku('work_orders')` | **`patient_name`** | **Patient name, TC kimlik/passport no, DOB, gender, nationality, city, country, teeth, work type, shade, notes** |
| `veriOku('doctors')` / `hekimAra` | `full_name` | **Doctor name, phone, TCKN, specialty** |
| `veriOku('clinics')` | `name` | **Clinic name, address, phone, e-mail, contact person, VKN** |
| `veriOku('invoices')` | `invoice_number` | Invoice totals, dates, clinic/doctor references |
| `veriOku('payments')` | — | Payment amounts, references, methods |
| `veriOku('v_clinic_balance')` / `cariDurum()` | — | Full receivables position of a clinic |
| `veriOku('order_messages')` | — | **Free-text clinical chat, including patient discussion** |
| `veriOku('support_tickets')` | `subject` | Support subjects and context |
| `veriOku('notifications')` | — | Notification titles/bodies (may contain patient names) |
| `veriOku('order_stages')` / `asamaDurumu()` | — | Technician assignments and timing |
| `veriOku('order_items')` *(lab side)* | — | **Teeth, work type, prices** |
| `veriOku('order_reviews')` *(lab side)* | — | **Clinical quality ratings and comments** |
| `veriOku('provas')` *(lab side)* | — | **Try-in appointment notes** |
| `veriOku('stock_items')`, `veriOku('lab_stations')`, `stokDurumu()`, `istasyonYuku()` *(lab side)* | `name` | Inventory / station load |
| **`veriOku('employees')` *(admin only)*** | `full_name` | **Employee name, phone, e-mail, TC no, base salary** |
| **`veriOku('expenses')` *(admin only)*** | — | Financial detail |
| `veriOku('deliveries')` *(lab/admin/courier)* | — | **Recipient name, destination address and phone** |
| `gunlukOzet()` | — | Aggregated overdue/today/critical counts **with example rows** |
| `kapanisAnalizi()`, `taramaTeshis()` | — | **Occlusal contact statistics and mesh-quality metrics derived from the patient's 3D scan** (computed client-side; the numeric summary is sent) |

Row cap: default 10, maximum 15 per call (`tools.ts:148`), up to 6 tool loops per turn (`api.ts:22`). So a single conversational turn can lawfully surface up to ~90 patient records to the model.

**D. Write-tool arguments.** `siparisOlustur` and `siparisDuzenle` accept and transmit patient identity explicitly. From `tools.ts:281-288`:
`hasta_ad_soyad` (full patient name), `tc_pasaport` (**national ID / passport number**), `dogum_tarihi` (DOB), `cinsiyet` (gender), `uyruk` (nationality), `ikamet_ulke`, `ikamet_sehir`.

### To which model? To which provider?

- **Model:** `claude-sonnet-4-5` — hard-coded at `modules/denty/api.ts:21` (`const DENTY_MODEL = 'claude-sonnet-4-5'`) and defaulted server-side at `supabase/functions/denty-brain/index.ts` (`body.model ?? 'claude-sonnet-4-5'`).
- **Provider:** **Anthropic PBC**, `https://api.anthropic.com/v1/messages`, API version header `2023-06-01`, `max_tokens: 1024`.
- **Note:** the model is caller-supplied (`body.model`), so a modified client could request any Anthropic model. The proxy does not validate it against an allowlist.

### Is patient data included?

**Yes, unambiguously.** `work_orders` is the primary search target and its designated search column is `patient_name`. The order-creation and order-edit tools take TC kimlik number and date of birth as named parameters.

### Is anonymisation performed?

**No.** There is no redaction, tokenisation, pseudonymisation, masking or field-stripping anywhere in `denty-brain/index.ts`, `modules/denty/api.ts`, `modules/denty/tools.ts` or `modules/denty/context.ts`. The proxy forwards `{system, messages, tools}` unchanged and returns `{stop_reason, content, usage}` unchanged.

### Is user consent required? Is it obtained?

**Required: yes** — Art. 9(2)(a) GDPR / KVKK m.6 for the health data, plus Art. 44-49 GDPR for the transfer to a US provider.
**Obtained: no.** The assistant is mounted in all six panels (`(lab)`, `(clinic)`, `(doctor)`, `(admin)`, `(station)`, `(courier)` — `context.ts:19`). There is no AI-specific notice, no opt-in, no per-tenant toggle and no way to disable it. `profiles.kvkk_accepted_at` is never written. The privacy policy names Anthropic in §4 but that is notice, not consent, and it is not surfaced at the point of use.

### Controls that DO exist

| Control | Implementation |
|---|---|
| Authentication | `denty-brain` rejects any request without a valid Supabase JWT (`index.ts:34-44`) |
| API-key isolation | `ANTHROPIC_API_KEY` lives only in the edge-function environment; it is never shipped to the client |
| RLS enforcement | Tools execute **client-side** using the user's own session, so RLS and permission grants bound what any tool can read (`api.ts` header comment; `tools.ts` panel gating) |
| Panel scoping | `employees`/`expenses` are admin-only; `order_items`/`stock_items`/`provas`/`order_reviews` are lab-side only; `deliveries` is lab/admin/courier |
| Rate limiting | `denty_consume_quota(p_user, p_limit)` RPC, default `DENTY_DAILY_LIMIT=120` requests/user/day, counted in `public.denty_usage`. **Fails open: if `SUPABASE_SERVICE_ROLE_KEY` is unset or the RPC errors, no limit is applied** (`denty-brain/index.ts:53-68`) |
| Write gating | Write tools halt the loop and render a confirmation card; nothing is written until the user presses "Onayla" (`api.ts:75-92`, `resumeDentyTurn`) |
| Loop bound | `MAX_TOOL_LOOPS = 6` |

### What is NOT controlled

- No anonymisation, no consent, no opt-out, no per-tenant kill switch.
- No logging of what was sent to Anthropic — **there is no audit trail of AI disclosures**, so a data subject's Art. 15 request about AI processing cannot be answered.
- No model allowlist on the proxy.
- Retention and training posture at Anthropic: **UNKNOWN** — determined by the commercial agreement, which is not in this repository. (Anthropic's standard commercial terms exclude API inputs from training, but this must be confirmed against the actual contract and recorded in the DPA.)

---

## AI-2 — Paper work-order OCR (`parse-work-order`)

| Question | Answer |
|---|---|
| **What data is sent?** | The **entire photograph or PDF of a handwritten laboratory prescription, base64-encoded** (`index.ts:414`), as an `image` or `document` content block (`:89-92`). These forms contain: handwritten **patient name**, doctor name, clinic, dates, tooth chart, shade, and any free-hand clinical note on the page. Nothing is cropped or redacted. |
| **Accepted inputs** | `application/pdf`, `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif` (`:418`) |
| **Model** | `claude-sonnet-4-5` (`:106`) |
| **Provider** | Anthropic, `https://api.anthropic.com/v1/messages` (`:98`) |
| **Is patient data included?** | **Yes — by design.** The prompt instructs the model to extract `patient_name` and warns it not to confuse it with the doctor's name (`:264-265`, `:309`). It returns per-field confidence (`:287`) and even alternative readings of the name (`:374`: `"patient_name": ["GÜLCİN KAZAZ", "GÜLGÜN KAZAZ"]`) |
| **Anonymisation?** | **No** — impossible by construction; the identity is the payload |
| **Consent?** | **None.** The patient is unaware their handwritten record was photographed and sent to a US AI provider. The clinic staff member who triggers OCR receives no notice either |
| **Where the output lands** | `pending_paper_orders.ocr_data` (**the full model output as jsonb**), `.patient_name`, `.confidence_avg`; the source image in the `paper-orders` bucket; on approval → `work_orders` |
| **Upstream ingest** | `inbound-paper-order/index.ts` — an authenticated webhook (`INBOUND_WEBHOOK_SECRET`) that also captures the **sender's phone number and name** from the messaging channel |
| **Retention** | UNKNOWN — `pending_paper_orders` rows are never deleted, including rejected ones |

---

## AI-3 — Purchase-invoice OCR (`parse-invoice`)

| Question | Answer |
|---|---|
| **What data is sent?** | Full invoice PDF/image, base64 (`index.ts:366`) — supplier legal name, tax number, address, bank details, line items, totals. The prompt also extracts equipment `model` names (`:336`) |
| **Model / Provider** | `claude-sonnet-4-5` / Anthropic (`:199-207`) |
| **Fallback** | The header comment (`:5`) indicates a non-AI path is tried first and Claude Vision is the fallback |
| **Patient data?** | **No** — supplier/commercial documents only |
| **Personal data?** | **Yes** — supplier contact persons and sole-trader tax identities are personal data |
| **Anonymisation?** | No |
| **Consent?** | Not the applicable basis; Legitimate Interest is arguable — but the **transfer to Anthropic still requires a DPA and a transfer mechanism** |
| **Where output lands** | `purchase_invoices`, `stock_movements`, `suppliers` |

---

## AI-4 — Payment-receipt OCR (`parse-receipt`)

| Question | Answer |
|---|---|
| **What data is sent?** | Full receipt/bank-transfer slip image, base64 (`index.ts:241`) — **payer name, bank, IBAN or account reference, amount, date** |
| **Model / Provider** | `claude-sonnet-4-5` / Anthropic (`:68-76`) |
| **Patient data?** | No |
| **Personal data?** | **Yes** — `sender_name` and bank details identify a natural person |
| **Anonymisation?** | No |
| **Consent?** | Not obtained; Contract/Legitimate Interest arguable |
| **Where output lands** | `payment_submissions` (`sender_name`, `bank_name`, `reference_no`, `receipt_url`) |

---

## AI-adjacent: client-side analysis that does NOT reach an AI provider

For completeness, so counsel does not over-scope the AI disclosure:

| Feature | What it does | Leaves the device? |
|---|---|---|
| `kapanisAnalizi()` — occlusion heat-map | Computes upper↔lower contact distances from the loaded 3D meshes using `three` + `three-mesh-bvh` in the browser/app | **The geometry stays local. Only the numeric summary (contact %, tightest/mean mm) is sent to Anthropic as a tool result.** The rendered heat-map image may be uploaded to the **public** `occlusion-screenshots` bucket |
| `taramaTeshis()` — mesh quality | Counts triangles, open edges, non-manifold edges, inverted normals locally | Only the numeric summary is sent to Anthropic |
| `modules/ar-scanner` (native module) + face scan | Captures 3D geometry on-device | Uploaded to `work-order-photos`; **not sent to any AI provider** |
| `useSpeechRecognition` | **Web Speech API** (`window.SpeechRecognition` / `webkitSpeechRecognition`), web/PWA only | **Not sent to Anthropic — but in Chrome/Edge the audio is transmitted to the browser vendor's (Google's) speech servers for transcription. This is an undisclosed third-party transfer of voice data, and the dictated text frequently contains patient names.** See risk R-14 |

---

## 5. Compliance conclusions for the AI layer

| Requirement | Status |
|---|---|
| Named provider & model documented | ✅ (this document) |
| DPA with Anthropic | ❌ **not in repository** |
| Art. 44-49 transfer mechanism (SCCs / KVKK explicit consent) | ❌ **not in repository** |
| Art. 9(2)(a) explicit consent for health data | ❌ **never collected** |
| Transparency notice at point of use | ❌ **none** — the privacy policy mentions Anthropic in §4 only |
| Ability to opt out / disable AI per tenant or per user | ❌ **none** |
| Anonymisation / pseudonymisation before transmission | ❌ **none** |
| Audit log of AI disclosures | ❌ **none** — only a request counter (`denty_usage`) |
| Human-in-the-loop for write actions | ✅ confirmation cards |
| RLS-bounded read scope | ✅ tools run under the user's own session |
| Rate limiting | ⚠️ present but **fails open** |
| Model allowlist on the proxy | ❌ caller-controlled |
| **EU AI Act** classification | **UNKNOWN — requires legal assessment.** The assistant is a general-purpose productivity tool, but `taramaTeshis()`/`kapanisAnalizi()` produce quality judgements on a medical device's design, and `profiles.trust_score` / `employee_performance.score` are automated worker-evaluation systems (an Annex III high-risk category if used for employment decisions) |
