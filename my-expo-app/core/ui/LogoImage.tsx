/**
 * LogoImage — kurum logosunu çerçeveye en-boy oranına göre yerleştirir.
 *
 * NEDEN: tüm listeler logoyu `cover` ile basıyordu → yatay logolar (ör. "ALLIANOI 21")
 * kareden/daireden kesiliyordu. Hepsini `contain` yapmak da kare logoları (ikon tarzı)
 * çerçevenin ortasında küçük bir kutuya çeviriyordu. Kural:
 *   - kareye yakın (0.8–1.25) → cover, çerçeveyi doldurur (eski görünüm)
 *   - yatay/dikey → contain, `fitStyle` boyutunda bütünüyle görünür
 * Oran bilinene dek contain (kesik bir an görünmesin). Kap ortalamalı olmalı.
 */
import React, { useEffect, useState } from 'react';
import { Image, type ImageStyle, type StyleProp } from 'react-native';
import { Tooth } from './dentalIcons';

const ratioCache = new Map<string, number>();

export function LogoImage({
  uri, style, fitStyle, accessibilityLabel,
}: {
  uri: string;
  /** Kare logoda (cover) kullanılan ölçü — genelde çerçeveyi doldurur. */
  style: StyleProp<ImageStyle>;
  /** Yatay/dikey logoda (contain) ölçü; verilmezse `style`. Daire çerçevede küçültün. */
  fitStyle?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
}) {
  const [ratio, setRatio] = useState<number | null>(() => ratioCache.get(uri) ?? null);

  useEffect(() => {
    const cached = ratioCache.get(uri);
    if (cached != null) { setRatio(cached); return; }
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (!alive || !w || !h) return; const r = w / h; ratioCache.set(uri, r); setRatio(r); },
      () => { /* ölçülemedi → contain kalır, kesilmez */ },
    );
    return () => { alive = false; };
  }, [uri]);

  const square = ratio != null && ratio >= 0.8 && ratio <= 1.25;
  return (
    <Image
      source={{ uri }}
      style={square ? style : (fitStyle ?? style)}
      resizeMode={square ? 'cover' : 'contain'}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

/**
 * DefaultLogo — logosu olmayan klinik/hekim için sabit nötr diş ikonu (2026-11-21, kullanıcı
 * isteği: baş harfler / bina ikonu yerine her yerde aynı varsayılan). Kabın zemini ve
 * rengi çağıran yerden gelir (panel accent), yalnız içerik sabittir.
 */
export function DefaultLogo({ size, color }: { size: number; color: string }) {
  return <Tooth size={size} color={color} strokeWidth={1.7} />;
}
