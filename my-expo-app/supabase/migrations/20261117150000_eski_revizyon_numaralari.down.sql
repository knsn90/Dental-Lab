-- Geri al: 20261117150000
BEGIN;
UPDATE public.work_orders SET order_number = 'NEX-2026-70' WHERE id = '9550df20-c8c8-4a36-9967-44973d6a5e9a' AND order_number = 'NEX-2026-0221-R1';
UPDATE public.work_orders SET order_number = 'NEX-2026-62' WHERE id = '471c2468-6b5b-4010-8053-041551a44d50' AND order_number = 'NEX-2026-0213-R1';
UPDATE public.work_orders SET order_number = 'LAB-2026-17' WHERE id = '3fe7cf0d-1d7c-4951-bdf4-36cf9b1c2424' AND order_number = 'LAB-2026-0116-R1';
UPDATE public.work_orders SET order_number = 'LAB-2026-21' WHERE id = '0fd36d3f-0741-4bc7-84fd-195bfc5d15e9' AND order_number = 'LAB-2026-0162-R1';
UPDATE public.work_orders SET order_number = 'NEX-2026-42' WHERE id = '89e24340-dfe1-48b6-ac23-4563149312ef' AND order_number = 'NEX-2026-0192-R1';
COMMIT;
