-- ============================================================
-- 037 — work_orders.doctor_id polymorphic FK temizliği
--
-- Sorun:
--   "insert or update on table work_orders violates foreign key
--    constraint work_orders_doctor_id_fkey"
--
-- Sebep:
--   001'de work_orders.doctor_id UUID NOT NULL REFERENCES profiles(id)
--   olarak tanımlandı. Ancak uygulamada doctor_id polymorphic kullanılıyor:
--     - Hekim kendi sipariş açtığında: profiles.id
--     - Lab/admin paneli sipariş açtığında: doctors.id (external record)
--     - Klinik müdürü sipariş açtığında: profiles.id (kendi kliniğinin hekimi)
--
--   FK sadece profiles(id)'i hedeflediği için lab/admin'in açtığı siparişler
--   FK constraint'ini ihlal ediyor.
--
-- Çözüm:
--   FK constraint'i kaldır. Trigger (010_fix_activity_log_fk.sql) zaten
--   hem profiles hem doctors'tan SELECT INTO ile güvenli arama yapıyor.
--
-- Idempotent: tekrar çalıştırılabilir.
-- ============================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  -- doctor_id sütununa bağlı tüm FK constraint'leri bul ve düşür
  FOR v_constraint_name IN
    SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema    = kcu.table_schema
     WHERE tc.table_schema    = 'public'
       AND tc.table_name      = 'work_orders'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND kcu.column_name    = 'doctor_id'
  LOOP
    EXECUTE format('ALTER TABLE work_orders DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped FK constraint: %', v_constraint_name;
  END LOOP;
END$$;

-- doctor_id NOT NULL kalır, sadece FK düşer
COMMENT ON COLUMN work_orders.doctor_id IS
  'UUID — polymorphic referans (profiles.id VEYA doctors.id). FK kasıtlı olarak yok; ' ||
  'lab/admin sipariş açarken external doctors.id, hekim kendi açarken profiles.id kullanılır. ' ||
  '010_fix_activity_log_fk.sql trigger''ı her iki durumu da güvenle handle eder.';

-- ============================================================
-- END OF 037
-- ============================================================
