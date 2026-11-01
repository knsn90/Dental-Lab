// Dış ekran görüntüsünü şablon oranına (1320×2724) getirir.
// Varsayılan: KIRPMA YOK — eksik kenarı görselin kendi kenar rengiyle uzatır.
// --kirp: önce çevresindeki modal perdesini keser (modal ekran görüntüleri için).
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

const arg = process.argv.slice(2);
const kirp = arg.includes('--kirp');
const [src, dst] = arg.filter(a => !a.startsWith('--'));
const W = 1320, ORAN = 2724 / 1320;
const mime = src.endsWith('.webp') ? 'image/webp' : src.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
const b64 = readFileSync(src).toString('base64');
const uri = `data:${mime};base64,${b64}`;

const br = await puppeteer.launch({ args: ['--no-sandbox'] });
const p = await br.newPage();
await p.setContent(`<img id="i" src="${uri}">`);
await p.evaluate(() => new Promise(r => { const i = document.getElementById('i'); i.complete ? r() : i.onload = r; }));

const k = await p.evaluate((kirp) => {
  const i = document.getElementById('i');
  const c = document.createElement('canvas');
  c.width = i.naturalWidth; c.height = i.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(i, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const at = (px, py) => { const o = (py * c.width + px) * 4; return [d[o], d[o+1], d[o+2]]; };
  let L = 0, R = c.width - 1, T = 0, B = c.height - 1;
  if (kirp) {
    const perde = at(2, 2);
    const ayni = (q) => Math.abs(q[0]-perde[0])<14 && Math.abs(q[1]-perde[1])<14 && Math.abs(q[2]-perde[2])<14;
    while (L < R && ayni(at(L, (T+B)>>1))) L++;
    while (R > L && ayni(at(R, (T+B)>>1))) R--;
    while (T < B && ayni(at((L+R)>>1, T))) T++;
    while (B > T && ayni(at((L+R)>>1, B))) B--;
  }
  const ust = at((L+R)>>1, T + 3), alt = at((L+R)>>1, B - 3);
  const sol = at(L + 3, (T+B)>>1), sag = at(R - 3, (T+B)>>1);
  return { L, T, w: R-L+1, h: B-T+1, tam: [c.width, c.height],
    ustRenk:`rgb(${ust})`, altRenk:`rgb(${alt})`, solRenk:`rgb(${sol})`, sagRenk:`rgb(${sag})` };
}, kirp);

const mevcut = k.h / k.w;
let cw = k.w, ch = k.h, ustD = 0, altD = 0, solD = 0, sagD = 0;
if (mevcut < ORAN) {                 // çok kısa → üst/alt uzat
  const d = Math.round(k.w * ORAN) - k.h; ustD = Math.round(d * 0.42); altD = d - ustD; ch = k.h + d;
} else {                             // çok uzun → yanları genişlet
  const d = Math.round(k.h / ORAN) - k.w; solD = Math.round(d / 2); sagD = d - solD; cw = k.w + d;
}

await p.setViewport({ width: cw, height: ch, deviceScaleFactor: W / cw });
await p.setContent(`<body style="margin:0;width:${cw}px;height:${ch}px;overflow:hidden;display:flex">
  <div style="width:${solD}px;background:${k.solRenk};flex:0 0 auto"></div>
  <div style="flex:1;display:flex;flex-direction:column">
    <div style="height:${ustD}px;background:${k.ustRenk};flex:0 0 auto"></div>
    <div style="width:${k.w}px;height:${k.h}px;overflow:hidden;position:relative;flex:0 0 auto">
      <img src="${uri}" style="position:absolute;left:${-k.L}px;top:${-k.T}px;display:block">
    </div>
    <div style="height:${altD}px;background:${k.altRenk};flex:0 0 auto"></div>
  </div>
  <div style="width:${sagD}px;background:${k.sagRenk};flex:0 0 auto"></div>
</body>`);
await new Promise(r => setTimeout(r, 400));
await p.screenshot({ path: dst });
await br.close();
console.log(`  ✓ ${dst.split('/').pop()}  ${k.tam.join('×')} → içerik ${k.w}×${k.h}  dolgu ↑${ustD} ↓${altD} ←${solD} →${sagD}`);
