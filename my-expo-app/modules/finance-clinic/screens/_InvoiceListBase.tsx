/**
 * Mali İşlemler — Fatura Liste (paylaşılan base).
 * "open" filtresi = tüm açık faturalar; "overdue" = sadece vadesi geçenler.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { FileText, AlertCircle, CreditCard, ChevronRight } from 'lucide-react-native';

import { DS } from '../../../core/theme/dsTokens';
import { fetchOpenInvoices, type ClinicInvoiceRow } from '../api';
import {
  DISPLAY, TRY, M, Mnat, fmtDate, PAGE_PADDING,
  ErrorBar, Loader, Card, SecHeader, EmptyCard, StatusChip, PillButton,
} from '../components/atoms';
import { useRates, rateToBase } from '../../../core/money/rateCache';
import { getBaseCurrency } from '../../../core/money/baseCurrency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { formatMoney, type Currency } from '../../../core/money/currency';

type Props = {
  clinicId: string;
  filter: 'open' | 'overdue';
  title: string;
  eyebrow: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: any;
};

export function InvoiceListBase({
  clinicId, filter, title, eyebrow, emptyTitle, emptyDescription, emptyIcon,
}: Props) {
  useRates();
  const router = useRouter();
  const segments = useSegments();
  const panelBase = String(segments?.[0] ?? '(clinic)');
  const [items, setItems] = useState<ClinicInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setItems(await fetchOpenInvoices(clinicId)); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setLoading(false); }
  }, [clinicId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'overdue') return items.filter(i => i.days_overdue > 0);
    return items;
  }, [items, filter]);

  // Katı per-currency: kalan tutar para birimine göre BAĞIMSIZ (asla toplanmaz)
  const remByCcy = groupByCurrency(filtered, i => ({ amount: Number(i.remaining) || 0, currency: (i.currency || 'TRY') as Currency }));
  const remLabel = remByCcy.length
    ? remByCcy.map(s => formatMoney(s.total, s.currency, { fractionDigits: 0 })).join(' · ')
    : '—';

  if (loading) return <Loader />;
  if (error)   return <View style={{ padding: PAGE_PADDING }}><ErrorBar message={error} /></View>;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: PAGE_PADDING, paddingBottom: 48, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      <SecHeader
        eyebrow={eyebrow}
        title={title}
        desc={
          filtered.length === 0
            ? '—'
            : `${filtered.length} fatura · ${remLabel} kalan`
        }
      />

      {filtered.length === 0 ? (
        <EmptyCard icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden', borderColor: filter === 'overdue' ? 'rgba(217,75,75,0.30)' : DS.ink[200] }}>
          {filtered.map((inv, i) => {
            const isOverdue = inv.days_overdue > 0;
            return (
              <Pressable
                key={inv.id}
                onPress={() => router.push(`/${panelBase}/invoice/${inv.id}` as any)}
                style={({ pressed }) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: i < filtered.length - 1 ? 1 : 0,
                  borderBottomColor: DS.ink[100],
                  backgroundColor: pressed ? DS.ink[50] : 'transparent',
                })}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: isOverdue ? 'rgba(217,75,75,0.10)' : DS.ink[100],
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {isOverdue
                    ? <AlertCircle size={18} color="#9C2E2E" strokeWidth={2} />
                    : <FileText size={18} color={DS.ink[700]} strokeWidth={2} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: DS.ink[900] }} numberOfLines={1}>
                      Fatura {inv.invoice_no ?? '—'}
                    </Text>
                    <StatusChip status={inv.status} />
                  </View>
                  <Text style={{ fontSize: 11, color: isOverdue ? '#9C2E2E' : DS.ink[500], marginTop: 4 }}>
                    {isOverdue
                      ? `${inv.days_overdue} gün gecikmiş · vade ${fmtDate(inv.due_date)}`
                      : `Vade ${fmtDate(inv.due_date)} · ${Math.abs(inv.days_overdue)} gün kaldı`}
                    {inv.paid_amount > 0 ? `  ·  ${Mnat(inv.paid_amount, inv.currency)} ödendi` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ ...DISPLAY, fontSize: 20, color: isOverdue ? '#9C2E2E' : DS.ink[900], letterSpacing: -0.5 }}>
                    {Mnat(inv.remaining, inv.currency)}
                  </Text>
                  <Text style={{ fontSize: 9, color: DS.ink[400], textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>
                    Kalan
                  </Text>
                </View>
                <PillButton variant={isOverdue ? 'danger' : 'dark'} size="sm" leftIcon={<CreditCard size={12} color="#FFF" />}>
                  Öde
                </PillButton>
                <ChevronRight size={16} color={DS.ink[400]} />
              </Pressable>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}
