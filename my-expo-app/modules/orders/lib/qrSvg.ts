/**
 * Yazdırma şablonları için QR'ı YERELDE üretir (iş emri etiketi + gönderi fişi).
 *
 * Eskiden QR görseli api.qrserver.com'dan çekiliyordu: sipariş adresi dış
 * servise gidiyor, yazdırmadan önce görselin yüklenmesi bekleniyordu.
 * `qrcode` paketi zaten react-native-qrcode-svg ile pakette; dinamik import
 * edildiği için yazdırmaya basılmadıkça yüklenmez.
 */
import { qrSvgFromModules } from './workLabel';

export async function localQrSvg(url: string): Promise<string | undefined> {
  try {
    // CJS paket: Metro'nun async import'u modülü `default` altında verir; yine de iki şekli de karşıla.
    const mod: any = await import('qrcode');
    const QRCode: typeof import('qrcode').default = mod.default ?? mod;
    const m = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
    return qrSvgFromModules(m.size, (r, c) => m.get(r, c), 2);
  } catch (e) {
    // Şablonlar bu durumda eski dış-servis görseline düşer; çıktı yine basılır.
    console.warn('[print] QR yerelde üretilemedi:', e);
    return undefined;
  }
}
