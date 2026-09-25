/**
 * PaymentLinkPanel — fatura detayındaki "Online Ödeme" bölümü.
 *
 *  • Aktif intent var mı? Var ise URL göster + kopyala
 *  • Yok ise "Ödeme Linki Oluştur" (tutar + geçerlilik seçimi)
 *  • Geçmiş intent'ler katlanır listede (son 5), ödenmişte iade
 *
 * KART DEĞİL BÖLÜMDÜR: InvoiceActionsCard içindeki tek kartın ikinci
 * bölümü olarak çizilir — kendi gölgesi/kenarlığı yoktur, yatay dolgusu
 * kartla ortaktır (SECTION_PAD). Tek kullanıcısı o karttır.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, Platform, Alert } from 'react-native';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { Copy, Link, Undo2, ChevronDown, ChevronRight, CircleCheck } from '../../../core/ui/icons';
import { useInkUI } from '../../../core/theme/inkScale';
import { toast } from '../../../core/ui/Toast';
import {
  createPaymentLink, fetchIntentsForInvoice, refundIntent, buildPaymentUrl,
  PAYMENT_STATUS_LABELS,
} from '../api';
import { getActivePaymentProvider } from '../providers';
import type { PaymentIntent } from '../types';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import {
  ActionSectionHead, NavyButton, SECTION_PAD, navyTones,
} from '../../invoices/components/InvoiceActionsCard';

interface Props {
  invoiceId: string;
  balance:   number;
  /** Kart içindeki sıra numarası (akış: 1 not → 2 ödeme → 3 e-fatura). */
  step?:     number;
  onChanged?:() => void;
}

function fmtMoney(n: number): string {
  return baseSymbol() + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentLinkPanel({ invoiceId, balance, step, onChanged }: Props) {
  const U = useInkUI();
  const navy = navyTones(U.isDark);
  useBaseCurrency();
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);

  const [providerName, setProviderName] = useState<string>('Demo POS (Sandbox)');
  useEffect(() => {
    getActivePaymentProvider().then(p => setProviderName(p.displayName));
  }, []);

  const load = async () => {
    const { data } = await fetchIntentsForInvoice(invoiceId);
    setIntents(((data ?? []) as PaymentIntent[]));
  };

  useEffect(() => { load(); }, [invoiceId]);

  const activeIntent = intents.find(i =>
    ['pending', 'awaiting_3ds', 'authorized'].includes(i.status)
    && new Date(i.expires_at).getTime() > Date.now()
  );

  const handleCopy = (url: string) => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      toast.success('Link panoya kopyalandı');
    } else {
      // Native için: expo-clipboard veya Share API
      toast.info(url);
    }
  };

  const handleRefund = (intent: PaymentIntent) => {
    Alert.alert(
      'İade Et',
      `${fmtMoney(Number(intent.amount))} ${autoT('tutarındaki ödeme iade edilsin mi?')}`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İade Et', style: 'destructive', onPress: async () => {
          const r = await refundIntent(intent.id);
          if (!r.ok) toast.error(r.error ?? 'İade başarısız');
          else        toast.success('İade gerçekleşti');
          load();
          onChanged?.();
        }},
      ],
    );
  };

  return (
    <View style={{ paddingHorizontal: SECTION_PAD, paddingVertical: 14, gap: 12 }}>
      <ActionSectionHead
        step={step}
        title={autoT('Online Ödeme')}
        hint={`${autoT('Sağlayıcı')}: ${providerName}`}
        right={activeIntent ? (
          <View style={{ paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: 999, backgroundColor: navy.soft }}>
            <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: navy.ink }}>
              {autoT('Aktif link')}
            </Text>
          </View>
        ) : null}
      />

      {activeIntent ? (
        /* Aktif link kutusu: lacivert yumuşak zemin — kartın içinde "şu an
           canlı olan" tek öğe, göz oraya gitsin. */
        <View style={{
          gap: 10, padding: 12, borderRadius: 14,
          backgroundColor: navy.soft, borderWidth: 1, borderColor: navy.line,
        }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: 'monospace' as any, color: U.ink[800] }}>
              {buildPaymentUrl(activeIntent.public_token)}
            </Text>
            <Text style={{ fontSize: 11, color: U.ink[500], marginTop: 5 }}>
              {fmtMoney(Number(activeIntent.amount))} · {autoT('son')}: {new Date(activeIntent.expires_at).toLocaleDateString(localeTag())}
            </Text>
          </View>
          <NavyButton
            label={autoT('Kopyala')}
            icon={<Copy size={13} strokeWidth={1.9} color="#FFFFFF" />}
            onPress={() => handleCopy(buildPaymentUrl(activeIntent.public_token))}
          />
        </View>
      ) : balance > 0 ? (
        <NavyButton
          block
          label={autoT('Ödeme Linki Oluştur')}
          icon={<Link size={14} strokeWidth={1.9} color="#FFFFFF" />}
          onPress={() => setCreateOpen(true)}
        />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <CircleCheck size={14} strokeWidth={1.9} color={U.chipTones.success.fg} />
          <Text style={{ fontSize: 12.5, color: U.ink[500], flexShrink: 1 }}>
            {autoT('Bakiye yok — bu fatura tahsil edildi')}
          </Text>
        </View>
      )}

      {/* Geçmiş: varsayılan KAPALI — çoğu faturada tek deneme var, açık
          liste kartı gereksiz uzatıyordu. */}
      {intents.length > 0 && (
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => setHistOpen(o => !o)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
            }}>
            {histOpen
              ? <ChevronDown size={13} strokeWidth={2} color={U.ink[400]} />
              : <ChevronRight size={13} strokeWidth={2} color={U.ink[400]} />}
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: U.ink[400] }}>
              {autoT('Geçmiş')} ({intents.length})
            </Text>
          </Pressable>

          {histOpen && intents.slice(0, 5).map(it => {
            const cfg = PAYMENT_STATUS_LABELS[it.status];
            return (
              <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.color }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '600', color: U.ink[900] }}>{fmtMoney(Number(it.amount))}</Text>
                  <Text style={{ fontSize: 10.5, color: U.ink[400], marginTop: 1 }}>
                    {new Date(it.created_at).toLocaleDateString(localeTag())}
                    {it.installments > 1 ? ` · ${it.installments} ${autoT('taksit')}` : ''}
                  </Text>
                </View>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: cfg.color + (U.isDark ? '2E' : '15') }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: cfg.color }}>
                    {cfg.label}
                  </Text>
                </View>
                {it.status === 'paid' && (
                  <Pressable
                    onPress={() => handleRefund(it)}
                    style={{
                      width: 26, height: 26, borderRadius: 8,
                      alignItems: 'center', justifyContent: 'center',
                      backgroundColor: U.chipTones.danger.bg,
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                    }}>
                    <Undo2 size={12} strokeWidth={1.9} color={U.chipTones.danger.fg} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <CreateLinkModal
        visible={createOpen}
        invoiceId={invoiceId}
        defaultAmount={balance}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); load(); onChanged?.(); }}
      />
    </View>
  );
}

