// Panel 10: giriş ekranı + dil menüsü açık. Oturumsuz, ayrı profil.
import puppeteer from 'puppeteer';
const LANG = process.argv[2] || 'tr';
const OUT = new URL(`./shots/${LANG}/10.png`, import.meta.url).pathname;

const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--lang=tr-TR'] });
const p = await br.newPage();
await p.setViewport({ width: 440, height: 908, deviceScaleFactor: 3 });
await p.goto('https://siman.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });

for (let i = 0; i < 40; i++) {
  const hazir = await p.evaluate(() => !!document.querySelector('input[type=password]')).catch(() => false);
  if (hazir) break;
  await new Promise(r => setTimeout(r, 1000));
}
await p.evaluate((l) => { localStorage.setItem('app_lang_v1', l); localStorage.setItem('app_lang_explicit_v1', '1'); }, LANG);
await p.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));

// dil seçicisini bul ve aç
const kutu = await p.evaluate(() => {
  const ad = { tr: 'Türkçe', en: 'English', de: 'Deutsch', fa: 'فارسی' };
  const hedef = Object.values(ad);
  const e = [...document.querySelectorAll('*')]
    .filter(el => el.children.length <= 2 && hedef.includes((el.textContent || '').trim()))
    .map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(o => o.r.width > 20 && o.r.height > 10)
    .sort((a, b) => b.r.top - a.r.top)[0];       // sayfanın en altındaki = dil şeridi
  if (!e) return null;
  const r = e.el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
if (kutu) { await p.mouse.click(kutu.x, kutu.y); await new Promise(r => setTimeout(r, 1800)); }

const acik = await p.evaluate(() => {
  const t = document.body.innerText;
  return ['Türkçe','English','Deutsch','فارسی'].filter(x => t.includes(x)).length >= 3;
});
console.log(acik ? '  · dil menüsü açık (4 dil görünür)' : '  ⚠ dil menüsü AÇILMADI');

await p.screenshot({ path: OUT });
await br.close();
console.log(`  ✓ ${OUT.split('/').slice(-3).join('/')}`);
