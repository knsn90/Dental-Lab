// ─────────────────────────────────────────────────────────────────────────
//  DoctorInvoiceDetailScreen — hekim için salt-okunur fatura detayı
//  Kalemler, ödemeler ve bağlı iş emirlerini listeler.
//  Hekim bu ekrandan ödeme kaydedemez / fatura güncelleyemez.
// ─────────────────────────────────────────────────────────────────────────

import React from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvoice } from '../hooks/useInvoices';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
} from '../types';
import { C } from '../../../core/theme/colors';
import { Card } from '../../../core/ui/Card';

function fmtMoney(n: number | string | null | undefined): string {
  const v = typeof n === 'string' ? Number(n) : (n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(s?: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function DoctorInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { invoice, loading } = useInvoice(id);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!invoice) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.back}>← Geri</Text>
          </TouchableOpacity>
        </View>
        <View style={s.center}>
          <Text style={s.emptyIcon}>🧾</Text>
          <Text style={s.emptyTitle}>Fatura bulunamadı</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor =
    INVOICE_STATUS_COLORS[invoice.status] ?? { fg: C.textSecondary, bg: C.border };
  const remaining = Number(invoice.total ?? 0) - Number(invoice.paid_amount ?? 0);
  const overdue =
    invoice.due_date
      && invoice.status !== 'odendi'
      && invoice.status !== 'iptal'
      && new Date(invoice.due_date) < new Date(new Date().toDateString());

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Geri</Text>
        </TouchableOpacity>
        <Text style={s.invNumber}>{invoice.invoice_number}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {/* Durum başlığı */}
        <Card style={s.card}>
          <View style={s.statusRow}>
            <View style={[s.badge, { backgroundColor: statusColor.bg }]}>
              <Text style={[s.badgeText, { color: statusColor.fg }]}>
                {INVOICE_STATUS_LABELS[invoice.status]}
              </Text>
            </View>
            {overdue ? (
              <Text style={s.overdue}>⚠️ Vade tarihi geçti</Text>
            ) : null}
          </View>

          <View style={s.amountsRow}>
            <View style={s.amountCol}>
              <Text style={s.amountLabel}>Toplam</Text>
              <Text style={s.amountValue}>{fmtMoney(invoice.total)}</Text>
            </View>
            <View style={s.amountCol}>
              <Text style={s.amountLabel}>Ödenen</Text>
              <Text style={[s.amountValue, { color: C.success }]}>
                {fmtMoney(invoice.paid_amount)}
              </Text>
            </View>
            <View style={s.amountCol}>
              <Text style={s.amountLabel}>Kalan</Text>
              <Text style={[s.amountValue, remaining > 0 && { color: C.danger }]}>
                {fmtMoney(remaining)}
              </Text>
            </View>
          </View>
        </Card>

        {/* Temel bilgiler */}
        <Card style={s.card}>
          <Text style={s.sectionTitle}>Fatura Bilgileri</Text>
          <Row label="Kesim Tarihi" value={fmtDate(invoice.issue_date)} />
          <Row label="Vade Tarihi"  value={fmtDate(invoice.due_date)} />
          <Row label="Ara Toplam"   value={fmtMoney(invoice.subtotal)} />
          <Row label="KDV"          value={`%${invoice.tax_rate} — ${fmtMoney(invoice.tax_amount)}`} />
          {invoice.clinic ? <Row label="Klinik" value={invoice.clinic.name} /> : null}
          {invoice.doctor ? <Row label="Hekim"  value={invoice.doctor.full_name} /> : null}
          {invoice.notes ?  <Row label="Not"    value={invoice.notes} /> : null}
        </Card>

        {/* Kalemler */}
        {invoice.items && invoice.items.length > 0 && (
          <Card style={s.card}>
            <Text style={s.sectionTitle}>Kalemler</Text>
            {invoice.items.map(item => (
              <View key={item.id} style={s.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineDesc}>{item.description}</Text>
                  <Text style={s.lineSub}>
                    {item.quantity} × {fmtMoney(item.unit_price)}
                  </Text>
                </View>
                <Text style={s.lineTotal}>{fmtMoney(item.total)}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Bağlı iş emirleri */}
        {invoice.linked_orders && invoice.linked_orders.length > 0 && (
          <Card style={s.card}>
            <Text style={s.sectionTitle}>Bağlı İş Emirleri</Text>
            {invoice.linked_orders.map(link => link.work_order && (
              <TouchableOpacity
                key={link.work_order.id}
                onPress={() => router.push(`/(doctor)/order/${link.work_order!.id}` as any)}
                style={s.linkRow}
              >
                <Text style={s.linkOrder}>{link.work_order.order_number}</Text>
                <Text style={s.linkPatient}>
                  {link.work_order.patient_name ?? '—'}
                </Text>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Tek iş emri */}
        {!invoice.linked_orders?.length && invoice.work_order && (
          <Card style={s.card}>
            <Text style={s.sectionTitle}>İş Emri</Text>
            <TouchableOpacity
              onPress={() => router.push(`/(doctor)/order/${invoice.work_order!.id}` as any)}
              style={s.linkRow}
            >
              <Text style={s.linkOrder}>{invoice.work_order.order_number}</Text>
              <Text style={s.linkPatient}>
                {invoice.work_order.patient_name ?? '—'}
              </Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* Ödemeler */}
        {invoice.payments && invoice.payments.length > 0 && (
          <Card style={s.card}>
            <Text style={s.sectionTitle}>Ödemeler</Text>
            {invoice.payments.map(p => (
              <View key={p.id} style={s.lineRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.lineDesc}>
                    {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}
                  </Text>
                  <Text style={s.lineSub}>
                    {fmtDate(p.payment_date)}
                    {p.reference_no ? `  •  Ref: ${p.reference_no}` : ''}
                  </Text>
                </View>
                <Text style={[s.lineTotal, { color: C.success }]}>
                  {fmtMoney(p.amount)}
                </Text>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={rs.row}>
      <Text style={rs.label}>{label}</Text>
      <Text style={rs.value}>{value}</Text>
    </View>
  );
}

const rs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.border },
  label: { fontSize: 13, color: C.textSecondary, fontWeight: '500' },
  value: { fontSize: 13, color: C.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
});

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface,
  },
  back: { fontSize: 16, color: C.primary, fontWeight: '600' },
  invNumber: { fontSize: 14, fontWeight: '700', color: C.textSecondary },
  content: { padding: 16 },
  card: { marginBottom: 12, padding: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: C.textPrimary, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  overdue: { color: C.danger, fontWeight: '600', fontSize: 13 },
  amountsRow: { flexDirection: 'row', gap: 12 },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  amountValue: { fontSize: 16, fontWeight: '800', color: C.textPrimary, marginTop: 2 },
  lineRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  lineDesc: { fontSize: 13, fontWeight: '600', color: C.textPrimary },
  lineSub:  { fontSize: 11, color: C.textSecondary, marginTop: 2 },
  lineTotal:{ fontSize: 14, fontWeight: '700', color: C.textPrimary },
  linkRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  linkOrder: { fontSize: 13, fontWeight: '700', color: C.primary },
  linkPatient: { fontSize: 13, color: C.textSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
});
