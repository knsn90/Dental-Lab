-- ============================================================
-- 20260711 — GÜVENLİK: _apply_order_edit doğrudan çağrıya kapatılır
--
-- _apply_order_edit SECURITY DEFINER + yetki kontrolü YOK (bilerek —
-- kontrol, onu saran client_update_order / admin_update_order /
-- approve_order_change_request fonksiyonlarında). Ancak authenticated'a
-- (ve default PUBLIC üzerinden anon'a) EXECUTE verilmişti → herhangi bir
-- kullanıcı RPC ile HERHANGİ bir siparişi düzenleyebiliyordu.
--
-- Sarmalayıcı fonksiyonlar SECURITY DEFINER olduğundan (owner yetkisiyle
-- koşar) bu REVOKE onları ETKİLEMEZ; yalnız doğrudan dış çağrı kapanır.
-- Idempotent.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public._apply_order_edit(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._apply_order_edit(uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public._apply_order_edit(uuid, jsonb, jsonb) FROM authenticated;
