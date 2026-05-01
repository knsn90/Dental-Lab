/**
 * PaymentLinkPanel — InvoiceDetail içinde "Ödeme Linki" yönetimi
 *
 *  • Aktif intent var mı? Var ise URL göster + kopyala + iptal/refund
 *  • Yok ise "Ödeme Linki Oluştur" butonu (tutar seçimi)
 *  • Geçmiş intent'ler (son 5)
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Modal, TextInput, Platform, Alert,
} from 'react-native';
import { AppIcon } from '../../../core/ui/AppIcon';
import { Shadows, CardSpec } from '../../../core/theme/shadows';
import { toast } from '../../../core/ui/Toast';
import {
  createPaymentLink, fetchIntentsForInvoice, refundIntent, buildPaymentUrl,
  PAYMENT_STATUS_LABELS,
} from '../api';
import { getActivePaymentProvider } from '../providers';
import type { PaymentIntent } from '../types';

interface Props {
  invoiceId: string;
  balance:   number;
  onChanged?:() => void;
}

function fmtMoney(n: number): string {
  return '₺' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PaymentLinkPanel({ invoiceId, balance, onChanged }: Props) {
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [providerName, setProviderName] = useState<string>('Demo POS (Sandbox)');
  useEffect(() => {
    getActivePaymentProvider().then(p => setProviderName(p.displayName));
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchIntentsForInvoice(invoiceId);
    setIntents(((data ?? []) as PaymentIntent[]));
    setLoading(false);
  };

  useEffect(() => { load(); }, [invoiceId]);

  const activeIntent = intents.find(i =>
    ['pending', 'awaiting_3ds', 'authorized'].includes(i.status)
    && new Date(i.expires_at).getTime() > Date.now()
  );
  const lastPaid = intents.find(i => i.status === 'paid');

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
      `${fmtMoney(Number(intent.amount))} tutarındaki ödeme iade edilsin mi?`,
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
    <View style={s.card}>
      <View style={s.head}>
        <View style={[s.iconBox, { backgroundColor: '#EFF6FF' }]}>
          <AppIcon name="credit-card" size={16} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Online Ödeme</Text>
          <Text style={s.providerHint}>Sağlayıcı: {providerName}</Text>
        </View>
      </View>

      {/* Aktif link */}
      {activeIntent ? (
        <View style={s.activeBox}>
          <View style={{ flex: 1 }}>
            <Text style={s.activeLabel}>Aktif Ödeme Linki</Text>
            <Text style={s.activeUrl} numberOfLines={1}>
              {buildPaymentUrl(activeIntent.public_token)}
            </Text>
            <Text style={s.activeMeta}>
              {fmtMoney(Number(activeIntent.amount))} · son: {new Date(activeIntent.expires_at).toLocaleDateString('tr-TR')}
            </Text>
          </View>
          <TouchableOpacity
            style={s.copyBtn}
            onPress={() => handleCopy(buildPaymentUrl(activeIntent.public_token))}
          >
            <AppIcon name="content-copy" size={14} color="#FFFFFF" />
            <Text style={s.copyText}>Kopyala</Text>
          </TouchableOpacity>
        </View>
      ) : balance > 0 ? (
        <TouchableOpacity style={s.createBtn} onPress={() => setCreateOpen(true)}>
          <AppIcon name="link-plus" size={16} color="#FFFFFF" />
          <Text style={s.createText}>Ödeme Linki Oluştur</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.noBalanceText}>Bakiye yok — bu fatura tahsil edildi</Text>
      )}

      {/* Geçmiş intent'ler */}
      {intents.length > 0 && (
        <View style={s.history}>
          <Text style={s.historyTitle}>Geçmiş ({intents.length})</Text>
          {intents.slice(0, 5).map(it => {
            const cfg = PAYMENT_STATUS_LABELS[it.status];
            return (
              <View key={it.id} style={s.historyRow}>
                <View style={[s.statusDot, { backgroundColor: cfg.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.historyAmount}>{fmtMoney(Number(it.amount))}</Text>
                  <Text style={s.historyMeta}>
                    {new Date(it.created_at).toLocaleDateString('tr-TR')}
                    {it.installments > 1 ? ` · ${it.installments} taksit` : ''}
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: cfg.color + '15' }]}>
                  <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                {it.status === 'paid' && (
                  <TouchableOpacity onPress={() => handleRefund(it)} style={s.miniBtn}>
                    <AppIcon name="undo" size={12} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>
      )}

      {loading && <ActivityIndicator size="small" color="#2563EB" />}

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
    if (num > defaultAmount) { toast.error(`En fazla ${defaultAmount.toFixed(2)} ₺ olabilir`); return; }
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
      <View style={mm.overlay}>
        <View style={mm.sheet}>
          <View style={mm.header}>
            <Text style={mm.title}>Ödeme Linki Oluştur</Text>
            <TouchableOpacity onPress={onClose} style={mm.closeBtn}>
              <AppIcon name="close" size={18} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={{ padding: 16, gap: 12 }}>
            <View>
              <Text style={mm.label}>Tutar (₺)</Text>
              <TextInput
                style={mm.input}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0,00"
              />
              <Text style={mm.hint}>Maksimum bakiye: {defaultAmount.toFixed(2)} ₺</Text>
            </View>

            <View>
              <Text style={mm.label}>Geçerlilik Süresi (gün)</Text>
              <TextInput
                style={mm.input}
                value={days}
                onChangeText={setDays}
                keyboardType="number-pad"
                placeholder="7"
              />
            </View>
          </View>

          <View style={mm.footer}>
            <TouchableOpacity onPress={onClose} style={mm.cancelBtn}>
              <Text style={mm.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCreate}
              disabled={busy}
              style={[mm.primaryBtn, busy && { opacity: 0.6 }]}
            >
              {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : <AppIcon name="link" size={14} color="#FFFFFF" />}
              <Text style={mm.primaryText}>{busy ? 'Oluşturuluyor...' : 'Oluştur'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, padding: 16, gap: 12, ...Shadows.card } as any,
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  providerHint: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  activeBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  activeLabel: { fontSize: 10, fontWeight: '700', color: '#1E40AF', textTransform: 'uppercase', letterSpacing: 0.4 },
  activeUrl: { fontSize: 12, color: '#1E40AF', fontFamily: 'monospace' as any, marginTop: 4 },
  activeMeta: { fontSize: 11, color: '#3B82F6', marginTop: 4 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#2563EB' },
  copyText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },

  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB' },
  createText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  noBalanceText: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingVertical: 8 },

  history: { gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  historyTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  historyAmount: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  historyMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  miniBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
});

const mm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  sheet:   { width: '100%', maxWidth: 440, backgroundColor: CardSpec.bg, borderRadius: CardSpec.radius, borderWidth: 1, borderColor: CardSpec.border, overflow: 'hidden', ...Shadows.card } as any,
  header:  { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  title:   { flex: 1, fontSize: 16, fontWeight: '800', color: '#0F172A' },
  closeBtn:{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  label:   { fontSize: 11, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  input:   { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0F172A', backgroundColor: '#FFFFFF' },
  hint:    { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  footer:  { flexDirection: 'row', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  cancelBtn:  { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#475569' },
  primaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' },
  primaryText:{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
