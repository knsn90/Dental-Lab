// modules/orders/components/StaticRouteMap.tsx
//
// Kurye bacağı için küçük, etkileşimsiz rota önizlemesi (Google Static Maps).
//
// Neden statik: sipariş detayında birden çok bacak olabiliyor. Her satıra
// etkileşimli Leaflet haritası gömmek tek sayfada 3-4 harita örneği açar,
// detayı yavaşlatır ve Leaflet web-only olduğu için mobilde hiç çalışmaz.
// Statik görsel hem hızlı hem her platformda çalışır.
//
// Adresler doğrudan Google'a metin olarak verilir → ayrıca geokodlama gerekmez.
// Çizgi kuş uçuşu (düz) çizilir; gerçek yol güzergâhı Directions API ister,
// bu önizleme için gereksiz maliyet olur.

import React, { useMemo, useState } from 'react';
import { View, Image, Platform } from 'react-native';
import { formatAddress } from '../../../core/util/formatAddress';

interface Props {
  /** Çıkış adresi (serbest metin ya da JSON adres). */
  originText?: string | null;
  /** Varış adresi (serbest metin ya da JSON adres). */
  destText?: string | null;
  /** Google Maps API anahtarı — yoksa bileşen hiçbir şey çizmez. */
  apiKey?: string | null;
  height?: number;
  accent?: string;
  /** Köşe yarıçapı — içine gömüldüğü satırla aynı olmalı. */
  radius?: number;
}

const GREEN = '0x2D9A6B';
const RED   = '0xD94B4B';

/**
 * Kurye Takip haritası CartoDB Positron (light_all) kullanıyor: açık gri, doygunluğu
 * düşük, etiketleri sessiz. Statik önizleme aynı dili konuşsun diye Google Static
 * Maps aynı palete stillendirilir — POI/toplu taşıma kapalı, yollar beyaz, su açık gri.
 * Böylece renkli olan tek şey rota ve A/B işaretleri olur.
 */
const MONO_STYLE = [
  'feature:all|element:geometry|color:0xf6f6f4',
  'feature:all|element:labels.text.fill|color:0x9aa0a6',
  'feature:all|element:labels.text.stroke|color:0xffffff|weight:2',
  'feature:all|element:labels.icon|visibility:off',
  'feature:poi|visibility:off',
  'feature:transit|visibility:off',
  'feature:administrative|element:geometry|visibility:off',
  'feature:administrative.land_parcel|visibility:off',
  'feature:landscape|element:geometry|color:0xf6f6f4',
  'feature:road|element:geometry|color:0xffffff',
  'feature:road|element:geometry.stroke|color:0xeceef0',
  'feature:road.arterial|element:geometry|color:0xfbfbfa',
  'feature:road.highway|element:geometry|color:0xf0f1f2',
  'feature:road.highway|element:geometry.stroke|color:0xe4e6e9',
  'feature:water|element:geometry|color:0xdfe4e8',
  'feature:water|element:labels.text.fill|color:0xa7b0b8',
];

export function StaticRouteMap({ originText, destText, apiKey, height = 96, accent = '#4771AB', radius = 12 }: Props) {
  /**
   * Görsel, kabın GERÇEK en-boy oranında istenir.
   *
   * Önceden sabit 560x150 isteniyor ve `cover` ile kırpılıyordu: kenarlar
   * kesiliyor, en altta Google'ın "Map data" atıfı ile logosu yarım kalıyordu.
   * Bu yalnız özensizlik değil — Static Maps kullanım şartları atfın görünür
   * kalmasını ister. Kabı ölçüp aynı oranda istemek ikisini birden çözer.
   */
  const [boxW, setBoxW] = useState(0);

  const url = useMemo(() => {
    if (!apiKey || boxW <= 0) return null;
    const o = formatAddress(originText).trim();
    const d = formatAddress(destText).trim();
    if (!o || !d) return null;

    // Türkiye bağlamı ekle — kısa adreslerde yanlış ülkeye düşmesin.
    const withRegion = (s: string) => (/türkiye|turkey/i.test(s) ? s : `${s}, Türkiye`);
    const oq = encodeURIComponent(withRegion(o));
    const dq = encodeURIComponent(withRegion(d));
    const line = accent.replace('#', '0x');

    const styles = MONO_STYLE.map(s => `&style=${encodeURIComponent(s)}`).join('');
    // Static Maps üst sınırı 640×640 (scale=2 ile 1280 px çıktı).
    const w = Math.max(120, Math.min(640, Math.round(boxW)));
    const h = Math.max(60, Math.min(640, Math.round(height)));

    return 'https://maps.googleapis.com/maps/api/staticmap'
      + `?size=${w}x${h}&scale=2&maptype=roadmap&language=tr&region=TR`
      + styles
      + `&markers=size:mid%7Ccolor:${GREEN}%7Clabel:A%7C${oq}`
      + `&markers=size:mid%7Ccolor:${RED}%7Clabel:B%7C${dq}`
      + `&path=color:${line}CC%7Cweight:4%7C${oq}%7C${dq}`
      + `&key=${apiKey}`;
  }, [originText, destText, apiKey, accent, boxW, height]);

  return (
    <View
      onLayout={e => {
        const w = e.nativeEvent.layout.width;
        // Yalnız anlamlı değişimde yeniden iste — her piksel oynamasında
        // yeni bir Static Maps isteği çıkmasın.
        setBoxW(prev => (Math.abs(prev - w) > 8 ? w : prev));
      }}
      style={{
        height, borderRadius: radius, overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.04)',
        ...(Platform.OS === 'web' ? { position: 'relative' } as any : {}),
      }}
    >
      {url ? (
        <Image
          source={{ uri: url }}
          style={{ width: '100%', height: '100%' }}
          // Oran artık birebir → `contain` kırpmaz, atıf görünür kalır.
          resizeMode="contain"
          accessibilityLabel="Kurye rotası önizlemesi"
        />
      ) : null}
    </View>
  );
}

/** Bacağın yönüne göre çıkış/varış adreslerini çözer. */
export function legRouteAddresses(
  leg: { direction?: string | null; destination_address?: string | null },
  labAddress?: string | null,
  clinicAddress?: string | null,
): { originText: string | null; destText: string | null } {
  if (leg.direction === 'clinic_to_lab') {
    // Klinikten alım: çıkış klinik, varış laboratuvar (= destination_address)
    return { originText: clinicAddress ?? null, destText: leg.destination_address ?? labAddress ?? null };
  }
  // Lab çıkışı: çıkış laboratuvar, varış klinik/hekim (= destination_address)
  return { originText: labAddress ?? null, destText: leg.destination_address ?? clinicAddress ?? null };
}
