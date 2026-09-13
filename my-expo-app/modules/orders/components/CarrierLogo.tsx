// Kargo taşıyıcısının markası (Aras, HepsiJET, Kolay Gelsin…) — Shipink fiyat
// listesinde her satırın başında görünür.
//
// NEDEN uzaktan yükleniyor da paketlenmiyor: 17 taşıyıcının SVG'si toplam ~106 KB
// ve küçültme yalnız %8 kazandırıyor (hacim path verisi). Liste ancak kullanıcı
// "Fiyat Sorgula"ya bastıktan sonra görünür — yani zaten çevrimiçi. Paketlemek
// her açılışa ~106 KB bindirirdi; üstelik yeni bir taşıyıcı eklendiğinde logosu
// olmazdı.
//
// NEDEN platforma göre iki yol: shipink.io logoları CORS başlığı GÖNDERMİYOR
// (ölçüldü: access-control-allow-origin yok). Bu yüzden fetch tabanlı `SvgUri`
// web'de çalışmaz; web'de <img> kullanıyoruz (görsel yüklemesi CORS'a tabi
// değil). Mobilde CORS kısıtı olmadığı için SvgUri sorunsuz.
//
// Logo yüklenmezse (dosya adı değişti, ağ yok, bilinmeyen taşıyıcı) sessizce
// nötr bir paket ikonuna düşer — liste hiçbir durumda boş kutu göstermez.
import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import { Package } from '../../../core/ui/icons';
import { SvgUri } from 'react-native-svg';

interface Props {
  url?: string | null;
  width?: number;
  height?: number;
}

export function CarrierLogo({ url, width = 54, height = 24 }: Props) {
  const [failed, setFailed] = useState(false);

  const frame = { width, height, alignItems: 'center' as const, justifyContent: 'center' as const };

  if (!url || failed) {
    return (
      <View style={frame}>
        <Package size={15} color="#9A9A9A" strokeWidth={1.8} />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    // react-native-web ham DOM elemanlarını olduğu gibi basar; <img> SVG'yi
    // fetch etmeden gösterdiği için CORS engeline takılmaz.
    return (
      <View style={frame}>
        {React.createElement('img', {
          src: url,
          alt: '',
          onError: () => setFailed(true),
          style: { width, height, objectFit: 'contain', display: 'block' },
        })}
      </View>
    );
  }

  return (
    <View style={frame}>
      <SvgUri uri={url} width={width} height={height} onError={() => setFailed(true)} />
    </View>
  );
}
