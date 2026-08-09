/**
 * app/dev/_layout.tsx — /dev/* sayfaları YALNIZ geliştirmede açık.
 *
 * Bu klasördeki ekranlar (patterns, ds-lab, order-detail, *-mockup ...) tasarım
 * referansı/mockup; prod build'de herkese açık olmamalı. Metro production
 * build'inde __DEV__ === false olduğu için prod'da ana sayfaya yönlendirilir.
 *
 * <Slot /> kullanılıyor: yeni bir navigator EKLEMEZ, mevcut yapıyı bozmaz —
 * sadece guard katmanı ekler.
 */
import React from 'react';
import { Slot, Redirect } from 'expo-router';

export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Slot />;
}
