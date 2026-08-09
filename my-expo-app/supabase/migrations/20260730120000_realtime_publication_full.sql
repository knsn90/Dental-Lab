-- Realtime yayınını (publication) eksiksiz kur.
--
-- Sorun: `supabase_realtime` publication'ı prod'da BOŞTU (hiç tablo yoktu), bu yüzden
-- istemcideki tüm `postgres_changes` abonelikleri (sipariş listesi, aşamalar, kurye,
-- mesaj, bildirim, onay, malzeme talebi…) sessizce hiçbir olay almıyordu → her şey
-- refresh istiyordu. Eski `20260506010000_enable_realtime.sql` yalnız 3 tablo ekliyordu
-- ve anlaşılan prod'a hiç uygulanmadı / bir Supabase işlemi publication'ı sıfırladı.
--
-- Çözüm: kodun abone olduğu tüm tabloları yayına ekle + silme olaylarının RLS altında
-- da ulaşması için order/mesaj/bildirim tablolarına REPLICA IDENTITY FULL ver.
-- İstemci kodu değişmez; tümüyle additive ve idempotent.

DO $$
DECLARE
  t text;
  -- Kodun postgres_changes ile abone olduğu tablolar (grep: table: '<name>')
  pub_tables text[] := ARRAY[
    'work_orders','order_stages','deliveries','order_messages','notifications',
    'approvals','material_requests','gps_pings','activity_logs','case_steps',
    'equipment','pending_paper_orders','profiles','stage_activity_events',
    'stock_items','stock_movements','whatsapp_sessions'
  ];
  -- DELETE/UPDATE olaylarının RLS altında da yayılması için FULL gerekenler.
  -- gps_pings / stock_movements yalnız-INSERT + yüksek trafik → WAL şişmesin diye HARİÇ.
  full_tables text[] := ARRAY[
    'work_orders','order_stages','deliveries','order_messages','notifications','material_requests'
  ];
BEGIN
  -- 1) Publication'a ekle (tablo varsa ve henüz yayında değilse)
  FOREACH t IN ARRAY pub_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t)
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
               WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;

  -- 2) Silme olaylarının RLS altında da ulaşması için REPLICA IDENTITY FULL
  FOREACH t IN ARRAY full_tables LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;
  END LOOP;
END $$;
