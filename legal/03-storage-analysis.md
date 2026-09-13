# 03 — File Storage Analysis

**Source:** live query of `storage.buckets` and `pg_policies` on schema `storage` (Supabase project `kjwjxqfdsxkxgcgophdy`), cross-referenced with every `supabase.storage.from(...)` call site in the repository.

---

## 1. Bucket inventory (live, verified)

| Bucket | Public? | Size limit | Allowed MIME types | Created |
|---|---|---|---|---|
| `avatars` | **PUBLIC** | 5 MB | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | 2026-04-05 |
| `chat-attachments` | **PUBLIC** | 100 MB | **none — any type accepted** | 2026-03-31 |
| `employee-docs` | Private | **none** | **none — any type accepted** | 2026-04-23 |
| `lab-logos` | **PUBLIC** | none | none | 2026-05-18 |
| `occlusion-screenshots` | **PUBLIC** | none | none | 2026-04-19 |
| `paper-orders` | Private | none | none | 2026-05-15 |
| `support-attachments` | Private | 100 MB | 24-entry allowlist incl. `model/stl`, `application/sla`, `application/zip`, `application/octet-stream`, `video/mp4`, `video/webm`, `video/quicktime`, `audio/*`, Office formats, `application/pdf`, images | 2026-05-21 |
| `work-order-photos` | Private | 200 MB | **none — any type accepted** | 2026-03-24 |

**`purchase-invoices` is referenced in application code (`modules/purchases/components/PurchaseFormModal.tsx` — `supabase.storage.from('purchase-invoices')`) but DOES NOT EXIST in `storage.buckets`.** Uploads through that path will fail. Whether purchase-invoice files are therefore stored anywhere is **UNKNOWN**.

---

## 2. Per-bucket detail

### 2.1 `work-order-photos` — the highest-risk bucket

| Attribute | Value |
|---|---|
| **Contents** | Intra-oral and extra-oral clinical photographs; 3D dental scans (**STL, PLY, OBJ**); **DICOM (`.dcm`)**; CAD exchange (`.step`, `.stp`); **ZIP** archives of the above; PDF prescriptions; face-scan outputs (`ply`, `obj`, `mtl`, `texturePNG`, `usdz`, `binarySTL`, `asciiSTL` — `modules/orders/utils/uploadFaceScanResult.ts:17`); design-approval screenshots |
| **Accepted extensions in the UI** | `.stl,.ply,.pdf,image/*,.jpg,.jpeg,.png,.heic,.webp` (`NewOrderScreen.tsx:1439`); `.stl,.ply,.obj,.dcm,.zip` (`:1579`); `.stl,.ply,.obj,.step,.stp,.dcm` (`:7696`) |
| **Folder convention** | Derived from `work_order_id`; recorded in `work_order_photos.storage_path` and `stage_photos.storage_path`. Exact prefix pattern: **UNKNOWN — assembled at each call site, not centrally defined** |
| **Uploader** | Clinic, doctor, lab technician, triage operator, reviewer, AI assistant (`modules/denty/tools.ts` attaches files on order creation), Medit webhook (service role) |
| **Upload code** | `modules/orders/screens/NewOrderScreen.tsx`, `modules/orders/components/StageFileUpload.tsx`, `modules/orders/utils/uploadFaceScanResult.ts`, `modules/triage/api.ts`, `modules/reviews/api.ts`, `modules/approvals/DesignApprovalInbox.tsx`, `modules/denty/tools.ts`, `core/storage/uploadWithProgress.ts` (XHR with bearer token, for progress reporting) |
| **Public?** | **No** — bucket flag is private |
| **Access rules (verbatim from `pg_policies`)** | INSERT: `(bucket_id = 'work-order-photos') AND (auth.role() = 'authenticated')`<br>SELECT: `(bucket_id = 'work-order-photos') AND (auth.role() = 'authenticated')` |
| **Effective access** | **ANY authenticated user of the entire SIMAN platform — regardless of tenant, regardless of whether they are connected to the order — can read and write every object in this bucket.** There is no `lab_id`, no `work_order_id` and no ownership check. The RLS on the `work_order_photos` metadata table (7 policies) does **not** protect the objects themselves: the object path is enough. |
| **Named policies** | `"Authenticated users can upload photos"`, `"Users can view photos of accessible orders"` — the second policy's name asserts a restriction its predicate does not implement |
| **DELETE / UPDATE policy** | **None exists** — objects cannot be deleted through the client API at all |
| **Retention** | **UNKNOWN — indefinite.** `storage_cleanup_queue` (`work_order_id`, `bucket`, `queued_at`, `processed_at`, `error_message`) is the intended deletion mechanism but **no cron job or edge function consumes it** (verified: `cron.job` holds only `shift-auto-pause`, `tcmb-daily-rates`, `daily-order-watch`) |
| **Special category** | **Yes — health data; 3D dental/facial scans are biometric-adjacent** |
| **Verdict** | **Critical. See 06-risk-report R-02.** |

