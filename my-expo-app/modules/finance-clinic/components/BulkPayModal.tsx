/**
 * BulkPayModal — klinik toplu online ödeme.
 *
 * Klinik 28 faturayı tek tek ödemek zorunda kalmasın: tek karttan TOPLAM
 * bakiyeyi ya da kendi belirlediği KISMİ tutarı öder. Ödeme onaylanınca tutar
 * faturalara en eskiden başlayarak dağıtılır (dağıtımı sunucu yapar).
 *
 * Para birimleri ASLA toplanmaz: her biri kendi bakiyesi, kendi ödemesi.
 * Birden fazla para birimi varsa önce o seçilir.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, TextInput, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CreditCard, X } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { autoT } from '../../../core/i18n/autoTranslate';
import { toast } from '../../../core/ui/Toast';
import { formatMoney, type Currency } from '../../../core/money/currency';
import { fetchMyOpenBalances, startMyBulkPayment, type OpenBalanceRow } from '../../payments/api';

export function BulkPayModal({ visible, onClose, onStarted }: {
  visible: boolean;
  onClose: () => void;
  /** Intent açıldı → kart ekranını çağıran ekran modalde açar. */
  onStarted?: (token: string) => void;
}) {
  const U = useInkUI();
  const theme = usePanelTheme();
  const router = useRouter();

  const [rows, setRows] = useState<OpenBalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ccy, setCcy] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setLoading(true);
    fetchMyOpenBalances().then(list => {
      setRows(list);
      // Tek para birimi varsa seçim adımı gereksiz.
      const first = list[0];
      setCcy(first ? first.currency : null);
      setAmountText(first ? first.balance.toFixed(2) : '');
      setLoading(false);
    });
  }, [visible]);

  const active = rows.find(r => r.currency === ccy) ?? null;
  const amount = Number(String(amountText).replace(',', '.'));
  const amountValid = Number.isFinite(amount) && amount > 0 && !!active && amount <= active.balance + 0.001;
  const isPartial = !!active && amountValid && amount < active.balance;

  const pickCurrency = (row: OpenBalanceRow) => {
    setCcy(row.currency);
    setAmountText(row.balance.toFixed(2));
  };

  const submit = async () => {
    if (!active || !amountValid || busy) return;
    setBusy(true);
    const r = await startMyBulkPayment(active.currency, Math.round(amount * 100) / 100);
    setBusy(false);
    if (r.error || !r.token) { toast.error(r.error ?? autoT('Ödeme başlatılamadı')); return; }
    if (onStarted) { onStarted(r.token); return; }   // modal zinciri
    onClose();
    router.push(`/pay/${r.token}` as any);           // geri uyumluluk
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 460 }]}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>{autoT('Toplu Ödeme')}</Text>
            <Pressable onPress={onClose} style={U.modalCloseBtn}>
              <X size={15} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>

          {loading ? (
            <View style={{ padding: 36, alignItems: 'center' }}>
              <ActivityIndicator color={theme.primary} />
            </View>
          ) : rows.length === 0 ? (
            <View style={{ padding: 28 }}>
              <Text style={{ fontSize: 13.5, color: U.ink[500], textAlign: 'center' }}>
                {autoT('Ödenecek açık faturanız yok.')}
              </Text>
            </View>
          ) : (
            <View style={{ padding: 20, gap: 16 }}>
              {/* Para birimi — birden fazlaysa seçilir, tek ise bilgi satırı */}
              {rows.length > 1 ? (
                <View style={{ gap: 8 }}>
                  <Text style={U.colHeader}>{autoT('Para birimi')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {rows.map(r => {
                      const on = r.currency === ccy;
                      return (
                        <Pressable
                          key={r.currency}
                          onPress={() => pickCurrency(r)}
                          style={{
                            paddingHorizontal: on ? 16 : 12, paddingVertical: 8, borderRadius: 999,
                            borderWidth: 1.5,
                            borderColor: on ? U.ink[900] : U.plainBtn.border,
                            backgroundColor: on ? U.ink[50] : U.plainBtn.bg,
                            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                          }}>
                          <Text style={{ fontSize: 12.5, fontWeight: on ? '700' : '600', color: U.ink[900] }}>
                            {formatMoney(r.balance, r.currency as Currency, { fractionDigits: 0 })}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {active ? (
                <>
                  <View style={{
                    padding: 14, borderRadius: 14,
                    backgroundColor: U.surfaceSoft, borderWidth: 1, borderColor: U.hairlineSoft,
                  }}>
                    <Text style={{ fontSize: 11, color: U.ink[500] }}>{autoT('Toplam bakiye')}</Text>
                    <Text style={{ fontSize: 22, fontWeight: '700', color: U.ink[900], marginTop: 2 }}>
                      {formatMoney(active.balance, active.currency as Currency)}
                    </Text>
                    <Text style={{ fontSize: 11.5, color: U.ink[400], marginTop: 4 }}>
                      {active.invoice_count} {autoT('açık fatura')}
                    </Text>
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={U.colHeader}>{autoT('Ödenecek tutar')}</Text>
                    <TextInput
                      value={amountText}
                      onChangeText={setAmountText}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor={U.ink[400]}
                      style={U.inputStyle}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => setAmountText(active.balance.toFixed(2))}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                          borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>
                          {autoT('Tüm bakiye')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setAmountText((active.balance / 2).toFixed(2))}
                        style={{
                          paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                          borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                          ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                        }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fgMuted }}>
                          {autoT('Yarısı')}
                        </Text>
                      </Pressable>
                    </View>
                    {/* Kısmi ödemede hangi faturaların kapanacağı belirsiz kalmasın. */}
                    <Text style={{ fontSize: 11.5, color: U.ink[400], lineHeight: 17 }}>
                      {isPartial
                        ? autoT('Kısmi ödeme: tutar en eski faturadan başlayarak dağıtılır.')
                        : autoT('Tüm açık faturalarınız kapanır.')}
                    </Text>
                    {!amountValid && amountText.trim() !== '' ? (
                      <Text style={{ fontSize: 11.5, color: U.chipTones.danger.fg }}>
                        {autoT('Tutar 0 ile toplam bakiye arasında olmalı.')}
                      </Text>
                    ) : null}
                  </View>
                </>
              ) : null}
            </View>
          )}

          {rows.length > 0 && !loading ? (
            <View style={{
              flexDirection: 'row', gap: 10, justifyContent: 'flex-end',
              paddingHorizontal: 20, paddingVertical: 16,
              borderTopWidth: 1, borderTopColor: U.hairline,
            }}>
              <Pressable
                onPress={onClose}
                style={{
                  paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999,
                  borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fgMuted }}>{autoT('Vazgeç')}</Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!amountValid || busy}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 7,
                  paddingHorizontal: 18, paddingVertical: 10, borderRadius: 9999,
                  backgroundColor: theme.primary,
                  opacity: !amountValid || busy ? 0.45 : pressed ? 0.85 : 1,
                  ...(Platform.OS === 'web' ? { cursor: amountValid && !busy ? 'pointer' : 'default' } as any : {}),
                })}>
                {busy
                  ? <ActivityIndicator size="small" color="#FFFFFF" />
                  : <CreditCard size={14} color="#FFFFFF" strokeWidth={2} />}
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                  {busy ? autoT('Açılıyor…') : autoT('Ödemeye geç')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
