// ClinicHoverCard — klinik logosunun üzerine gelince açılan küçük klinik kartı.
// Web sürümü: ClinicHoverCard.web.tsx (portal + cam yüzey + yaylı giriş).
// Native'de hover yok; dokunma satırın kendi eylemidir → sarılan öğe aynen döner.
import React from 'react';
import { View } from 'react-native';

export interface ClinicHoverCardProps {
  children: React.ReactNode;
  /** Klinik kimliği; yoksa kart açılmaz (yalnız logo büyüme efekti). */
  clinicId?: string | null;
  clinicName?: string | null;
  logoUrl?: string | null;
  /** Satırdaki hekim adı — kartta ikinci satır. */
  doctorName?: string | null;
  /** "Klinik özetini aç" — ekran düzeyindeki ClinicSummaryModal'ı açar. */
  onOpenSummary?: (clinicId: string) => void;
  style?: any;
}

export function ClinicHoverCard({ children, style }: ClinicHoverCardProps) {
  return style ? <View style={style}>{children}</View> : <>{children}</>;
}