### 2.2 `chat-attachments`

| Attribute | Value |
|---|---|
| **Contents** | Anything a user drags into an order chat — photos, PDFs, STL files, Office documents, archives. No MIME restriction, 100 MB per object |
| **Folder** | Path built in `modules/orders/chatApi.ts`; metadata in `order_messages.attachment_url/_type/_name/_size` |
| **Uploader** | Clinic, doctor, lab staff |
| **Public?** | **YES — bucket is public and the code calls `getPublicUrl()` (`chatApi.ts:445`)** |
| **Access rules** | `chat_attach_insert`: `bucket_id='chat-attachments' AND auth.uid() IS NOT NULL`<br>`chat_attach_select`: `bucket_id='chat-attachments' AND auth.uid() IS NOT NULL`<br>**These policies are irrelevant for reads: a public bucket serves objects over unauthenticated HTTP at `/storage/v1/object/public/chat-attachments/<path>`.** |
| **Effective access** | **Anyone on the internet with the URL.** URLs are stored in `order_messages.attachment_url` and are emitted in notification payloads |
| **Deletion** | `chatApi.ts:407-411` removes the object when a message is deleted |
| **Retention** | UNKNOWN |
| **Special category** | **Yes — clinical images and case files are routinely shared in order chat** |
| **Verdict** | **Critical. See R-02.** |

### 2.3 `avatars`

| Attribute | Value |
|---|---|
| **Contents** | User profile photographs (JPEG/PNG/WEBP/GIF, ≤5 MB); **also clinic logos fetched from Clearbit/Brandfetch/Google by the `clinic-logo-search` edge function** (`clinic-logo-search/index.ts:70-72`) |
| **Folder** | `{auth.uid()}/…` for user avatars (enforced by policy); the edge function writes a clinic-scoped path with the **service role**, bypassing that policy |
| **Uploader** | User (self), `clinic-logo-search` edge function (service role) |
| **Public?** | **YES** |
| **Access rules** | SELECT/UPDATE/DELETE/INSERT all constrained to `(storage.foldername(name))[1] = auth.uid()::text` — **but because the bucket is public, the SELECT policy is bypassed for anonymous HTTP reads** |
| **Retention** | UNKNOWN. `delete-account` does **not** delete the avatar object |
| **PD** | Yes — a face photograph. **SPD: potentially, if of biometric quality** |

### 2.4 `lab-logos`

Contents: tenant logos + the SIMAN brand asset used in e-mails (`send-email-notification/index.ts:44` hard-codes `…/storage/v1/object/public/lab-logos/_brand/siman-type.png`).
**Public.** Policies: read = anyone (`lab_logos_read_public` has predicate `bucket_id='lab-logos'` with no auth condition); insert/update/delete = any authenticated user — **so any authenticated user on the platform can overwrite or delete any tenant's logo, including the SIMAN brand asset.**
Uploader: lab admin (`modules/settings/sections/GeneralSection.tsx`). PD: No (corporate marks). Retention: UNKNOWN.

### 2.5 `occlusion-screenshots`

