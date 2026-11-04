/**
 * pushData — push bildiriminin `data` alanı (telefon: expo, tarayıcı: sw.js).
 *
 * Dokununca açılacak bağlantıyı iki alıcı da `data.url`'den okur
 * (core/notifications/nativePush.ts, public/sw.js). DB göndericileri
 * (_notify_channels, _notify_inapp_push ve günlük/tarama/prova bildirimleri)
 * ise bağlantıyı `payload.actionUrl`'e koyar, `data` hiç göndermez. Bu yüzden
 * telefonda dokunmak hiçbir yere gitmiyor, tarayıcıda ana sayfayı açıyordu.
 *
 * Kural: `data.url` doluysa (istemci göndericisi, core/notifications/dispatch.ts)
 * olduğu gibi kalır. Boşsa `actionUrl` yalnız uygulama içi yol ise ('/' ile
 * başlayan, '//' ile başlamayan) `data.url` olur; dış adres taşınmaz.
 *
 * Saf modül — Deno edge fonksiyonları ve node --test aynı dosyayı kullanır.
 */
export interface PushPayloadLike {
  data?: Record<string, unknown> | null;
  actionUrl?: string | null;
  [k: string]: unknown;
}

function inAppPath(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s.startsWith('/') || s.startsWith('//')) return null;
  return s;
}

export function pushData(payload: PushPayloadLike): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(payload.data ?? {}) };
  const current = typeof data.url === 'string' ? data.url.trim() : '';
  if (current) return data;
  delete data.url;
  const url = inAppPath(payload.actionUrl);
  if (url) data.url = url;
  return data;
}
