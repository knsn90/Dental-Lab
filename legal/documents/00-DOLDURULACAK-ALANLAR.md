# 00 — Doldurulacak Alanlar (Pilot Modeli: NexaDent = Veri Sorumlusu)

**Pilot kararı (kullanıcı onayı):** Şirket henüz kurulmadı. Pilot aşamasında
**veri sorumlusu = pilot laboratuvarı NexaDent**, **veri işleyen = SIMAN**.
Bu, çok-kiracılı gerçekle ve DPA (doc 14) yapısıyla uyumludur. Şirket kurulunca
SIMAN kendi tüzel kişiliğiyle bu alanları sürüm yükselterek günceller.

> **Varsayım (yanlışsa düzeltin):** Pilot **tek laboratuvarlı** (yalnız NexaDent).
> Bu durumda yayınlanan politikada veri sorumlusu olarak NexaDent gösterilebilir.
> Pilot birden çok labı kapsıyorsa politika tek bir sorumluyu adlandıramaz — o
> zaman "her lab kendi verisinin sorumlusudur" ifadesi kalır ve bu alanlar
> laboratuvar bazında doldurulur.

---

## A. Veri Sorumlusu = NexaDent — DOLDURULDU ✅

| Anahtar | Değer | Durum |
|---|---|---|
| `SIRKET_UNVAN` | NEXADENT LABORATUVAR HİZMETLERİ SANAYİ TİCARET LİMİTED ŞİRKETİ | ✅ |
| `SIRKET_ADRES` | Atatürk Mah. Vatan Cad. No: 21 İç Kapı No: 2, Ataşehir/İstanbul | ✅ |
| `VKN` | 6312098145 | ✅ |
| `KVKK_EPOSTA` | nexadentlab@gmail.com | ✅ |
| `DESTEK_EPOSTA` | nexadentlab@gmail.com (pilotta aynı kutu; ayrılırsa güncellenir) | ✅ |
| `MERSIS` | *(NexaDent'ten alınacak — Ltd. Şti. olduğu için mevcut)* | ☐ |
| `KEP` | *(NexaDent KEP adresi — varsa)* | ☐ |
| `IRTIBAT_KISISI` | *(NexaDent KVKK irtibat kişisi adı)* | ☐ |
| `VERBIS` | *(sağlık verisi işlendiği için gerekli olabilir — hukuk teyidi)* | ☐ |

## B. Veri İşleyen = SIMAN (pilot; tüzel kişilik yok)

| Anahtar | Açıklama | Durum |
|---|---|---|
| `SIMAN_ISLEYEN` | DPA'da İşleyen tarafı: pilot işleteni **kurucunun ad-soyadı + iletişimi**. Şirket kurulunca SIMAN tüzel kişiliğiyle değişir. **Ayrıca:** SIMAN'ın NexaDent'ten ayrı işleyen mi (Kurgu A) yoksa NexaDent'in iç yazılımı mı (Kurgu B) olduğu hukukça netleşmeli — bkz. doc 14 Taraflar uyarısı | ☐ |

## C. Teknik (koddan doğrulanamayan)

| Anahtar | Açıklama | Durum |
|---|---|---|
| `SUPABASE_BOLGE` | Supabase barındırma bölgesi (panelden) — yurt dışı aktarım tespiti için | ☐ |

---

## Pilot modelinin getirdiği ZORUNLU adımlar

1. **NexaDent ↔ SIMAN DPA imzalanmalı** (doc 14 hazır). Bu, "lab sorumlu, SIMAN
   işleyen" ilişkisini hukuken kurar. Pilotun olmazsa-olmazı.
2. **NexaDent, kendi aydınlatma + açık rızasını yönetir:** hastalara ve kendi
   personeline. Doc 12 (KVKK Aydınlatma) NexaDent'in yayımlayacağı metin olarak
   kullanılabilir; SIMAN bunu teknik olarak (uygulama-içi rıza kaydı) destekler.
3. **Yayınlanan politikada** (siman-legal) veri sorumlusu = NexaDent gösterilir;
   SIMAN veri işleyen olarak belirtilir.

## Şirket kurulunca (gelecek)

Tek yapılacak: bu alanları SIMAN tüzel kişiliğiyle güncelleyip belgeleri sürüm
yükseltmek (v2.1). Yapı aynı kalır; yalnız veri sorumlusu/işleyen kimlikleri
netleşir (SIMAN çok-kiracılı hâle geçtiğinde her lab kendi verisinin sorumlusu,
SIMAN ortak işleyen olur — bu da mevcut DPA yapısıyla uyumludur).

---

## Kodtan doğrulanan (bilgi amaçlı)

- Ürün: **Siman** · Alan adları: `siman.app`, `app.nexadentlab.com`
- Giden e-posta: `noreply@nexadentlab.com` (Resend)
- Pilot lab markası: **NexaDent** (`nexadentlab.com`)
