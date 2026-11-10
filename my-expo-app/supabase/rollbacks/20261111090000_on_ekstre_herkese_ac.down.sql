-- DOWN: before.txt'deki değerlere döner — yalnız demo lab açık kalır. Migration'ın eklediği
-- ayar satırı silinmez (varsayılanlarla zararsız); ayarı kapalı olur.
BEGIN;
UPDATE public.lab_settings SET invoice_approval_enabled = (lab_id = '7c769d4a-0cec-408f-85d0-9dccac7bd969');
COMMIT;
