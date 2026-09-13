/**
 * Sipariş AI özeti — "Özet çıkar" butonu ve Simanty'nin `siparisRaporu` aracı
 * bu tek motoru kullanır.
 *
 * Akış: veriyi TOPLA → tek paragraf YAZDIR (denty-brain) → KAYDET (save_order_ai_report).
 *
 * Neden model yerine burada topluyoruz: veri okuması kullanıcının oturumuyla
 * yapılır, yani RLS ne gösteriyorsa o kadarı rapora girer. Model serbestçe tablo
 * gezmez; ne verildiyse onu yazar.
 *
 * Gizlilik: hasta ADI rapora girer (zaten ekranlarda görünür), TC kimlik ve telefon
 * GÖNDERİLMEZ. Bkz. KVKK notu.
 */
import { supabase } from '../../lib/supabase';
import { useDentyStore } from './store/dentyStore';

export type ReportAudience = 'lab' | 'clinic';

export interface OrderReport {
  id: string;
  work_order_id: string;
  audience: ReportAudience;
  body: string;
  sources: Record<string, number>;
  model: string | null;
  created_by_name: string | null;
  created_at: string;
}

const REPORT_MODEL = 'claude-sonnet-4-5';
const MAX_MESSAGES = 100;

/** Siparişin son raporu (izleyiciye göre RLS zaten filtreler). */
export async function fetchLatestReport(orderId: string): Promise<OrderReport | null> {
  const { data, error } = await supabase
    .from('order_ai_reports')
    .select('*')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrderReport) ?? null;
}

