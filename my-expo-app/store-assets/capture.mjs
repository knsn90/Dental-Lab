// Siman ekranlarını gerçek uygulamadan yakalar.
// Oturum, kalıcı Chrome profilinde durur — token hiçbir yere kopyalanmaz.
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const PROFILE = '/tmp/claude-501/-Users-saber-Desktop-DentalSoftware/e0312d2d-06db-4180-a347-d2eede359e97/scratchpad/siman-chrome';
const LANG = process.argv[2] || 'tr';
const OUT = new URL(`./shots/${LANG}/`, import.meta.url).pathname;
const ORDER = '53f2d174-2fee-472e-8fe8-7fd1bbfe17bf';

const ROUTES = [
  ['01', '/',                      'panel',    'Ana pano'],
  ['02', '/new-order',             'panel',    'Yeni sipariş'],
  ['03', '/order/0cf706a3-a7f4-4d84-a26b-fa3592310308', 'tarama', '3D tarama'],
  ['04', `/order/${ORDER}`,        'panel',    'Sipariş aşamaları'],
  ['05', '/courier-tracking',      'panel',    'Kurye haritası'],
  ['06', '/production',            'panel',    'Üretim panosu'],
  ['07', '/performance',           'panel',    'Teknisyen performansı'],
  ['08', '/finance',               'panel',    'Finans'],
  ['09', '/messages',              'ilkSohbet','Sipariş sohbeti'],
  ['10', '/settings',              'panel',    'Ayarlar / dil'],
];

const browser = await puppeteer.launch({
  headless: false,
  userDataDir: PROFILE,
  defaultViewport: { width: 440, height: 908, deviceScaleFactor: 3 },
  args: ['--window-size=520,1000', '--lang=tr-TR'],
});
const page = (await browser.pages())[0] || await browser.newPage();
// 440x909: şablondaki görsel alanının (772x1594) oranına birebir eşit → kırpma yok
await page.setViewport({ width: 440, height: 908, deviceScaleFactor: 3 });

await page.goto('https://siman.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });

// Uygulama hidrasyonunu bekle: React ağacı dolana kadar hiçbir karar verme
const hidreOldu = async () => page.evaluate(() =>
  document.body && document.body.innerText.trim().length > 20).catch(() => false);
for (let i = 0; i < 60 && !(await hidreOldu()); i++) await new Promise(r => setTimeout(r, 1000));

// Giriş bekle — token'a DOKUNMADAN, sadece "login ekranında mıyız" diye bak
const girisVarMi = async () => page.evaluate(() =>
  document.body.innerText.trim().length > 20 &&
  !document.querySelector('input[type=password]') &&
  !location.pathname.startsWith('/login')).catch(() => false);
if (!(await girisVarMi())) {
  console.log('\n  ⏳ Chrome penceresi açıldı. Lütfen giriş yap (e-posta alanı dolu gelir).');
  console.log('     Giriş yapılınca otomatik devam edecek — en fazla 10 dk beklerim.\n');
  try {
    await page.evaluate(() => {
      const e = document.querySelector('input[type=email]');
      if (e && !e.value) {
        const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        s.call(e, 'iyzico.demo@siman.app');
        e.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  } catch {}
  const bitis = Date.now() + 10 * 60 * 1000;
  while (Date.now() < bitis) {
    await new Promise(r => setTimeout(r, 2000));
    if (await girisVarMi().catch(() => false)) break;
  }
  if (!(await girisVarMi())) { console.error('  ✗ Giriş algılanmadı, çıkılıyor.'); await browser.close(); process.exit(1); }
}
// Uygulama dilini zorla — temiz profilde İngilizce açılıyor, karışık dilli ekran çıkıyor
await page.evaluate((l) => {
  localStorage.setItem('app_lang_v1', l);
  localStorage.setItem('app_lang_explicit_v1', '1');
}, LANG);
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 4000));
const aktifDil = await page.evaluate(() => localStorage.getItem('app_lang_v1'));
if (aktifDil !== LANG) { console.error(`  ✗ dil ${LANG} olarak ayarlanamadı (${aktifDil})`); await browser.close(); process.exit(1); }
console.log(`  ✓ Oturum açık · dil=${aktifDil} · yakalamaya başlıyorum\n`);

await mkdir(OUT, { recursive: true });
for (const [n, route, aksiyon, ad] of ROUTES) {
  try {
    await page.goto('https://siman.app' + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // realtime websocket yüzünden networkidle hiç gelmiyor → içerik dolana kadar bekle
    for (let i = 0; i < 25; i++) {
      const hazir = await page.evaluate(() => document.body.innerText.trim().length > 60).catch(() => false);
      if (hazir) break;
      await new Promise(r => setTimeout(r, 800));
    }
    await new Promise(r => setTimeout(r, 3000));            // animasyon + veri

    if (aksiyon === 'tarama') {
      // 3D görüntüleyici ayrı sayfa değil; dosya listesinden açılıyor
      for (let tur = 0; tur < 3 && !(await page.evaluate(() =>
            /FPS|mesh|3D Viewer/i.test(document.body.innerText)).catch(() => false)); tur++) {
        const kutu = await page.evaluate(() => {
          const e = [...document.querySelectorAll('*')]
            .filter(el => /\.stl|\.ply|3D|Tarama/i.test(el.textContent || '') && el.children.length < 8)
            .map(el => ({ el, r: el.getBoundingClientRect() }))
            .filter(o => o.r.width > 40 && o.r.height > 16 && o.r.top > 0)
            .sort((a, b) => a.r.top - b.r.top)[0];
          if (!e) return null;
          e.el.scrollIntoView({ block: 'center' });
          const r = e.el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }).catch(() => null);
        if (!kutu) break;
        await page.mouse.click(kutu.x, kutu.y);
        await new Promise(r => setTimeout(r, 4500));
      }
      const acik = await page.evaluate(() =>
        /FPS|mesh|3D Viewer/i.test(document.body.innerText)).catch(() => false);
      console.log(acik ? `    · ${n}: 3D görüntüleyici açıldı` : `    ⚠ ${n}: görüntüleyici AÇILMADI`);
      if (acik) await new Promise(r => setTimeout(r, 3000));   // mesh yüklensin
    }

    if (aksiyon === 'ilkSohbet') {
      // RNW sentetik click'i yutuyor → gerçek fare tıklaması gerek
      const kutu = await page.evaluate(() => {
        const e = [...document.querySelectorAll('*')]
          .filter(el => /#LAB-\d{4}-\d{4}/.test(el.textContent || '') && el.children.length < 12)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }).catch(() => null);

      if (kutu) { await page.mouse.click(kutu.x, kutu.y); await new Promise(r => setTimeout(r, 4000)); }

      // SONUCU doğrula — tıklamanın gönderilmiş olması açıldığı anlamına gelmez
      const sohbetAcik = await page.evaluate(() =>
        /Mesaj yaz|SABİTLENDİ|İş Özeti/i.test(document.body.innerText)).catch(() => false);
      if (!sohbetAcik) console.log(`    ⚠ ${n}: sohbet AÇILMADI, gelen kutusu çekiliyor`);
      else console.log(`    · ${n}: sohbet açıldı`);
    }

    await page.screenshot({ path: `${OUT}${n}.png` });
    console.log(`  ✓ ${n}.png  ${ad}  (${route})`);
  } catch (e) {
    console.log(`  ✗ ${n}    ${ad}  (${route}) — ${String(e.message).slice(0, 70)}`);
  }
}
console.log(`\nBitti → store-assets/shots/${LANG}/  (Chrome açık bırakıldı)`);
await browser.close();
