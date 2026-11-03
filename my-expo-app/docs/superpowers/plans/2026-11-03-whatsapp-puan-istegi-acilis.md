# WhatsApp puan isteği — açılış kontrol listesi

Plan: `2026-11-03-whatsapp-puan-istegi.md` · Spec: `../specs/2026-11-03-whatsapp-puan-istegi-design.md`

DB (görev 2–4), `send-review-request` ve `whatsapp-webhook` canlıda. Özellik lab
ayarı kapalıyken hiçbir şey göndermez; aşağıdaki sıra özelliği güvenle açar.

## 1. Meta şablon onayı

Meta Business → WhatsApp Manager → Message templates:

- `is_degerlendirme` (tr) — durum **Approved**
- `is_sorunu_lab` (tr) — durum **Approved**

İkisi onaylanmadan 2. ve 4. adıma geçme. `is_degerlendirme` onaysızken gönderim
Meta'dan hata döner ve satır `failed` olur.

## 2. `send-whatsapp-meta` yayını (Görev 7 adım 3)

`is_sorunu_lab` onaylandıktan sonra:

```bash
supabase functions deploy send-whatsapp-meta --project-ref kjwjxqfdsxkxgcgophdy --workdir /Users/saber/Desktop/DentalSoftware/my-expo-app --use-api --no-verify-jwt
```

Yayına kadar "Sorun var" cevabı lab'a uygulama içi ve e-posta ile gider; WhatsApp
nüshası `no-template-for-category` ile atlanır.

## 3. Web deploy

Kullanıcı "deploy" deyince, standart deploy zinciriyle. Lab ayar kartı, hekim
anahtarı, bildirim kategorileri ve mobil değerlendirme kartları bununla canlıya çıkar.

## 4. Lab yöneticisi özelliği açar

Ayarlar → Entegrasyonlar → "WhatsApp'tan puan iste" → anahtar açık, gün sayısı
(varsayılan 3) → Kaydet. Açıldığı gün kartta görünür; o günden önceki teslimlere
istek gitmez.

```sql
select review_wa_enabled, review_wa_enabled_at, review_wa_delay_days
from lab_settings where lab_id = '<lab>';
```

## 5. İlk gerçek gönderimden sonra

Saatlik görev (`review-request-tick`, her saat :07) vadesi gelen satırları gönderir.

```sql
select status, skip_reason, count(*)
from review_requests where lab_id = '<lab>'
group by 1, 2 order by 3 desc;

select l.status, l.error_code, l.error_title, l.created_at
from whatsapp_delivery_log l
join review_requests r on r.wamid = l.wamid
where r.lab_id = '<lab>'
order by l.created_at desc limit 20;
```

Beklenen: `sent` satırları, teslim raporunda `delivered`/`read`. `failed` varsa
`error` ve günlükteki `error_title`'a bak (şablon onayı, numara biçimi).

## 6. İlk "Sorun var" cevabından sonra

- Satır `answered`, `answer = 1`; sipariş ekranında WhatsApp kaynaklı değerlendirme görünür.
- Lab yöneticisinde "Hekim sorun bildirdi" uygulama içi bildirimi.
- E-posta (kategori `review_problem`, varsayılan açık).
- WhatsApp `is_sorunu_lab` (2. adım yayınlandıysa).

```sql
select category, title, created_at
from notifications
where category in ('review_problem', 'review_minor')
order by created_at desc limit 10;
```