export async function fetchReportHistory(orderId: string, limit = 10): Promise<OrderReport[]> {
  const { data, error } = await supabase
    .from('order_ai_reports')
    .select('*')
    .eq('work_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderReport[];
}

interface Gathered {
  text: string;
  sources: Record<string, number>;
  orderNumber: string;
}

function line(label: string, value: unknown): string {
  const v = typeof value === 'string' ? value.trim() : value;
  return v === null || v === undefined || v === '' ? '' : `${label}: ${v}\n`;
}

/** Siparişin bağlamını düz metne çevirir — modele giden tek girdi budur. */
async function gather(orderId: string): Promise<Gathered> {
  const { data: order, error } = await supabase
    .from('work_orders')
    .select('id, order_number, patient_name, status, work_type, tooth_numbers, shade, machine_type,' +
            ' model_type, notes, lab_notes, is_urgent, delivery_date, created_at, triaged_at,' +
            ' revision_of_id, continues_order_id, doctor_id')
    .eq('id', orderId)
    .single();
  if (error) throw new Error(error.message);
  const o = order as any;

  // work_orders.doctor_id POLİMORFİK (doctors.id VEYA profiles.id) — PostgREST embed
  // çalışmaz ("Could not find a relationship"). İki tabloyu sırayla dene.
  let doctorName: string | null = null;
  if (o.doctor_id) {
    const { data: d } = await supabase.from('doctors').select('full_name').eq('id', o.doctor_id).maybeSingle();
    doctorName = (d as any)?.full_name ?? null;
    if (!doctorName) {
      const { data: pr } = await supabase.from('profiles').select('full_name').eq('id', o.doctor_id).maybeSingle();
      doctorName = (pr as any)?.full_name ?? null;
    }
  }

  const [msgRes, fileRes, stageRes, relRes, histRes] = await Promise.all([
    supabase.from('order_messages')
      .select('content, created_at, attachment_name, sender:profiles!order_messages_sender_id_fkey(full_name, user_type)')
      .eq('work_order_id', orderId).order('created_at', { ascending: true }).limit(MAX_MESSAGES),
    supabase.from('work_order_photos').select('storage_path, caption, created_at').eq('work_order_id', orderId).limit(40),
    supabase.from('order_stages')
      .select('sequence_order, stage_name, status, started_at, completed_at')
      .eq('work_order_id', orderId).order('sequence_order', { ascending: true }).limit(40),
    supabase.from('work_orders').select('id, order_number, status, created_at')
      .or(`revision_of_id.eq.${orderId},continues_order_id.eq.${orderId}`).limit(20),
    o.patient_name
      ? supabase.from('work_orders').select('order_number, work_type, status, created_at, delivery_date')
          .eq('patient_name', o.patient_name).neq('id', orderId)
          .order('created_at', { ascending: false }).limit(10)
      : Promise.resolve({ data: [] } as any),
  ]);

  const msgs   = (msgRes.data ?? []) as any[];
  const files  = (fileRes.data ?? []) as any[];
  const stages = (stageRes.data ?? []) as any[];
  const rels   = (relRes.data ?? []) as any[];
  const hist   = (histRes.data ?? []) as any[];

  let t = '';
  t += `SİPARİŞ #${o.order_number}\n`;
  t += line('Hasta', o.patient_name);
  t += line('Hekim', doctorName);
  t += line('Durum', o.triaged_at ? o.status : `${o.status} (planlama yapılmadı)`);
  t += line('İş tipi', o.work_type);
  t += line('Dişler', Array.isArray(o.tooth_numbers) ? o.tooth_numbers.join(', ') : null);
  t += line('Renk', o.shade);
  t += line('Makine', o.machine_type);
  t += line('Ölçü', o.model_type);
  t += line('Acil', o.is_urgent ? 'evet' : '');
  t += line('Oluşturma', o.created_at?.slice(0, 10));
  t += line('Teslim tarihi', o.delivery_date);
  t += line('Hekim notu', o.notes);
  t += line('Lab notu', o.lab_notes);

  if (stages.length) {
    t += `\nAŞAMALAR (${stages.length}):\n`;
    stages.forEach(s => {
      t += `- ${s.stage_name ?? 'aşama'}: ${s.status}`
        + (s.completed_at ? ` (bitti ${String(s.completed_at).slice(0, 10)})` : '') + '\n';
    });
  }

  if (rels.length) {
    t += `\nBAĞLI İŞLER (${rels.length}):\n`;
    rels.forEach(r => { t += `- #${r.order_number} · ${r.status}\n`; });
  }
  if (o.revision_of_id || o.continues_order_id) {
    t += `- Bu iş bir ${o.continues_order_id ? 'devam siparişi' : 'revizyon'}\n`;
  }

  if (files.length) {
    t += `\nDOSYALAR (${files.length}): `
      + files.map(f => (f.caption || String(f.storage_path).split('/').pop())).join(', ') + '\n';
  }

  if (msgs.length) {
    t += `\nMESAJLAR (${msgs.length}, eskiden yeniye):\n`;
    msgs.forEach(m => {
      const who = m.sender?.full_name ?? 'Kullanıcı';
      const role = m.sender?.user_type === 'doctor' || String(m.sender?.user_type ?? '').startsWith('clinic')
        ? 'klinik' : 'lab';
      const body = (m.content ?? '').trim() || (m.attachment_name ? `[dosya: ${m.attachment_name}]` : '');
      if (body) t += `- (${role}) ${who}: ${body}\n`;
    });
  }

  if (hist.length) {
    t += `\nAYNI HASTANIN ÖNCEKİ İŞLERİ (${hist.length}):\n`;
    hist.forEach(h => {
      t += `- #${h.order_number} · ${h.work_type ?? ''} · ${h.status} · ${String(h.created_at).slice(0, 10)}\n`;
    });
  }

  return {
    text: t,
    orderNumber: o.order_number,
    sources: { messages: msgs.length, files: files.length, stages: stages.length, linked: rels.length, history: hist.length },
  };
}

const SYSTEM_LAB =
  'Sen bir diş laboratuvarının iş takip asistanısın. Sana bir siparişin tüm bağlamı veriliyor. ' +
  'TEK PARAGRAF, 3-5 cümle Türkçe özet yaz. Teknisyenin işe başlamadan bilmesi gerekeni yaz: ' +
  'işin ne olduğu, hekimin özel istekleri, açık kalan konular, gecikme/aciliyet ve varsa geçmiş işle ilişkisi. ' +
  'Madde işareti, başlık ve emoji KULLANMA. Veride olmayan hiçbir şeyi uydurma; bilinmiyorsa yazma.';

const SYSTEM_CLINIC =
  'Sen bir diş laboratuvarının klinik tarafına konuşan asistanısın. Sana bir siparişin bağlamı veriliyor. ' +
  'TEK PARAGRAF, 3-5 cümle Türkçe özet yaz: işin durumu, hekimin istekleri, bekleyen konular ve teslim beklentisi. ' +
  'Laboratuvarın iç notlarını, teknisyen adlarını ve iç maliyet/atama bilgisini YAZMA. ' +
  'Madde işareti, başlık ve emoji KULLANMA. Veride olmayan hiçbir şeyi uydurma.';

/**
 * Raporu üretir ve kaydeder. audience sunucuda çağıranın tarafına göre ZORLANIR;
 * buradaki değer yalnız hangi yönergeyle yazılacağını belirler.
 */
export async function generateOrderReport(
  orderId: string, audience: ReportAudience,
): Promise<{ body: string; sources: Record<string, number>; orderNumber: string }> {
  const g = await gather(orderId);

  const { data, error } = await supabase.functions.invoke('denty-brain', {
    body: {
      system: audience === 'clinic' ? SYSTEM_CLINIC : SYSTEM_LAB,
      messages: [{ role: 'user', content: g.text }],
      model: REPORT_MODEL,
      max_tokens: 600,
    },
  });
  if (error) throw new Error(error.message);

  const res: any = data;
  if (res?.ok === false) throw new Error(res.error ?? 'Özet üretilemedi.');
  const body = String(
    (res?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('\n'),
  ).trim();
  if (!body) throw new Error('Özet boş döndü.');

  const { error: saveErr } = await supabase.rpc('save_order_ai_report', {
    p_order: orderId, p_body: body, p_sources: g.sources, p_model: REPORT_MODEL,
  });
  if (saveErr) throw new Error(saveErr.message);

  return { body, sources: g.sources, orderNumber: g.orderNumber };
}

/**
 * Butondan çalışan yol: özeti ÜRET ve Simanty penceresine olduğu gibi yaz.
 *
 * Model turu YOK — bilinçli. Modelden "şu siparişi özetle" diye istenince araç
 * sonucunu yeniden biçimlendirip başlıklı, emojili bir döküm yazıyordu. Rapor
 * metni burada ne ise panelde de o görünür.
 */
export async function reportIntoPanel(orderId: string, audience: ReportAudience): Promise<void> {
  const store = useDentyStore.getState();
  store.open();
  store.pushDisplay('user', 'Bu siparişin özetini çıkar');
  store.setBusy(true);
  const pendingId = store.pushDisplay('denty', '', { pending: true });
  try {
    const r = await generateOrderReport(orderId, audience);
    const src = `${r.sources.messages} mesaj · ${r.sources.files} dosya · ${r.sources.linked} bağlı iş · ${r.sources.history} geçmiş iş`;
    store.updateDisplay(pendingId, { text: `${r.body}\n\n(kaynak: ${src})`, pending: false });
  } catch (e: any) {
    store.updateDisplay(pendingId, { text: `Özet üretilemedi: ${e?.message ?? e}`, pending: false });
  } finally {
    store.setBusy(false);
  }
}
