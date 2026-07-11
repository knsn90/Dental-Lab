-- ─────────────────────────────────────────────────────────────────────────────
-- bonus_policies audit trigger — JSONB karşılaştırması
-- "operator does not exist: json = json" hatası fix
-- row_to_json() → json tipi (eşitlik desteklemez); to_jsonb() → jsonb (destekler)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_bonus_policy_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    INSERT INTO public.bonus_rule_history (policy_id, changed_by, field_changed, old_snapshot, new_snapshot)
    VALUES (
      NEW.id,
      auth.uid(),
      'policy',
      to_jsonb(OLD),
      to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;
