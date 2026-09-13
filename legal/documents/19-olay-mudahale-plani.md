# SIMAN — Veri İhlali / Olay Müdahale Planı (Incident Response Plan)

**Sınıflandırma:** 🔒 İÇ KULLANIM — müşteriye/üçüncü tarafa gösterilmez
**Sürüm:** 1.0 · **Yürürlük:** 23 Temmuz 2026
**Kapsam:** SIMAN üretim ortamı — Supabase projesi `kjwjxqfdsxkxgcgophdy`,
Vercel barındırma (`siman.app`, `app.nexadentlab.com`), tüm edge fonksiyonları ve
alt-işleyenler.

> Bu plan, SIMAN’ın **gerçek** mimarisine göre yazılmıştır (RLS, platform
> yöneticileri, service_role, depolama bucket’ları, gerçek log tabloları). Amaç:
> bir olayda kimin, kaç saat içinde, hangi komutlarla hareket edeceğini önceden
> belirlemek. Yasal zemin: KVKK m.12 ve Kurul kararları, GDPR Art. 33–34, ve
> SIMAN–kiracı arası DPA §9 (`14-veri-isleme-sozlesmesi.md`).

---

## 1. Roller ve İletişim (Müdahale Ekibi)

| Rol | Sorumluluk | Kişi / İletişim |
|---|---|---|
| **Olay Komutanı (IC)** | Kararları verir, süreci yürütür, kayıt tutar | ☐ ⟦OPS⟧ |
| **Teknik Müdahale** | Supabase/Vercel erişimi, containment, forensics | ☐ ⟦OPS⟧ |
| **Hukuk / KVKK İrtibat** | Kurul & ilgili kişi bildirimi, kiracı bildirimi | ☐ ⟦HUKUK: IRTIBAT_KISISI⟧ |
| **İletişim** | Müşteri/kamuoyu mesajları, destek koordinasyonu | ☐ ⟦OPS⟧ |
| **Yedek IC** | IC ulaşılamazsa devralır | ☐ ⟦OPS⟧ |

**Çağrı zinciri:** Olayı ilk fark eden → IC → (IC) Teknik + Hukuk’u aktive eder.
IC 30 dakika içinde ulaşılamazsa Yedek IC devralır.

**Dış iletişim noktaları (önceden hazır olmalı):**
- Supabase destek/güvenlik: ☐
- Vercel destek: ☐
- Kritik alt-işleyen güvenlik e-postaları (Anthropic, Resend, Twilio): ☐
- KVKK Kurumu bildirim kanalı (VERBİS/İhlal Bildirim Formu): ☐

---

## 2. Olay Nedir? Kapsam

**Kişisel veri ihlali:** kişisel verilerin hukuka aykırı olarak açığa çıkması,
erişilmesi, değiştirilmesi, yok olması veya yetkisiz aktarımı. SIMAN bağlamında
örnekler:

- Kiracı izolasyonunun aşılması (bir kiracının başka kiracının hasta verisini
  görmesi) — ör. RLS/görünüm/depolama politikası açığı (bkz. R-02, R-03 sınıfı).
- `anon`/publishable anahtar üzerinden yetkisiz veri okuma.
- `service_role` anahtarının veya `provider_credentials` içeriğinin sızması.
- Depolama bucket’ından (özellikle `work-order-photos`, `chat-attachments`) sağlık
  verisi/görsel sızması.
- Bir alt-işleyende (Supabase, Anthropic, Resend, Twilio…) yaşanan ihlal.
- Hesap ele geçirme (kimlik doğrulama).

---

## 3. Şiddet Sınıflandırması (SEV)

| Seviye | Tanım | Örnek | Hedef müdahale |
|---|---|---|---|
| **SEV-1 (Kritik)** | Sağlık/özel nitelikli veri veya çok-kiracı çapında sızma; aktif istismar | anon ile payroll/hasta verisi okunabiliyor; service_role sızdı | Derhal; 1 saat içinde containment başlar |
| **SEV-2 (Yüksek)** | Sınırlı kişisel veri sızması veya tek kiracı etkisi | Tek bir imzalı URL’nin kötüye kullanımı | 4 saat içinde |
| **SEV-3 (Orta)** | Doğrudan sızma yok ama ciddi zafiyet | Yanlış yapılandırılmış politika (istismar kanıtı yok) | 24 saat içinde |
| **SEV-4 (Düşük)** | Bilgi amaçlı, kişisel veri riski yok | Tekil hatalı log | Rutin |

