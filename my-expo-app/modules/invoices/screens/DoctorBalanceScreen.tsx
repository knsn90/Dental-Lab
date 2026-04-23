// ─────────────────────────────────────────────────────────────────────────
//  DoctorBalanceScreen — hekim kendi kliniğinin cari bakiyesini görür.
//  Toplam faturalanan, ödenen, kalan bakiye, vadesi geçmiş tutar.
// ─────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchClinicBalance, fetchInvoicesForClinic } from '../api';
import type { ClinicBalance, Invoice } from '../types';
import { useDoctorScope } from '../../clinics/hooks/useDoctorScope';
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

export function DoctorBalanceScreen() {
  const router = useRouter();
  const { clinic, clinicId, loading: scopeLoading } = useDoctorScope();
  const [balance, setBalance] = useState<ClinicBalance | null>(null);
  const [recent,  setRecent]  = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clinicId) { setLoading(false); return; }
    setLoading(true);

    const [balRes, invRes] = await Promise.all([
      fetchClinicBalance(clinicId),
      fetchInvoicesForClinic(clinicId),
    ]);

    setBalance(balRes.data ?? null);
    setRecent(((invRes.data ?? []) as Invoice[]).slice(0, 5));
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { void load(); }, [load]);

  if (scopeLoading || (loading && !balance)) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!clinicId) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.header}>
          <Text style={s.title}>Cari Hesap</Text>
        </View>
        <View style={s.center}>
          <Text style={s.emptyIcon}>💼</Text>
          <Text style={s.emptyTitle}>Klinik bağlantısı yok</Text>
          <Text style={s.emptySub}>Lütfen laboratuvar ile iletişime geçin.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalBilled = Number(balance?.total_billed ?? 0);
  const totalPaid   = Number(balance?.total_paid ?? 0);
  const remaining   = Number(balance?.balance ?? totalBilled - totalPaid);
  const overdueAmt  = Number(balance?.overdue_amount ?? 0);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <Text style={s.title}>Cari Hesap</Text>
        <Text style={s.subtitle}>{clinic?.name ?? 'Kliniğiniz'}</Text>
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {/* Büyük bakiye kartı */}
        <Card style={s.bigCard}>
          <Text style={s.bigLabel}>Güncel Bakiye</Text>
          <Text style={[s.bigValue, remaining > 0 && { color: C.danger }]}>
            {fmtMoney(remaining)}
          </Text>
          {overdueAmt > 0 && (
            <View style={s.overdueBox}>
              <Text style={s.overdueLabel}>Vadesi Geçmiş</Text>
              <Text style={s.overdueValue}>{fmtMoney(overdueAmt)}</Text>
              {balance?.oldest_overdue_date && (
                <Text style={s.overdueSub}>
                  En eski: {fmtDate(balance.oldest_overdue_date)}
                </Text>
              )}
            </View>
          )}
        </Card>

        {/* Detay rakamlar */}
        <View style={s.row2}>
          <Card style={s.halfCard}>
            <Text style={s.smLabel}>Toplam Faturalanan</Text>
            <Text style={s.smValue}>{fmtMoney(totalBilled)}</Text>
          </Card>
          <Card style={s.halfCard}>
            <Text style={s.smLabel}>Toplam Ödenen</Text>
            <Text style={[s.smValue, { color: C.success }]}>
              {fmtMoney(totalPaid)}
            </Text>
          </Card>
        </View>

        {/* Son faturalar */}
        <View style={s.listHeader}>
          <Text style={s.listTitle}>Son Faturalar</Text>
          <TouchableOpacity onPress={() => router.push('/(doctor)/invoices' as any)}>
            <Text style={s.linkText}>Tümünü gör →</Text>
          </TouchableOpacity>
        </View>

        {recent.length === 0 && (
          <Text style={s.emptyRow}>Henüz fatura yok.</Text>
        )}

        {recent.map(inv => (
          <TouchableOpacity
            key={inv.id}
            activeOpacity={0.7}
            onPress={() => router.push(`/(doctor)/invoice/${inv.id}` as any)}
          >
            <Card style={s.invRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.invNum}>{inv.invoice_number}</Text>
                <Text style={s.invDate}>{fmtDate(inv.issue_date)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.invTotal}>{fmtMoney(inv.total)}</Text>
                <Text style={s.invRemaining}>
                  Kalan: {fmtMoney(Number(inv.total ?? 0) - Number(inv.paid_amount ?? 0))}
                </Text>
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 2 },
  content: { padding: 16 },
  bigCard: { padding: 20, marginBottom: 12 },
  bigLabel: { fontSize: 13, color: C.textSecondary, fontWeight: '600' },
  bigValue: { fontSize: 32, fontWeight: '800', color: C.textPrimary, marginTop: 6 },
  overdueBox: {
    marginTop: 14, padding: 12, borderRadius: 10,
    backgroundColor: C.dangerBg, borderWidth: 1, borderColor: C.dangerBorder,
  },
  overdueLabel: { fontSize: 11, color: C.danger, fontWeight: '700' },
  overdueValue: { fontSize: 18, color: C.danger, fontWeight: '800', marginTop: 2 },
  overdueSub:   { fontSize: 11, color: C.danger, marginTop: 2 },
  row2: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  halfCard: { flex: 1, padding: 14 },
  smLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '600' },
  smValue: { fontSize: 18, color: C.textPrimary, fontWeight: '800', marginTop: 4 },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, marginBottom: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  linkText: { fontSize: 13, color: C.primary, fontWeight: '600' },
  emptyRow: { fontSize: 13, color: C.textSecondary, fontStyle: 'italic', padding: 12 },
  invRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 12, marginBottom: 8,
  },
  invNum: { fontSize: 14, fontWeight: '700', color: C.textPrimary },
  invDate: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  invTotal: { fontSize: 15, fontWeight: '700', color: C.textPrimary },
  invRemaining: { fontSize: 11, color: C.textSecondary, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.textPrimary },
  emptySub: { fontSize: 14, color: C.textSecondary, textAlign: 'center', maxWidth: 280 },
});
