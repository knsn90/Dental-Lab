// Siman App Store görselleri → out/01..10.png @ 1290×2796 (iPhone 6.9")
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL_BASE = process.env.SHOOT_URL || 'http://localhost:8915/';
const LANG = process.argv[2] || 'tr';
const OUT = new URL(`./out/${LANG}/`, import.meta.url).pathname;

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] });
const page = await browser.newPage();
await page.setViewport({ width: 1290, height: 2796, deviceScaleFactor: 1 });

await page.goto(`${URL_BASE}?export=1&lang=${LANG}`, { waitUntil: 'networkidle0', timeout: 60000 });
await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
// Export modunu URL'e güvenmeden zorla: `serve` /index.html -> / yönlendirmesinde
// query'yi düşürebiliyor, o zaman paneller önizleme ölçeğinde kalıyor.
await page.evaluate(() => { document.body.className = 'export'; document.body.style.height = ''; });
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 400));

await mkdir(OUT, { recursive: true });
const panels = await page.$$('.panel');
if (panels.length !== 10) throw new Error(`10 panel bekleniyordu, ${panels.length} bulundu`);

for (const [i, panel] of panels.entries()) {
  const n = String(i + 1).padStart(2, '0');
  const box = await panel.boundingBox();
  if (Math.round(box.width) !== 1290 || Math.round(box.height) !== 2796) {
    throw new Error(`panel ${n} ölçüsü yanlış: ${box.width}×${box.height}`);
  }
  // Başlık paneli taşmasın — DE uzun kelimeler, FA farklı font yüzünden gerçek risk
  const fit = await panel.evaluate(el => {
    const c = el.querySelector('.copy'), p = el.getBoundingClientRect(), r = c.getBoundingClientRect();
    return { over: Math.max(0, p.top - r.top) + Math.max(0, r.bottom - p.bottom),
             wide: Math.max(0, p.left - r.left) + Math.max(0, r.right - p.right),
             text: c.textContent.trim().replace(/\s+/g, ' ') };
  });
  if (fit.over > 1 || fit.wide > 1) {
    throw new Error(`panel ${n} [${LANG}] başlık taşıyor (dikey ${fit.over|0}px, yatay ${fit.wide|0}px): "${fit.text}"`);
  }

  await panel.screenshot({ path: `${OUT}${n}.png` });
  console.log(`  ✓ out/${LANG}/${n}.png  1290×2796`);
}

await browser.close();
console.log(`\n${panels.length} görsel hazır → store-assets/out/${LANG}/`);
