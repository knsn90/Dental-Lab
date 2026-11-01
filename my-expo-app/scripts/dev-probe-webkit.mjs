// dev-probe-webkit.mjs — iOS Safari (WebKit) ile web hatası yeniden üretme.
//
// NEDEN: iOS'taki mobil web hatalarının çoğu Chrome'da GÖRÜNMÜYOR (backdrop-filter,
// stacking, flex davranışları). Bu betik Playwright WebKit + iPhone profiliyle açar.
// Gerçek giriş GEREKMEZ: Supabase istekleri sahte yanıtlarla karşılanır, oturum
// localStorage'a sahte JWT ile yazılır (supabase-js imzayı istemcide doğrulamaz).
//
// Kurulum (tek sefer):  npx playwright install webkit
//
// Yerel kodu test:
//   npx expo export -p web --output-dir <scratch>/webdist   (dist/'e DOKUNMA)
//   node scripts/dev-probe-webkit.mjs "/(lab)/" <out.png>
// Canlı siteyi test:
//   PROBE_BASE=https://siman.app node scripts/dev-probe-webkit.mjs "/(lab)/" <out.png>
// Profil düzenleme modalini açar:  PROBE_OPEN_EDIT=1
//
// Çıktı: tam ekran + üst 120px kırpımı ve logo/blur-şerit z-index ölçümü.
import { webkit, devices } from '/Users/saber/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const SCRATCH = '/private/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/48baacc3-30c1-4eb3-99d5-f15156b06eef/scratchpad';
const DIST  = resolve(`${SCRATCH}/webdist`);
const ROUTE = process.argv[2] ?? '/(lab)/';
const OUT   = process.argv[3] ?? `${SCRATCH}/wk.png`;
const PORT  = 8793;

const MIME = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.ttf':'font/ttf', '.ico':'image/x-icon' };
const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(DIST, url);
    if (!extname(url) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise(r => server.listen(PORT, r));

const LAB_ID = '243ef1db-9853-424b-8292-0025abfca436';
const UID    = 'f6817e96-2aab-443f-8cb3-02b7718f18e4';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg:'HS256', typ:'JWT' })}.${b64({ sub: UID, role:'authenticated', exp: Math.floor(Date.now()/1000)+86400, email:'test@example.com' })}.sig`;
const PROFILE = { id: UID, email:'test@example.com', full_name:'Kaan Esen', user_type:'lab', role:'manager',
  lab_id: LAB_ID, clinic_id:null, phone:'+905342649620', whatsapp_phone:'+905342649620', city:'İstanbul',
  address:'Atatürk mah.', birth_date:'1990-07-18', gender:'male', is_active:true, approval_status:'approved',
  avatar_url:null, created_at:'2026-01-01T00:00:00Z', notification_prefs:null, tc_kimlik:null, specialty:null,
  diploma_no:null, department:null };
const LAB = { id: LAB_ID, name:'Nexadent', setup_completed_at:'2026-01-01T00:00:00Z', logo_url:'https://siman.app/icons/icon-192.png', currency:'TRY' };
const LAB_SETTINGS = { lab_id: LAB_ID, id: LAB_ID, region:'TR', base_currency:'TRY' };

const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'], locale: 'tr-TR' });
await ctx.addInitScript(([token]) => {
  localStorage.setItem('sb-kjwjxqfdsxkxgcgophdy-auth-token', token);
}, [JSON.stringify({ access_token: jwt, token_type:'bearer', expires_in: 86400,
  expires_at: Math.floor(Date.now()/1000)+86400, refresh_token:'fake',
  user:{ id: UID, aud:'authenticated', role:'authenticated', email:'test@example.com', user_metadata:{}, app_metadata:{} } })]);

await ctx.route('**://*.supabase.co/**', async (route) => {
  const u = route.request().url();
  const accept = route.request().headers()['accept'] ?? '';
  const one = accept.includes('pgrst.object');
  const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  if (u.includes('/auth/v1/user'))  return json({ id: UID, aud:'authenticated', email:'test@example.com', user_metadata:{}, app_metadata:{} });
  if (u.includes('/auth/v1/token')) return json({ access_token: jwt, refresh_token:'fake', expires_in:86400, user:{ id: UID, email:'test@example.com' } });
  if (u.includes('/rest/v1/profiles'))     return json(one ? PROFILE : [PROFILE]);
  if (u.includes('/rest/v1/labs'))         return json(one ? LAB : [LAB]);
  if (u.includes('/rest/v1/lab_settings')) return json(one ? LAB_SETTINGS : [LAB_SETTINGS]);
  return json([]);
});

const page = await ctx.newPage();
const BASE = process.env.PROBE_BASE ?? `http://localhost:${PORT}`;
await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
await page.waitForTimeout(5000);
// Profil düzenleme modalını aç (ekran görüntüsünden önce) — "ekle +" satırına tıkla
if (process.env.PROBE_OPEN_EDIT === '1') {
  for (const label of ['Telefon ekle', 'Doğum tarihi ekle', 'Adres ekle', 'Şehir']) {
    const el = page.getByText(label, { exact: false }).first();
    if (await el.count().catch(() => 0)) { await el.click({ timeout: 3000 }).catch(() => {}); break; }
  }
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: OUT });
await page.screenshot({ path: OUT.replace('.png', '-top.png'), clip: { x: 0, y: 0, width: 393, height: 120 } });
console.log('WebKit ekran görüntüsü:', OUT);

const info = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img')];
  const logo = imgs.find(i => (i.src || '').includes('icon-192'));
  const strip = [...document.querySelectorAll('*')].find(e => {
    const c = getComputedStyle(e); const bf = c.backdropFilter || c.webkitBackdropFilter;
    return bf && bf !== 'none' && e.getBoundingClientRect().top < 10;
  });
  const z = (e) => e ? getComputedStyle(e).zIndex : null;
  return {
    logo: logo ? { rect: logo.getBoundingClientRect().toJSON(), zParent: z(logo.parentElement), zSelf: z(logo) } : null,
    strip: strip ? { rect: strip.getBoundingClientRect().toJSON(), z: z(strip),
                     bf: (getComputedStyle(strip).backdropFilter || getComputedStyle(strip).webkitBackdropFilter),
                     mask: (getComputedStyle(strip).webkitMaskImage || 'none').slice(0, 40) } : null,
  };
});
console.log(JSON.stringify(info, null, 1));

await browser.close();
server.close();
