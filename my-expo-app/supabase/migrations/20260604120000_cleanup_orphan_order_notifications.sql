-- ============================================================
-- TEK SEFERLİK TEMİZLİK: artık var olmayan iş emirlerine ait
-- "öksüz" bildirimleri sil.
--
-- Arka plan: notifications.resource_id, work_orders.id'ye FK DEĞİL
-- (jenerik kaynak). trg_work_orders_cleanup_notifications trigger'ı
-- yalnızca KENDİSİ kurulduktan SONRA silinen siparişleri temizler;
-- daha önce silinmiş siparişlere ait bildirimler listede öksüz kalır
-- (tıklanınca boşa gider). Bu migration o eski kayıtları temizler.
--
-- Güvenli: yalnızca resource_type='work_order' VE karşılığı work_orders'da
-- BULUNMAYAN satırları siler. Mevcut siparişlerin bildirimlerine dokunmaz.
-- email_notifications zaten notifications'a ON DELETE CASCADE bağlı.
-- ============================================================

DELETE FROM public.notifications n
WHERE n.resource_type = 'work_order'
  AND n.resource_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.work_orders w WHERE w.id = n.resource_id
  );
