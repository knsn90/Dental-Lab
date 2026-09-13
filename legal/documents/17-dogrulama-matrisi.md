# 17 — Doğrulama Matrisi (İddia → Kod Kanıtı → Durum)

Bu matris, hukuki belgelerdeki her önemli iddiayı **kaynak koddaki/veritabanındaki
gerçek uygulamaya** bağlar. Amaç: “metin ne diyor” ile “sistem ne yapıyor”
arasındaki farkı görünür kılmak. Hukukçu, yayın öncesi bu tabloyu kullanarak her
cümlenin arkasını doğrulayabilir.

**Durum kodları:** ✅ Uygulanıyor · ⚠️ Kısmen · 🔧 Planlı (yol haritasında) ·
⟦H⟧ Hukuk onayı gerekli (koddan doğrulanamaz).

---

## A. Gizlilik Politikası / KVKK Aydınlatma

| İddia | Kanıt | Durum |
|---|---|---|
| Veri sorumlusu kimliği | — | ⟦H⟧ (SIRKET_UNVAN vb.) |
| Hasta verisini klinik/hekim/lab girer | `work_orders` INSERT: `Doctors can create orders`, `clinic_admin_insert_clinic_orders`, `wo_lab_insert` | ✅ |
| Toplanan veri kategorileri | `01-data-inventory.md` (169 tablo canlı şema) | ✅ |
| Sağlık verisi işleniyor | `work_orders.patient_name/patient_dob/tooth_numbers`, `work_order_photos`, `medit_patients` | ✅ |
| Reklam/izleme yok | Tüm kodda analitik/reklam SDK’sı yok (tarama) | ✅ |
| Rıza sürümlü kaydediliyor | `user_consents` tablosu (append-only, trigger + RLS) — canlıda | ✅ |
| Yeni kayıtta rıza alınır | `ConsentGate` + register ekranları + `record_consents` RPC | ✅ (deploy edildi) |
| Mevcut kullanıcıya rıza kapısı | `ConsentGuard` (login overlay) | ⚠️ kod hazır, **deploy bekliyor** |
| Yurt dışı aktarım açıklaması | `04-third-party-data-flow.md`; `18-subprocessor-listesi.md` | ✅ (liste), ⟦H⟧ (SCC/DPA) |
| Saklama süreleri | Politika olarak beyan | ⚠️ beyan var, **otomatik uygulama yok (R-05)** |
| Hesap silme | `functions/delete-account` | ⚠️ **kısmi** (profil+auth; depolama/log/mesaj kalıyor — R-06) |
| KVKK m.11 başvuru kanalı | `DataRightsRequest` → `support_tickets` (`kvkk_talebi`) | ⚠️ kod hazır, **deploy bekliyor** |
| Şifreleme + RLS + kiracı izolasyonu | Tüm tablolarda RLS; storage özel + sipariş-scoped; imzalı URL | ✅ (P0 sonrası) |

## B. Yapay Zekâ Bildirimi

| İddia | Kanıt | Durum |
|---|---|---|
| Model = claude-sonnet-4-5, Anthropic | `functions/denty-brain`, `parse-*` | ✅ |
| API anahtarı sunucuda | `denty-brain` env `ANTHROPIC_API_KEY` | ✅ |
| Kullanıcı başlatır | Asistan + OCR uçları yalnızca çağrıyla çalışır | ✅ |
| Yazma işlemi onaya tabi | `modules/denty/api.ts` onay kartı akışı | ✅ |
| RLS ile sınırlı okuma | Araçlar kullanıcının oturumuyla çalışır | ✅ |
| Rıza (ai_processing) | `user_consents` kind=`ai_processing` | ✅ (kayıt), 🔧 (özellik kill-switch R-09) |
| Anonimleştirme | — | 🔧 **yok, planlı (R-09)** |
| AI ifşa denetim kaydı | — | 🔧 **yok, planlı (R-09)** |
| Eğitimde kullanılmaz | Anthropic ticari koşulları | ⟦H⟧ (sözleşmeyle teyit) |

## C. Depolama / Güvenlik (P0 sonrası — canlı)

| İddia | Kanıt | Durum |
|---|---|---|
| Sağlık dosyaları özel bucket | `chat-attachments`, `occlusion-screenshots` private; `work-order-photos` private | ✅ |
| Sipariş-bazlı erişim | `can_access_work_order()` + storage policies | ✅ |
| İmzalı/süreli URL | `chatApi.ts` `createSignedUrl` | ✅ (deploy edildi) |
| Görünümler RLS uygular | 31/31 view `security_invoker` | ✅ |
| anon cross-tenant okuma yok | anon view SELECT = 0, write = 0 | ✅ |
| Silme mümkün (erasure) | `wop_delete`, `chat_delete` policies | ✅ (P0) |

## D. Bilinen açık kalemler (hukukun bilmesi gereken)

| Kalem | Rapor | Durum |
|---|---|---|
| Saklama/imha otomasyonu | R-05 | 🔧 planlı |
| Silme akışının tüm veriye genişletilmesi | R-06 | 🔧 planlı |
| DPA/SCC (20 alt-işleyen) | R-08 | ⟦H⟧ + 🔧 |
| AI anonimleştirme + ifşa kaydı + kill-switch | R-09 | 🔧 planlı |
| OTP düz-metin → karma | R-15 | 🔧 planlı |
| E-posta QRServer aktarımı kaldırma | R-16 | 🔧 planlı |
| `labs` authenticated cross-tenant politikası | R-22 | 🔧 planlı |
| Supabase bölgesi (aktarım tespiti) | R-04 | ⟦H⟧ |
| Veri dışa aktarma (Export My Data) | Sprint-2 | 🔧 planlı |

---

**Kullanım:** Yayın öncesi, A–C tablolarındaki ⚠️/🔧/⟦H⟧ satırları için ya (a)
ilgili özelliği tamamlayın, ya (b) metni gerçeğe uygun biçimde yumuşatın, ya da
(c) hukuk onayıyla kapatın. ✅ satırlar olduğu gibi yayınlanabilir.
