/**
 * Isı hücresinin siparişleri (spec §7.5): ortada, bulanık arka planlı pencere
 * (`U.modalOverlay` / `U.modalCard`). Satır: sipariş no · klinik · iş tipi ·
 * miktar + birim. Satıra basınca sipariş sayfasına gidilir (çağıran yönlendirir).
 * KVKK: hasta adı GÖSTERİLMEZ — yalnız sipariş no, klinik adı, iş tipi, miktar.
 */
import React from 'react';
import { View, Text, Pressable, Modal, ScrollView, Platform, StyleSheet } from 'react-native';
import { useInkUI } from '../../../../core/theme/inkScale';
import { usePanelTheme } from '../../../../core/theme/usePanelTheme';
import { X, ArrowUpRight } from '../../../../core/ui/icons';
import { autoT } from '../../../../core/i18n/autoTranslate';
import { isRTL } from '../../../../core/i18n';
import { serviceUnitLabel } from '../../../../core/util/serviceUnits';
import { UNKNOWN_CLINIC_ID, UNKNOWN_CLINIC_NAME, type CountedOrder } from '../aggregate';

const web = Platform.OS === 'web';

export interface CellOrdersModalProps {
  visible: boolean;
  title: string;
  orders: CountedOrder[];
  clinicName: Map<string, string>;
  onClose(): void;
  onOpenOrder(id: string): void;
}

export function CellOrdersModal({ visible, title, orders, clinicName, onClose, onOpenOrder }: CellOrdersModalProps) {
  const U = useInkUI();
  const clinicOf = (id: string) =>
    id === UNKNOWN_CLINIC_ID ? autoT(UNKNOWN_CLINIC_NAME) : (clinicName.get(id) || autoT(UNKNOWN_CLINIC_NAME));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        {/* Dışarı basınca kapanır — kartın KARDEŞİ (iç içe <button> olmasın) */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={autoT('Kapat')} />
        <View style={[U.modalCard, { maxWidth: 520 }]}>
          <View style={U.modalHeaderRow}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={2} style={U.modalTitle}>{title}</Text>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>
                {`${autoT('Siparişler')}: ${orders.length}`}
              </Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
              <X size={14} color={U.ink[700]} strokeWidth={2.2} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ padding: 8 }}>
            {orders.length === 0 ? (
              <Text style={{ padding: 16, textAlign: 'center', fontSize: 13, color: U.ink[500] }}>Bu hücrede sipariş yok</Text>
            ) : orders.map((o) => (
              <OrderRow key={o.id} order={o} clinic={clinicOf(o.clinicId)} onPress={() => onOpenOrder(o.id)} />
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function OrderRow({ order, clinic, onPress }: { order: CountedOrder; clinic: string; onPress(): void }) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const tint = U.isDark ? '#93C5FD' : accent;
  const unit = autoT(serviceUnitLabel(order.unit));
  const workType = autoT(order.workType);
  const rtl = isRTL();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${autoT('Siparişi aç')}: ${order.orderNumber} · ${clinic} · ${workType} · ${order.qty} ${unit}`}
      style={({ pressed, hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12,
        backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
        transform: [{ scale: pressed ? 0.97 : 1 }],
        ...(web ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 13.5, fontWeight: '700', color: U.ink[900], writingDirection: 'ltr',
            textAlign: rtl ? 'right' : 'left',
            fontFamily: web ? '"JetBrains Mono", ui-monospace, monospace' : undefined,
          }}
        >
          {order.orderNumber || '—'}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: U.ink[500], textAlign: rtl ? 'right' : 'left' }}>
          {`${clinic} · ${workType}`}
        </Text>
      </View>
      <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900], fontVariant: ['tabular-nums'] }}>{String(order.qty)}</Text>
      <Text style={{ fontSize: 11, color: U.ink[500], minWidth: 30 }}>{unit}</Text>
      <ArrowUpRight size={15} color={tint} strokeWidth={2} />
    </Pressable>
  );
}
