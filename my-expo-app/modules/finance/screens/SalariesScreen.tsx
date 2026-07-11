/**
 * SalariesScreen — Maaş ödemeleri (tüm ekip için)
 *
 * Finans Hub içinde "Maaşlar" tab'ı olarak servis edilir.
 * Her satır: personel + son ödeme + toplam ödenen + "Maaş Öde" butonu.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Wallet, Plus, Check, X, Trash2, Users, Calendar, Banknote } from 'lucide-react-native';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  createSalaryPayment, deleteSalaryPayment, fetchSalaryTotalsByCurrency,
  ROLE_LABELS, MONTH_NAMES,
  type Employee, type SalaryPaymentMethod,
} from '../../employees/api';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { groupByCurrency, type CurrencyTotal } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import { formatMoney, CURRENCY_META, SUPPORTED_CURRENCIES, type Currency } from '../../../core/money/currency';

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };
// Katı per-currency: tutar KENDİ para biriminde.
const fmtMoney = (n: number, currency: string = 'TRY') => formatMoney(Number(n) || 0, (currency as Currency), { fractionDigits: 0 });

interface EmpRow extends Employee {
  total_paid?: number;
  salaryByCcy?: CurrencyTotal[];
  last_payment?: { paid_at: string; gross: number; month: number; year: number } | null;
}

interface SalaryRow {
  id: string;
  employee_id: string;
  paid_at: string;
  month: number;
  year: number;
  gross: number;
  net: number;
  method: SalaryPaymentMethod;
  currency?: string;
}

export function SalariesScreen() {
  const PANEL_PRIMARY = usePanelTheme().primary;
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const LS_KEY = 'salaries_screen_v1';
  const loadCached = (): { employees: EmpRow[]; recent: SalaryRow[]; allPaidSlices?: CurrencyTotal[] } | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCached = (data: { employees: EmpRow[]; recent: SalaryRow[]; allPaidSlices?: CurrencyTotal[] }) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cached = loadCached();

  const [employees, setEmployees] = useState<EmpRow[]>(cached?.employees ?? []);
  const [loading, setLoading] = useState(cached === null);
  const [payOpen, setPayOpen] = useState<EmpRow | null>(null);
  const [recent, setRecent] = useState<SalaryRow[]>(cached?.recent ?? []);
  // Toplam ödenen maaş — TÜM ödeme kayıtlarından (aktif/pasif fark etmez, hesap sabit).
  const [allPaidSlices, setAllPaidSlices] = useState<CurrencyTotal[]>(cached?.allPaidSlices ?? []);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [empsRes, paysRes, ccyRes] = await Promise.all([
      supabase.from('employees')
        .select('id, full_name, role, base_salary, is_active')
        // Pasif personel de finansta görünür (maaş geçmişi korunur) — aktifler üstte.
        .order('is_active', { ascending: false })
        .order('full_name'),
      supabase.from('salary_payments')
        // Gerçek kolonları (payment_date/period_month/...) ekranın beklediği adlara alias'la
        .select('id, employee_id, paid_at:payment_date, month:period_month, year:period_year, gross:gross_amount, net:net_amount, method:payment_method, currency')
        .order('payment_date', { ascending: false })
        .limit(200),
      fetchSalaryTotalsByCurrency(),
    ]);
    const emps = (empsRes.data ?? []) as EmpRow[];
    const pays = (paysRes.data ?? []) as SalaryRow[];

    const totalsByEmp: Record<string, number> = {};
    const lastByEmp: Record<string, SalaryRow> = {};
    pays.forEach(p => {
      totalsByEmp[p.employee_id] = (totalsByEmp[p.employee_id] || 0) + (p.net || 0);
      if (!lastByEmp[p.employee_id]) lastByEmp[p.employee_id] = p;
    });
    // Katı per-currency: maaş toplamları view'den (çalışan + para birimi başına)
    const salaryCcyByEmp: Record<string, CurrencyTotal[]> = {};
    for (const r of (ccyRes.data ?? [])) {
      (salaryCcyByEmp[r.employee_id] ??= []).push({
        currency: (r.currency || 'TRY') as Currency, total: Number(r.total_net) || 0, count: Number(r.payment_count) || 0,
      });
    }
    // Toplam ödenen — TÜM ödemelerden (çalışan aktif/pasif fark etmez → hesap sabit).
    // View varsa onun tüm satırları; yoksa fallback: pays'i para birimine göre grupla.
    const allSlices: CurrencyTotal[] = (ccyRes.data && ccyRes.data.length)
      ? (ccyRes.data as any[]).map(r => ({ currency: (r.currency || 'TRY') as Currency, total: Number(r.total_net) || 0, count: Number(r.payment_count) || 0 }))
      : Object.values(pays.reduce((acc: Record<string, CurrencyTotal>, p) => {
          const c = (p.currency || 'TRY') as Currency;
          (acc[c] ??= { currency: c, total: 0, count: 0 }).total += (p.net || 0);
          acc[c].count += 1;
          return acc;
        }, {}));
    emps.forEach(e => {
      e.total_paid = totalsByEmp[e.id] || 0;
      // View varsa per-currency; yoksa fallback (TRY tek dilim)
      e.salaryByCcy = salaryCcyByEmp[e.id]
        ?? (e.total_paid > 0 ? [{ currency: 'TRY' as Currency, total: e.total_paid, count: 0 }] : []);
      e.last_payment = lastByEmp[e.id] ?? null;
    });
    const recentSlice = pays.slice(0, 50);
    setEmployees(emps);
    setRecent(recentSlice);
    setAllPaidSlices(allSlices);
    saveCached({ employees: emps, recent: recentSlice, allPaidSlices: allSlices });
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(cached !== null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Katı per-currency: toplam ödenen maaş — TÜM ödemelerden (aktif/pasif fark etmez).
  const salaryAllByCcy = useMemo(
    () => groupByCurrency(allPaidSlices, s => ({ amount: s.total, currency: s.currency as Currency })),
    [allPaidSlices],
  );
  const activeCount = useMemo(() => employees.filter(e => (e as any).is_active !== false).length, [employees]);

  if (loading) {
    return <CenteredLoader color={T.ink3} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 120, gap: 14 }}>
      {/* F1 HeroCard — Maaş özeti */}
      {(() => {
        const ACCENT = PANEL_PRIMARY;
        return (
          <View style={{
            borderRadius: 20, overflow: 'hidden',
            backgroundColor: ACCENT, padding: 18, position: 'relative',
          }}>
            <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
                  Toplam Ödenen Maaş
                </Text>
                {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
                <MoneyMultiX slices={salaryAllByCcy} variant="cards" size="lg" accentColor={ACCENT} emptyText="—" />
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 8 }}>
                  {activeCount} aktif personel
                </Text>
              </View>
              <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
                <Wallet size={20} color="#FFFFFF" strokeWidth={1.6} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              {([
                { label: 'Personel',     value: String(activeCount),                 icon: Users    },
                { label: 'Para Birimi',  value: String(salaryAllByCcy.length || 1),  icon: Banknote },
                { label: 'Ödeme',        value: String(recent.length),               icon: Calendar },
              ] as const).map(stat => {
                const Icon = stat.icon;
                return (
                  <View key={stat.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                      <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                        {stat.label}
                      </Text>
                    </View>
                    <Text
                      style={{ ...DISPLAY, fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20 }}
                      numberOfLines={1}
                    >
                      {stat.value}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* Ekip listesi */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink }}>Ekip ve Maaş Durumu</Text>
        </View>
        {employees.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
            <Wallet size={28} color={T.ink3} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: T.ink3 }}>Henüz aktif personel yok. Ekip menüsünden ekleyebilirsiniz.</Text>
          </View>
        ) : (
          employees.map((e, i) => {
            const isPassive = (e as any).is_active === false;
            return (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: i < employees.length - 1 ? 1 : 0, borderBottomColor: T.hairline2, opacity: isPassive ? 0.62 : 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isPassive ? T.hairline2 : '#7C3AED15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isPassive ? T.ink3 : '#7C3AED' }}>{(e.full_name?.[0] ?? '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: T.ink }} numberOfLines={1}>{e.full_name}</Text>
                  {isPassive && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: T.hairline2 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: T.ink3, letterSpacing: 0.3 }}>PASİF</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>
                  {ROLE_LABELS[e.role]} · Maaş: {fmtMoney(e.base_salary)}
                  {e.last_payment ? `  ·  Son: ${MONTH_NAMES[e.last_payment.month - 1]} ${e.last_payment.year}` : '  ·  ödeme yok'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: T.ink3 }}>Toplam ödenen</Text>
                <MoneyMultiX slices={e.salaryByCcy ?? []} variant="inline" colorBySign={false} />
              </View>
              <Pressable onPress={() => setPayOpen(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: T.ink }}>
                <Plus size={12} color="#FFFFFF" strokeWidth={2} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.bg }}>Maaş Öde</Text>
              </Pressable>
            </View>
            );
          })
        )}
      </View>

      {/* Son ödemeler */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink }}>Son Maaş Ödemeleri</Text>
        </View>
        {recent.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: T.ink3 }}>Henüz ödeme yok.</Text>
          </View>
        ) : (
          recent.slice(0, 20).map((p, i) => {
            const emp = employees.find(e => e.id === p.employee_id);
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < Math.min(recent.length, 20) - 1 ? 1 : 0, borderBottomColor: T.hairline2 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{emp?.full_name ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                    {MONTH_NAMES[p.month - 1]} {p.year} · {p.method} · {new Date(p.paid_at).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{fmtMoney(p.net, p.currency ?? 'TRY')}</Text>
                <Pressable
                  onPress={async () => {
                    const { error } = await deleteSalaryPayment(p.id);
                    if (error) toast.error((error as any).message);
                    else { toast.success('Ödeme silindi'); load(); }
                  }}
                  style={{ padding: 6 }}
                >
                  <Trash2 size={14} color={T.ink3} strokeWidth={1.6} />
                </Pressable>
              </View>
            );
          })
        )}
      </View>

      {payOpen && (
        <PaySalaryModal
          employee={payOpen}
          onClose={() => setPayOpen(null)}
          onSaved={() => { setPayOpen(null); load(); }}
        />
      )}
    </ScrollView>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent: string }) {
  const T = useMobileTokens();
  return (
    <View style={{ flex: 1, minWidth: 160, padding: 16, backgroundColor: T.card, borderRadius: 14, borderWidth: 1, borderColor: T.hairline }}>
      <Text style={{ fontSize: 11, color: T.ink3, textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ ...DISPLAY, fontSize: 22, color: accent, marginTop: 6 }}>{value}</Text>
    </View>
  );
}

