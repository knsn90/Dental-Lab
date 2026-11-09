/**
 * HTML → PDF çıkışı (tek yardımcı).
 *  - native: expo-print (kenar 45/45/40/40) → anlamlı adla paylaş
 *  - web >=1024: yeni sekmede yazdır (pencere TIKLAMA JESTİ içinde, ilk await'ten ÖNCE açılır)
 *  - web dar/PWA: gizli iframe → html2canvas → jsPDF A4 → a[download]
 * html2pdf KULLANILMAZ (stilleri düşürüyor). Yöntem PriceListScreen.buildWebPdfFile ile aynı;
 * ek olarak sayfa tablonun ortasında başlıyorsa tablo başlığı (thead) her sayfanın başına çizilir.
 * Hata Error olarak fırlar; çağıran butonun yanında gösterir.
 */
import { Platform, Dimensions } from 'react-native';
import { pdfExportMode } from './pdfExportMode';
import { pageSlices, clampScale, type HeadBox } from './pageSlices';

export { pdfExportMode } from './pdfExportMode';

const CONTENT_W = 688;                              // 182mm @ 96dpi
const PAGE_H = Math.floor(CONTENT_W * 265 / 182);   // 297 − 2×16mm dikey içerik
const SCALE = 2;

type HtmlSrc = string | Promise<string>;

