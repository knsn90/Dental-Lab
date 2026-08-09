-- ============================================================================
-- P0-4 · R-02 — Scope lab-logos writes to the owning tenant
-- ============================================================================
-- BEFORE: lab_logos_{upload,update,delete}_authenticated all had predicate
--     bucket_id = 'lab-logos' AND auth.role() = 'authenticated'
-- so any authenticated user of ANY tenant could overwrite or delete any other
-- tenant's logo — including _brand/siman-type.png, which is embedded in every
-- outbound notification e-mail (send-email-notification/index.ts:44).
--
-- Read stays public: logos are rendered inside e-mail clients that carry no
-- session, so a signed URL is not workable here. Logos are not personal data.
--
-- Path shape (verified against live objects):
--     {lab_id}/…    tenant logo
--     _brand/…      reserved SIMAN asset — now service-role only
-- ============================================================================

drop policy if exists lab_logos_upload_authenticated on storage.objects;
drop policy if exists lab_logos_update_authenticated on storage.objects;
drop policy if exists lab_logos_delete_authenticated on storage.objects;
drop policy if exists lab_logos_write  on storage.objects;
drop policy if exists lab_logos_update on storage.objects;
drop policy if exists lab_logos_delete on storage.objects;

create policy lab_logos_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lab-logos'
    and split_part(name,'/',1) = get_my_lab_id()::text
  );

create policy lab_logos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lab-logos'
    and split_part(name,'/',1) = get_my_lab_id()::text
  );

create policy lab_logos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lab-logos'
    and split_part(name,'/',1) = get_my_lab_id()::text
  );

-- lab_logos_read_public is intentionally left in place.

do $$
declare v_old int;
begin
  select count(*) into v_old from pg_policies
   where schemaname='storage'
     and policyname in ('lab_logos_upload_authenticated',
                        'lab_logos_update_authenticated',
                        'lab_logos_delete_authenticated');
  if v_old > 0 then
    raise exception 'P0-4 FAILED: % unscoped lab-logos policy/policies remain', v_old;
  end if;
  raise notice 'P0-4 complete: lab-logos writes scoped to owning lab; _brand/ locked';
end $$;
