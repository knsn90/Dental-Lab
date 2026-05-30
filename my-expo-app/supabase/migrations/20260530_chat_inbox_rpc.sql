-- ============================================================
-- Migration: get_chat_inbox RPC
--
-- Önceki yaklaşım: 2000 mesajı JS'e çek, order_id'ye göre grupla (O(n)).
-- Yeni yaklaşım: DB'de DISTINCT ON + GROUP BY ile hesapla, sadece özetleri döndür.
-- ============================================================

CREATE OR REPLACE FUNCTION get_chat_inbox(p_user_id UUID)
RETURNS TABLE(
  work_order_id        UUID,
  order_number         TEXT,
  work_type            TEXT,
  patient_name         TEXT,
  doctor_id            TEXT,
  status               TEXT,
  is_urgent            BOOLEAN,
  tooth_numbers        INT[],
  shade                TEXT,
  machine_type         TEXT,
  delivery_date        DATE,
  notes                TEXT,
  last_content         TEXT,
  last_attachment_type TEXT,
  last_created_at      TIMESTAMPTZ,
  last_sender_id       TEXT,
  last_sender_type     TEXT,
  total_count          BIGINT,
  unread_for_me        BIGINT
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  WITH latest AS (
    -- Her sipariş için en son mesajı al (DISTINCT ON = tek geçişte)
    SELECT DISTINCT ON (om.work_order_id)
      om.work_order_id,
      om.content               AS last_content,
      om.attachment_type::TEXT AS last_attachment_type,
      om.created_at            AS last_created_at,
      om.sender_id::TEXT       AS last_sender_id,
      p.user_type              AS last_sender_type
    FROM order_messages om
    LEFT JOIN profiles p ON p.id = om.sender_id
    ORDER BY om.work_order_id, om.created_at DESC
  ),
  counts AS (
    -- Sipariş başına: toplam mesaj + kullanıcıya ait okunmamış
    SELECT
      work_order_id,
      COUNT(*)                                                              AS total_count,
      COUNT(*) FILTER (WHERE sender_id != p_user_id AND read_at IS NULL)  AS unread_for_me
    FROM order_messages
    GROUP BY work_order_id
  )
  SELECT
    wo.id               AS work_order_id,
    wo.order_number,
    wo.work_type,
    wo.patient_name,
    wo.doctor_id::TEXT  AS doctor_id,
    wo.status,
    wo.is_urgent,
    wo.tooth_numbers,
    wo.shade,
    wo.machine_type::TEXT,
    wo.delivery_date,
    wo.notes,
    l.last_content,
    l.last_attachment_type,
    l.last_created_at,
    l.last_sender_id,
    l.last_sender_type,
    COALESCE(c.total_count,   0) AS total_count,
    COALESCE(c.unread_for_me, 0) AS unread_for_me
  FROM work_orders wo
  JOIN latest  l ON l.work_order_id = wo.id
  LEFT JOIN counts c ON c.work_order_id = wo.id
  ORDER BY l.last_created_at DESC NULLS LAST;
$$;