export async function exportHtmlPdf(
  html: HtmlSrc, fileName: string, opts?: { winW?: number },
): Promise<void> {
  const winW = opts?.winW ?? Dimensions.get('window').width;
  const mode = pdfExportMode(Platform.OS, winW);

  if (mode === 'tab') {
    if (typeof window === 'undefined') throw new Error('PDF_NO_WINDOW');
    // Jest kaybolmasın: ilk await'ten önce aç.
    const w = window.open('', '_blank');
    if (!w) { Promise.resolve(html).catch(() => {}); throw new Error('POPUP_BLOCKED'); }
    try {
      const src = await html;
      const title = fileName.replace(/\.pdf$/i, '');
      const doc = src
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${title.replace(/[<>&]/g, '')}</title>`)
        .replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},350)}<\/script></body>');
      w.document.write(doc); w.document.close();
    } catch (e) { try { w.close(); } catch {} throw e; }
    return;
  }

  const src = await html;
  if (mode === 'native') return nativeShare(src, fileName);
  const file = await buildWebPdfFile(src, fileName);
  await deliverWebPdf(file);
}

async function nativeShare(html: string, fileName: string): Promise<void> {
  const Print = await import('expo-print');
  const Sharing = await import('expo-sharing');
  const { File: FSFile, Paths } = await import('expo-file-system');
  const { uri } = await Print.printToFileAsync({
    html, width: 595, height: 842, margins: { top: 45, bottom: 45, left: 40, right: 40 },
  });
  let shareUri = uri;
  try {
    const src = new FSFile(uri);
    const dest = new FSFile(Paths.cache, fileName);
    if (dest.exists) dest.delete();
    src.move(dest);
    shareUri = src.uri;
  } catch { /* ad değişmezse rastgele adla paylaşılır — içerik aynı */ }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: fileName });
  }
}

async function deliverWebPdf(file: File): Promise<void> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], title: file.name }); return; }
    catch (e: any) {
      if (e?.name === 'AbortError') return;          // kullanıcı vazgeçti
      // NotAllowedError (jest düştü) ve diğerleri: indirmeye düş
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click();
  setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {} }, 4000);
}

/** Sayfa kırılabilecek yerler: satır, başlık, bölüm, toplam şeritleri. */
const BREAK_SELECTOR = 'tr, h2, h3, .sums .sum, .doctor, .foot, .band';

async function buildWebPdfFile(html: string, fileName: string): Promise<File> {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_W}px;height:${PAGE_H}px;border:none;`;
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    await new Promise<void>((resolve) => {
      const imgs = Array.from(doc.images);
      if (imgs.length === 0) return resolve();
      let loaded = 0;
      const tick = () => { if (++loaded >= imgs.length) resolve(); };
      imgs.forEach(img => { if (img.complete) tick(); else { img.onload = tick; img.onerror = tick; } });
      setTimeout(resolve, 5000);
    });
    try { await (doc as any).fonts?.ready; } catch {}
    const fix = doc.createElement('style');
    fix.textContent = 'html,body{-webkit-text-size-adjust:100%!important;text-size-adjust:100%!important}';
    doc.head.appendChild(fix);
    // html2canvas object-fit desteklemiyor: logoya oranı koruyan px boyut ver.
    doc.querySelectorAll('img').forEach((img) => {
      const el = img as HTMLImageElement;
      if (!el.naturalWidth || !el.naturalHeight) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const ratio = el.naturalWidth / el.naturalHeight;
      const w = r.width / r.height > ratio ? r.height * ratio : r.width;
      const h = w / ratio;
      el.style.width = `${w}px`; el.style.height = `${h}px`;
      el.style.maxWidth = 'none'; el.style.maxHeight = 'none'; el.style.objectFit = 'fill';
    });
    await new Promise(r => setTimeout(r, 300));

    const root = doc.body as HTMLElement;
    // Kırılma yerleri html2canvas'ın KENDİ klonunda ölçülür: klon, iframe'den birkaç px farklı
    // satır yüksekliği verebiliyor (yedek font metrikleri); asıl çizilen düzen odur.
    let totalH = 0;
    let breaks: number[] = [];
    let heads: HeadBox[] = [];
    let measured = false;
    const measure = (cdoc: Document) => {
      if (measured) return;
      measured = true;
      const croot = cdoc.body as HTMLElement;
      const top0 = croot.getBoundingClientRect().top;
      const rel = (el: Element) => (el as HTMLElement).getBoundingClientRect().top - top0;
      const relBottom = (el: Element) => (el as HTMLElement).getBoundingClientRect().bottom - top0;
      totalH = Math.ceil(croot.scrollHeight);
      breaks = Array.from(new Set(
        Array.from(cdoc.querySelectorAll(BREAK_SELECTOR)).map(el => Math.round(rel(el))),
      )).filter(y => y > 0).sort((a, b) => a - b);
      // Tablo başlıkları: sayfa tablonun ortasında başlarsa thead yeniden çizilir.
      heads = Array.from(cdoc.querySelectorAll('table')).map((t) => {
        const th = t.querySelector('thead');
        return th ? { top: rel(th), bottom: relBottom(th), tableBottom: relBottom(t) } : null;
      }).filter(Boolean) as { top: number; bottom: number; tableBottom: number }[];
    };

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const scale = clampScale(CONTENT_W, PAGE_H, SCALE);
    const base = { useCORS: true, backgroundColor: '#FFFFFF', logging: false, width: CONTENT_W, windowWidth: CONTENT_W } as const;
    // iOS Safari ~16.7M px tuval sınırı: tüm belge tek tuvale ÇİZİLMEZ. Önce 1px'lik çizimle yalnız ölçülür.
    const probe = await html2canvas(root, { ...base, scale: 1, height: 1, windowHeight: 1, onclone: (cdoc) => { measure(cdoc); } });
    probe.width = 0; probe.height = 0;
    if (!totalH) totalH = Math.ceil(root.scrollHeight);
    const slices = pageSlices({ breaks, totalH, pageH: PAGE_H, heads });
    const winH = totalH + 10;

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const mmPerPx = 182 / CONTENT_W;
    const headCache = new Map<number, HTMLCanvasElement>();
    try {
      for (let i = 0; i < slices.length; i++) {
        const sl = slices[i];
        const bodyCv = await html2canvas(root, { ...base, scale, y: sl.y, height: sl.h, windowHeight: winH });
        let headCv: HTMLCanvasElement | null = null;
        if (sl.head) {
          headCv = headCache.get(sl.head.top) ?? null;
          if (!headCv) {
            headCv = await html2canvas(root, { ...base, scale, y: sl.head.top, height: sl.head.bottom - sl.head.top, windowHeight: winH });
            headCache.set(sl.head.top, headCv);
          }
        }
        const page = document.createElement('canvas');
        page.width = bodyCv.width;
        page.height = bodyCv.height + (headCv ? headCv.height : 0);
        const ctx = page.getContext('2d')!;
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, page.width, page.height);
        if (headCv) ctx.drawImage(headCv, 0, 0);
        ctx.drawImage(bodyCv, 0, headCv ? headCv.height : 0);
        if (i > 0) pdf.addPage();
        pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', 14, 16, 182, (page.height / scale) * mmPerPx);
        // Sonraki sayfadan önce belleği bırak (iOS tuval bellek tavanı)
        bodyCv.width = 0; bodyCv.height = 0; page.width = 0; page.height = 0;
      }
    } finally {
      headCache.forEach((c) => { c.width = 0; c.height = 0; });
    }
    return new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
  } finally {
    try { document.body.removeChild(iframe); } catch {}
  }
}
