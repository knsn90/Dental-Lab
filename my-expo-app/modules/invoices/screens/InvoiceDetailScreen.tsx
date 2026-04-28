import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { toast } from '../../../core/ui/Toast';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvoice } from '../hooks/useInvoices';
import {
  recordPayment, setInvoiceStatus, deleteInvoice,
  addInvoiceItem, deleteInvoiceItem,
} from '../api';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  PAYMENT_METHOD_LABELS, type PaymentMethod,
} from '../types';
import { printInvoice } from '../printInvoice';
import { C } from '../../../core/theme/colors';
import { F } from '../../../core/theme/typography';

import { AppIcon } from '../../../core/ui/AppIcon';

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.includes('T') ? new Date(iso) : new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function InvoiceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { invoice, loading, refetch } = useInvoice(id);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [addItemModalVisible, setAddItemModalVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator style={{ marginTop: 64 }} color={C.primary} />
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.emptyWrap}>
          <AppIcon name={'alert-circle-outline' as any} size={48} color={C.textMuted} />
          <Text style={s.emptyTitle}>Fatura bulunamadı</Text>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backBtnText}>Geri dön</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = INVOICE_STATUS_COLORS[invoice.status];
  const balance = Number(invoice.total) - Number(invoice.paid_amount);
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = invoice.due_date && invoice.due_date < today
    && invoice.status !== 'odendi' && invoice.status !== 'iptal';

  const handlePrint = async () => {
    const res = await printInvoice(invoice);
    if (!res.ok && res.error) toast.error(res.error);
  };

  const handleMarkSent = async () => {
    setBusy(true);
    const { error } = await setInvoiceStatus(invoice.id, 'kesildi');
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error));
    else refetch();
  };

  const handleCancel = () => {
    Alert.alert(
      'Fatura İptal',
      'Bu faturayı iptal etmek istediğinize emin misiniz? İptal sonrası düzenlenemez.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'İptal Et', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await setInvoiceStatus(invoice.id, 'iptal');
            setBusy(false);
            if (error) toast.error((error as any).message ?? String(error));
            else refetch();
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Faturayı Sil',
      'Bu taslak fatura silinecek. Geri alınamaz. Devam?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await deleteInvoice(invoice.id);
            setBusy(false);
            if (error) toast.error((error as any).message ?? String(error));
            else router.back();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.iconOnlyBtn}>
          <AppIcon name={'arrow-left' as any} size={20} color="#0F172A" />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.topTitle} numberOfLines={1}>{invoice.invoice_number}</Text>
          <View style={[s.topStatus, { backgroundColor: statusColor.bg }]}>
            <Text style={[s.topStatusText, { color: statusColor.fg }]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handlePrint} style={s.iconOnlyBtn}>
          <AppIcon name={'printer-outline' as any} size={20} color="#0F172A" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Summary card */}
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Genel Toplam</Text>
            <Text style={s.summaryTotal}>{fmtMoney(invoice.total)}</Text>
          </View>
          <View style={s.summarySub}>
            <View style={s.summarySubCol}>
              <Text style={s.summarySubLabel}>Ödenen</Text>
              <Text style={[s.summarySubValue, { color: '#047857' }]}>
                {fmtMoney(invoice.paid_amount)}
              </Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summarySubCol}>
              <Text style={s.summarySubLabel}>Kalan Bakiye</Text>
              <Text style={[s.summarySubValue, { color: balance > 0 ? (isOverdue ? '#DC2626' : '#0F172A') : '#047857' }]}>
                {fmtMoney(balance)}
              </Text>
            </View>
          </View>
          {balance > 0 && invoice.status !== 'iptal' && (
            <TouchableOpacity
              style={s.payBtn}
              activeOpacity={0.85}
              onPress={() => setPaymentModalVisible(true)}
            >
              <AppIcon name={'cash-plus' as any} size={16} color="#FFF" />
              <Text style={s.payBtnText}>Tahsilat Ekle</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info */}
        <Text style={s.sectionLabel}>Alıcı</Text>
        <View style={s.infoCard}>
          <InfoRow icon="domain" label="Klinik" value={invoice.clinic?.name ?? '—'} />
          <InfoRow icon="doctor" label="Hekim" value={invoice.doctor?.full_name ?? '—'} />
          {invoice.doctor?.phone && <InfoRow icon="phone-outline" label="Tel" value={invoice.doctor.phone} />}
          {invoice.clinic?.address && <InfoRow icon="map-marker-outline" label="Adres" value={invoice.clinic.address} />}
        </View>

        <Text style={s.sectionLabel}>Tarihler</Text>
        <View style={s.infoCard}>
          <InfoRow icon="calendar-start" label="Düzenleme" value={fmtDate(invoice.issue_date)} />
          <InfoRow
            icon="calendar-clock"
            label="Vade"
            value={fmtDate(invoice.due_date) + (isOverdue ? ' · geçti' : '')}
            valueColor={isOverdue ? '#DC2626' : undefined}
          />
          {/* Tek sipariş (eski stil) ya da toplu fatura */}
          {(invoice.linked_orders && invoice.linked_orders.length > 0)
            ? invoice.linked_orders.map((lo) => (
                lo.work_order && (
                  <InfoRow
                    key={lo.work_order_id}
                    icon="clipboard-text-outline"
                    label="İş Emri"
                    value={lo.work_order.order_number + (lo.work_order.patient_name ? ` · ${lo.work_order.patient_name}` : '')}
                    link
                    onPress={() => router.push(`/(lab)/order/${lo.work_order!.id}` as any)}
                  />
                )
              ))
            : invoice.work_order && (
                <InfoRow
                  icon="clipboard-text-outline"
                  label="İş Emri"
                  value={invoice.work_order.order_number + (invoice.work_order.patient_name ? ` · ${invoice.work_order.patient_name}` : '')}
                  link
                  onPress={() => router.push(`/(lab)/order/${invoice.work_order!.id}` as any)}
                />
              )
          }
        </View>

        {/* Items */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Kalemler ({invoice.items?.length ?? 0})</Text>
          {invoice.status === 'taslak' && (
            <TouchableOpacity onPress={() => setAddItemModalVisible(true)} style={s.smallBtn}>
              <AppIcon name={'plus' as any} size={14} color="#2563EB" />
              <Text style={s.smallBtnText}>Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={s.infoCard}>
          {(invoice.items ?? []).length === 0 ? (
            <Text style={s.emptyListText}>Kalem eklenmemiş</Text>
          ) : (
            invoice.items!.slice().sort((a, b) => a.sort_order - b.sort_order).map((it, idx) => (
              <View key={it.id} style={[s.itemRow, idx > 0 && s.itemRowBordered]}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemName}>{it.description}</Text>
                  <Text style={s.itemMeta}>
                    {Number(it.quantity).toLocaleString('tr-TR')} × {fmtMoney(it.unit_price)}
                  </Text>
                </View>
                <Text style={s.itemTotal}>{fmtMoney(it.total)}</Text>
                {invoice.status === 'taslak' && (
                  <TouchableOpacity
                    onPress={async () => {
                      const { error } = await deleteInvoiceItem(it.id);
                      if (error) toast.error((error as any).message ?? String(error));
                      else refetch();
                    }}
                    style={s.itemDelBtn}
                  >
                    <AppIcon name={'trash-can-outline' as any} size={15} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Ara Toplam</Text>
            <Text style={s.totalsValue}>{fmtMoney(invoice.subtotal)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>KDV (%{Number(invoice.tax_rate).toLocaleString('tr-TR')})</Text>
            <Text style={s.totalsValue}>{fmtMoney(invoice.tax_amount)}</Text>
          </View>
          <View style={[s.totalsRow, s.totalsGrand]}>
            <Text style={[s.totalsLabel, { fontWeight: '800', color: '#0F172A' }]}>Genel Toplam</Text>
            <Text style={[s.totalsValue, { fontWeight: '800', color: '#0F172A', fontSize: 15 }]}>
              {fmtMoney(invoice.total)}
            </Text>
          </View>
        </View>

        {/* Payments */}
        {(invoice.payments ?? []).length > 0 && (
          <>
            <Text style={s.sectionLabel}>Tahsilat Geçmişi ({invoice.payments!.length})</Text>
            <View style={s.infoCard}>
              {invoice.payments!.map((p, idx) => (
                <View key={p.id} style={[s.paymentRow, idx > 0 && s.itemRowBordered]}>
                  <View style={s.paymentIcon}>
                    <AppIcon name={'cash-check' as any} size={15} color="#047857" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentAmount}>{fmtMoney(p.amount)}</Text>
                    <Text style={s.paymentMeta}>
                      {fmtDate(p.payment_date)} · {PAYMENT_METHOD_LABELS[p.payment_method]}
                      {p.reference_no ? ` · ${p.reference_no}` : ''}
                    </Text>
                  </View>
                  {p.receiver?.full_name && (
                    <Text style={s.paymentReceiver}>{p.receiver.full_name}</Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Notes */}
        {invoice.notes && (
          <>
            <Text style={s.sectionLabel}>Notlar</Text>
            <View style={s.infoCard}>
              <Text style={s.noteText}>{invoice.notes}</Text>
            </View>
          </>
        )}

        {/* Actions */}
        <View style={s.actionsRow}>
          {invoice.status === 'taslak' && (
            <TouchableOpacity style={s.actionBtn} onPress={handleMarkSent} disabled={busy}>
              <AppIcon name={'send-outline' as any} size={16} color="#2563EB" />
              <Text style={[s.actionBtnText, { color: '#2563EB' }]}>Kesildi Olarak İşaretle</Text>
            </TouchableOpacity>
          )}
          {invoice.status !== 'iptal' && invoice.status !== 'odendi' && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={handleCancel} disabled={busy}>
              <AppIcon name={'cancel' as any} size={16} color="#DC2626" />
              <Text style={[s.actionBtnText, { color: '#DC2626' }]}>İptal Et</Text>
            </TouchableOpacity>
          )}
          {invoice.status === 'taslak' && (
            <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={handleDelete} disabled={busy}>
              <AppIcon name={'trash-can-outline' as any} size={16} color="#DC2626" />
              <Text style={[s.actionBtnText, { color: '#DC2626' }]}>Taslağı Sil</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Payment modal */}
      <PaymentModal
        visible={paymentModalVisible}
        invoiceId={invoice.id}
        maxAmount={balance}
        onClose={() => setPaymentModalVisible(false)}
        onDone={() => { setPaymentModalVisible(false); refetch(); }}
      />

      {/* Add item modal */}
      <AddItemModal
        visible={addItemModalVisible}
        invoiceId={invoice.id}
        onClose={() => setAddItemModalVisible(false)}
        onDone={() => { setAddItemModalVisible(false); refetch(); }}
      />
    </SafeAreaView>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────
function InfoRow({
  icon, label, value, valueColor, link, onPress,
}: {
  icon: string; label: string; value: string; valueColor?: string;
  link?: boolean; onPress?: () => void;
}) {
  const Wrap: any = link && onPress ? TouchableOpacity : View;
  return (
    <Wrap
      style={s.infoRow}
      onPress={onPress}
      activeOpacity={link ? 0.7 : 1}
    >
      <AppIcon name={icon as any} size={15} color={C.textMuted} />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, valueColor ? { color: valueColor, fontWeight: '700' } : null, link ? { color: '#2563EB' } : null]} numberOfLines={2}>
        {value}
      </Text>
    </Wrap>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────
function PaymentModal({
  visible, invoiceId, maxAmount, onClose, onDone,
}: { visible: boolean; invoiceId: string; maxAmount: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount]   = useState('');
  const [method, setMethod]   = useState<PaymentMethod>('nakit');
  const [refNo, setRefNo]     = useState('');
  const [notes, setNotes]     = useState('');
  const [busy, setBusy]       = useState(false);

  React.useEffect(() => {
    if (visible) {
      setAmount(maxAmount > 0 ? maxAmount.toFixed(2) : '');
      setMethod('nakit'); setRefNo(''); setNotes('');
    }
  }, [visible, maxAmount]);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Geçerli bir tutar girin.');
      return;
    }
    setBusy(true);
    const { error } = await recordPayment({
      invoice_id: invoiceId,
      amount: amt,
      payment_method: method,
      reference_no: refNo || undefined,
      notes: notes || undefined,
    });
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error));
    else onDone();
  };

  const METHOD_OPTIONS: { v: PaymentMethod; l: string; icon: string }[] = [
    { v: 'nakit',  l: 'Nakit',     icon: 'cash' },
    { v: 'kart',   l: 'Kredi K.',  icon: 'credit-card-outline' },
    { v: 'havale', l: 'Havale',    icon: 'bank-outline' },
    { v: 'cek',    l: 'Çek',       icon: 'file-document-outline' },
    { v: 'diger',  l: 'Diğer',     icon: 'dots-horizontal' },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>Tahsilat Ekle</Text>
            <TouchableOpacity onPress={onClose}>
              <AppIcon name={'close' as any} size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={m.label}>Tutar (₺)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00"
            placeholderTextColor={C.textMuted}
            keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
            style={m.input}
          />
          {maxAmount > 0 && (
            <Text style={m.hint}>Kalan bakiye: {fmtMoney(maxAmount)}</Text>
          )}

          <Text style={m.label}>Yöntem</Text>
          <View style={m.chipRow}>
            {METHOD_OPTIONS.map(opt => {
              const active = method === opt.v;
              return (
                <TouchableOpacity
                  key={opt.v}
                  style={[m.chip, active && m.chipActive]}
                  onPress={() => setMethod(opt.v)}
                >
                  <AppIcon name={opt.icon as any} size={12} color={active ? '#0F172A' : '#94A3B8'} />
                  <Text style={[m.chipText, active && m.chipTextActive]}>{opt.l}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={m.label}>Referans No (ops.)</Text>
          <TextInput
            value={refNo}
            onChangeText={setRefNo}
            placeholder="Havale/çek referans no"
            placeholderTextColor={C.textMuted}
            style={m.input}
          />

          <Text style={m.label}>Not (ops.)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Ek bilgi…"
            placeholderTextColor={C.textMuted}
            multiline
            style={[m.input, { minHeight: 56, textAlignVertical: 'top' }]}
          />

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, busy && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={busy}
            >
              <Text style={m.saveText}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────
function AddItemModal({
  visible, invoiceId, onClose, onDone,
}: { visible: boolean; invoiceId: string; onClose: () => void; onDone: () => void }) {
  const [desc, setDesc] = useState('');
  const [qty, setQty]   = useState('1');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (visible) { setDesc(''); setQty('1'); setPrice(''); }
  }, [visible]);

  const handleSave = async () => {
    const q = Number(qty.replace(',', '.'));
    const p = Number(price.replace(',', '.'));
    if (!desc.trim()) { toast.error('Açıklama girin.'); return; }
    if (!Number.isFinite(q) || q <= 0) { toast.error('Geçerli bir adet girin.'); return; }
    if (!Number.isFinite(p) || p < 0)  { toast.error('Geçerli bir birim fiyat girin.'); return; }
    setBusy(true);
    const { error } = await addInvoiceItem(invoiceId, {
      description: desc.trim(), quantity: q, unit_price: p,
    });
    setBusy(false);
    if (error) toast.error((error as any).message ?? String(error));
    else onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={m.header}>
            <Text style={m.title}>Kalem Ekle</Text>
            <TouchableOpacity onPress={onClose}>
              <AppIcon name={'close' as any} size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={m.label}>Açıklama</Text>
          <TextInput
            value={desc}
            onChangeText={setDesc}
            placeholder="Örn: Zirkonya kron"
            placeholderTextColor={C.textMuted}
            style={m.input}
          />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={m.label}>Adet</Text>
              <TextInput
                value={qty}
                onChangeText={setQty}
                placeholder="1"
                placeholderTextColor={C.textMuted}
                keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                style={m.input}
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={m.label}>Birim Fiyat (₺)</Text>
              <TextInput
                value={price}
                onChangeText={setPrice}
                placeholder="0,00"
                placeholderTextColor={C.textMuted}
                keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                style={m.input}
              />
            </View>
          </View>

          <View style={m.footer}>
            <TouchableOpacity style={m.cancelBtn} onPress={onClose} disabled={busy}>
              <Text style={m.cancelText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[m.saveBtn, busy && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={busy}
            >
              <Text style={m.saveText}>{busy ? 'Ekleniyor…' : 'Ekle'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F7F9FB' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    gap: 6,
  },
  iconOnlyBtn: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  topStatus: { marginTop: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  topStatusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },

  summaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 18, marginBottom: 16, gap: 14,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryTotal: { fontSize: 24, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  summarySub: { flexDirection: 'row' },
  summarySubCol: { flex: 1 },
  summarySubLabel: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  summarySubValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: '#F1F5F9', marginHorizontal: 14 },
  payBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 10, backgroundColor: '#2563EB',
  },
  payBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8, marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8, marginBottom: 8,
  },
  smallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#DBEAFE',
  },
  smallBtnText: { fontSize: 11, fontWeight: '700', color: '#2563EB' },

  infoCard: {
    backgroundColor: '#FFFFFF', borderRadius: 12,
    borderWidth: 1, borderColor: '#F1F5F9',
    padding: 6, marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
  },
  infoLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', minWidth: 68 },
  infoValue: { fontSize: 13, color: '#0F172A', fontWeight: '600', flex: 1, textAlign: 'right' },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 10,
  },
  itemRowBordered: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  itemName: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  itemMeta: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  itemTotal: { fontSize: 13, fontWeight: '800', color: '#0F172A', minWidth: 80, textAlign: 'right' },
  itemDelBtn: { padding: 4 },
  emptyListText: { padding: 20, textAlign: 'center', color: '#94A3B8', fontStyle: 'italic' },

  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 7, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: '#F1F5F9',
  },
  totalsGrand: { borderTopWidth: 2, borderTopColor: '#0F172A', paddingTop: 10 },
  totalsLabel: { fontSize: 12, color: '#475569', fontWeight: '600' },
  totalsValue: { fontSize: 13, color: '#0F172A', fontWeight: '700' },

  paymentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 10, paddingHorizontal: 10,
  },
  paymentIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center',
  },
  paymentAmount: { fontSize: 14, fontWeight: '800', color: '#047857' },
  paymentMeta: { fontSize: 11, color: '#64748B', marginTop: 1 },
  paymentReceiver: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },

  noteText: { fontSize: 13, color: '#334155', lineHeight: 20, padding: 12 },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF',
  },
  actionBtnDanger: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  actionBtnText: { fontSize: 13, fontWeight: '700' },

  emptyWrap: { alignItems: 'center', paddingVertical: 80, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  backBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F1F5F9' },
  backBtnText: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: '#FFFFFF', borderRadius: 20,
    width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden',
    padding: 20, paddingBottom: 28, gap: 6,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  label: {
    fontSize: 11, fontWeight: '700', color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 10, marginBottom: 4,
  },
  input: {
    fontSize: 15, color: '#0F172A',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  hint: { fontSize: 11, color: '#94A3B8', marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#F1F5F9', backgroundColor: '#FAFAFA',
  },
  chipActive: { borderColor: '#0F172A', backgroundColor: '#F1F5F9' },
  chipText: { fontSize: 12, fontWeight: '500', color: '#94A3B8' },
  chipTextActive: { color: '#0F172A', fontWeight: '600' },
  footer: { flexDirection: 'row', gap: 8, marginTop: 18 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  saveBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  saveText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
