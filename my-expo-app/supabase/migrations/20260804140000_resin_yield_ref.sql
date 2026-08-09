-- ============================================================================
-- Reçine verimi referansı — üreticinin kendi verim tablosu
--
-- NEDEN TABLO: gr/diş değerlerini bugüne kadar ya türetmek ya da varsaymak
-- zorundaydık (üreticiler IFU'da tüketim yayınlamıyor). SprintRay'in verim
-- tablosu bunu ortadan kaldırıyor: paket gramajı ÷ üretim adedi = birim başına
-- tüketim. disc_yield_ref ile aynı rol — kural motorunun beslendiği referans.
--
-- unit_basis, "adet"in NE olduğunu söyler:
--   tooth = kron/diş başına · jaw = çene/model başına · job = iş başına
-- Bu ayrım olmadan 10 gr'ın "gece plağı başına" mı "diş başına" mı olduğu
-- belirsiz kalır — geçmişteki hataların bir kısmı tam olarak buydu.
--
-- FİYAT TUTMAZ: maliyet her zaman satınalma faturasından gelir. Bu tablo
-- yalnız "bir pakette kaç birim çıkar" sorusunu cevaplar.
--
-- Kaynak: SprintRay reçine verim tablosu (lab tarafından sağlandı).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.resin_yield_ref (
  code           text PRIMARY KEY,
  brand          text NOT NULL DEFAULT 'SprintRay',
  label          text NOT NULL,
  pack_qty       numeric,                     -- paket büyüklüğü (gr veya kapsül adedi)
  pack_unit      text NOT NULL DEFAULT 'gr',
  units_per_pack numeric NOT NULL CHECK (units_per_pack > 0),
  unit_basis     text NOT NULL CHECK (unit_basis IN ('tooth','jaw','job')),
  qty_per_unit   numeric GENERATED ALWAYS AS (round(pack_qty / units_per_pack, 4)) STORED,
  print_minutes  int,
  note           text
);

ALTER TABLE public.resin_yield_ref ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lab users read resin yield" ON public.resin_yield_ref;
CREATE POLICY "Lab users read resin yield" ON public.resin_yield_ref
  FOR SELECT USING (public.is_lab_user());

COMMENT ON TABLE public.resin_yield_ref IS
  'Uretici recine verim tablosu: paket / uretim adedi = birim basina tuketim.';
COMMENT ON COLUMN public.resin_yield_ref.unit_basis IS
  'tooth = kron basina, jaw = cene/model basina, job = is basina';

INSERT INTO public.resin_yield_ref
  (code, label, pack_qty, pack_unit, units_per_pack, unit_basis, print_minutes, note)
VALUES
  ('CERAMIC_CROWN',  'Ceramic Crown',            250,  'gr',    70,  'tooth', 14,  '3.57 gr/kron'),
  ('ONX_TOUGH_2',    'ONX Tough 2',              500,  'gr',    30,  'tooth', 24,  '16.67 gr/kron'),
  ('DIE_MODEL_2',    'Die & Model 2',           1000,  'gr',    56,  'jaw',   22,  '17.86 gr/model — icesi bosaltilmis baski'),
  ('TEMP_CROWN',     'Temporary Crown & Teeth', 1000,  'gr',    85,  'tooth', 23,  '11.76 gr/kron'),
  ('DENTURE_BASE',   'Denture Base',            1000,  'gr',    55,  'jaw',   109, '18.18 gr/kaide'),
  ('NIGHT_GUARD',    'Night Guard',             1000,  'gr',   100,  'job',   20,  '10 gr/plak — plak tek parca, is basina'),
  ('GINGIVA_MASK',   'Gingiva Mask',            1000,  'gr',   350,  'jaw',   25,  '2.86 gr/maske'),
  ('SURGICAL_GUIDE', 'Surgical Guide',          1000,  'gr',    56,  'job',   33,  '17.86 gr/rehber'),
  ('MIDAS_CROWN',    'Midas kapsul — kron',        3,  'adet',   3,  'tooth', NULL, '1 kapsul = 3 kron'),
  ('MIDAS_INLAY',    'Midas kapsul — inlay/onlay', 3,  'adet',   6,  'tooth', NULL, '1 kapsul = 6 inlay/onlay'),
  ('MIDAS_VENEER',   'Midas kapsul — lamine',      3,  'adet',   9,  'tooth', NULL, '1 kapsul = 9 lamine')
ON CONFLICT (code) DO UPDATE SET
  pack_qty = EXCLUDED.pack_qty, units_per_pack = EXCLUDED.units_per_pack,
  unit_basis = EXCLUDED.unit_basis,
  print_minutes = EXCLUDED.print_minutes, note = EXCLUDED.note;

-- ── Stoktaki iki SprintRay kalemi artık türetilmiş değil, üretici verisi ────
-- Değerler zaten aynıydı (11.76 gr/diş ve iş başına 10 gr) — bu güncelleme
-- sayıyı değil, GEREKÇESİNİ değiştiriyor: artık tahmin değil, kaynağı belli.
UPDATE public.consumption_rules cr
   SET is_assumption = false,
       note = '[U] SprintRay verim tablosu: 1000 gr / 85 kron = 11.76 gr/kron'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'TEMP_RESIN';

UPDATE public.consumption_rules cr
   SET is_assumption = false,
       note = '[U] SprintRay verim tablosu: 1000 gr / 100 plak = 10 gr/plak (is basina)'
  FROM public.production_materials pm
 WHERE pm.id = cr.production_material_id AND pm.code = 'SPLINT_RESIN';
