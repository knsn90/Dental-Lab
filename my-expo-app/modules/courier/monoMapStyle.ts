// modules/courier/monoMapStyle.ts
//
// Gri "Positron benzeri" MONO Google Maps stili — TEK KAYNAK.
// Web (CourierTrackingMapGoogle) ve native (CourierTrackingMapNative) AYNI
// görünümü kullansın diye buraya alındı. Yeni bir harita eklerken buradan al,
// kopyalama.

export const MONO_LIGHT: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#f6f6f4' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9aa0a6' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#ffffff' }, { weight: 2 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f6f6f4' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#eceef0' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#fbfbfa' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f0f1f2' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e4e6e9' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dfe4e8' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#a7b0b8' }] },
];

export const MONO_DARK: any[] = [
  { elementType: 'geometry', stylers: [{ color: '#1f2226' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a9099' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#12151a' }, { weight: 2 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#1f2226' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2e34' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#191c21' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#33383f' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14171b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#5b6169' }] },
];
