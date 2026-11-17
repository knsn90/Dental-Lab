/**
 * DraftInvoiceNoticeModal — sipariş kalemleri değişti ama siparişin TASLAK faturası
 * otomatik güncellenmez (fatura teslimde kopyalanır). Kullanıcıyı uyarır; istenirse
 * faturayı aynı popup'ta düzenletir.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { AlertTriangle, Pencil, X } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { InvoiceDetailScreen } from '../screens/InvoiceDetailScreen';

export interface DraftInvoiceRef { id: string; invoice_number: string | null }

export function DraftInvoiceNoticeModal({ invoices, onClose }: {
  /** Boş/null → kapalı */
  invoices: DraftInvoiceRef[] | null;
  onClose: () => void;
}) {
  const U = useInkUI();
  const [editId, setEditId] = useState<string | null>(null);
  const open = !!invoices && invoices.length > 0;
  const list = invoices ?? [];
  const btn = (primary: boolean) => ({ pressed, hovered }: any) => ({
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 7,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
    backgroundColor: primary
      ? U.ink[900]
      : (hovered || pressed ? U.plainBtn.hoverBg : U.plainBtn.bg),
    borderWidth: primary ? 0 : 1, borderColor: U.plainBtn.border,
    opacity: primary && pressed ? 0.85 : 1,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  });

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        {editId ? (
          <View style={[U.modalCard, { maxWidth: 1180, height: '92%', maxHeight: '92%', backgroundColor: U.surfaceSoft }]}>
            <View style={[U.modalHeaderRow, { backgroundColor: U.surface }]}>
              <Text style={U.modalTitle}>{autoT('Faturayı düzenle')}</Text>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Uyarıya dön')}>
                <Pressable onPress={() => setEditId(null)} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                  <X size={15} color={U.ink[700]} strokeWidth={1.9} />
                </Pressable>
              </GlassTooltip>
            </View>
            <View style={{ flex: 1, minHeight: 0 }}>
              <InvoiceDetailScreen invoiceId={editId} onBack={() => setEditId(null)} />
            </View>
          </View>
        ) : (
          <View style={U.modalCard}>
            <View style={U.modalHeaderRow}>
              <Text style={U.modalTitle}>{autoT('Taslak fatura güncellenmedi')}</Text>
              <GlassTooltip title={autoT('Kapat')} text={autoT('Uyarıyı kapat')}>
                <Pressable onPress={onClose} accessibilityLabel={autoT('Kapat')} style={U.modalCloseBtn}>
                  <X size={15} color={U.ink[700]} strokeWidth={1.9} />
                </Pressable>
              </GlassTooltip>
            </View>
            <View style={{ padding: 20, gap: 14 }}>
              <View style={{
                flexDirection: 'row', gap: 10, alignItems: 'flex-start',
                padding: 12, borderRadius: 12, backgroundColor: U.chipTones.warning.bg,
              }}>
                <AlertTriangle size={16} color={U.chipTones.warning.fg} strokeWidth={1.9} />
                <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: U.chipTones.warning.fg }}>
                  {autoT('Siparişin kalemleri değişti, ama taslak faturası eski tutarla duruyor. Fatura otomatik güncellenmez; kliniğe gitmeden önce faturayı da düzeltin.')}
                </Text>
              </View>
              <View style={{ gap: 8 }}>
                {list.map(inv => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
                      {inv.invoice_number || autoT('Taslak hizmet bedeli')}
                    </Text>
                    <Pressable onPress={() => setEditId(inv.id)} accessibilityRole="button" style={btn(true)}>
                      <Pencil size={14} color={U.onDarkPill} strokeWidth={1.9} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>{autoT('Faturayı düzenle')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Pressable onPress={onClose} accessibilityRole="button" style={btn(false)}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Daha sonra')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}
