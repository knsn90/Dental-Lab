-- 20261025166000_definer_exec_revoke.sql
-- Rol görünürlüğü son incelemesi, Critical + Important 5 (önceden var olan açıklar):
--  * get_admin_stats(): DEFINER, lab/rol süzgeci yok → her oturum TÜM lab'ların sipariş sayılarını ve
--    son siparişlerin hasta adı/notlarını görüyordu (lab'lar arası KVKK sızıntısı). İstemci çağırmıyor.
--  * alloc_receipt_to_invoices(...): DEFINER, yetki/lab kontrolü yok → her oturum herhangi bir kliniğe
--    tahsilat yazıp açık faturayı "ödendi"ye çekebiliyordu. Yalnız record_clinic_receipt / apply_clinic_credit
--    (DEFINER) çağırıyor.
--  * _send_payment_reminder_core(...): çağıranı kontrol etmiyor → her oturum herhangi bir lab/klinik
--    adına hatırlatma (uygulama içi, e-posta, WhatsApp) gönderebiliyordu. Çağıranlar DEFINER + cron.
-- DEFINER çağıranlar sahip (postgres) yetkisiyle çalıştığı için etkilenmez; service_role yetkisi kalır.
-- Geri alma: rollbacks/20261025166000_definer_exec_revoke.down.sql
revoke all on function public.get_admin_stats() from public, anon, authenticated;
revoke all on function public.alloc_receipt_to_invoices(uuid, uuid, numeric, text, date, text) from public, anon, authenticated;
revoke all on function public._send_payment_reminder_core(uuid, uuid, uuid, text, text, text, text[], uuid) from public, anon, authenticated;
