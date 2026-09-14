// _shared/security.ts
//
// Ortak güvenlik yardımcıları (edge functions).
//   • timingSafeEqualStr — sabit-zamanlı string/hex karşılaştırma
//   • hmacSha256Hex / hmacSha256Base64 — Web Crypto HMAC-SHA256
//   • verifyMetaSignature — Meta X-Hub-Signature-256 doğrulama (ham gövde üzerinden)
//   • isServiceRoleBearer — dahili çağrı için service-role bearer eşleşmesi (sabit-zamanlı)
//
// TÜM secret/imza karşılaştırmaları BURADAN geçmeli; ham `===`/`!==` kullanma.

/**
 * Sabit-zamanlı eşitlik. Uzunluk farkı erken döner (uzunluk gizli veri değildir);
 * eşit uzunlukta içerik XOR ile birikimli karşılaştırılır → içerik sızdırmaz.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(String(a ?? ''));
  const eb = new TextEncoder().encode(String(b ?? ''));
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // @ts-ignore btoa is a Deno/edge global
  return btoa(binary);
}

async function hmacRaw(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

/** HMAC-SHA256(secret, message) → lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  return toHex(await hmacRaw(secret, message));
}

/** HMAC-SHA256(secret, message) → base64. */
export async function hmacSha256Base64(secret: string, message: string): Promise<string> {
  return toBase64(await hmacRaw(secret, message));
}

/**
 * Meta (WhatsApp/Facebook) X-Hub-Signature-256 doğrulaması.
 * header biçimi: "sha256=<hex>". İmza HAM gövde üzerinden appSecret ile hesaplanır.
 * Secret boşsa FAIL CLOSED (false). Karşılaştırma sabit-zamanlı.
 */
export async function verifyMetaSignature(
  rawBody: string,
  headerValue: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret) return false;                       // fail closed: secret yok
  const hdr = String(headerValue ?? '').trim();
  if (!hdr.startsWith('sha256=')) return false;       // eksik/hatalı biçim
  const given = hdr.slice('sha256='.length).trim();
  if (!given) return false;
  const expected = await hmacSha256Hex(appSecret, rawBody);
  return timingSafeEqualStr(expected, given);
}

/**
 * Dahili (server→server) çağrı: Authorization bearer service-role anahtarına
 * sabit-zamanlı eşit mi? service-role anahtarı GİZLİDİR (anon gibi herkese açık
 * değil) → geçerli bir dahili güven çıpasıdır.
 */
export function isServiceRoleBearer(authHeader: string | null, serviceRoleKey: string): boolean {
  if (!serviceRoleKey) return false;
  const got = String(authHeader ?? '');
  return timingSafeEqualStr(got, `Bearer ${serviceRoleKey}`);
}