function PaySalaryModal({ employee, onClose, onSaved }: { employee: Employee; onClose: () => void; onSaved: () => void }) {
  const T = useMobileTokens();
  const today = new Date();
  const [month, setMonth] = useState(String(today.getMonth() + 1));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [gross, setGross] = useState(String(employee.base_salary || 0));
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [deductions, setDeductions] = useState('0');
  const [method, setMethod] = useState<SalaryPaymentMethod>('havale');
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const m = Number(month), y = Number(year);
    const g = Number(gross.replace(',', '.'));
    const d = Number(deductions.replace(',', '.'));
    if (!Number.isFinite(m) || m < 1 || m > 12) { toast.error('Ay 1–12 arası olmalı'); return; }
    if (!Number.isFinite(y) || y < 2020) { toast.error('Geçerli yıl girin'); return; }
    if (!Number.isFinite(g) || g <= 0) { toast.error('Brüt maaş girin'); return; }
    setSaving(true);
    const { error } = await createSalaryPayment({
      employee_id: employee.id, period_month: m, period_year: y, gross_amount: g, deductions: d || 0,
      currency, payment_method: method, payment_date: paidAt, notes: notes || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    toast.success('Maaş ödemesi kaydedildi');
    onSaved();
  };

  const inputStyle: any = {
    borderWidth: 1, borderColor: T.hairline, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.ink, backgroundColor: T.card,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ backgroundColor: T.card, borderRadius: 18, width: '100%', maxWidth: 460, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
            <View>
              <Text style={{ ...DISPLAY, fontSize: 20, color: T.ink }}>Maaş Öde</Text>
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{employee.full_name}</Text>
            </View>
            <Pressable onPress={onClose} style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color={T.ink3} strokeWidth={1.8} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Ay *</Text>
                <TextInput style={inputStyle} value={month} onChangeText={setMonth} keyboardType="number-pad" placeholder="1-12" placeholderTextColor={T.ink3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Yıl *</Text>
                <TextInput style={inputStyle} value={year} onChangeText={setYear} keyboardType="number-pad" placeholderTextColor={T.ink3} />
              </View>
            </View>
            {/* Para birimi — maaş KENDİ para biriminde (katı per-currency) */}
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Para Birimi</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SUPPORTED_CURRENCIES.map(cur => (
                  <Pressable key={cur} onPress={() => setCurrency(cur)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: currency === cur ? T.ink : T.cardSoft }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: currency === cur ? T.bg : T.ink2 }}>{CURRENCY_META[cur].symbol}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: currency === cur ? T.bg : T.ink2 }}>{cur}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>{`Brüt (${CURRENCY_META[currency].symbol}) *`}</Text>
                <TextInput style={inputStyle} value={gross} onChangeText={setGross} keyboardType="decimal-pad" placeholderTextColor={T.ink3} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Kesinti</Text>
                <TextInput style={inputStyle} value={deductions} onChangeText={setDeductions} keyboardType="decimal-pad" placeholderTextColor={T.ink3} />
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Ödeme Yöntemi</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(['havale', 'nakit', 'cek'] as SalaryPaymentMethod[]).map(m => (
                  <Pressable key={m} onPress={() => setMethod(m)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: method === m ? T.ink : T.cardSoft }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: method === m ? T.bg : T.ink2 }}>{m.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Ödeme Tarihi</Text>
              <DatePicker value={paidAt} onChange={setPaidAt} placeholder="Tarih seç" />
            </View>
            <View>
              <Text style={{ fontSize: 11, fontWeight: '600', color: T.ink2, marginBottom: 6 }}>Not</Text>
              <TextInput style={{ ...inputStyle, minHeight: 60, textAlignVertical: 'top' }} value={notes} onChangeText={setNotes} multiline placeholder="İsteğe bağlı..." placeholderTextColor={T.ink3} />
            </View>
            <Text style={{ fontSize: 12, color: T.ink3 }}>
              Net: <Text style={{ fontWeight: '700', color: '#059669' }}>{fmtMoney(Math.max(0, Number(gross.replace(',', '.')) - Number(deductions.replace(',', '.') || 0)), currency)}</Text>
            </Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: T.hairline }}>
            <Pressable onPress={onClose} style={{ flex: 1, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: T.hairline, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink2 }}>İptal</Text>
            </Pressable>
            <Pressable onPress={handleSave} disabled={saving} style={{ flex: 2, paddingVertical: 12, borderRadius: 999, backgroundColor: T.ink, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
              <Check size={14} color="#FFFFFF" strokeWidth={2} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.bg }}>Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
