# Eski Supabase Auth şablonları (2026-10-20 öncesi)

2026-10-20'de panelde 6 şablon `build-templates.mjs` çıktısıyla değiştirildi (SHA-256 dosyayla birebir doğrulandı).
Eskiler aynı "N" plakalı NEXADENT/LABORATORY tasarımıydı (gerçek logo yok, Powered by Siman yok).

| Şablon | Eski konu | Eski gövde |
|---|---|---|
| Confirm signup | Confirm your email address | tam yedek: `confirm-signup.before-2026-10-20.html` |
| Magic Link | Your sign-in link | 4777 kr. — kod + **"Giriş Yap" butonu ({{ .ConfirmationURL }})** — buton şifresiz girişe izin veriyordu (kod+şifre akışını atlıyordu); yenisinde YOK |
| Reset Password | Reset your password | 4838 kr. — aynı tasarım, buton |
| Change Email Address | Confirm your new email address | 270 kr. — Supabase varsayılanı (İngilizce düz metin) |
| Invite user | You've been invited | 4867 kr. — aynı tasarım, buton |
| Reauthentication | {{ .Token }} is your verification code | 4222 kr. — aynı tasarım, kod |

Geri almak gerekirse: panelde ilgili şablonda "Reset template" Supabase varsayılanına döner;
eski özel tasarım için Confirm signup yedeği referans alınabilir.
