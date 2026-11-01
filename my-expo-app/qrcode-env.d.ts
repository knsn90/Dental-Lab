/**
 * `qrcode` için asgari tip bildirimi — paket kendi .d.ts'ini yayınlamıyor ve
 * @types/qrcode kurulu değil. Paket zaten react-native-qrcode-svg üzerinden
 * pakette; iş emri etiketi QR'ı yalnız `create()` ile modül matrisini alıp
 * SVG'yi kendisi çiziyor (modules/orders/lib/workLabel.ts → qrSvgFromModules).
 */
declare module 'qrcode' {
  interface QRModules {
    size: number;
    get(row: number, col: number): number | boolean;
  }
  const QRCode: {
    create(text: string, opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): { modules: QRModules };
  };
  export default QRCode;
}
