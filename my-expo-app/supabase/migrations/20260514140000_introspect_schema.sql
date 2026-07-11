-- Geçici introspection — schema'yı NOTICE olarak yazdır, sonra hiçbir şey yapma.
DO $$
DECLARE
  r RECORD;
  tbl text;
  tbls text[] := ARRAY['stock_items', 'stock_movements', 'purchase_invoices', 'supplier_transactions', 'expenses'];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    RAISE NOTICE '─── % ───', tbl;
    FOR r IN
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl
      ORDER BY ordinal_position
    LOOP
      RAISE NOTICE '  % | % | nullable=%', r.column_name, r.data_type, r.is_nullable;
    END LOOP;
  END LOOP;
END $$;
