// inbound-order-message — WhatsApp'tan gelen (YENİ SİPARİŞ OLMAYAN) mesajı, ilgili
// work_order'ın sohbetine (order_messages) ekler. Yeni sipariş açmaz.
//
// Korelasyon zinciri (ilk tutan kazanır):
//   1) reply-context: kullanıcı bir giden bildirime "yanıt" verdiyse Meta `context.id`
//      (wamid) gelir → whatsapp_notifications.provider_id → work_order_id. KESİN.
//   2) sipariş numarası: metinde LAB-2026-0120 gibi numara → work_orders.order_number.
//   3) hasta adı: metinde geçen hasta tam adı → work_orders.patient_name (aynı isimden
//      çok varsa aktif + en yeni).
//   4) tek aktif sipariş: gönderen telefon → profil → o hekimin TEK aktif siparişi.
//
// Eşleşme yoksa { matched:false } döner → çağıran (webhook) not/tampon yoluna düşer.
//
// Input: { lab_id, sender_phone?, sender_name?, text, channel_msg_id?, context_wamid? }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FINAL_STATUSES = ['teslim_edildi', 'iptal', 'iptal_edildi', 'reddedildi', 'tamamlandi'];

// Türkçe-duyarlı sadeleştirme (karşılaştırma için).
function fold(s: unknown): string {
  return String(s ?? '')
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const H = { apikey: key, Authorization: `Bearer ${key}` };
  const HJ = { ...H, 'content-type': 'application/json' };

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }

  const labId  = String(body?.lab_id ?? '').trim();
  const text   = String(body?.text ?? '').trim();
  const phone  = String(body?.sender_phone ?? '').replace(/[^\d]/g, '');
  const sName  = String(body?.sender_name ?? '').trim();
  const ctxId  = String(body?.context_wamid ?? '').trim();
  if (!labId || !text) return json({ ok: true, matched: false, skipped: 'lab_id/text yok' });

  try {
    let matched: { id: string; order_number: string } | null = null;
    let method = '';

    // ── 1) reply-context wamid → giden bildirim → work_order_id ──
    if (ctxId) {
      const r = await fetch(
        `${url}/rest/v1/whatsapp_notifications?provider_id=eq.${encodeURIComponent(ctxId)}&work_order_id=not.is.null&select=work_order_id&order=created_at.desc&limit=1`,
        { headers: H },
      );
      if (r.ok) {
        const rows = await r.json();
        const woId = Array.isArray(rows) && rows[0]?.work_order_id;
        if (woId) {
          const w = await fetch(`${url}/rest/v1/work_orders?id=eq.${woId}&lab_id=eq.${labId}&select=id,order_number&limit=1`, { headers: H });
          const wr = w.ok ? await w.json() : [];
          if (Array.isArray(wr) && wr[0]) { matched = wr[0]; method = 'reply'; }
        }
      }
    }

    // Kalan yöntemler için lab'ın son siparişlerini çek (tek sorgu).
    let orders: any[] = [];
    if (!matched) {
      const r = await fetch(
        `${url}/rest/v1/work_orders?lab_id=eq.${labId}&select=id,order_number,patient_name,status,doctor_id,created_at&order=created_at.desc&limit=200`,
        { headers: H },
      );
      orders = r.ok ? await r.json() : [];
    }

    // ── 2) sipariş numarası (rakam dizisi eşleşmesi) ──
    if (!matched && orders.length) {
      const textDigits = text.replace(/\D/g, '');
      if (textDigits.length >= 4) {
        for (const o of orders) {
          const onDigits = String(o.order_number ?? '').replace(/\D/g, '');
          if (onDigits.length >= 6 && textDigits.includes(onDigits)) { matched = o; method = 'order_no'; break; }
        }
      }
    }

    // ── 3) hasta adı (tam ad, metinde substring) ──
    if (!matched && orders.length) {
      const ft = fold(text);
      const hits = orders.filter((o) => {
        const pn = fold(o.patient_name);
        // en az 2 kelime veya >=5 harf — tek kısa isim yanlış eşleşmesini önler
        return pn.length >= 5 && (pn.includes(' ') || pn.length >= 6) && ft.includes(pn);
      });
      if (hits.length) {
        // aktif olanı, sonra en yeniyi tercih et (orders zaten created_at desc)
        hits.sort((a, b) => {
          const af = FINAL_STATUSES.includes(a.status) ? 1 : 0;
          const bf = FINAL_STATUSES.includes(b.status) ? 1 : 0;
          if (af !== bf) return af - bf;
          return String(b.created_at).localeCompare(String(a.created_at));
        });
        matched = { id: hits[0].id, order_number: hits[0].order_number };
        method = 'patient';
      }
    }

    // ── 4) gönderenin TEK aktif siparişi ──
    let senderProfileId: string | null = null;
    if (phone) {
      const p = await fetch(`${url}/rest/v1/profiles?whatsapp_phone=eq.%2B${phone}&select=id&limit=1`, { headers: H })
        .catch(() => null);
      let prow = p && p.ok ? await p.json() : [];
      if (!Array.isArray(prow) || !prow.length) {
        // + olmadan da dene (kayıt formatına dayanma)
        const p2 = await fetch(`${url}/rest/v1/profiles?whatsapp_phone=eq.${phone}&select=id&limit=1`, { headers: H }).catch(() => null);
        prow = p2 && p2.ok ? await p2.json() : [];
      }
      senderProfileId = Array.isArray(prow) && prow[0]?.id ? prow[0].id : null;
    }
    if (!matched && senderProfileId && orders.length) {
      const active = orders.filter((o) => o.doctor_id === senderProfileId && !FINAL_STATUSES.includes(o.status));
      if (active.length === 1) { matched = { id: active[0].id, order_number: active[0].order_number }; method = 'single_active'; }
    }

    if (!matched) return json({ ok: true, matched: false });

    const attB64 = String(body?.attachment_b64 ?? '');

    // ── Dedupe (yalnız metin mesajı): aynı sipariş + aynı içerik son 2 dk'da varsa atla ──
    if (!attB64 && text) {
      const since = new Date(Date.now() - 2 * 60_000).toISOString();
      const dup = await fetch(
        `${url}/rest/v1/order_messages?work_order_id=eq.${matched.id}&created_at=gte.${encodeURIComponent(since)}&select=id,content`,
        { headers: H },
      );
      if (dup.ok) {
        const drows = await dup.json();
        if (Array.isArray(drows) && drows.some((m: any) => String(m.content ?? '').includes(text))) {
          return json({ ok: true, matched: true, duplicate: true, work_order_id: matched.id, order_number: matched.order_number, method });
        }
      }
    }

    // ── Görsel eki varsa chat-attachments (private) bucket'ına yükle → PATH saklanır ──
    let attachmentUrl: string | null = null;
    let attachmentType: string | null = null;
    let attachmentName: string | null = null;
    if (attB64) {
      const attMime = String(body?.attachment_mime ?? 'image/jpeg');
      const ext = attMime.includes('png') ? 'png' : attMime.includes('webp') ? 'webp' : attMime.includes('pdf') ? 'pdf' : 'jpg';
      const attType = attMime.includes('pdf') ? 'file' : 'image';
      const path = `${matched.id}/${Date.now()}_wa.${ext}`;
      const bytes = Uint8Array.from(atob(attB64), (c) => c.charCodeAt(0));
      const up = await fetch(`${url}/storage/v1/object/chat-attachments/${path}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': attMime, 'x-upsert': 'true' },
        body: bytes,
      });
      if (up.ok) {
        attachmentUrl = path;
        attachmentType = attType;
        attachmentName = String(body?.attachment_name ?? `whatsapp.${ext}`).slice(0, 120);
      }
    }

    // ── Sohbete ekle ── (lab_id + approval_status trigger'larla otomatik)
    // İçerik temiz kalır; WhatsApp kaynağı external_source/external_sender ile işaretlenir
    // → UI yeşil "WhatsApp" rozeti gösterir, gönderen profile eşleşmezse adı buradan alır.
    const ins = await fetch(`${url}/rest/v1/order_messages`, {
      method: 'POST',
      headers: { ...HJ, Prefer: 'return=representation' },
      body: JSON.stringify({
        work_order_id: matched.id,
        sender_id: senderProfileId,   // null olabilir → trigger 'approved' yapar
        content: text,                // caption olabilir; görselde boş olabilir
        message_type: 'user',
        external_source: 'whatsapp',
        external_sender: (sName || ('+' + phone) || 'WhatsApp').slice(0, 120),
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        attachment_name: attachmentName,
      }),
    });
    if (!ins.ok) {
      return json({ ok: false, matched: true, error: `insert ${ins.status}: ${(await ins.text()).slice(0, 200)}`, work_order_id: matched.id });
    }
    const irows = await ins.json();
    const msgId = Array.isArray(irows) ? irows[0]?.id : irows?.id;
    return json({ ok: true, matched: true, work_order_id: matched.id, order_number: matched.order_number, method, message_id: msgId });

  } catch (e: any) {
    return json({ ok: false, matched: false, error: e?.message ?? String(e) });
  }
});
