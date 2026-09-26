// supabase/functions/_shared/iyzico.ts
//
// iyzico REST API yardımcıları (Deno / edge function).
//
// KİMLİK DOĞRULAMA — IYZWSv2 (HMACSHA256):
//   randomKey  = benzersiz değer (biz: timestamp + rastgele)
//   payload    = randomKey + uriPath + requestBody      (gövde boşsa atlanır)
//   signature  = hex( HMAC_SHA256(payload, secretKey) )
//   authString = "apiKey:<apiKey>&randomKey:<randomKey>&signature:<signature>"
//   Authorization: "IYZWSv2 " + base64(authString)      ← ARADA TEK BOŞLUK
//   + x-iyzi-rnd: randomKey   + Content-Type: application/json
//   Kaynak: docs.iyzico.com/on-hazirliklar/kimlik-dogrulama/hmacsha256
//
// YANIT İMZASI (bizim doğruladığımız):
//   3DS initialize → paymentId:conversationId
//   3DS auth       → paymentId:currency:basketId:conversationId:paidPrice:price
//   hex( HMAC_SHA256(alanlar ":" ile birleştirilmiş, secretKey) )
//   DİKKAT: fiyatlardaki SONDAKİ SIFIRLAR atılır ("10.50" → "10.5"), yoksa
//   imza tutmaz. Değerler YANITTAN alınır, istekten değil.
//
// Ortam: sandbox https://sandbox-api.iyzipay.com · canlı https://api.iyzipay.com
// (tek fark URL; anahtarlar ortamlar arasında TAMAMEN farklıdır.)

export interface IyzicoCreds {
  api_key: string;
  secret_key: string;
  /** Verilmezse sandbox kullanılır — canlıya yanlışlıkla çıkılmasın. */
  base_url?: string;
}

export const IYZICO_SANDBOX = 'https://sandbox-api.iyzipay.com';

function hexEncode(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return hexEncode(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

function randomKey(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `${Date.now()}${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * iyzico'ya imzalı POST. `path` MUTLAKA "/payment/..." biçiminde olmalı —
 * imzaya giren de tam olarak bu yoldur.
 */
export async function iyzicoPost<T = any>(
  creds: IyzicoCreds,
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; http_status: number; data: T | null; error?: string }> {
  const base = (creds.base_url || IYZICO_SANDBOX).replace(/\/+$/, '');
  const payload = JSON.stringify(body);
  const rnd = randomKey();
  const signature = await hmacHex(creds.secret_key, rnd + path + payload);
  const authString = `apiKey:${creds.api_key}&randomKey:${rnd}&signature:${signature}`;
  const authHeader = 'IYZWSv2 ' + btoa(authString);

  let resp: Response;
  try {
    resp = await fetch(base + path, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'x-iyzi-rnd': rnd,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: payload,
    });
  } catch (e) {
    return { ok: false, http_status: 0, data: null, error: `iyzico bağlantı hatası: ${String(e)}` };
  }

  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* JSON değilse ham metin */ }

  if (!data) {
    return { ok: false, http_status: resp.status, data: null, error: `iyzico yanıtı okunamadı (${resp.status})` };
  }
  return { ok: resp.ok && data.status === 'success', http_status: resp.status, data };
}

/** Fiyatı iyzico'nun beklediği biçime getirir: "35" → "35.0", "35.50" → "35.5" */
export function iyziPrice(n: number | string): string {
  const num = Number(n) || 0;
  // İki hane yuvarla, sonra sondaki sıfırları at ama en az bir ondalık bırak.
  let s = num.toFixed(2);
  s = s.replace(/0+$/, '');
  if (s.endsWith('.')) s += '0';
  return s;
}

/** İmza karşılaştırması için: sondaki sıfırlar atılır ("10.50" → "10.5"). */
function trimZeros(v: unknown): string {
  const s = String(v ?? '');
  if (!s.includes('.')) return s;
  const t = s.replace(/0+$/, '');
  return t.endsWith('.') ? t.slice(0, -1) : t;
}

/** Sabit zamanlı dize karşılaştırma (imza sızdırmamak için). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 3DS initialize yanıt imzası: paymentId:conversationId
 * İmza alanı yoksa FALSE döner (fail closed) — çağıran buna göre karar verir.
 */
export async function verifyInitSignature(secret: string, res: any): Promise<boolean> {
  const given = String(res?.signature ?? '');
  if (!given) return false;
  const expected = await hmacHex(secret, [res.paymentId, res.conversationId].map(trimZeros).join(':'));
  return timingSafeEqual(expected, given);
}

/**
 * 3DS auth (tamamlama) yanıt imzası:
 *   paymentId:currency:basketId:conversationId:paidPrice:price
 */
export async function verifyAuthSignature(secret: string, res: any): Promise<boolean> {
  const given = String(res?.signature ?? '');
  if (!given) return false;
  const expected = await hmacHex(secret, [
    res.paymentId, res.currency, res.basketId, res.conversationId, res.paidPrice, res.price,
  ].map(trimZeros).join(':'));
  return timingSafeEqual(expected, given);
}
