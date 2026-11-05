// Ekstre indirimi — saf kurallar (numara, hata metni, dönem etiketi).
// Metinler Türkçe kaynaktır; çağıran autoT() ile sarar.

export type DiscountMode = 'amount' | 'percent';
export type SdErrorCode = 'SD_EMPTY' | 'SD_VALUE' | 'SD_CAP';

export function statementDiscountDocNo(n: number): string {
  return 'İND-' + n;
}

const SD_TEXTS: Record<SdErrorCode, string> = {
  SD_VALUE: "İndirim 0'dan büyük olmalı.",
  SD_CAP: 'Bu döneme verilen indirimlerin toplamı dönemin fatura toplamını aşamaz.',
  SD_EMPTY: 'Bu dönemde kesilmiş fatura yok.',
};

export function sdErrorText(code: string | null | undefined): string {
  if (code && Object.prototype.hasOwnProperty.call(SD_TEXTS, code)) {
    return SD_TEXTS[code as SdErrorCode];
  }
  return 'İndirim kaydedilemedi.';
}

function ymd(s: string): [number, number, number] {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function discountPeriodLabel(
  from: string,
  to: string,
  monthName: (monthIndex0: number) => string,
): string {
  const [fy, fm, fd] = ymd(from);
  const [ty, tm, td] = ymd(to);
  const lastDay = new Date(Date.UTC(fy, fm, 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDay) {
    return `${monthName(fm - 1)} ${fy}`;
  }
  return `${pad2(fd)}.${pad2(fm)}.${fy} – ${pad2(td)}.${pad2(tm)}.${ty}`;
}

/** Sunucu hata mesajından SD_* kodunu çıkarır; yoksa ham mesaj ('Yetkiniz yok' vb.). Boşsa null. */
export function sdServerError(message: string | null | undefined): string | null {
  const m = String(message ?? '').trim();
  if (!m) return null;
  const hit = m.match(/SD_[A-Z_]+/);
  return hit ? hit[0] : m;
}
