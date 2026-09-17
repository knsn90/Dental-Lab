# İmplant Parçaları (scan body, dijital analog, Ti-base …) — Tasarım

Tarih: 2026-09-12 · Durum: onaylandı (kullanıcıyla bölüm bölüm)

## Sorun
İmplant işlerinde tarama/tasarım için gereken parçalar (scan body, dijital analog vb.)
lab tarafından kliniğe bildiriliyor, klinik implant firmasından sipariş ediyor. Hangi
parçanın (tür/model/REF) alındığı yalnız sohbet mesajlarında kalıyor; geçici iş → 3 ay
sonra daimi iş geldiğinde tekrar lazım olunca mesajlar aranıyor.

## Kararlar
- Kalıcı kayıt + talep akışı (A: ayrı tablo). JSON kolon / yalnız-mesaj reddedildi.
- Talep sohbete mesaj olarak da düşer; ambalaj fotoğrafı yüklenebilir.
- Roller: lab talep eder → klinik "sipariş verdim" → lab "teslim aldım" → (isteğe bağlı) lab "iade ettim".
- Tekrar kullanım yalnız Devam Siparişi zinciri (`continues_order_id`, doğrudan asıl iş).
- Yer: sipariş detayı → Çalışma kartı → İMPLANT şeridinin altı (web + mobil; native web ile aynı görünmeli).

## 1. Veri modeli
`order_implant_parts`
- id, lab_id → labs(id) (auto_set_lab_id), work_order_id → work_orders ON DELETE CASCADE
- tooth_number int NULL (NULL = vaka geneli)
- part_type text CHECK: scan_body · digital_analog · ti_base · multi_unit · transfer · healing_cap · screw · other
- brand, model, ref_code, note text; quantity int ≥1 default 1
- status text CHECK: talep_edildi · siparis_verildi · teslim_alindi · iade_edildi · iptal
- return_required bool default false
- requested_by/at, ordered_by/at, received_by/at, returned_by/at, cancelled_by/at
- copied_from_part_id → order_implant_parts(id) ON DELETE SET NULL
- created_at, updated_at

`order_implant_part_photos`: id, lab_id, part_id → parts ON DELETE CASCADE, storage_path, uploaded_by, created_at.
Dosyalar `work-order-photos` bucket'ında `<work_order_id>/parts/<part_id>/…`.

RLS SELECT: lab (`is_lab_user() AND lab_id = get_my_lab_id()`), hekim (`is_my_doctor_order(work_order_id)`),
klinik yöneticisi (work_order_photos ile aynı kalıp). Doğrudan INSERT/UPDATE/DELETE yok — RPC'ler.
Dışarıda: lot no, stok bağı, fiyat (YAGNI).

## 2. Akış ve yetkiler (SECURITY DEFINER RPC)
- `request_implant_parts(order, parts jsonb)` — toplu ekleme; lab → talep_edildi, klinik/hekim → siparis_verildi.
- `set_implant_part_status(part, status)`:
  talep→siparis_verildi: klinik/hekim + lab · →teslim_alindi: lab · teslim→iade_edildi: lab (return_required) ·
  teslim öncesi→iptal: lab · `revert_implant_part_status(part)`: lab, bir adım geri.
- `update_implant_part(part, fields)` — lab her zaman; klinik/hekim yalnız talep/siparis_verildi iken.
- `delete_implant_part(part)` — lab, yalnız talep_edildi.
- `add_implant_part_photo(part, path)` / `delete_implant_part_photo(photo)` — görebilen ekler; yükleyen/lab siler.

## 3. Arayüz
İMPLANT şeridinde diş satırının altında parça listesi; "Genel" grubu; başlıkta "N parça · M bekliyor".
Satır: tür · model · REF · ×adet · küçük resim · durum rozeti · rolün tek birincil butonu · ⋯ (düzenle, fotoğraf,
geri al, iptal, sil). Ekleme penceresi: diş seçimi (implant dişleri ön-seçili), çoklu satır, marka ön-dolu,
iade anahtarı (scan body varsayılan açık), fotoğraf. Görünme: implant bilgisi veya en az bir parça varsa.
Mobil (`OrderDetailMobileHandoff`) de; nesne stil, Animated.View'de className yok, token renk, 16px kenar.
Web + iOS simülatör ekran görüntüsüyle karşılaştırmalı doğrulama.

## 4. Devam siparişi
Doğrudan asıl işin parçaları "Önceki işte kullanılan parçalar" bloğunda; "Aynısını talep et" / "Tümünü talep et"
ekleme penceresini ön-dolu açar, `copied_from_part_id` yazılır, fotoğraflar kopyalanmaz (kaynağa bağlantı).

## 5. Mesaj + bildirim
- order_messages: `parts_request` (talep) ve `parts_status` (sipariş verildi/teslim/iade) — düz metin içerik
  (eski native sürümler de okur); yeni sürüm kart olarak çizer. Düzenleme/fotoğraf mesaj üretmez. Emoji yok.
- Bildirim kategorisi `implant_parts`, sunucu tetikleyicisinde:
  talep → hekim + klinik yöneticisi (in-app + e-posta); sipariş verildi → talep eden + lab yöneticileri (in-app);
  teslim/iade → hekim + klinik yöneticisi (in-app).
- v1 dışı: WhatsApp şablonu.
- Metinler tr/en/de/fa birlikte.
