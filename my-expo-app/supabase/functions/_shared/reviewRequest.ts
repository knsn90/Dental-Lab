// _shared/reviewRequest.ts
//
// WhatsApp puan isteği (spec: docs/superpowers/specs/2026-11-03-whatsapp-puan-istegi-design.md).
// Saf yardımcılar — içe aktarma yok; send-review-request ve whatsapp-webhook kullanır,
// node --test ile sınanır.
//
// Düğme yükü: review:<review_requests.id>:<puan>. Puan yalnız 5 (Sorunsuz), 3 (Küçük
// düzeltme), 1 (Sorun var). Düğme sırası Meta'daki is_degerlendirme şablonuyla birebir.

export type ReviewScore = 5 | 3 | 1;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PAYLOAD_RE = new RegExp(`^review:(${UUID}):([135])$`, 'i');
const SCORES: ReviewScore[] = [5, 3, 1];

export function reviewButtonPayload(requestId: string, score: ReviewScore): string {
  return `review:${requestId}:${score}`;
}

export function parseReviewPayload(p: unknown): { requestId: string; score: ReviewScore } | null {
  if (typeof p !== 'string') return null;
  const m = PAYLOAD_RE.exec(p.trim());
  if (!m) return null;
  return { requestId: m[1].toLowerCase(), score: Number(m[2]) as ReviewScore };
}

export type InboundKind =
  | { kind: 'review_button'; requestId: string; score: ReviewScore }
  | { kind: 'review_invalid' }
  | { kind: 'text'; text: string }
  | { kind: 'other' };

// Meta şablonundaki hızlı cevap düğmesi type:'button' + button.payload ile gelir;
// etkileşimli mesaj yanıtları interactive.button_reply.id taşır — ikisi de denenir.
export function classifyInbound(msg: any): InboundKind {
  const raw = msg?.type === 'button' ? msg?.button?.payload : msg?.interactive?.button_reply?.id;
  if (typeof raw === 'string' && raw.trim().toLowerCase().startsWith('review:')) {
    const parsed = parseReviewPayload(raw);
    return parsed ? { kind: 'review_button', ...parsed } : { kind: 'review_invalid' };
  }
  if (msg?.type === 'text') {
    const text = String(msg?.text?.body ?? '').trim();
    if (text) return { kind: 'text', text };
  }
  return { kind: 'other' };
}

// Hekime yanıt (spec §10). Lab adı yoksa genel ifade.
export function doctorReplyFor(score: ReviewScore, labName: string): string {
  const lab = String(labName ?? '').trim() || 'laboratuvar';
  if (score === 5) return `Teşekkür ederiz. Cevabınızı ${lab} ekibine ilettik.`;
  return `Teşekkür ederiz, cevabınızı ${lab} ekibine ilettik. Ekip sizinle iletişime geçecek. ` +
    'İsterseniz sorunu kısaca bu mesaja yazın; siparişe eklenir.';
}

// DB'deki _review_work_type_label ile aynı kural: virgüllü parçalar tekilleşir
// (ilk görülme sırası), 60 karakterde kesilir, boşsa '—'.
export function workTypeLabel(raw: string | null): string {
  const parts: string[] = [];
  for (const x of String(raw ?? '').split(',')) {
    const t = x.trim();
    if (t && !parts.includes(t)) parts.push(t);
  }
  const s = parts.join(', ');
  if (!s) return '—';
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

// send-whatsapp-meta normalizePhoneTR ile aynı kural (o dosya değişmez).
export function normalizePhoneTR(raw: unknown): string {
  const d = String(raw ?? '').replace(/[^\d]/g, '');
  if (!d) return '';
  if (d.startsWith('90') && d.length === 12) return d;
  if (d.startsWith('0') && d.length === 11) return '90' + d.slice(1);
  if (d.length === 10 && d.startsWith('5')) return '90' + d;
  return d;
}

// Meta şablon değişkeni: boş olamaz, sekme/yeni satır/4+ boşluk olamaz.
function clean(v: unknown): string {
  const s = String(v ?? '').replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return s.length ? s.slice(0, 200) : '—';
}

export function buildReviewTemplateMessage(o: {
  to: string; requestId: string; patient: string | null; orderNumber: string; workType: string | null;
}): Record<string, unknown> {
  return {
    messaging_product: 'whatsapp',
    to: o.to,
    type: 'template',
    template: {
      name: 'is_degerlendirme',
      language: { code: 'tr' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', parameter_name: 'hasta_adi', text: clean(o.patient) },
            { type: 'text', parameter_name: 'siparis_no', text: clean(o.orderNumber) },
            { type: 'text', parameter_name: 'is_turu', text: clean(workTypeLabel(o.workType)) },
          ],
        },
        ...SCORES.map((score, i) => ({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(i),
          parameters: [{ type: 'payload', payload: reviewButtonPayload(o.requestId, score) }],
        })),
      ],
    },
  };
}
