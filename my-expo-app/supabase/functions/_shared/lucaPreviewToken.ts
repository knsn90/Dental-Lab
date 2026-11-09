// Önizleme jetonu — gerçek e-fatura YALNIZ önizlenen içerikle gönderilir.
//
// Kullanıcı kuralı (2026-10-21): "hiçbir zaman direkt gerçek faturaya geçmeyelim, önce
// önizleme". Luca'da taslak işlemi yok (Send = anında GİB), bu yüzden kapı sunucuda:
//   preview → faturayı gönderilecek haliyle kurar, içeriğin özetini + son kullanma
//             zamanını HMAC ile imzalar, istemciye jeton verir;
//   send    → jeton yoksa / süresi dolduysa / fatura önizlemeden sonra değiştiyse
//             (tutar, kalem, kur, alıcı, tür…) Luca'ya HİÇ gitmeden reddeder.
// Böylece gönderilen içerik, kullanıcının onayladığı içerikle birebir aynıdır.
// Deno (edge) ve Node (test) ortak: yalnız Web Crypto kullanır.

export const PREVIEW_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Anahtarları sıralı, tanımsız alanları atılmış JSON — aynı içerik = aynı metin. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonicalJson(x))).join(',')}]`;
  const keys = Object.keys(v as Record<string, unknown>)
    .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`).join(',')}}`;
}

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

export async function previewDigest(content: unknown): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(canonicalJson(content))));
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Jeton: `<sonKullanmaMs>.<hmac(faturaId.özet.sonKullanma)>` */
export async function signPreviewToken(secret: string, invoiceId: string, digest: string, expiresAtMs: number): Promise<string> {
  return `${expiresAtMs}.${await hmac(secret, `${invoiceId}.${digest}.${expiresAtMs}`)}`;
}

export type PreviewTokenCheck = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' };

export async function verifyPreviewToken(
  secret: string, token: string | null | undefined, invoiceId: string, digest: string, nowMs: number,
): Promise<PreviewTokenCheck> {
  if (!token) return { ok: false, reason: 'missing' };
  const m = /^(\d{10,16})\.([0-9a-f]{64})$/.exec(String(token));
  if (!m) return { ok: false, reason: 'malformed' };
  const expiresAt = Number(m[1]);
  if (nowMs > expiresAt) return { ok: false, reason: 'expired' };
  const expected = await hmac(secret, `${invoiceId}.${digest}.${expiresAt}`);
  return safeEqual(expected, m[2]) ? { ok: true } : { ok: false, reason: 'mismatch' };
}

export type LucaLineMode = 'kalem' | 'birlesik';

/** lab_settings.efatura_line_mode → güvenli değer; bilinmeyen/boş/okunamadı = 'kalem'. */
export function normalizeLineMode(v: unknown): LucaLineMode {
  return v === 'birlesik' ? 'birlesik' : 'kalem';
}

/**
 * Önizleme jetonunun özetlenen içeriği (efatura-luca preview/send/merge_*).
 * input = buildLucaInput ÇIKTISI → birleşik modda birleştirilmiş satırlar + "İş dökümü" notu özetin
 * içindedir (gönderilen = önizlenen). externalCode hariç (yeniden denemede değişir).
 * 'kalem' modunda şekil bu özellikten önceki ile birebir aynı (eski jetonlar geçerli kalır);
 * 'birlesik' modunda lineMode + consolidated eklenir → önizleme ile gönderim arasında ayar
 * değişirse (satırlar aynı kalsa bile) özet tutmaz ve gönderim "içerik değişti" ile reddedilir.
 */
export function lucaDigestContent(a: {
  env: string; kind: string; currency: string; crossRate: number | null;
  input: Record<string, unknown>; lineMode?: LucaLineMode; consolidated?: boolean;
}): Record<string, unknown> {
  return {
    env: a.env, kind: a.kind, currency: a.currency, crossRate: a.crossRate,
    input: { ...a.input, externalCode: undefined },
    ...(a.lineMode === 'birlesik' ? { lineMode: 'birlesik', consolidated: a.consolidated === true } : {}),
  };
}
