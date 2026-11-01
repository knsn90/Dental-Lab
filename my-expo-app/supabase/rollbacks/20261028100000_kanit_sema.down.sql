-- Geri alma: 20261028100000_kanit_sema
drop trigger if exists trg_deliveries_proof_guard on public.deliveries;
drop function if exists public._deliveries_proof_guard();

drop policy if exists dp_insert on storage.objects;
drop policy if exists dp_select on storage.objects;
drop function if exists public._delivery_proof_can_upload(uuid, uuid);
drop function if exists public._delivery_visible(uuid);

-- Alan yalnız boşsa silinir (dosya varsa kalır; önce Storage API ile boşaltılmalı)
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.buckets b
 where b.id = 'delivery-proofs'
   and not exists (select 1 from storage.objects o where o.bucket_id = 'delivery-proofs');

alter table public.deliveries
  drop constraint if exists deliveries_proof_override_by_fkey,
  drop constraint if exists deliveries_proof_source_check,
  drop column if exists proof_photo_path,
  drop column if exists signature_skipped_reason,
  drop column if exists proof_source,
  drop column if exists proof_captured_at,
  drop column if exists recipient_title,
  drop column if exists proof_override_reason,
  drop column if exists proof_override_by,
  drop column if exists proof_override_by_name,
  drop column if exists proof_override_at,
  drop column if exists provider_proof_checked_at;
