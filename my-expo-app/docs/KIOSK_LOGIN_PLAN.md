# Tablet Giriş Kodu (Kiosk PIN) — Uygulama Planı

> Karar: **kayıtlı tabletler** + **sadece kod (kullanıcı listesi yok)** + **önce plan**.
> Durum: ONAY BEKLİYOR (auth + RLS + edge function → CLAUDE.md gereği onaysız kod yok).
> Proje: kjwjxqfdsxkxgcgophdy · Ortam: Expo + react-native-web + Supabase.

## Amaç
Lab'daki ortak tabletlerde kullanıcı e-posta+şifre yerine **kişisel bir giriş kodu**
girip kendi panelini açsın. Kod yalnız **admin'in kaydettiği güvenilir tablette**
çalışır; kullanıcı listesi gösterilmez (kişi doğrudan kodunu girer).

## Mimari özet
1. Tablet bir kez **eşleştirilir** (admin panelden eşleştirme kodu üretir → tablette
   girilir → tablet kalıcı bir **cihaz jetonu** alır, güvenli depoya yazar).
2. Kullanıcı tablette kodunu girer → edge function cihaz jetonunu + kodu doğrular
   (lab-kapsamlı, hız-sınırlı) → **kullanıcının GERÇEK Supabase oturumunu üretir**
   (`admin.generateLink` → istemci `verifyOtp`).
3. Oturum kurulunca mevcut `onAuthStateChange` + routing effect (app/_layout.tsx:420,
   459-657) kullanıcıyı **kendi paneline otomatik** yönlendirir — ekstra kod gerekmez.

**Neden gerçek oturum:** RLS/yetkiler kullanıcının kendi JWT'sine bağlı; ortak "cihaz
hesabı" ile açarsak herkes yanlış kimlikle işlem yapar. Bu yüzden kod → kullanıcının
kendi oturumu üretilir.

---

## Faz 0 — Şema + RLS (additive migration, mevcutta NO-OP)

**`lab_devices`** — kayıtlı tabletler
- `id uuid pk`, `lab_id uuid → labs(id)`, `name text` ("Üretim Tableti 1"),
  `device_token_hash text` (ham jetonun SHA-256'sı; ham jeton yalnız tablette),
  `active bool default true`, `pairing_code text`, `pairing_expires_at timestamptz`
  (eşleşince NULL), `created_by uuid`, `created_at`, `last_seen_at`, `revoked_at`.
- RLS: lab/admin kendi lab'ının cihazlarını yönetir (`lab_id = get_my_lab_id()` +
  admin kaçış). `device_token_hash` istemciye asla SELECT edilmez (kolon gizli / view).

**`staff_access_codes`** — kişisel giriş kodu (PIN)
- `user_id uuid pk → profiles(id)`, `lab_id uuid`, `code_hash text` (bcrypt),
  `active bool`, `failed_attempts int default 0`, `locked_until timestamptz`,
  `updated_at`.
- RLS: kullanıcı kendininkini yönetir (`user_id = auth.uid()`); admin/manager kendi
  lab'ının personelinin kodunu **sıfırlayabilir** (görüntüleyemez). `code_hash` istemciye
  hiç dönmez.

Hepsi additive; mevcut e-posta/şifre girişi ve diğer tablolar etkilenmez.

## Faz 1 — Edge Functions (service-role, cihaz-kapsamlı, hız-sınırlı)
Konvansiyon: admin-create-user two-client + CORS boilerplate; whatsapp-brain shared-secret
deseni. Deploy: `supabase functions deploy <ad> --project-ref kjwjxqfdsxkxgcgophdy
--workdir .../my-expo-app --use-api` + `--no-verify-jwt` (uç, kullanıcı JWT'siz çağrılır;
kimlik = cihaz jetonu + hız sınırı).

1. **`kiosk-pair`** (public): `{ pairing_code }` → kod geçerli/süresi dolmamış/eşleşmemiş
   mi? → rastgele `device_token` (32B) üret, `sha256` sakla, `pairing_code` temizle,
   `{ device_token, lab_name, device_name }` dön. Hız sınırlı.
