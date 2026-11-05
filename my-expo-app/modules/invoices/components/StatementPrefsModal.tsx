/**
 * StatementPrefsModal — ekstre liste ayarı.
 *
 * Kullanıcı: "ekstre sayfasına liste ayarı ekleyelim, kullanıcı karar versin ekstrede
 * neleri açıp kapatacağını". Ekran + PDF + Excel aynı ayarı kullanır; tercih
 * kullanıcıya özel, cihazda saklanır (hooks/useStatementPrefs, lib/statementPrefs).
 */
import React from 'react';
import { View, Text, Pressable, Modal, Platform } from 'react-native';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { AppSwitch } from '../../../core/ui/AppSwitch';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { X } from '../../../core/ui/icons';
import { autoT } from '../../../core/i18n/autoTranslate';
import type { StatementPrefs } from '../lib/statementPrefs';

const ROWS: { key: Exclude<keyof StatementPrefs, 'discountMode'>; label: string; hint: string }[] = [
  { key: 'vat',      label: 'KDV',                     hint: 'Fatura satırındaki KDV ve sondaki KDV dökümü' },
  { key: 'details',  label: 'Hasta, sipariş ve hekim', hint: 'Fatura satırının altındaki hasta adı, sipariş no ve hekim' },
  { key: 'payments', label: 'Tahsilat satırları',      hint: 'Kapalıyken yalnız faturalar listelenir; bakiye yine tahsilatları içerir' },
  { key: 'status',   label: 'Durum ve revizyon notu',  hint: 'Kesildi / Ödendi etiketi ve revizyon faturası notu' },
];

export function StatementPrefsModal({ visible, prefs, onChange, onReset, onClose }: {
  visible: boolean;
  prefs: StatementPrefs;
  onChange: (key: Exclude<keyof StatementPrefs, 'discountMode'>, value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const U = useInkUI();
  const accent = usePanelTheme().primary;
  const web = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : {};
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard as any, { width: '100%', maxWidth: 440 }]}>
          <View style={U.modalHeaderRow as any}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={U.modalTitle as any}>Liste ayarı</Text>
              <Text style={{ fontSize: 12, color: U.ink[500], marginTop: 2 }}>Ekstrede neleri göstereceğini seç</Text>
            </View>
            <GlassTooltip title={autoT('Kapat')} text={autoT('Pencereyi kapatır')} placement="bottom">
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={autoT('Kapat')} style={[U.modalCloseBtn as any, web]}>
                <X size={16} color={U.ink[500]} strokeWidth={1.8} />
              </Pressable>
            </GlassTooltip>
          </View>

          <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
            {ROWS.map((r, i) => (
              <View key={r.key} style={{
                flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
                borderBottomWidth: i < ROWS.length - 1 ? 1 : 0, borderBottomColor: U.hairlineSoft,
              }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900] }}>{r.label}</Text>
                  <Text style={{ fontSize: 11.5, color: U.ink[500], marginTop: 2, lineHeight: 16 }}>{r.hint}</Text>
                </View>
                <AppSwitch value={prefs[r.key]} onValueChange={(v: boolean) => onChange(r.key, v)} accentColor={accent} />
              </View>
            ))}
            <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 8 }}>Bu ayar yalnız sizin için bu cihazda saklanır.</Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
            <GlassTooltip title={autoT('Varsayılana dön')} text={autoT('Ayarları varsayılana döndürür (hepsi açık)')}>
              <Pressable onPress={onReset} style={[{
                paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
              }, web]}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.plainBtn.fg }}>Varsayılana dön</Text>
              </Pressable>
            </GlassTooltip>
            <GlassTooltip title={autoT('Tamam')} text={autoT('Pencereyi kapatır')}>
              <Pressable onPress={onClose} style={[{
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, backgroundColor: U.ink[900],
              }, web]}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.onDarkPill }}>Tamam</Text>
              </Pressable>
            </GlassTooltip>
          </View>
        </View>
      </View>
    </Modal>
  );
}
