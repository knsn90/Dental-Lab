-- Geri alma: 20261123120000_perm_target_membership (20261123100000'daki tanım)
CREATE OR REPLACE FUNCTION public._perm_target_allowed(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles t
     WHERE t.id = p_user_id
       AND (t.lab_id IS NULL OR t.lab_id = public.get_my_lab_id())
  );
$function$;

DROP FUNCTION IF EXISTS public.list_permission_targets();
