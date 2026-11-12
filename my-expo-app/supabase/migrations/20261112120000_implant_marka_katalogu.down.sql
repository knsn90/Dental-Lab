-- Geri alma: 20261112120000_implant_marka_katalogu. Yalnız bu migration'ın oluşturduğu nesneleri düşürür.
-- Siparişlerdeki marka/model METİN olduğu için siparişler etkilenmez; eklenen katalog kayıtları kaybolur.
BEGIN;
DROP FUNCTION IF EXISTS public.implant_catalog_merge_brand(uuid, uuid);
DROP FUNCTION IF EXISTS public.implant_catalog_update(text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.implant_catalog_add_model(uuid, text);
DROP FUNCTION IF EXISTS public.implant_catalog_add_brand(uuid, text);
DROP FUNCTION IF EXISTS public.implant_catalog_list(uuid, boolean);
DROP FUNCTION IF EXISTS public._implant_catalog_seed(uuid);
DROP TABLE IF EXISTS public.implant_models;
DROP TABLE IF EXISTS public.implant_brands;
DROP FUNCTION IF EXISTS public._implant_catalog_can_manage(uuid);
DROP FUNCTION IF EXISTS public._implant_catalog_can_use(uuid);
DROP FUNCTION IF EXISTS public._implant_catalog_key(text);
COMMIT;
