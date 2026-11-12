// Özet panolarının ortak ızgarası (kullanıcı: "üst satırdaki 4 kartın genişlikleri aynı olsun, alt sıra da aynı
// hizada dursun, farklı ekranlara uysun"). Her satır iki YARIM'dan, her yarım bir ya da iki HÜCRE'den oluşur;
// bütün satırlar aynı iç içe yapıyı kullandığı için sütun sınırları sıradan sıraya birebir hizalanır.
// Genişlik ölçülmez (flex-basis + wrap): yer daralınca önce yarımlar alt alta iner (4 → 2 sütun), daha darda
// hücreler de (→ 1 sütun). Kart, hücrenin yüksekliğini flex:1 ile doldurur; aynı satırdaki kartlar eş boylu kalır.
import React from 'react';
import { View } from 'react-native';

/** Kartların okunur kaldığı en dar sütun */
const CELL_MIN = 220;

export function DashRow({ gap, children, style }: { gap: number; children: React.ReactNode; style?: any }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', gap }, style]}>{children}</View>;
}

/** Satırın yarısı — içindeki DashCell'ler yan yana (tek hücre yarımın tamamını kaplar) */
export function DashHalf({ gap, children }: { gap: number; children: React.ReactNode }) {
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN * 2 + gap, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'stretch', gap }}>
      {children}
    </View>
  );
}

export function DashCell({ children }: { children: React.ReactNode }) {
  return <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: CELL_MIN, minWidth: 0 }}>{children}</View>;
}

/** Satırın üçte biri — üç kartlı satırlar için. Daralınca 2'li, sonra tek sütuna iner. */
export function DashThird({ children }: { children: React.ReactNode }) {
  return <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0 }}>{children}</View>;
}
