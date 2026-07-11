// lib/printCheckinPoster.ts
//
// Lab girişine asılacak "Personel Giriş / Çıkış" QR check-in posteri (A4/A5).
// Temiz adaçayı (sage) tasarım: Siman markalı, büyük QR, adım adım talimat.
// Uygulama içi üretilir → QR her zaman güncel token ile basılır (statik dosya eskimez).
//
// Kullanım (web):
//   const html = buildCheckinPosterHtml({ qrUrl, labName, size: 'A4' });
//   const w = window.open('', '_blank'); w.document.write(html); w.document.close();

export interface CheckinPosterInput {
  /** QR içeriği — /checkin?token=... tam URL */
  qrUrl: string;
  /** Lab adı (başlıkta görünür) */
  labName?: string | null;
  /** Sayfa boyutu */
  size?: 'A4' | 'A5';
}

const ICON = {
  scan: `<svg viewBox="0 0 24 24" fill="none" stroke="#0F2A1F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg>`,
  pin:  `<svg viewBox="0 0 24 24" fill="none" stroke="#0F2A1F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  check:`<svg viewBox="0 0 24 24" fill="none" stroke="#0F2A1F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
};

export function buildCheckinPosterHtml({ qrUrl, labName, size = 'A4' }: CheckinPosterInput): string {
  const isA4 = size === 'A4';
  const pageW = isA4 ? 210 : 148;
  const pageH = isA4 ? 297 : 210;
  const k = isA4 ? 1 : 148 / 210;
  const mm = (n: number) => +(n * k).toFixed(2) + 'mm';
  const pt = (n: number) => +(n * k).toFixed(2) + 'pt';

  const M = {
    pad: isA4 ? 12 : 8,  fpad: isA4 ? 14 : 9,  qr: isA4 ? 72 : 50,
    title: isA4 ? 26 : 18,  lab: isA4 ? 13 : 10,  step: isA4 ? 11 : 8.5,
    stepNo: isA4 ? 11 : 8.5,  stepIcon: isA4 ? 16 : 12,  kicker: isA4 ? 9.5 : 7.5,
    foot: isA4 ? 8.5 : 7,  gap: isA4 ? 8 : 5,
  };

  const lab = (labName || '').trim();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=8&qzone=1&format=png&ecc=M&color=0f2a1f&bgcolor=ffffff&data=${encodeURIComponent(qrUrl)}`;

  const step = (icon: string, no: number, title: string, body: string) => `
    <div class="step">
      <div class="stepIco">${icon}</div>
      <div class="stepTxt">
        <div class="stepHd"><span class="stepNo">${no}</span>${title}</div>
        <div class="stepBd">${body}</div>
      </div>
    </div>`;

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Check-in Posteri${lab ? ' · ' + esc(lab) : ''}</title>
<style>
  @page { size: ${size} portrait; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  html,body { background:#fff; }
  body {
    font-family:'Inter','Helvetica Neue',Arial,sans-serif; color:#0F2A1F;
    width:${pageW}mm; height:${pageH}mm; overflow:hidden;
    padding:${mm(M.pad)}; display:flex; flex-direction:column;
  }
  .frame { flex:1; min-height:0; border:1.5px solid #BCDBC8; border-radius:${isA4 ? 9 : 6}mm;
           padding:${mm(M.fpad)}; display:flex; flex-direction:column; align-items:center; text-align:center; }

  .kicker { font-size:${pt(M.kicker)}; font-weight:800; letter-spacing:.28em; text-transform:uppercase; color:#4D8A6B; }
  .title  { font-size:${pt(M.title)}; font-weight:300; letter-spacing:-.01em; line-height:1.05;
            margin-top:${mm(M.gap * .55)}; white-space:nowrap; }
  .title b { font-weight:600; }
  .lab    { font-size:${pt(M.lab)}; font-weight:600; color:#0F2A1F; margin-top:${mm(M.gap * .35)};
            display:inline-flex; align-items:center; gap:2mm; }
  .lab .dot { width:${isA4 ? 2.2 : 1.6}mm; height:${isA4 ? 2.2 : 1.6}mm; border-radius:50%; background:#6BA888; display:inline-block; }

  .qrWrap { margin-top:${mm(M.gap)}; padding:${isA4 ? 6 : 5}mm; background:#fff; border:1.5px solid #E5F1EA; border-radius:${isA4 ? 8 : 6}mm; }
  .qrWrap img { display:block; width:${mm(M.qr)}; height:${mm(M.qr)}; }
  .scanHint { margin-top:${mm(M.gap * .5)}; font-size:${pt(M.step)}; font-weight:600; color:#4D8A6B; }

  .steps { margin-top:${mm(M.gap)}; width:100%; max-width:${isA4 ? 150 : 105}mm; display:flex; flex-direction:column; gap:${mm(M.gap * .55)}; }
  .step  { display:flex; align-items:center; gap:${isA4 ? 5 : 3.5}mm; text-align:left; border:1px solid #E5F1EA; border-radius:${isA4 ? 5 : 4}mm; padding:${mm(M.gap * .5)}; }
  .stepIco { width:${mm(M.stepIcon)}; height:${mm(M.stepIcon)}; flex:0 0 auto; border-radius:${isA4 ? 4 : 3}mm; background:#E5F1EA; display:flex; align-items:center; justify-content:center; }
  .stepIco svg { width:${mm(M.stepIcon * .55)}; height:${mm(M.stepIcon * .55)}; }
  .stepHd  { font-size:${pt(M.step)}; font-weight:700; color:#0F2A1F; display:flex; align-items:center; gap:2mm; }
  .stepNo  { width:${isA4 ? 6 : 4.6}mm; height:${isA4 ? 6 : 4.6}mm; flex:0 0 auto; border-radius:50%; background:#6BA888; color:#fff; font-size:${pt(M.stepNo)}; font-weight:800; display:inline-flex; align-items:center; justify-content:center; }
  .stepBd  { font-size:${pt(M.step * .82)}; color:#4D8A6B; margin-top:.6mm; }

  .foot { margin-top:auto; padding-top:${mm(M.gap * .6)}; font-size:${pt(M.foot)}; color:#8AA89A; letter-spacing:.04em; }
  .foot b { color:#4D8A6B; font-weight:700; }
</style></head>
<body>
  <div class="frame">
    <div class="kicker">Personel Giriş / Çıkış</div>
    <div class="title">QR ile <b>giriş-çıkış</b> yapın</div>
    ${lab ? `<div class="lab"><span class="dot"></span>${esc(lab)}</div>` : ''}

    <div class="qrWrap"><img src="${qrSrc}" alt="Check-in QR"></div>
    <div class="scanHint">Telefon kameranızı bu koda tutun</div>

    <div class="steps">
      ${step(ICON.scan, 1, 'QR kodu okutun', 'Telefonunuzun kamerasıyla yukarıdaki kodu tarayın.')}
      ${step(ICON.pin, 2, 'Konum izni verin', 'Çıkan ekranda konum iznini onaylayın.')}
      ${step(ICON.check, 3, 'Otomatik kaydedilir', 'İlk okutma giriş, ikinci okutma çıkış olarak işlenir.')}
    </div>

    <div class="foot"><b>Siman</b> · Dijital Laboratuvar Yönetimi</div>
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},450);};<\/script>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
