// Storage migration: old (Tokyo) → new (Frankfurt)
import { createClient } from '@supabase/supabase-js';

const OLD = {
  url:     'https://fukaxeppklvtegnjuwih.supabase.co',
  service: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1a2F4ZXBwa2x2dGVnbmp1d2loIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM0NTcxOSwiZXhwIjoyMDg5OTIxNzE5fQ.XoHGOiCQiD1x4XbQ-vng72bQC9jg7G4tZRodin3erYk',
};
const NEW = {
  url:     'https://kjwjxqfdsxkxgcgophdy.supabase.co',
  service: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtqd2p4cWZkc3hreGdjZ29waGR5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTE4MzA4NiwiZXhwIjoyMDk0NzU5MDg2fQ.83vtBKaOkrKKAW0KS9NKU4_sKSbJ-bTHV_9T032ODxU',
};

const oldClient = createClient(OLD.url, OLD.service, { auth: { persistSession: false } });
const newClient = createClient(NEW.url, NEW.service, { auth: { persistSession: false } });

const BUCKETS = ['avatars', 'chat-attachments', 'lab-logos', 'occlusion-screenshots', 'paper-orders', 'work-order-photos', 'employee-docs'];

async function listAllInBucket(client, bucket, prefix = '') {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit, offset });
    if (error) { console.error(`  list error ${bucket}/${prefix}:`, error.message); break; }
    if (!data || data.length === 0) break;
    for (const item of data) {
      if (item.id === null) {
        // folder
        const subItems = await listAllInBucket(client, bucket, prefix ? `${prefix}/${item.name}` : item.name);
        all.push(...subItems);
      } else {
        all.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return all;
}

let totalCopied = 0;
let totalSkipped = 0;
let totalFailed = 0;
const failed = [];

for (const bucket of BUCKETS) {
  console.log(`\n=== ${bucket} ===`);
  const files = await listAllInBucket(oldClient, bucket);
  console.log(`  ${files.length} dosya bulundu`);
  let i = 0;
  for (const path of files) {
    i++;
    process.stdout.write(`  [${i}/${files.length}] ${path.slice(0, 60)}... `);
    try {
      const { data: dl, error: dlErr } = await oldClient.storage.from(bucket).download(path);
      if (dlErr || !dl) { console.log('DOWNLOAD FAIL'); totalFailed++; failed.push(`${bucket}/${path}: ${dlErr?.message}`); continue; }
      const buffer = await dl.arrayBuffer();
      const contentType = dl.type || 'application/octet-stream';
      const { error: upErr } = await newClient.storage.from(bucket).upload(path, buffer, {
        upsert: true,
        contentType,
      });
      if (upErr) { console.log('UPLOAD FAIL:', upErr.message); totalFailed++; failed.push(`${bucket}/${path}: ${upErr.message}`); continue; }
      console.log('OK');
      totalCopied++;
    } catch (e) {
      console.log('ERR:', e.message);
      totalFailed++;
      failed.push(`${bucket}/${path}: ${e.message}`);
    }
  }
}

console.log(`\n=== ÖZET ===`);
console.log(`Kopyalanan: ${totalCopied}`);
console.log(`Hata: ${totalFailed}`);
if (failed.length) {
  console.log('\nHatalar:');
  failed.forEach(f => console.log('  -', f));
}
