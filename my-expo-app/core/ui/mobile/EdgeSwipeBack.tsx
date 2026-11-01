import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import { PAGE_PADDING } from '../pageMetrics';

/**
 * Kenardan sağa kaydırınca geri — iOS'un yerel "swipe back" hareketinin karşılığı.
 *
 * Neden gerekli: paneller mobilde <Tabs> navigator kullanıyor ve detay ekranları
 * (fatura, sipariş…) gizli SEKME — üst üste açılan stack sayfası değil. iOS'un
 * kenar kaydırması yalnız stack'te çalıştığı için bu ekranlarda hiç yoktu.
 *
 * Nasıl çalışır: ekranın sol kenarına PAGE_PADDING genişliğinde görünmez bir
 * şerit koyar. Kartlar zaten PAGE_PADDING içeriden başladığı için şerit yalnız
 * kenar boşluğunu kaplar — içeriğe dokunmayı engellemez. Sadece şeritten
 * BAŞLAYAN, ağırlıkla yatay, sağa doğru harekete yanıt verir; dikey kaydırma,
 * yatay listeler ve harita etkilenmez.
 *
 * Kullanım — ekranın KENDİ geri fonksiyonunu ver, geri butonuyla aynı olsun:
 *   <View style={{ flex: 1 }}>
 *     <ScrollView>…</ScrollView>
 *     <EdgeSwipeBack onBack={handleBack} />
 *   </View>
 *
 * ScrollView'un İÇİNE koyma (içerikle birlikte kayar); kökteki View'un son
 * çocuğu olsun.
 *
 * Formlarda / sihirbazlarda KULLANMA: yanlışlıkla kaydırma, kaydedilmemiş girdiyi
 * sessizce kaybettirir. Yalnız salt okunur detay ekranları için.
 *
 * Web'de render edilmez — tarayıcının kendi geri hareketi var.
 */
export function EdgeSwipeBack({ onBack, enabled = true }: { onBack: () => void; enabled?: boolean }) {
  // En güncel geri fonksiyonu — PanResponder bir kez kurulur, kapanış eski kalmasın.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Dokunuşu hemen alma — yalnız belirgin yatay hareket başlayınca sahiplen.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_e, g) => {
          // Uzun kaydırma YA DA kısa ama hızlı fiske — iOS'un hissine yakın.
          if (g.dx > 70 || (g.dx > 30 && g.vx > 0.5)) onBackRef.current();
        },
      }),
    [],
  );

  if (!enabled || Platform.OS === 'web') return null;

  return (
    <View
      {...responder.panHandlers}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: PAGE_PADDING, zIndex: 40 }}
    />
  );
}