Contents: rendered occlusion heat-map images produced by the 3D viewer / the AI `kapanisAnalizi()` tool.
**Public. No storage policies whatsoever** — no INSERT, SELECT, UPDATE or DELETE policy exists for this bucket in `pg_policies`. Writes therefore only succeed via the service role; reads are open to the world because the bucket is public.
**PD: Yes (linked to a patient's case). SPD: Yes (health).** Uploader: system / viewer. Retention: UNKNOWN. **See R-02.**

### 2.6 `employee-docs`

| Attribute | Value |
|---|---|
| **Contents** | HR documents — `doc_type` is uncontrolled free text, so this can hold ID copies, diplomas, employment contracts, **medical certificates**, criminal-record extracts. Metadata: `employee_documents.file_path/file_name/mime_type/file_size/valid_from/valid_until` |
| **Folder** | `{lab_id}/…` — enforced by policy |
| **Public?** | No |
| **Access rules** | SELECT / INSERT / DELETE all require `(storage.foldername(name))[1] = (SELECT labs.id::text FROM labs WHERE labs.id = get_my_lab_id() LIMIT 1)` — **correct tenant isolation** |
| **Weakness** | **Tenant-level only: every user of the lab — including technicians and couriers — passes this check. There is no HR-role restriction at the storage layer.** The `employee_documents` table has 1 RLS policy; whether that policy narrows access to HR roles is **UNKNOWN without reading the policy predicate** |
| **Size / MIME limits** | **None** |
| **Retention** | UNKNOWN — statutory HR retention not implemented |
| **SPD** | **Yes** |

### 2.7 `paper-orders`

Contents: photographs/PDFs of handwritten laboratory prescriptions received through the inbound webhook, before AI OCR. Metadata: `pending_paper_orders.photo_storage_path`, `photo_url`.
**Private.** Policy `paper-orders-read` (SELECT only): requires an existing `profiles` row where `p.id = auth.uid()` AND (`p.user_type='admin'` OR `p.lab_id` matches) — **correct tenant isolation for reads. No INSERT/UPDATE/DELETE policy — writes are service-role only (the edge function), which is appropriate.**
Uploader: `inbound-paper-order` edge function. **SPD: Yes** (handwritten patient name + clinical instructions). Retention: UNKNOWN.

### 2.8 `support-attachments`

Contents: whatever a user attaches to a support ticket — screenshots, screen recordings (`video/*`), voice notes (`audio/*`), STL files, spreadsheets, PDFs, ZIPs.
**Private.** Policies: INSERT and SELECT both join `support_tickets` on `(storage.foldername(objects.name))[1] = t.id::text` — **path is scoped to the ticket, correct**. DELETE allows `owner = auth.uid()` OR a `profiles` row with `user_type='admin'`.
Folder: `{ticket_id}/{timestamp}_{filename}` (`modules/support/components/AttachmentUploader.tsx:7, 21, 81`).
**SPD: possible** — a screenshot of an order screen contains the patient name. Retention: UNKNOWN.

---

## 3. File-type matrix

| Type | Bucket(s) | Uploader | Contains PD | Contains SPD | Access | Retention |
|---|---|---|---|---|---|---|
| **STL** | `work-order-photos`, `chat-attachments`, `support-attachments` | Clinic, Doctor, Lab, Medit | Yes (case-linked) | **Yes — dental geometry, biometric-adjacent** | any authenticated (WOP) / **public** (chat) / ticket parties | UNKNOWN |
| **PLY** | `work-order-photos`, `chat-attachments` | Clinic, Doctor, Lab | Yes | **Yes** (PLY carries vertex colour → textured intra-oral scan) | as above | UNKNOWN |
| **OBJ (+ MTL, texture PNG, USDZ)** | `work-order-photos` | Clinic, Lab, face-scan module | Yes | **Yes — face scans** | any authenticated | UNKNOWN |
| **DICOM (`.dcm`)** | `work-order-photos` | Clinic, Doctor | Yes | **Yes — medical imaging, DICOM headers embed patient name, ID and DOB in the file itself** | any authenticated | UNKNOWN |
| **STEP / STP** | `work-order-photos` | Clinic, Lab | Yes (linked) | Yes | any authenticated | UNKNOWN |
| **JPEG / PNG / HEIC / WEBP / GIF** | `work-order-photos`, `avatars`, `chat-attachments`, `support-attachments`, `paper-orders`, `occlusion-screenshots`, `lab-logos` | All roles | Yes | **Yes** (intra-oral, clinical review photos, handwritten scripts) | mixed — see per-bucket | UNKNOWN |
| **PDF** | `work-order-photos`, `chat-attachments`, `support-attachments`, `paper-orders` | Clinic, Doctor, Lab | Yes | **Yes** (prescriptions, invoices) | mixed | UNKNOWN |
| **ZIP** | `work-order-photos`, `chat-attachments`, `support-attachments` | Clinic, Lab | Yes | **Yes** (opaque archive — content cannot be governed) | mixed | UNKNOWN |
| **Video (`mp4`, `webm`, `quicktime`)** | `support-attachments`, `chat-attachments` | User | Yes | Possibly (screen recordings of patient data) | ticket parties / **public** | UNKNOWN |
| **Audio (`webm`, `ogg`, `mpeg`, `wav`)** | `support-attachments` | User | **Yes (voice)** | Possibly | ticket parties | UNKNOWN |
| **Office (`doc(x)`, `xls(x)`), CSV, TXT** | `support-attachments`, `chat-attachments` | User | Yes | Possibly | ticket parties / **public** | UNKNOWN |
| **HR documents (contracts, ID copies, medical certificates)** | `employee-docs` | Lab HR/admin | **Yes** | **Yes** | any user of the same lab | UNKNOWN |
| **Signature images** | `deliveries.signature_path` — **target bucket is UNKNOWN; the column stores a path but no `storage.from()` call for signatures was found in the repository** | Courier | **Yes (handwriting = biometric-adjacent)** | Yes | UNKNOWN | UNKNOWN |
| **Purchase-invoice files** | **`purchase-invoices` — bucket does not exist** | Lab | Yes | No | **broken** | N/A |
| **Bank receipts** | `payment_submissions.receipt_url` — bucket **UNKNOWN**, not resolvable from source | Clinic | Yes | No | UNKNOWN | UNKNOWN |

---

## 4. Public-vs-private summary

| Bucket | Flag | Actually reachable by |
|---|---|---|
| `avatars` | **public** | **the internet** |
| `chat-attachments` | **public** | **the internet** ← contains clinical case files |
| `lab-logos` | **public** | **the internet** (write: any authenticated user, any tenant) |
| `occlusion-screenshots` | **public** | **the internet** ← contains patient occlusion analyses |
| `employee-docs` | private | any user of the owning lab |
| `paper-orders` | private | admins + users of the owning lab ✅ |
| `support-attachments` | private | ticket parties + platform admins ✅ |
| `work-order-photos` | private | **every authenticated user on the entire platform** ← contains scans, DICOM, clinical photos |

**Four of eight buckets are world-readable, and two of those four (`chat-attachments`, `occlusion-screenshots`) hold special-category health data. A fifth (`work-order-photos`) is nominally private but has no tenant scoping.**

---

## 5. Deletion behaviour

| Path | What is deleted |
|---|---|
| Chat message delete | The single `chat-attachments` object (`chatApi.ts:407-411`) |
| Support attachment delete | Permitted by policy for the object owner or a platform admin |
| Avatar replace/delete | Permitted by policy for the owning user |
| **Account deletion (`delete-account`)** | **No storage objects at all** — avatars, uploaded scans, chat files and HR documents all survive |
| **Tenant purge (`admin_purge_lab_pii`)** | **No storage objects at all** — the function only overwrites database columns |
| **Order deletion / archival** | `storage_cleanup_queue` rows are enqueued; **nothing consumes the queue** |
| `work-order-photos` object delete via client | **Impossible — no DELETE policy exists** |

**Conclusion: there is no working file-erasure path in this system for the highest-risk data.**
