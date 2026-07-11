// Siman logosu (assets/images/siman-logo.svg) → favicon + app/PWA ikonları + splash.
// Çalıştır: node scripts/gen-siman-icons.js
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(ROOT, 'assets/images/siman-logo.svg'));
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// Bir boyutta beyaz/şeffaf zeminli mark PNG buffer'ı üret.
async function buf(size, { bg, padFrac }) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * padFrac)));
  const mark = await sharp(svg, { density: 2400 })
    .resize(inner, inner, { fit: 'contain', background: CLEAR })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function gen(out, size, opts) {
  const full = path.join(ROOT, out);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, await buf(size, opts));
  console.log('✓', out, `${size}x${size}`);
}

(async () => {
  // Favicon (web sekme) — ŞEFFAF zemin (beyaz arka plan yok)
  await gen('assets/images/favicon.png',        256,  { bg: CLEAR, padFrac: 0.08 });
  // App store ikonu — beyaz zemin (iOS/Android şeffafı sevmez)
  await gen('assets/images/icon.png',           1024, { bg: WHITE, padFrac: 0.18 });
  await gen('public/icons/icon-192.png',        192,  { bg: WHITE, padFrac: 0.14 });
  await gen('public/icons/icon-512.png',        512,  { bg: WHITE, padFrac: 0.14 });
  await gen('public/icons/maskable-512.png',    512,  { bg: WHITE, padFrac: 0.22 }); // maskable safe-zone
  // Apple touch icon — beyaz zemin
  await gen('public/icons/apple-touch-180.png', 180,  { bg: WHITE, padFrac: 0.14 });
  // Android adaptive foreground — şeffaf (app.json android bg = #FFFFFF)
  await gen('assets/images/adaptive-icon.png',  1024, { bg: CLEAR, padFrac: 0.28 });
  // Splash — şeffaf, ortada küçük mark (app.json splash bg = #FFFFFF, contain)
  await gen('assets/images/splash.png',         1024, { bg: CLEAR, padFrac: 0.34 });

  // favicon.ico — çok-çözünürlüklü (16/32/48), ŞEFFAF zemin
  const icoBufs = await Promise.all(
    [16, 32, 48].map((s) => buf(s, { bg: CLEAR, padFrac: 0.06 }))
  );
  fs.writeFileSync(path.join(ROOT, 'public/favicon.ico'), await pngToIco(icoBufs));
  console.log('✓', 'public/favicon.ico', '16/32/48');

  console.log('done');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
