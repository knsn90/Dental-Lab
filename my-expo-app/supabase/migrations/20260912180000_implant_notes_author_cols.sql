-- 20260912180000_implant_notes_author_cols.sql
--
-- DÜZELTME: "column created_by_name of relation order_implant_notes does not exist"
--
-- 20260912120000 tablo için `CREATE TABLE IF NOT EXISTS` kullanıyor. Tablo o
-- migration'ın ERKEN bir sürümüyle (yazar adı/tarafı kolonları YOKken) zaten
-- oluşmuştu; dosyaya kolonlar sonradan eklendi ama CREATE atlandığı için canlıda
-- oluşmadı. RPC'ler ise CREATE OR REPLACE olduğu için güncellendi ve olmayan
-- kolona yazmaya çalıştı → not eklemek hata veriyordu.
--
-- Bu migration YALNIZ EKLER: iki kolon + kontrol + geçmiş satırların adını doldurur.

ALTER TABLE public.order_implant_notes
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS created_by_side text;

-- CHECK yalnız bir kez eklenmeli (ADD CONSTRAINT IF NOT EXISTS yok).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.order_implant_notes'::regclass
       AND conname  = 'order_implant_notes_created_by_side_check')
  THEN
    ALTER TABLE public.order_implant_notes
      ADD CONSTRAINT order_implant_notes_created_by_side_check
      CHECK (created_by_side IN ('lab','clinic'));
  END IF;
END $$;

-- Kolonlar eklenmeden önce yazılmış notlarda yazar adı boş kalmasın.
UPDATE public.order_implant_notes n
   SET created_by_name = p.full_name
  FROM public.profiles p
 WHERE p.id = n.created_by
   AND n.created_by_name IS NULL;

COMMENT ON COLUMN public.order_implant_notes.created_by_name IS
  'Yazarın adı YAZMA anında kopyalanır — klinik kullanıcısı lab profillerini (ve tersi) RLS yüzünden okuyamıyor.';
