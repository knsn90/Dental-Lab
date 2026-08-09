-- Sohbette gönderenin adı: lab kullanıcısı karşı tarafın profilini okuyabilsin
--
-- SORUN: Sipariş sohbetinde hekimden gelen mesajlar "Kullanıcı" olarak
-- görünüyordu. Veri sağlamdı (profiles satırı full_name ile mevcut); okuma
-- engelliydi.
--
-- `profiles` üzerindeki mevcut SELECT politikaları:
--   • Own profile readable            → auth.uid() = id
--   • Lab users can read lab profiles → is_lab_user() AND lab_id = get_my_lab_id()
--   • clinic_admin_*                  → klinik yöneticisine özel
-- Hekim profilinin `lab_id`'si NULL (hekim laba değil kliniğe ait), dolayısıyla
-- hiçbir politika tutmuyordu. PostgREST gömülü satırı RLS ile eleyince hata
-- vermez, sessizce `sender: null` döner → arayüz "Kullanıcı"ya düşer.
--
-- NEDEN BUGÜN FARK EDİLDİ: sistemdeki İLK `doctor` tipli mesaj bugün yazıldı.
-- Önceki 68 mesajın tamamı lab/admin (aynı lab_id → okunabilir) veya
-- clinic_admin kaynaklıydı. Regresyon değil, koşulun ilk kez oluşması.
--
-- NEDEN İSTEMCİ TARAFINDA ÇÖZÜLMEDİ: `doctors` tablosunda `profile_id` yok;
-- mesajı yazan profil ile siparişin hekim kaydı arasında güvenilir bağ
-- bulunmuyor. Listedeki adı baloncuğa kopyalamak tahmin olurdu ve klinikte
-- birden fazla hekim/sekreter varsa YANLIŞ kişiyi yazardı. Mesaj yazarını
-- yanlış göstermek, "Kullanıcı" yazmaktan kötüdür.
--
-- KAPSAM: politika bilinçli olarak dar — "kendi laboratuvarımın bir işinde bana
-- mesaj yazmış kişinin profilini okuyabilirim". Profil tablosu açılmaz; mesaj
-- ilişkisi olmayan hiçbir satır görünmez.
--
-- PERFORMANS: idx_order_messages_sender (sender_id) ve idx_work_orders_lab_id
-- (lab_id) zaten mevcut; EXISTS alt sorgusu bu indeksleri kullanır.

CREATE POLICY "lab_read_order_message_senders"
ON public.profiles
FOR SELECT
USING (
  is_lab_user()
  AND EXISTS (
    SELECT 1
      FROM public.order_messages m
      JOIN public.work_orders   w ON w.id = m.work_order_id
     WHERE m.sender_id = profiles.id
       AND w.lab_id    = get_my_lab_id()
  )
);

COMMENT ON POLICY "lab_read_order_message_senders" ON public.profiles IS
  'Lab kullanıcısı, kendi laboratuvarının işlerinde mesaj yazmış kişilerin profilini okuyabilir — sohbette gönderen adı görünsün diye. Başka profil açılmaz.';
