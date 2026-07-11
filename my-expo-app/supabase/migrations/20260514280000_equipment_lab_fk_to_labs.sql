-- equipment.lab_id eski tasarımda profiles(id)'ye referans veriyordu.
-- Geri kalan tablolar (stock_items, stock_movements, purchase_invoices, warehouses)
-- labs(id) tablosuna işaret ediyor — uyumsuzluk nedeniyle satın alma faturasından
-- demirbaş üretirken FK ihlali oluyor.
--
-- Bu migration:
--   1) Eski constraint'i düşürür
--   2) Yeni constraint: equipment.lab_id → labs(id) ON DELETE CASCADE
--
-- Mevcut satırlardaki lab_id değerleri profiles.id == labs.id eşleşmesi yoksa
-- NULL'a çekilir (aksi durumda yeni constraint hatayı tekrarlar).

-- Sorunlu (orphan) lab_id'leri NULL yap — labs tablosunda bulunmayanlar
UPDATE public.equipment e
SET lab_id = NULL
WHERE e.lab_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.labs l WHERE l.id = e.lab_id);

-- Eski FK
ALTER TABLE public.equipment
  DROP CONSTRAINT IF EXISTS equipment_lab_id_fkey;

-- Yeni FK → labs(id)
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_lab_id_fkey
  FOREIGN KEY (lab_id) REFERENCES public.labs(id) ON DELETE CASCADE;
