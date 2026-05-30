// supabase/functions/cleanup-storage/index.ts
//
// storage_cleanup_queue tablosundaki işlenmemiş kayıtları okur,
// chat-attachments bucket'ından {work_order_id}/* prefix'li dosyaları siler.
//
// Deploy:
//   supabase functions deploy cleanup-storage --project-ref <REF>
//
// Manuel çalıştır (test):
//   supabase functions invoke cleanup-storage --project-ref <REF>
//
// Otomatik çalıştır (pg_cron — Dashboard > Database > Cron Jobs):
//   SELECT cron.schedule('cleanup-storage', '0 3 * * *',
//     $$SELECT net.http_post(
//       url := 'https://<REF>.supabase.co/functions/v1/cleanup-storage',
//       headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE_KEY>'),
//       body := '{}'::jsonb
//     )$$
//   );

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BATCH_SIZE = 50;

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // İşlenmemiş kuyruğu al
  const { data: queue, error: qErr } = await supabase
    .from('storage_cleanup_queue')
    .select('id, work_order_id, bucket')
    .is('processed_at', null)
    .order('queued_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (qErr || !queue?.length) {
    return new Response(JSON.stringify({ processed: 0, error: qErr?.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let processed = 0;
  const errors: string[] = [];

  for (const item of queue) {
    try {
      // Bucket'taki {work_order_id}/ prefix'li tüm dosyaları listele
      const { data: files, error: listErr } = await supabase.storage
        .from(item.bucket)
        .list(item.work_order_id, { limit: 1000 });

      if (listErr) throw new Error(listErr.message);

      if (files && files.length > 0) {
        const paths = files.map((f: { name: string }) => `${item.work_order_id}/${f.name}`);
        const { error: delErr } = await supabase.storage
          .from(item.bucket)
          .remove(paths);
        if (delErr) throw new Error(delErr.message);
      }

      // İşlendi olarak işaretle
      await supabase
        .from('storage_cleanup_queue')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', item.id);

      processed++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${item.work_order_id}: ${msg}`);
      await supabase
        .from('storage_cleanup_queue')
        .update({ error_message: msg })
        .eq('id', item.id);
    }
  }

  return new Response(
    JSON.stringify({ processed, errors: errors.length ? errors : undefined }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
