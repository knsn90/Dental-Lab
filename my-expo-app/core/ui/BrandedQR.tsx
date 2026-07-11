// core/ui/BrandedQR.tsx
//
// Stilize QR kod wrapper'ı — dotted/rounded modüller, yuvarlak finder pattern.
// react-native-qrcode-styled tabanlı; mevcut react-native-qrcode-svg'nin
// drop-in replacement'i (value/size/color/backgroundColor props uyumlu).
//
// Kullanım:
//   <BrandedQR value={qrUrl} size={200} color="#0F172A" />

import React, { useState } from 'react';
import { View, Image, StyleSheet, Platform } from 'react-native';
import QRCodeStyledBase from 'react-native-qrcode-styled';

// Paketin .d.ts'i eksik (size/padding/onChangePieceSize/errorCorrectionLevel runtime'da
// var ama tiplerde yok); valid runtime proplarını geçebilmek için any cast.
const QRCodeStyled = QRCodeStyledBase as any;

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
  // qrcode-styled v0.4: bileşen `size`'tan kendi pieceSize'ını hesaplar
  // (`pieceSize` prop'u DEĞİL — verilirse DOM'a sızar). Yuvarlaklık yarıçapları için
  // gerçek pieceSize'ı `onChangePieceSize` callback'inden alıp state'te tutuyoruz.
  const innerWidth = Math.max(1, size - padding * 2);
  // pieceSizeOverride (modül başı px) verilmişse onu hedef pieceSize kabul edip
  // size'ı türet; yoksa matris tahmini ile başlangıç değeri.
  const matrixSize = estimateMatrixSize(value, errorCorrectionLevel);
  const initialPiece = pieceSizeOverride ?? Math.max(1, innerWidth / matrixSize);
  const [piece, setPiece] = useState(initialPiece);

  const isDot = pieceShape === 'dot';

  // Web: styled SVG QR, react-native-svg üzerinden DOM'a `transform-origin` (kebab)
  // sızdırıp konsol uyarısı veriyor. Web'de düz QR görseli kullan (uyarı yok, baskı/ekran net).
  if (Platform.OS === 'web') {
    const hex = (color || '#0F172A').replace('#', '');
    const bg  = (backgroundColor || '#FFFFFF').replace('#', '');
    const px  = Math.max(120, Math.round(innerWidth * 2)); // net çözünürlük
    const src = `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=0&format=png&ecc=${errorCorrectionLevel}&color=${hex}&bgcolor=${bg}&data=${encodeURIComponent(value)}`;
    return (
      <View style={[styles.wrap, { width: size, height: size, backgroundColor, padding, borderRadius }]}>
        <Image source={{ uri: src }} style={{ width: innerWidth, height: innerWidth }} resizeMode="contain" />
      </View>
    );
  }

  return (
    <View style={[
      styles.wrap,
      { width: size, height: size, backgroundColor, padding, borderRadius },
    ]}>
      <QRCodeStyled
        data={value}
        size={innerWidth}
        padding={0}
        onChangePieceSize={setPiece}
        pieceCornerType="rounded"
        pieceBorderRadius={isDot ? piece / 2 : Math.max(1, piece * 0.25)}
        pieceScale={isDot ? 0.92 : 1}
        outerEyesOptions={{
          topLeft:    { borderRadius: piece * 1.5 },
          topRight:   { borderRadius: piece * 1.5 },
          bottomLeft: { borderRadius: piece * 1.5 },
        }}
        innerEyesOptions={{
          borderRadius: piece,
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
    if (bytes <= caps[v]) {
      // +1 version safety buffer — capacity table mode/length indicator
      // overhead'i tam yansıtmıyor, qrcode-styled bazen bir üst version'a
      // geçiyor. Buffer ile QR matrix container'ı taşmıyor.
      return 17 + Math.min(v + 2, caps.length) * 4;
    }
  }
  return 17 + 20 * 4;
}