// ─── Yeni link oluştur modal'ı ─────────────────────────────────────────
function CreateLinkModal({
  visible, invoiceId, defaultAmount, onClose, onCreated,
}: {
  visible: boolean;
  invoiceId: string;
  defaultAmount: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const U = useInkUI();
  const [amount, setAmount] = useState('');
  const [days, setDays]     = useState('7');
  const [busy, setBusy]     = useState(false);

  useEffect(() => {
    if (visible) {
      setAmount(defaultAmount.toFixed(2));
      setDays('7');
    }
  }, [visible, defaultAmount]);

  const handleCreate = async () => {
    const num = Number(amount.replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) { toast.error('Geçerli tutar girin'); return; }
    if (num > defaultAmount) { toast.error(`En fazla ${defaultAmount.toFixed(2)} ${baseSymbol()} olabilir`); return; }
    setBusy(true);
    const { error } = await createPaymentLink({
      invoice_id: invoiceId,
      amount: num,
      expires_in_days: Math.max(1, Math.min(30, Number(days) || 7)),
    });
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success('Ödeme linki oluşturuldu');
    onCreated();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={U.modalCard}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>{autoT('Ödeme Linki Oluştur')}</Text>
            <Pressable onPress={onClose} style={U.modalCloseBtn}>
              <Text style={{ fontSize: 15, color: U.ink[500] }}>×</Text>
            </Pressable>
          </View>

          <View style={{ padding: 20, gap: 14 }}>
            <View>
              <Text style={{ ...U.colHeader, marginBottom: 6 }}>{autoT('Tutar')} ({baseSymbol()})</Text>
              <TextInput
                style={U.inputStyle}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor={U.ink[400]}
              />
              <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 5 }}>
                {autoT('Maksimum bakiye')}: {defaultAmount.toFixed(2)} {baseSymbol()}
              </Text>
            </View>

            <View>
              <Text style={{ ...U.colHeader, marginBottom: 6 }}>{autoT('Geçerlilik Süresi (gün)')}</Text>
              <TextInput
                style={U.inputStyle}
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="7"
                placeholderTextColor={U.ink[400]}
              />
            </View>
          </View>

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
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fgMuted }}>{autoT('İptal')}</Text>
            </Pressable>
            <NavyButton
              label={busy ? autoT('Oluşturuluyor...') : autoT('Oluştur')}
              icon={busy
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Link size={14} strokeWidth={1.9} color="#FFFFFF" />}
              onPress={handleCreate}
              disabled={busy}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
