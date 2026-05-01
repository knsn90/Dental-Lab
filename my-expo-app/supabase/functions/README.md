# Supabase Edge Functions — Production İçin Çalıştırma

Bu klasördeki fonksiyonlar **production e-Fatura ve POS** entegrasyonları için
gereklidir. Sandbox/test akışı client-side `DemoProvider` ile zaten çalışır.

## 📋 Klasörler

| Fonksiyon | Amaç |
|---|---|
| `efatura-send/` | Production e-Fatura/e-Arşiv gönderimi (UBL-TR XML) |
| `payments-charge/` | 3DS başlatma — production POS akışı |
| `payments-callback/` | Provider 3DS sonrası geri çağrı (imza doğrulama + RPC) |

## 🚀 Deploy

```bash
# Supabase CLI yükle
brew install supabase/tap/supabase

# Login + link
supabase login
supabase link --project-ref fukaxeppklvtegnjuwih

# Deploy hepsi
supabase functions deploy efatura-send
supabase functions deploy payments-charge
supabase functions deploy payments-callback
```

## 🔐 Secrets (production API key'leri)

Iki yol var:

### Yol 1 — DB tablosundan oku (önerilen)
Provider API key'leri zaten `provider_credentials` tablosunda
(IntegrationsScreen UI üzerinden girilir). Edge Function service role
ile bu tabloyu okur — ekstra secret yok.

### Yol 2 — Supabase Secrets (çoklu lab değilse)
```bash
supabase secrets set IYZICO_API_KEY=...
supabase secrets set IYZICO_SECRET=...
supabase secrets set NILVERA_USERNAME=...
supabase secrets set NILVERA_PASSWORD=...
```

> **Bizim mimaride Yol 1 kullanılıyor** çünkü her lab kendi key'ini girer.

## 🔁 Provider Callback URL'leri

Her POS sağlayıcının panelinde "callback URL" / "return URL" olarak şunu set et:

```
https://fukaxeppklvtegnjuwih.supabase.co/functions/v1/payments-callback
```

## 📝 Yeni Provider Implementasyonu

Bir Edge Function dosyasında (`efatura-send/index.ts` veya `payments-charge/index.ts`):

1. `switch ((cred as any).provider)` bloğuna yeni case ekle
2. İlgili `chargeViaXxx()` veya `sendViaXxx()` fonksiyonunu doldur
3. Provider'ın resmi REST/SOAP dokümanına göre HTTP isteği yap
4. Sonucu `{ ok, uuid?/provider_ref?, status, error? }` formatında döndür
5. Re-deploy: `supabase functions deploy <name>`

## ⚠️ Güvenlik

- **İmza doğrulamayı asla atlamayın.** `payments-callback` içindeki
  `verifySignature()` placeholder — production'da provider'a özel
  HMAC/SHA hesabı yap.
- Service role key ASLA client'a sızdırılmamalı (sadece Edge Function'da).
- `payment_intents` tablosunun RLS'i lab izolasyonlu — public token
  okuma yalnızca status pending/awaiting_3ds ve süresi geçmemiş için.
