import { autoT } from '../../core/i18n/autoTranslate';

/** Harita kontrol düğmeleri (Konumum · Yakınlaştır · Uzaklaştır) için GlassTooltip
 *  metinleri — Google ve Leaflet haritası aynı sırayı kullanır. Dil değişimini
 *  yakalamak için render anında çağrılır. */
export function mapControlTips(): { title: string; text: string }[] {
  return [
    { title: autoT('Konumum'), text: autoT('Haritayı bulunduğun yere ortalar') },
    { title: autoT('Yakınlaştır'), text: autoT('Haritayı bir kademe yakınlaştırır') },
    { title: autoT('Uzaklaştır'), text: autoT('Haritayı bir kademe uzaklaştırır') },
  ];
}
