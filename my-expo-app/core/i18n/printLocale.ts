/**
 * Yazdırma/PDF şablonları için dil yardımcıları.
 *
 * Ekran metinleri autoTranslate'in yamaladığı JSX runtime'ından geçer; yazdırma
 * şablonları ise ham HTML dizesi üretir ve o katmana HİÇ uğramaz. Bu yüzden
 * şablonlar dili kendileri sormak zorunda.
 *
 * CSS notu: burası gerçek tarayıcı CSS'i (React Native değil). `text-align:
 * start/end`, `border-inline-start`, `padding-inline-end` gibi mantıksal
 * özellikler burada DESTEKLENİR ve `dir` özniteliğine göre kendiliğinden döner.
 * Şablonlarda fiziksel `left/right` yerine bunları kullan.
 */
import i18n, { isRTL, localeTag } from './index';

/** `<html>` etiketinin lang + dir öznitelikleri. */
export function htmlAttrs(): string {
  return `lang="${i18n.language || 'tr'}" dir="${isRTL() ? 'rtl' : 'ltr'}"`;
}

/** Aktif dilin tarih etiketi — Farsça'da `fa-IR-u-ca-persian` (Şemsi). */
export function printLocale(): string {
  return localeTag();
}

/**
 * Farsça'da Batı rakamlarını Farsça rakama çevirir. Şablonlarda para/sayı
 * biçimlendirmesi genelde elle yapıldığı için Intl bunu kendiliğinden yapmaz.
 */
const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
export function printNum(s: string): string {
  if (!isRTL() || i18n.language !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[+d]);
}
