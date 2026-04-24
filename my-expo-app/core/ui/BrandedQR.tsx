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
  /** Toplam piksel boyutu (kare) */
  size?: number;
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
  color = '#0F172A',
  backgroundColor = '#FFFFFF',
  errorCorrectionLevel = 'M',
  padding = 8,
  pieceShape = 'dot',
  borderRadius = 14,
}: BrandedQRProps) {
  // QR matrix tipik 25-37 modül arasında değişir; orta nokta 33 alıp
  // toplam size'a göre piece başına piksel hesapla.
  const pieceSize = Math.max(2, Math.floor((size - padding * 2) / 33));

  const isDot = pieceShape === 'dot';
  const liquidRadius = isDot ? Math.max(2, Math.floor(pieceSize / 2)) : 1;

  return (
    <View style={[styles.wrap, { backgroundColor, padding, borderRadius }]}>
      <QRCodeStyled
        data={value}
        pieceSize={pieceSize}
        pieceCornerType="rounded"
        pieceLiquidRadius={liquidRadius}
        // Finder patterns (dış kareler) — yuvarlak köşe
        outerEyesOptions={{
          topLeft:    { borderRadius: [12, 12, 2, 12] },
          topRight:   { borderRadius: [12, 12, 12, 2] },
          bottomLeft: { borderRadius: [12, 2, 12, 12] },
        }}
        // Finder patterns (iç nokta) — daha yumuşak yuvarlak
        innerEyesOptions={{
          borderRadius: 4,
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
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ display: 'inline-block' } as any)
      : {}),
  },
});

export default BrandedQR;