**Kural:** Şüphede kal → bir üst seviyeyi seç. Sağlık verisi söz konusuysa asgari
**SEV-2**.

---

## 4. Müdahale Aşamaları

### Aşama 0 — Tespit ve Triyaj (ilk 30 dk)
- Olayı **kaydet** (zaman damgası, kaynak, ilk belirti). Tüm sürecin zaman
  çizelgesini tut — bildirim sürelerinin ispatı için gerekir.
- SEV seviyesini belirle. IC’yi aktive et.
- **Kanıtı koru:** log’ları silme/değiştirme. İlgili Supabase log’larını dışa al
  (`get_logs`), `activity_logs`, `platform_audit_log`, `auth.audit_log_entries`
  (IP), `auth.sessions` anlık görüntüsünü sakla.

### Aşama 1 — Containment (SEV-1 için ilk 1 saat)
Olay tipine göre uygulanacak **somut** aksiyonlar:

**a) Kimlik/anahtar sızması:**
- **service_role / anon anahtarını döndür** (Supabase Dashboard → API → rotate).
  Not: anon anahtar istemci paketinde gömülüdür; rotasyon istemci yeniden dağıtımı
  gerektirir — İletişim’i uyar.
- `provider_credentials` sızdıysa: ilgili tüm tenant sağlayıcı anahtarlarını
  geçersiz kıl (iyzico/Nilvera panelinden) ve tabloyu güncelle.
- `tenant_api_keys` sızdıysa: ilgili satırda `revoked_at` set et.

**b) Hesap ele geçirme:**
- Kullanıcı oturumlarını sonlandır (Supabase Auth → ilgili kullanıcı → sign out /
  `auth.admin`).
- Hesabı pasifleştir: `admin_set_user_active(user, false)` (platform admin RPC).
- Gerekirse parolayı sıfırla / şüpheli e-posta değişikliğini geri al.

**c) Kiracı izolasyonu açığı (RLS/görünüm/depolama):**
- Zafiyetli politikayı derhal **daralt/iptal et** (geçici olarak erişimi kes).
- Gerekirse ilgili görünüm/tabloya `REVOKE` uygula.
- Depolama sızması ise ilgili bucket’ı geçici **private**/erişim kısıtlı yap ve
  imzalı URL üretimini durdur.

**d) Alt-işleyen ihlali:**
- Sağlayıcının resmi bildirimini al; SIMAN tarafında ek erişim kısıtlaması gerekip
  gerekmediğini değerlendir (ör. o sağlayıcıya veri akışını `lab_feature_flags` /
  entegrasyon anahtarıyla durdur).

**e) Genel “acil durdurma” seçenekleri:**
- Bakım moduna al (platform ayarı `maintenance_mode`).
- Gerekirse Vercel dağıtımını geri al / erişimi kes.

### Aşama 2 — Eradikasyon ve Kanıt Toplama
- Kök nedeni belirle (kod, politika, yapılandırma, sağlayıcı).
- Etki kapsamını çıkar: **hangi kiracılar, hangi ilgili kişiler, hangi veri
  kategorileri** (özellikle sağlık verisi), yaklaşık kayıt sayısı.
- Bunun için: `activity_logs`, `platform_audit_log`, `order_events`,
  `email/whatsapp_notifications`, Supabase erişim log’ları, `storage.objects`
  erişim izleri, `storage_orphan_audit`.
- Kalıcı düzeltmeyi hazırla (migration/kod/politika) ve **kabul testleriyle**
  doğrula (`legal/audit/p0-acceptance-tests.sql`, `regression-harness.sql`).

### Aşama 3 — Kurtarma
- Düzeltmeyi üretime al; regresyon harness’ını çalıştır (tüm P0 PASS olmalı).
- Döndürülen anahtarlarla istemciyi yeniden dağıt.
- İzlemeyi artır (anormal `anon` okuma, olağandışı depolama erişimi).

### Aşama 4 — Bildirim (bkz. §5)
### Aşama 5 — Olay Sonrası İnceleme (§6)

---

## 5. Yasal Bildirim Yükümlülükleri

