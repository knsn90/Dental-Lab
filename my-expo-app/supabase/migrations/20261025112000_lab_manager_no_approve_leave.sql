-- Lab müdürü izin onaylayamaz — 0b Görev 3 (kullanıcı kararı 2026-10-25: "izinleri yalnız ben onaylayayım").
-- approve_leave lab_manager'ın ortak varsayılanından kalkar. Lab müdürü izinleri görmeye (view_leaves) ve
-- personel adına BEKLEYEN izin girip düzeltmeye (manage_leaves) devam eder; onay/ret ve onaylı kaydı silme
-- yalnız approve_leave'de (20261025110000 el_* kuralları). Lab'a özel lab_manager yetki seti yok.
-- Geri alma: supabase/rollbacks/20261025112000_lab_manager_no_approve_leave.down.sql

delete from public.role_permissions
 where role_key = 'lab_manager' and lab_id is null and permission_key = 'approve_leave';
