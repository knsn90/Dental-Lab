// Luca (TÜRMOB) e-fatura SOAP proxy'si.
//
// Neden var: Luca yalnız whitelist'teki statik IP'den (bu VPS: 93.127.213.200)
// gelen çağrıları kabul eder; Supabase edge function'larının çıkış IP'si sabit
// değil. Edge function → (HMAC imzalı) → Caddy /luca/* → bu servis → Luca.
//
//   POST /luca/<test|prod>/<InvoiceService|AddressBookService>
//     X-Luca-Ts:  unix saniye
//     X-Luca-Sig: hex HMAC-SHA256(LUCA_PROXY_SECRET, ts\npath\nSOAPAction\nsha256(body))
//     SOAPAction: http://tempuri.org/I<Servis>/<İşlem>
//   GET  /luca/healthz
//
// Ortam: LUCA_PROXY_SECRET (≥32 karakter) · LUCA_VKN_TEST / LUCA_VKN_PROD (virgüllü)
//        · LUCA_PROD_ENABLED=true (canlı IP tanımı gelene kadar kapalı)

import http from 'node:http';
import dns from 'node:dns';
import { verifySignature, parseRoute, checkPolicy } from './lib.mjs';

dns.setDefaultResultOrder('ipv4first'); // Luca whitelist'i IPv4

const SECRET = process.env.LUCA_PROXY_SECRET ?? '';
if (SECRET.length < 32) {
  console.error('LUCA_PROXY_SECRET eksik ya da kısa (≥32)');
  process.exit(1);
}
const vknSet = (v) => new Set(String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const ALLOWED_VKN = { test: vknSet(process.env.LUCA_VKN_TEST), prod: vknSet(process.env.LUCA_VKN_PROD) };
const PROD_ENABLED = process.env.LUCA_PROD_ENABLED === 'true';
const UPSTREAM = {
  test: 'https://einvoiceserviceturmobtest.luca.com.tr',
  prod: 'https://einvoiceserviceturmob.luca.com.tr',
};
const PORT = 8080;
const MAX_BODY = 5 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;
const RATE_PER_MIN = 60;

// Aynı imzanın 5 dk içinde ikinci kez kullanılması (replay) reddedilir.
const seenSigs = new Map(); // sig → bitiş (ms)
const recent = [];          // son istek zamanları (ms)

function log(entry) {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
}

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('gövde çok büyük'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url ?? '/', 'http://x');
  const client = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();

  if (req.method === 'GET' && url.pathname === '/luca/healthz') return reply(res, 200, { ok: true });

  const route = req.method === 'POST' ? parseRoute(url.pathname) : null;
  if (!route) return reply(res, 404, { ok: false, error: 'bulunamadı' });

  const deny = (status, reason, extra = {}) => {
    log({ ev: 'deny', status, reason, client, path: url.pathname, ...extra });
    reply(res, status, { ok: false, error: reason });
  };

  const now = Date.now();
  while (recent.length && now - recent[0] > 60_000) recent.shift();
  if (recent.length >= RATE_PER_MIN) return deny(429, 'hız sınırı');
  recent.push(now);

  let body;
  try { body = await readBody(req); } catch (e) { return deny(e.status ?? 400, e.message); }

  const soapAction = String(req.headers.soapaction ?? '');
  const ts = String(req.headers['x-luca-ts'] ?? '');
  const sig = String(req.headers['x-luca-sig'] ?? '');
  const v = verifySignature({ secret: SECRET, ts, sig, path: url.pathname, soapAction, body, now: Math.floor(now / 1000) });
  if (!v.ok) return deny(401, v.reason);

  for (const [k, exp] of seenSigs) if (exp < now) seenSigs.delete(k);
  if (seenSigs.has(sig)) return deny(401, 'tekrarlanan istek');
  seenSigs.set(sig, now + 2 * 300_000);

  if (route.env === 'prod' && !PROD_ENABLED) return deny(403, 'canlı ortam kapalı');

  const text = body.toString('utf8');
  const p = checkPolicy({ service: route.service, soapAction, body: text, allowedVkn: ALLOWED_VKN[route.env] });
  if (!p.ok) return deny(403, p.reason, { env: route.env, service: route.service });

  const target = `${UPSTREAM[route.env]}/${route.service}/ServiceContract/${route.service}.svc`;
  try {
    const up = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"http://tempuri.org/I${route.service}/${p.op}"` },
      body,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const out = Buffer.from(await up.arrayBuffer());
    log({ ev: 'call', env: route.env, service: route.service, op: p.op, vkn: p.vkns, status: up.status, ms: Date.now() - started, bytes: out.length, client });
    res.writeHead(up.status, { 'Content-Type': up.headers.get('content-type') ?? 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(out);
  } catch (e) {
    log({ ev: 'upstream_error', env: route.env, op: p.op, error: String(e?.message ?? e), ms: Date.now() - started });
    reply(res, 502, { ok: false, error: 'Luca servisine ulaşılamadı' });
  }
});

server.listen(PORT, () => log({ ev: 'start', port: PORT, prod: PROD_ENABLED, vknTest: [...ALLOWED_VKN.test], vknProd: [...ALLOWED_VKN.prod] }));
