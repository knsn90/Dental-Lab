// core/ui/BrandedQR.tsx
//
// Stilize QR kod wrapper'ı — dotted/rounded modüller, yuvarlak finder pattern.
// react-native-qrcode-styled tabanlı; mevcut react-native-qrcode-svg'nin
// drop-in replacement'i (value/size/color/backgroundColor props uyumlu).
//
// Kullanım:
//   <BrandedQR value={qrUrl} size={200} color="#0F172A" />

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';

export interface BrandedQRProps {
  /** QR içeriği (URL, JSON string, vs.) */
  value: string;
  /** Toplam piksel boyutu (kare) — pieceSize verilmezse buradan hesaplanır */
  size?: number;
  /** Doğrudan modül başına piksel — verilirse size yoksayılır */
  pieceSize?: number;
  /** Modül rengi — default siyah; panel temalı kullanım için accent verilebilir */
  color?: string;
  /** Arkaplan rengi — default beyaz */
  backgroundColor?: string;
  /** Hata düzeltme seviyesi (L/M/Q/H) — default M */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  /** Padding (kenar boşluğu) — default 8px */
  padding?: number;
  /**
   * Modül stili: 'dot' yuvarlak nokta (görseldeki gibi), 'rounded' yuvarlak
   * köşe kare. Default 'dot'.
   */
  pieceShape?: 'dot' | 'rounded';
  /** Kenar köşe yarıçapı (wrapper container) */
  borderRadius?: number;
}

export function BrandedQR({
  value,
  size = 200,
  pieceSize: pieceSizeOverride,
  color = '#0F172A',
  backgroundColor = '#FFFFFF',
  errorCorrectionLevel = 'M',
  padding = 8,
  pieceShape = 'dot',
  borderRadius = 14,
}: BrandedQRProps) {
  // Integer pieceSize — qrcode-styled float ignore ediyor.
  // QR doğal boyutu = pieceSize * matrixSize. Bu boyut size'dan küçük olur,
  // wrap padding ile beraber tam size'a oturtulur (overflow: hidden YOK).
  const matrixSize    = estimateMatrixSize(value, errorCorrectionLevel);
  const innerWidth    = Math.max(1, size - padding * 2);
  const pieceSize     = pieceSizeOverride
    ?? Math.max(1, Math.floor(innerWidth / matrixSize));
  const renderedQR    = pieceSize * matrixSize;
  // Kalan boşluğu eşit padding olarak ekle — QR ortalanır, kırpılmaz.
  const slack         = Math.max(0, innerWidth - renderedQR);
  const effectivePad  = padding + slack / 2;

  const isDot = pieceShape === 'dot';

  return (
    <View style={[
      styles.wrap,
      { width: size, height: size, backgroundColor, padding: effectivePad, borderRadius },
    ]}>
      <QRCodeStyled
        data={value}
        pieceSize={pieceSize}
        pieceCornerType="rounded"
        pieceBorderRadius={isDot ? pieceSize / 2 : Math.max(1, pieceSize * 0.25)}
        pieceScale={isDot ? 0.92 : 1}
        outerEyesOptions={{
          topLeft:    { borderRadius: pieceSize * 1.5 },
          topRight:   { borderRadius: pieceSize * 1.5 },
          bottomLeft: { borderRadius: pieceSize * 1.5 },
        }}
        innerEyesOptions={{
          borderRadius: pieceSize,
        }}
        color={color}
        errorCorrectionLevel={errorCorrectionLevel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
});

export default BrandedQR;

// QR sürümünün byte kapasitesi (ECL bazında) — version 1..10 (21..57 modül)
// Her sürümün matrix size'ı: 17 + version * 4
const QR_BYTE_CAPACITY: Record<'L' | 'M' | 'Q' | 'H', number[]> = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271],
  M: [14, 26, 42, 62,  84, 106, 122, 152, 180, 213],
  Q: [11, 20, 32, 46,  60,  74,  86, 108, 130, 151],
  H: [ 7, 14, 24, 34,  44,  58,  64,  84,  98, 119],
};

function estimateMatrixSize(value: string, ecl: 'L' | 'M' | 'Q' | 'H'): number {
  const bytes = new TextEncoder().encode(value).length;
  const caps = QR_BYTE_CAPACITY[ecl];
  for (let v = 0; v < caps.length; v++) {
    if (bytes <= caps[v]) return 17 + (v + 1) * 4;
  }
  // Çok uzun veri için emniyetli üst sınır — version 20
  return 17 + 20 * 4;
}
