/**
 * NewOrderEntryChooser — lab/admin "Yeni sipariş" girişinde ilk soru:
 * formu elle mi dolduracak, yoksa kağıt iş emrini mi tarayacak?
 *
 * Yalnız giriş kararını verir; tarama ScanWorkOrderModal'da yapılır ve okunan
 * bilgiler aynı sihirbaza (ocr_work_order) aktarılır. Kapatmak = formu doldur.
 */
import React from 'react';
import { Modal, View, Text, Pressable, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { hexA } from '../../../core/theme/stationPalette';
import { PenLine, Camera, X, ChevronRight, ChevronLeft } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { isRTL } from '../../../core/i18n';

export function NewOrderEntryChooser({ visible, accent, onForm, onScan }: {
  visible: boolean;
  accent: string;
  onForm: () => void;
  onScan: () => void;
}) {
  const U = useInkUI();
  const accentFg = U.isDark ? '#93C5FD' : accent;
  const Chevron = isRTL() ? ChevronLeft : ChevronRight;

  const Option = ({ icon, title, text, onPress, primary }: {
    icon: React.ReactNode; title: string; text: string; onPress: () => void; primary?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: 16, borderWidth: 1,
        borderColor: primary ? hexA(accent, U.isDark ? 0.45 : 0.30) : U.plainBtn.border,
        backgroundColor: primary
          ? hexA(accent, U.isDark ? 0.16 : (hovered ? 0.10 : 0.06))
          : (hovered ? U.plainBtn.hoverBg : U.plainBtn.bg),
        opacity: pressed ? 0.8 : 1,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{
        width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
        backgroundColor: hexA(accent, U.isDark ? 0.22 : 0.12),
      }}>
        {icon}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: U.ink[900] }}>{title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 17, color: U.ink[500] }}>{text}</Text>
      </View>
      <Chevron size={16} color={U.ink[400]} strokeWidth={1.8} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onForm}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 460 }]}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>Yeni sipariş nasıl girilsin?</Text>
            <Pressable onPress={onForm} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
              <X size={14} color={U.ink[500]} strokeWidth={1.8} />
            </Pressable>
          </View>
          <View style={{ padding: 20, gap: 12 }}>
            <Option
              primary
              icon={<PenLine size={20} color={accentFg} strokeWidth={1.8} />}
              title="Formu doldur"
              text="Klinik, hasta ve işlemleri adım adım girin."
              onPress={onForm}
            />
            <Option
              icon={<Camera size={20} color={accentFg} strokeWidth={1.8} />}
              title="Kağıttan tara"
              text="Kağıt iş emrini kamerayla çekin ya da taranmış dosyayı yükleyin; bilgiler forma aktarılır."
              onPress={onScan}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
