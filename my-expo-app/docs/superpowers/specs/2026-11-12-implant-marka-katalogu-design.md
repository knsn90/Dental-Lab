# İmplant marka/model kataloğu (lab başına) — tasarım

Onay: kullanıcı, 2026-11-12 (sohbet).

## Neden
Yeni sipariş formundaki implant markası listesi kodda sabit (~80 marka,
`NewOrderScreen.tsx` `ALL_IMPLANT_BRANDS`). Yeni marka çıktığında listeye
eklenemiyor; markaya özel model (Straumann BLX vb.) hiç seçilemiyor.

## Hedefler
- Sipariş girebilen HERKES (hekim, klinik, lab) formun içinden yeni marka ekler.
- Model isteğe bağlı; yalnız modeli olan markada seçici görünür. Modeli
  olmayan markada küçük "+ model ekle" bağlantısı. Model de herkes ekler.
- Eklenen marka/model YALNIZ o lab'ın listesine düşer (lab + o lab'a sipariş
  gönderen hekim/klinikler görür; başka lab görmez).
- Bilinen markaya benzeyen yazımda uyarı: "Bunu mu demek istediniz: Straumann?".
  Büyük/küçük harf + TR karakter farkıyla aynı isim → yeni kayıt açılmaz,
  mevcut seçilir.
- Düzeltme / yeniden adlandırma / birleştirme / silme YALNIZ lab yöneticisi,
  lab ayarlarındaki "İmplant markaları" bölümünden. Silme = gizleme.
- "İmplant Türü" (Bone Level / Tissue Level / Mini) aynen kalır.
- Model, sipariş detayında ve iş kağıdında markanın yanında: "Straumann BLX".

## Hedef dışı
- Global (tüm Siman) ortak liste.
- Geçmiş siparişleri değiştirmek: sipariş marka/model'i METİN saklar;
  katalog düzeltmesi eski siparişlere yansımaz.

## Veri
- `implant_brands(id, lab_id, name, name_key, is_hidden, created_by, created_at)`
  — `name_key` = TR-küçük harf + boşluk sadeleştirilmiş; `unique(lab_id, name_key)`.
- `implant_models(id, lab_id, brand_id, name, name_key, is_hidden, …)`
  — `unique(brand_id, name_key)`.
- Başlangıç verisi: lab'ın satırı yoksa ilk okumada bugünkü ~80 marka + büyük
  markaların yaygın modelleri o lab'a yüklenir (tembel tohumlama; yeni lab'lar da alır).
- Sipariş: `implant_details[diş].model` (jsonb anahtar) + vaka geneli model
  `implant_brand` metninin yanında. Okuma/yazma tek kaynak `modules/orders/implantInfo.ts`.

## Erişim (RLS + RPC)
- Okuma ve ekleme SECURITY DEFINER RPC'lerle: çağıran o lab'ın kullanıcısı
  (`get_my_lab_id()`), ya da lab `my_connected_lab_ids()` içinde, ya da
  `profiles.lab_id` o lab.
- Güncelleme/silme: yalnız `user_type='admin'` veya lab kullanıcısı
  `role in ('manager','admin')` ve aynı lab.
- Tablolarda RLS açık; doğrudan yazma yalnız yöneticiye.

## Kurallar
- i18n tr/en/de/fa + koyu tema aynı anda. Popup `U.modalOverlay`, hata
  butonun yanında, ikonlar `core/ui/icons`.
- DB değişikliği 5 adım: before, down.sql, geri alınan prova, onay, uygula+ölç.
