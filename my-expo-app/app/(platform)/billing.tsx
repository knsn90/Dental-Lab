import { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from 'react-native';
import { CreditCard, Check, Ban, RotateCcw, Info } from 'lucide-react-native';
import { billingOverview, listPlans, setPlanPrice, setPlanLimits, listInvoices, setInvoiceStatus, LIMIT_METRICS, type BillingOverview, type PlanDef, type PlatformInvoice } from '../../modules/platform/api';
import { C, FONT, PageHeader, Panel, Kpi, Chip, Banner, SectionLabel, IconChip, hexA, fmtMoney } from '../../modules/platform/ui';

const stTone = (s: string) => (s === 'paid' ? C.green : s === 'void' ? C.ink3 : C.amber);

export default function PlatformBilling() {
  const [ov, setOv] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<PlanDef[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [lim, setLim] = useState<Record<string, string>>({}); // `${plan}:${metric}` → değer
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

  const inputStyle = (active: boolean, w: number, h = 38, fs = 14): any => ({ width: w, height: h, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.cardHover, borderWidth: 1, borderColor: active ? C.accent : C.line, color: C.ink, fontSize: fs, textAlign: 'end' as any, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingBottom: 72, maxWidth: 1080, width: '100%', alignSelf: 'center' }}>
        <PageHeader eyebrow="Yönetim" title="Faturalama"
          description="Abonelik geliri, plan fiyatları ve fatura yönetimi."
          stats={ov ? [{ label: 'MRR', value: fmtMoney(ov.mrr_cents, ov.currency), tone: C.green }] : undefined} />

        {!ov ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.accent} /></View>
        ) : (
          <>
            {/* Gelir KPI */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 }}>
              <Kpi label="MRR (aylık)" value={fmtMoney(ov.mrr_cents, ov.currency)} tone={C.green} />
              <Kpi label="ARR (yıllık)" value={fmtMoney(ov.arr_cents, ov.currency)} />
              <Kpi label="Ödeyen lab" value={ov.paying_labs} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 28 }}>
              <Kpi label="Açık alacak" value={fmtMoney(ov.outstanding_cents, ov.currency)} tone={ov.outstanding_cents > 0 ? C.amber : C.ink} />
              <Kpi label="Açık fatura" value={ov.open_invoices} />
              <Kpi label="Son 30g tahsilat" value={fmtMoney(ov.paid_30d_cents, ov.currency)} tone={C.green} />
            </View>

            <Banner tone={C.accent} icon={Info}>
              Manuel faturalama aktif. Otomatik tahsilat için Stripe/iyzico entegrasyonu (webhook fatura durumunu günceller) sonraki adımda eklenir.
            </Banner>

            {/* Plan fiyatları */}
            <SectionLabel>Plan fiyatları</SectionLabel>
            <Panel padding={0} style={{ marginBottom: 28 }}>
              {plans.map((p, i) => (
                <View key={p.key} style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: C.ink, fontSize: 14, fontWeight: '700', letterSpacing: -0.2 }}>{p.name}</Text>
                      <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>{p.key} · {p.billing_interval}</Text>
                    </View>
                    <TextInput
                      value={edit[p.key] ?? String(p.price_cents / 100)}
                      onChangeText={(t) => setEdit((e) => ({ ...e, [p.key]: t }))}
                      keyboardType="numeric"
                      style={inputStyle(edit[p.key] != null, 110)} />
                    <Text style={{ color: C.ink3, fontSize: 13, width: 34 }}>{p.currency}</Text>
                    {edit[p.key] != null ? (
                      <Pressable disabled={busy} onPress={() => savePrice(p.key)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>Kaydet</Text>
                      </Pressable>
                    ) : <View style={{ width: 72 }} />}
                  </View>
                  {/* limitler */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: C.ink3, fontSize: 11.5 }}>Limit (0=∞):</Text>
                    {LIMIT_METRICS.map((m) => {
                      const dk = `${p.key}:${m.key}`;
                      const cur = Number(p.limits?.[m.key] ?? 0);
                      return (
                        <View key={m.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Text style={{ color: C.ink3, fontSize: 11.5 }}>{m.label}</Text>
                          <TextInput value={lim[dk] ?? String(cur)} onChangeText={(t) => setLim((l) => ({ ...l, [dk]: t }))} keyboardType="numeric"
                            style={inputStyle(lim[dk] != null, 62, 30, 12.5)} />
                        </View>
                      );
                    })}
                    {LIMIT_METRICS.some((m) => lim[`${p.key}:${m.key}`] != null) && (
                      <Pressable disabled={busy} onPress={async () => {
                        const next: Record<string, number> = { ...(p.limits ?? {}) };
                        LIMIT_METRICS.forEach((m) => { const dk = `${p.key}:${m.key}`; if (lim[dk] != null) next[m.key] = parseInt(lim[dk], 10) || 0; });
                        setBusy(true); try { await setPlanLimits(p.key, next); Object.keys(lim).filter((k) => k.startsWith(p.key + ':')).forEach((k) => delete lim[k]); await load(); } finally { setBusy(false); }
                      }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: C.accent, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Limit kaydet</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
            </Panel>

            {/* Faturalar */}
            <SectionLabel>Son faturalar</SectionLabel>
            {invoices.length === 0 ? (
              <Panel style={{ alignItems: 'center', paddingVertical: 36, gap: 10 }}>
                <IconChip icon={CreditCard} tone={C.ink3} size={52} />
                <Text style={{ color: C.ink3, fontSize: 14 }}>Henüz fatura yok. Lab detayından fatura kesebilirsin.</Text>
              </Panel>
            ) : (
              <Panel padding={0}>
                {invoices.map((inv, i) => (
                  <View key={inv.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontWeight: '600' }}>{inv.lab_name || '—'}</Text>
                      <Text style={{ color: C.ink3, fontSize: 12, fontFamily: FONT }}>#{inv.id} · {new Date(inv.issued_at).toLocaleDateString()}{inv.due_at ? ` · vade ${new Date(inv.due_at).toLocaleDateString()}` : ''}</Text>
                    </View>
                    <Text style={{ ...({ fontFamily: FONT } as any), color: C.ink, fontSize: 15, fontWeight: '600' }}>{fmtMoney(inv.amount_cents, inv.currency)}</Text>
                    <Chip tone={stTone(inv.status)} dot>{inv.status.toUpperCase()}</Chip>
                    {inv.status === 'open' ? (
                      <>
                        <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'paid'))} style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: hexA(C.green, 0.12), ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Check size={15} color={C.green} strokeWidth={2} />
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'void'))} style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                          <Ban size={15} color={C.ink3} strokeWidth={2} />
                        </Pressable>
                      </>
                    ) : (
                      <Pressable disabled={busy} onPress={() => invAct(() => setInvoiceStatus(inv.id, 'open'))} style={{ width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: C.cardHover, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}>
                        <RotateCcw size={15} color={C.ink3} strokeWidth={2} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </Panel>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
