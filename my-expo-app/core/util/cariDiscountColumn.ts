// Ortak cari PDF şablonunun (buildCariStatementHtml) İndirim sütunu parçaları.
// Saf: yerel içe aktarma yok (node --test doğrudan çalıştırır). show=false iken
// her parça '' döner → sütunu istemeyen belgeler (tedarikçi, çalışan) bit bit aynı.
// Stil satır içi / mevcut sınıflarla verilir: şablonun <style> bloğu değişmesin.

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tablo başlığı hücresi (KDV başlığıyla aynı sınıf). */
export function cariDiscountTh(show: boolean, label: string): string {
  if (!show) return '';
  return `<th class="num">${esc(label)}</th>`;
}

/** Satır hücresi; metin yoksa boş hücre. */
export function cariDiscountTd(show: boolean, text: string | undefined): string {
  if (!show) return '';
  return `<td class="vat-cell">${text ? `<div class="vat-num">${esc(text)}</div>` : ''}</td>`;
}

/** Alttaki özet çubuğunda (fatura toplamı ile kapanış arasında) "İndirimler" kutusu.
 *  amountHtml çağıranın biçimlendirdiği, kaçışlı HTML'dir. */
export function cariDiscountSummaryRow(show: boolean, label: string, amountHtml: string): string {
  if (!show) return '';
  return `<div>
      <div class="lbl">${esc(label)}</div>
      <div class="num credit">${amountHtml}</div>
    </div>`;
}
