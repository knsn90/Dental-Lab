// scripts/gen-og-cover.mjs
// siman.app sosyal paylaşım (Open Graph) kapağı — 1200×630 PNG üretir.
// WhatsApp/Telegram/Twitter büyük kart önizlemesi için. public/og-cover.png'e yazar.
// Çalıştır: node scripts/gen-og-cover.mjs   (puppeteer-core + sistem Chrome)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Logo SVG'yi inline göm (mavi gradient, beyaz kutuda net görünür)
let logo = fs.readFileSync(path.join(ROOT, 'assets/images/siman-logo.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace('<svg ', '<svg style="width:150px;height:150px;display:block" ');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden}
  .wrap{width:1200px;height:630px;display:flex;align-items:center;gap:64px;padding:0 96px;
    background:linear-gradient(135deg,#28316f 0%,#1b2350 55%,#131a3b 100%);
    font-family:-apple-system,'SF Pro Display','Segoe UI',system-ui,sans-serif;position:relative;overflow:hidden}
  .orb1{position:absolute;right:-140px;top:-140px;width:460px;height:460px;border-radius:50%;background:rgba(84,141,202,.16)}
  .orb2{position:absolute;left:-90px;bottom:-120px;width:300px;height:300px;border-radius:50%;background:rgba(0,0,0,.12)}
  .chip{width:240px;height:240px;border-radius:52px;background:#fff;display:flex;align-items:center;justify-content:center;
    flex-shrink:0;box-shadow:0 24px 70px rgba(0,0,0,.38);z-index:1}
  .txt{color:#fff;z-index:1}
  .brand{font-size:88px;font-weight:800;letter-spacing:-2.5px;line-height:1}
  .tag{font-size:31px;font-weight:600;margin-top:20px;color:#d3ddf1}
  .sub{font-size:22px;margin-top:14px;color:#9fb0d6}
  .url{font-size:23px;margin-top:36px;color:#8aa0d6;font-weight:700;letter-spacing:.3px}
</style></head><body>
  <div class="wrap">
    <div class="orb1"></div><div class="orb2"></div>
    <div class="chip">${logo}</div>
    <div class="txt">
      <div class="brand">Siman</div>
      <div class="tag">Dijital Diş Laboratuvarı Yönetimi</div>
      <div class="sub">Sipariş · Üretim · Teslimat · Finans — tek platformda</div>
      <div class="url">siman.app</div>
    </div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0' });
const out = path.join(ROOT, 'public/og-cover.png');
await page.screenshot({ path: out, type: 'png' });
await browser.close();
const kb = (fs.statSync(out).size / 1024).toFixed(1);
console.log(`✓ og-cover.png üretildi (${kb} KB) → ${out}`);