### 5.1 SIMAN veri işleyen olduğunda (hasta/personel verisi)
DPA §9 uyarınca: ihlali öğrenir öğrenmez **gecikmeksizin** ilgili **Veri Sorumlusu
kiracıya** (laboratuvar/klinik) bildir. Bildirim; ihlalin niteliği, etkilenen veri
ve ilgili kişi kategorileri, olası sonuçlar ve alınan önlemleri içerir. Kurul’a ve
ilgili kişilere bildirim **Veri Sorumlusu’nun** yükümlülüğüdür; SIMAN teknik
destek ve kanıt sağlar.

### 5.2 SIMAN veri sorumlusu olduğunda (hesap/kimlik/faturalama verisi)
- **KVKK Kurulu’na bildirim:** ihlali öğrenmeden itibaren **en kısa sürede — 72
  saati aşmamak üzere** (Kurul’un 2019/10 sayılı kararı ve uygulaması).
- **İlgili kişilere bildirim:** makul en kısa sürede, uygun kanaldan
  (uygulama-içi + e-posta).
- GDPR uygulanıyorsa: yetkili denetim otoritesine **72 saat** (Art. 33); yüksek
  risk varsa **ilgili kişilere** (Art. 34).

### 5.3 Bildirim içeriği (asgari)
Kim/ne zaman/ne oldu · etkilenen veri kategorileri ve yaklaşık sayılar · olası
sonuçlar · alınan ve alınacak önlemler · irtibat noktası
(nexadentlab@gmail.com).

### 5.4 72 saat sayacı
Sayaç, **ihlalden makul şekilde haberdar olunduğu an** başlar. Aşama 0’daki zaman
damgası bu sayacın kanıtıdır. Kapsam netleşmese bile süre işler → belirsizlikte
Kurul’a “devam eden inceleme” notuyla ön bildirim yapılabilir.

---

## 6. Olay Sonrası İnceleme (Post-Mortem)

Olaydan sonra **5 iş günü** içinde suçlamasız (blameless) bir inceleme:
- Zaman çizelgesi (tespit → containment → kurtarma → bildirim).
- Kök neden ve neden daha erken yakalanmadığı.
- Kalıcı düzeltmeler ve **regresyon testi** eklendi mi (harness’a yeni kontrol).
- Süreç iyileştirmeleri; bu planın güncellenmesi.

---

## 7. Hazırlık (Olay Öncesi Sürekli Görevler)

- [ ] Müdahale ekibi ve iletişim bilgileri güncel (§1).
- [ ] `service_role`/`anon` anahtar rotasyon prosedürü denenmiş.
- [ ] Supabase **Security Advisor** düzenli çalıştırılıyor (DDL sonrası şart).
- [ ] Regresyon/kabul testleri CI’da (`p0-acceptance-tests.sql`).
- [ ] Yedeklerin varlığı ve geri-yükleme testi (Supabase).
- [ ] Log saklama süresi yeterli (ihlal incelemesi için) — R-05 ile uyumlu.
- [ ] Alt-işleyen ihlal-bildirim kanalları kayıtlı (§1).
- [ ] Bildirim şablonları (Kurul + ilgili kişi + kiracı) hazır ve onaylı.

---

## 8. Hızlı Runbook (SEV-1 özet kart)

```
1. KAYDET      → zaman damgası + belirti  (72s sayacı başladı)
2. AKTİVE ET   → IC → Teknik + Hukuk
3. DURDUR      → anahtar rotasyonu / oturum kes / politika daralt / bakım modu
4. KANITI KORU → get_logs + activity_logs + platform_audit_log + auth logs dışa al
5. KAPSAM      → hangi kiracı/kişi/veri (sağlık var mı?)
6. DÜZELT      → migration/kod + harness PASS
7. BİLDİR      → işleyen isek kiracıya; sorumlu isek Kurul (≤72s) + ilgili kişi
8. POST-MORTEM → 5 iş günü içinde, blameless
```

---

**Sürüm 1.0 · 🔒 İç Kullanım · Yürürlük: 23 Temmuz 2026**
Ekli referanslar: `08-remediation-roadmap.md`, `10-p0-implementation-summary.md`,
`14-veri-isleme-sozlesmesi.md`, `legal/audit/`.
