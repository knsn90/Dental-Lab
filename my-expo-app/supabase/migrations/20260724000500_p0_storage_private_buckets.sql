-- ============================================================================
-- P0-3 · R-02 — Take health-data buckets off the public internet
-- ============================================================================
-- chat-attachments      public=true, no MIME limit, 100 MB — order-chat files,
--                       which in this workflow routinely include case photos
--                       and design files. Served over unauthenticated HTTP at
--                       /storage/v1/object/public/chat-attachments/<path>.
-- occlusion-screenshots public=true and ZERO storage policies.
--
-- ⚠ DEPLOY ORDER — THIS MIGRATION MUST RUN *AFTER* THE CLIENT SHIPS.
--   order_messages.attachment_url historically stored permanent PUBLIC URLs.
--   Once the bucket is private those URLs 400. modules/orders/chatApi.ts has
--   been changed to (a) store the object PATH going forward and (b) mint short
--   -lived signed URLs at fetch time, recovering the path from legacy absolute
--   URLs. Applying this migration before that client build reaches users leaves
--   attachments briefly unrenderable. Security-wise that is the correct
--   trade — a broken thumbnail beats world-readable patient photographs — but
--   it must be a decision, not a surprise.
--
-- occlusion-screenshots gets NO path policy: the bucket holds 0 objects and
-- grep finds no writer anywhere in the repository. Inventing a path predicate
-- would be guessing. It is closed to clients; the service role can still write.
-- Whoever adds the first writer MUST add a matching policy in the same PR.
-- ============================================================================

update storage.buckets
   set public = false
 where id in ('chat-attachments','occlusion-screenshots');

-- ── chat-attachments: path = {work_order_id}/{ts}_{filename} ───────────────
drop policy if exists chat_attach_select on storage.objects;
drop policy if exists chat_attach_insert on storage.objects;
drop policy if exists chat_select        on storage.objects;
drop policy if exists chat_insert        on storage.objects;
drop policy if exists chat_delete        on storage.objects;

create policy chat_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.can_access_work_order(public.try_uuid(split_part(name,'/',1)))
  );

create policy chat_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and public.can_access_work_order(public.try_uuid(split_part(name,'/',1)))
  );

-- Deletion follows the 5-minute message-delete window enforced in chatApi.ts;
-- storage only needs to answer "may this principal remove this object".
-- NOTE: storage.objects.owner is null on 9 of 21 existing rows, so owner-based
-- deletion cannot reach those. Lab users on the owning order can, which covers
-- the erasure path; platform admins cover the rest.
create policy chat_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
         owner = auth.uid()
      or is_platform_admin()
      or (is_lab_user()
          and public.can_access_work_order(public.try_uuid(split_part(name,'/',1))))
    )
  );

-- ── Assertions ─────────────────────────────────────────────────────────────
do $$
declare v_public int; v_chat int;
begin
  select count(*) into v_public from storage.buckets
   where public and id in ('chat-attachments','occlusion-screenshots');
  select count(*) into v_chat from pg_policies
   where schemaname='storage' and policyname in ('chat_select','chat_insert','chat_delete');

  if v_public > 0 then
    raise exception 'P0-3 FAILED: % health-data bucket(s) still public', v_public;
  end if;
  if v_chat < 3 then
    raise exception 'P0-3 FAILED: expected 3 chat policies, got %', v_chat;
  end if;

  raise notice 'P0-3 complete: chat-attachments + occlusion-screenshots are private';
end $$;
