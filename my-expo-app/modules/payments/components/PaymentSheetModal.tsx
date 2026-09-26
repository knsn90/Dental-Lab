/**
 * PaymentSheetModal — uygulama içi ödeme.
 *
 * Klinik "Öde" dediğinde ayrı bir sayfaya gitmek yerine aynı akış modalde
 * açılır: kullanıcı listeden/faturadan kopmaz, ödeme bitince olduğu yerde
 * kalır ve liste tazelenir. Ayrı sayfada "geri" sorunu da böylece kalkar.
 *
 * Gövde `PublicPaymentScreen` ile AYNI bileşendir (`embedded`) — kart formu,
 * 3DS iframe'i ve sonuç ekranları tek yerde durur. /pay/<token> rotası
 * KALIR: lab'ın e-posta/WhatsApp ile gönderdiği link oturumsuz açılır.
 */
import React from 'react';
import { View, Text, Modal, Pressable, Platform } from 'react-native';
import { X } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { autoT } from '../../../core/i18n/autoTranslate';
import { PublicPaymentScreen } from '../screens/PublicPaymentScreen';

export function PaymentSheetModal({
  token, onClose, onPaid,
}: {
  /** null → modal kapalı. */
  token: string | null;
  onClose: () => void;
  /** Ödeme tamamlandığında çağrılır (liste/fatura tazelensin diye). */
  onPaid?: () => void;
}) {
  const U = useInkUI();

  return (
    <Modal visible={!!token} transparent animationType="fade" onRequestClose={onClose}>
      {/* Arka plan blur: kart girilen ekran, arkadaki listeden görsel olarak
          ayrılsın. backdropFilter web'e özgü; native'de sahne biraz daha
          koyultulur (expo-blur eklemeden aynı ayrışma hissi). */}
      <View style={[
        U.modalOverlay,
        Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(8px) saturate(120%)', WebkitBackdropFilter: 'blur(8px) saturate(120%)' } as any)
          : { backgroundColor: U.isDark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.58)' },
      ]}>
        <View style={[U.modalCard, { maxWidth: 520, height: '88%' }]}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>{autoT('Online Ödeme')}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={autoT('Kapat')}
              style={U.modalCloseBtn}>
              <X size={15} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Akışın kendisi; kabuk çizmesin diye embedded. */}
          <View style={{ flex: 1, ...(Platform.OS === 'web' ? { overflow: 'hidden' } as any : {}) }}>
            {token ? (
              <PublicPaymentScreen token={token} embedded onPaid={onPaid} />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