2. **`kiosk-login`** (public): `{ device_token, code }`:
   - `sha256(device_token)` → aktif `lab_devices` bul → `lab_id`, `last_seen` güncelle.
   - **Cihaz başına hız sınırı**: N yanlış denemede cihazı M dk kilitle.
   - `lab_id`'nin aktif `staff_access_codes` satırlarında `bcrypt.compare(code, hash)` ile
     kullanıcıyı bul (lab'da sınırlı kullanıcı). `locked_until` kontrolü.
   - Eşleşme yoksa → cihaz sayaç++ (+gerekirse kilit), **genel hata** (kullanıcı sızdırma
     yok). Kullanıcı aktif + approval_status kontrolü.
   - E-postayı **auth.users**'tan al (`admin.getUserById(user_id).email` — profiles.email
     nullable).
   - `adminClient.auth.admin.generateLink({ type:'magiclink', email })` → `hashed_token`
     dön (tek kullanımlık, kısa ömürlü). Sayaçları sıfırla.
   - İstemci: `supabase.auth.verifyOtp({ token_hash, type:'magiclink' })` (LoginScreen.tsx:
     171-173 deseni) → oturum kurulur → panel açılır.

## Faz 2 — Tablet Kiosk UI (yeni public route)
- `app/_layout.tsx:466` `isPublicRoute`'a `|| segments[0] === 'kiosk'` ekle.
- `app/kiosk/index.tsx`:
  - Cihaz eşleşmemişse → **eşleştirme ekranı** (eşleştirme kodu gir → kiosk-pair →
    `device_token`'ı sakla: web tablet = localStorage, native = expo-secure-store).
  - Eşleşmişse → **numerik kod tuş takımı** (liste yok). Kod gir → kiosk-login →
    verifyOtp → panel.
- **Kiosk modu bayrağı** (store): oturum kiosk'tan açıldıysa işaretle → çıkışta e-posta
  login'e değil `/kiosk` kod ekranına dön.

## Faz 3 — Yönetim UI
- **Ayarlar → Tabletler**: cihaz listesi (ad, son görülme, aktif), "Yeni tablet ekle"
  (eşleştirme kodu + QR göster), "Kaldır/İptal" (revoke → active=false → o tabletteki tüm
  kodlar durur).
- **Ayarlar → Giriş Kodum**: kullanıcı kendi PIN'ini belirler/değiştirir. Admin/manager
  personelin kodunu **sıfırlar** (görüntülemez).

## Faz 4 — Otomatik kilit + veri hijyeni
- **Boşta kilit**: hareketsizlik zamanlayıcısı (öneri 5 dk) → signOut → `/kiosk`. Ayrıca
  "Kilitle" butonu (sıradaki kişi için hızlı kilit).
- **Cache temizliği**: kilit/çıkışta uygulama cache anahtarlarını (orders_cache_v1 vb.)
  temizle — ortak tablette önceki kullanıcının verisi kalmasın (KVKK).
- Kiosk modunda logout `/(auth)/login` yerine `/kiosk`'a döner.

---

## Güvenlik (ship öncesi zorunlu)
- **Brute-force:** cihaz başına + kullanıcı başına deneme sayacı + kilitleme.
- **Cihaz hırsızlığı:** device_token hash'li saklanır; admin revoke → anında geçersiz.
- **Enumeration yok:** kod↔kullanıcı eşleşmesi başarısızsa genel hata.
- **Oturum:** kiosk oturumu = gerçek kullanıcı → doğru RLS. Kısa boşta-kilit.
- **generateLink** yalnız cihaz+kod doğrulandıktan sonra, tek kullanımlık OTP.
- Uçlar `--no-verify-jwt` ile deploy (kimlik device_token + hız sınırı).
- **Önce demo lab'da** test; canlıya P sonra.

## Onaylanan parametreler (2026-08-18)
- Kod uzunluğu: **6 hane**.
- Kodu **kullanıcı kendisi** belirler; admin yalnız sıfırlar (göremez).
- Boşta otomatik kilit: **10 dakika**.
- **Faz 0 onaylandı → başlandı.**

## Riskli dokunuşlar (CLAUDE.md — onay şart)
auth (oturum üretimi), RLS (2 yeni tablo), edge function (2 yeni + --no-verify-jwt),
routing (public route + kiosk-aware logout), ortak store (kiosk bayrağı). Hepsi additive;
mevcut e-posta/şifre girişi birebir korunur.
