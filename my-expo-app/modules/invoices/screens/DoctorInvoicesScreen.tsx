// ─────────────────────────────────────────────────────────────────────────
//  DoctorInvoicesScreen — hekim paneli için salt-okunur fatura listesi
//  Giriş yapmış hekimin bağlı olduğu kliniğin faturalarını gösterir.
//  Filtre: tümü | bekleyen (kesildi + kısmi) | ödendi | vadesi geçmiş
// ─────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useInvoices } from '../hooks/useInvoices';
import { useDoctorScope } from '../../clinics/hooks/useDoctorScope';
import {
  INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, type InvoiceStatus,
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
  const d = new Date(s);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function isOverdue(inv: { due_date: string | null; status: InvoiceStatus }) {
  if (!inv.due_date) return false;
  if (inv.status === 'odendi' || inv.status === 'iptal') return false;
  return new Date(inv.due_date) < new Date(new Date().toDateString());
}

type Filter = 'all' | 'unpaid' | 'paid' | 'overdue';

export function DoctorInvoicesScreen() {
  const router = useRouter();
  const { clinicId, loading: scopeLoading } = useDoctorScope();
  const [filter, setFilter] = useState<Filter>('all');

  const { invoices, loading, refetch } = useInvoices({
    clinic_id: clinicId ?? undefined,
  });

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (filter === 'unpaid') {
        return inv.status === 'kesildi' || inv.status === 'kismi_odendi';
      }
      if (filter === 'paid')    return inv.status === 'odendi';
      if (filter === 'overdue') return isOverdue(inv);
      return true;
    });
  }, [invoices, filter]);

  const totals = useMemo(() => {
    return invoices.reduce((acc, i) => ({
      billed: acc.billed + Number(i.total ?? 0),
      paid:   acc.paid + Number(i.paid_amount ?? 0),
    }), { billed: 0, paid: 0 });
  }, [invoices]);
  const balance = totals.billed - totals.paid;

  if (scopeLoading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.centered}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!clinicId) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.title}>Faturalarım</Text>
        </View>
        <View style={s.centered}>
          <Text style={s.emptyIcon}>🧾</Text>
          <Text style={s.emptyTitle}>Kliniğiniz bulunamadı</Text>
          <Text style={s.emptySub}>
            Klinik bilginiz henüz sisteme bağlanmamış. Lütfen laboratuvar ile
            iletişime geçin.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Faturalarım</Text>
        <Text style={s.subtitle}>Kliniğinize kesilen faturalar</Text>
      </View>

      {/* Özet kartları */}
      <View style={s.summaryRow}>
        <Card style={s.summaryCard}>
          <Text style={s.summaryLabel}>Toplam Faturalanan</Text>
          <Text style={s.summaryValue}>{fmtMoney(totals.billed)}</Text>
        </Card>
        <Card style={s.summaryCard}>
          <Text style={s.summaryLabel}>Ödenen</Text>
          <Text style={[s.summaryValue, { color: C.success }]}>
            {fmtMoney(totals.paid)}
          </Text>
        </Card>
        <Card style={s.summaryCard}>
          <Text style={s.summaryLabel}>Kalan Bakiye</Text>
          <Text style={[s.summaryValue, balance > 0 && { color: C.danger }]}>
            {fmtMoney(balance)}
          </Text>
        </Card>
      </View>

      {/* Filtre chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
      >
        {([
          ['all',     'Tümü'],
          ['unpaid',  'Bekleyen'],
          ['overdue', 'Vadesi Geçmiş'],
          ['paid',    'Ödendi'],
        ] as const).map(([val, label]) => (
          <TouchableOpacity
            key={val}
            onPress={() => setFilter(val)}
            style={[s.chip, filter === val && s.chipActive]}
          >
            <Text style={[s.chipText, filter === val && s.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Liste */}
      <ScrollView
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
      >
        {filtered.length === 0 && !loading && (
          <View style={s.centered}>
            <Text style={s.emptyIcon}>🧾</Text>
            <Text style={s.emptyTitle}>Fatura bulunamadı</Text>
            <Text style={s.emptySub}>Seçili filtrede fatura yok.</Text>
          </View>
        )}

        {filtered.map(inv => {
          const overdue = isOverdue(inv);
          const color = INVOICE_STATUS_COLORS[inv.status] ?? { fg: C.textSecondary, bg: C.border };
          const remaining = Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0);

          return (
            <TouchableOpacity
              key={inv.id}
              onPress={() => router.push(`/(doctor)/invoice/${inv.id}` as any)}
              activeOpacity={0.7}
            >
              <Card style={s.item}>
                <View style={s.itemTop}>
                  <Text style={s.invNumber}>{inv.invoice_number}</Text>
                  <View style={[s.badge, { backgroundColor: color.bg }]}>
                    <Text style={[s.badgeText, { color: color.fg }]}>
                      {overdue && inv.status !== 'odendi' ? 'Gecikmiş' : INVOICE_STATUS_LABELS[inv.status]}
                    </Text>
                  </View>
                </View>

                <Text style={s.itemDate}>
                  Kesim: {fmtDate(inv.issue_date)}
                  {inv.due_date ? `  •  Vade: ${fmtDate(inv.due_date)}` : ''}
                </Text>

                {inv.work_order ? (
                  <Text style={s.itemSub}>
                    İş Emri: {inv.work_order.order_number}
                    {inv.work_order.patient_name ? ` — ${inv.work_order.patient_name}` : ''}
                  </Text>
                ) : null}

                <View style={s.itemBottom}>
                  <Text style={s.itemTotal}>{fmtMoney(inv.total)}</Text>
                  {remaining > 0 ? (
                    <Text style={[s.itemRemaining, overdue && { color: C.danger }]}>
                      Kalan: {fmtMoney(remaining)}
                    </Text>
                  ) : (
                    <Text style={[s.itemRemaining, { color: C.success }]}>
                      Tamamı ödendi
                    </Text>
                  )}
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 8 },
  summaryCard: { flex: 1, padding: 12 },
  summaryLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: C.textPrimary, fontWeight: '800', marginTop: 4 },
  chipsRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.primaryBg, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  chipTextActive: { color: C.primary, fontWeight: '700' },
  list: { padding: 16, paddingTop: 4, gap: 10 },
  item: { padding: 14, marginBottom: 10 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  invNumber: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  itemDate: { fontSize: 12, color: C.textSecondary, marginTop: 4 },
  itemSub:  { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  itemTotal: { fontSize: 16, fontWeight: '800', color: C.textPrimary },
  itemRemaining: { fontSize: 13, fontWeight: '600', color: C.textSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 320 },
});
