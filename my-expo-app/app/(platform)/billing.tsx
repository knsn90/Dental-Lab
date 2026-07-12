import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { CreditCard, Check, Ban, RotateCcw } from 'lucide-react-native';
import { billingOverview, listPlans, setPlanPrice, listInvoices, setInvoiceStatus, type BillingOverview, type PlanDef, type PlatformInvoice } from '../../modules/platform/api';
import { C, FONT, PlatformNav, Kpi, fmtMoney } from '../../modules/platform/ui';

const stTone = (s: string) => (s === 'paid' ? C.green : s === 'void' ? C.ink3 : C.amber);

export default function PlatformBilling() {
  const [ov, setOv] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, p, i] = await Promise.all([billingOverview(), listPlans(), listInvoices(null, 100)]);
      setOv(o); setPlans(p); setInvoices(i);
    } catch { setOv(null); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const savePrice = async (key: string) => {
    const val = edit[key];
    if (val == null) return;
    const cents = Math.round(parseFloat(val.replace(',', '.')) * 100);
    if (isNaN(cents) || cents < 0) return;
    setBusy(true);
    try { await setPlanPrice(key, cents); setEdit((e) => { const n = { ...e }; delete n[key]; return n; }); await load(); } finally { setBusy(false); }
  };
  const invAct = async (fn: () => Promise<any>) => { setBusy(true); try { await fn(); await load(); } finally { setBusy(false); } };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 64, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <PlatformNav active="billing" />

        {!ov ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* Gelir KPI */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              <Kpi label="MRR (aylık)" value={fmtMoney(ov.mrr_cents, ov.currency)} tone={C.green} />
              <Kpi label="ARR (yıllık)" value={fmtMoney(ov.arr_cents, ov.currency)} />
              <Kpi label="Ödeyen lab" value={ov.paying_labs} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
              <Kpi label="Açık alacak" value={fmtMoney(ov.outstanding_cents, ov.currency)} tone={ov.outstanding_cents > 0 ? C.amber : C.ink} />
              <Kpi label="Açık fatura" value={ov.open_invoices} />
              <Kpi label="Son 30g tahsilat" value={fmtMoney(ov.paid_30d_cents, ov.currency)} tone={C.green} />
            </View>

            {/* Not: ödeme sağlayıcı */}
            <View style={{ backgroundColor: 'rgba(79,141,247,0.08)', borderWidth: 1, borderColor: 'rgba(79,141,247,0.25)', borderRadius: 12, padding: 12, marginBottom: 24 }}>
              <Text style={{ color: C.ink2, fontSize: 12.5 }}>Manuel faturalama aktif. Otomatik tahsilat için Stripe/iyzico entegrasyonu (webhook fatura durumunu günceller) sonraki adımda eklenir.</Text>
            </View>

            {/* Plan fiyatları */}
            <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Plan fiyatları</Text>
            <View style={{ backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden', marginBottom: 24 }}>
              {plans.map((p, i) => (
                <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{p.name}</Text>
                    <Text style={{ color: C.ink3, fontSize: 12 }}>{p.key} · {p.billing_interval}</Text>
                  </View>
                  <TextInput
                    value={edit[p.key] ?? String(p.price_cents / 100)}
                    onChangeText={(t) => setEdit((e) => ({ ...e, [p.key]: t }))}
                    keyboardType="numeric"
                    style={{ width: 110, height: 38, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: edit[p.key] != null ? C.accent : C.line, color: C.ink, fontSize: 14, textAlign: 'right', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
                  <Text style={{ color: C.ink3, fontSize: 13, width: 34 }}>{p.currency}</Text>
                  {edit[p.key] != null ? (
                    <Pressable disabled={busy} onPress={() => savePrice(p.key)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                      <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Kaydet</Text>
                    </Pressable>
                  ) : <View style={{ width: 66 }} />}
                </View>
              ))}
            </View>

            {/* Faturalar */}
            <Text style={{ color: C.ink2, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Son faturalar</Text>
            {invoices.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
                <CreditCard size={26} color={C.ink3} strokeWidth={1.5} />
                <Text style={{ color: C.ink3, fontSize: 14 }}>Henüz fatura yok. Lab detayından fatura kesebilirsin.</Text>
              </View>
            ) : (
              <View style={{ backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
                {invoices.map((inv, i) => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '500' }}>{inv.lab_name || '—'}</Text>
                      <Text style={{ color: C.ink3, fontSize: 12 }}>#{inv.id} · {new Date(inv.issued_at).toLocaleDateString()}{inv.due_at ? ` · vade ${new Date(inv.due_at).toLocaleDateString()}` : ''}</Text>
                    </View>
                    <Text style={{ color: C.ink, fontSize: 14, fontWeight: '600', fontFamily: FONT }}>{fmtMoney(inv.amount_cents, inv.currency)}</Text>
                    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: stTone(inv.status) + '22' }}>
                      <Text style={{ color: stTone(inv.status), fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{inv.status}</Text>
                    </View>
                    {inv.status === 'open' ? (
                      <>
                        <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'paid'))} style={{ padding: 7, borderRadius: 9, backgroundColor: 'rgba(55,194,133,0.12)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Check size={15} color={C.green} strokeWidth={2} />
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'void'))} style={{ padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Ban size={15} color={C.ink3} strokeWidth={2} />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'open'))} style={{ padding: 7, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.05)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <RotateCcw size={15} color={C.ink3} strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
