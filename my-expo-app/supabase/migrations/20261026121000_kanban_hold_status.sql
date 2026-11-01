-- 20261026121000_kanban_hold_status.sql
-- Tek tanım (Y2) Task 8 ek: Üretim Panosu geciken sayısı beklemeye alınmış işi saymasın (tek tanım:
-- beklemedeki iş gecikmez). Görünüme hold_status sona eklendi; başka değişiklik yok.
-- Geri alma: rollbacks/20261026121000_kanban_hold_status.down.sql

create or replace view public.v_active_orders_kanban with (security_invoker = on) as
SELECT wo.id,
    wo.order_number,
    wo.work_type,
    wo.delivery_date,
    wo.is_rush,
    wo.status,
    wo.input_type,
    ob.box_code,
    cs.id AS current_stage_id,
    cs.sequence_order AS current_sequence,
    cs.status AS stage_status,
    cs.started_at AS stage_started_at,
    ls.name AS current_station_name,
    ls.color AS current_station_color,
    tp.id AS technician_id,
    tp.full_name AS technician_name,
    dp.full_name AS doctor_name,
    dp.clinic_name,
    cs.parallel_group,
    wo.patient_name,
    wo.tooth_numbers,
    wo.shade,
    wo.is_urgent,
    wo.hold_status
   FROM (((((work_orders wo
     JOIN order_stages cs ON (((cs.work_order_id = wo.id) AND (cs.status = 'aktif'::stage_status))))
     LEFT JOIN order_boxes ob ON ((ob.id = wo.box_id)))
     LEFT JOIN lab_stations ls ON ((ls.id = cs.station_id)))
     LEFT JOIN profiles tp ON ((tp.id = cs.technician_id)))
     LEFT JOIN profiles dp ON ((dp.id = wo.doctor_id)))
  WHERE ((wo.status <> ALL (ARRAY['teslim_edildi'::work_order_status, 'iptal'::work_order_status])) AND (NOT COALESCE(wo.is_archived, false)) AND (wo.lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)))
UNION ALL
 SELECT wo.id,
    wo.order_number,
    wo.work_type,
    wo.delivery_date,
    wo.is_rush,
    wo.status,
    wo.input_type,
    ob.box_code,
    cs.id AS current_stage_id,
    cs.sequence_order AS current_sequence,
    cs.status AS stage_status,
    cs.started_at AS stage_started_at,
    ls.name AS current_station_name,
    ls.color AS current_station_color,
    tp.id AS technician_id,
    tp.full_name AS technician_name,
    dp.full_name AS doctor_name,
    dp.clinic_name,
    cs.parallel_group,
    wo.patient_name,
    wo.tooth_numbers,
    wo.shade,
    wo.is_urgent,
    wo.hold_status
   FROM (((((work_orders wo
     LEFT JOIN order_boxes ob ON ((ob.id = wo.box_id)))
     LEFT JOIN order_stages cs ON ((cs.id = wo.current_stage_id)))
     LEFT JOIN lab_stations ls ON ((ls.id = cs.station_id)))
     LEFT JOIN profiles tp ON ((tp.id = cs.technician_id)))
     LEFT JOIN profiles dp ON ((dp.id = wo.doctor_id)))
  WHERE ((wo.status <> ALL (ARRAY['teslim_edildi'::work_order_status, 'iptal'::work_order_status])) AND (NOT COALESCE(wo.is_archived, false)) AND (NOT (EXISTS ( SELECT 1
           FROM order_stages os
          WHERE ((os.work_order_id = wo.id) AND (os.status = 'aktif'::stage_status))))) AND (wo.lab_id = ( SELECT get_my_lab_id() AS get_my_lab_id)));
