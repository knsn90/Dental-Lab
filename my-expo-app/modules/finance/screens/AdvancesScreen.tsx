import { localeTag } from '../../../core/i18n';
/**
 * AdvancesScreen — Avanslar (tüm ekip için)
 *
 * Finans Hub içinde "Avanslar" tab'ı olarak servis edilir.
 * Her satır: personel + bekleyen avans + toplam verilen + "Avans Ver" butonu.
 *
 * Patterns §13 Form Popup pattern uygulandı.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Banknote, Plus, Check, X, Trash2, CheckCircle2, Users, Clock, Wallet } from '../../../core/ui/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { DS } from '../../../core/theme/dsTokens';
import { DatePicker } from '../../../core/ui/DatePicker';
import {
  createAdvance, deleteAdvance, markAdvanceDeducted, fetchAdvanceTotalsByCurrency,
  ROLE_LABELS,
  type Employee, type EmployeeAdvance,
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

// Modal sub-componentinde fallback olarak; ana ekranda usePanelTheme override eder.
const P = '#7C3AED';

interface EmpRow extends Employee {
  total_advances?: number;
  pending_advances?: number;
  advancesByCcy?: CurrencyTotal[];
  pendingByCcy?: CurrencyTotal[];
  last_advance?: EmployeeAdvance | null;
}

export function AdvancesScreen() {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  const P = usePanelTheme().primary;
  const insets = useSafeAreaInsets();
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const LS_KEY_ADV = 'advances_screen_v1';
  const loadCachedAdv = (): { employees: EmpRow[]; recent: EmployeeAdvance[]; allAdvSlices?: CurrencyTotal[]; allPendSlices?: CurrencyTotal[] } | null => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    try { const r = window.localStorage.getItem(LS_KEY_ADV); return r ? JSON.parse(r) : null; } catch { return null; }
  };
  const saveCachedAdv = (data: { employees: EmpRow[]; recent: EmployeeAdvance[]; allAdvSlices?: CurrencyTotal[]; allPendSlices?: CurrencyTotal[] }) => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try { window.localStorage.setItem(LS_KEY_ADV, JSON.stringify(data)); } catch { /* quota */ }
  };
  const cachedAdv = loadCachedAdv();

  const [employees, setEmployees] = useState<EmpRow[]>(cachedAdv?.employees ?? []);
  const [loading, setLoading] = useState(cachedAdv === null);
  const [advOpen, setAdvOpen] = useState<EmpRow | null>(null);
  // Toplam/bekleyen avans — TÜM kayıtlardan (aktif/pasif fark etmez, hesap sabit).
  const [allAdvSlices, setAllAdvSlices]   = useState<CurrencyTotal[]>(cachedAdv?.allAdvSlices ?? []);
  const [allPendSlices, setAllPendSlices] = useState<CurrencyTotal[]>(cachedAdv?.allPendSlices ?? []);
  const [recent, setRecent] = useState<EmployeeAdvance[]>(cachedAdv?.recent ?? []);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [empsRes, advRes, ccyRes] = await Promise.all([
      supabase.from('employees')
        .select('id, full_name, role, base_salary, is_active')
        // Pasif personel de finansta görünür (avans geçmişi korunur) — aktifler üstte.
        .order('is_active', { ascending: false })
        .order('full_name'),
      supabase.from('employee_advances')
        .select('id, employee_id, amount, advance_date, is_deducted, description, currency')
        .order('advance_date', { ascending: false })
        .limit(200),
      fetchAdvanceTotalsByCurrency(),
    ]);
    const emps = (empsRes.data ?? []) as EmpRow[];
    const advs = (advRes.data ?? []) as unknown as EmployeeAdvance[];

    const totalsByEmp: Record<string, number> = {};
    const pendingByEmp: Record<string, number> = {};
    const lastByEmp: Record<string, EmployeeAdvance> = {};
    advs.forEach(a => {
      totalsByEmp[a.employee_id] = (totalsByEmp[a.employee_id] || 0) + (a.amount || 0);
      if (!a.is_deducted) pendingByEmp[a.employee_id] = (pendingByEmp[a.employee_id] || 0) + (a.amount || 0);
      if (!lastByEmp[a.employee_id]) lastByEmp[a.employee_id] = a;
    });
    // Katı per-currency: avans toplamları view'den (çalışan + para birimi başına)
    const advCcyByEmp: Record<string, CurrencyTotal[]> = {};
    const pendCcyByEmp: Record<string, CurrencyTotal[]> = {};
    for (const r of (ccyRes.data ?? [])) {
      const cur = (r.currency || 'TRY') as Currency;
      (advCcyByEmp[r.employee_id] ??= []).push({ currency: cur, total: Number(r.total_advances) || 0, count: Number(r.advance_count) || 0 });
      if (Number(r.pending_advances) > 0)
        (pendCcyByEmp[r.employee_id] ??= []).push({ currency: cur, total: Number(r.pending_advances) || 0, count: 0 });
    }
    emps.forEach(e => {
      e.total_advances   = totalsByEmp[e.id] || 0;
      e.pending_advances = pendingByEmp[e.id] || 0;
      e.advancesByCcy = advCcyByEmp[e.id] ?? (e.total_advances > 0 ? [{ currency: 'TRY' as Currency, total: e.total_advances, count: 0 }] : []);
      e.pendingByCcy  = pendCcyByEmp[e.id] ?? (e.pending_advances > 0 ? [{ currency: 'TRY' as Currency, total: e.pending_advances, count: 0 }] : []);
      e.last_advance     = lastByEmp[e.id] ?? null;
    });
    // Toplam/bekleyen avans — TÜM kayıtlardan (çalışan aktif/pasif fark etmez → hesap sabit).
    const hasView = ccyRes.data && ccyRes.data.length;
    const allAdv: CurrencyTotal[] = hasView
      ? (ccyRes.data as any[]).map(r => ({ currency: (r.currency || 'TRY') as Currency, total: Number(r.total_advances) || 0, count: Number(r.advance_count) || 0 }))
      : Object.values(advs.reduce((acc: Record<string, CurrencyTotal>, a) => {
          const c = ((a as any).currency || 'TRY') as Currency;
          (acc[c] ??= { currency: c, total: 0, count: 0 }).total += (a.amount || 0);
          acc[c].count += 1;
          return acc;
        }, {}));
    const allPend: CurrencyTotal[] = hasView
      ? (ccyRes.data as any[]).filter(r => Number(r.pending_advances) > 0).map(r => ({ currency: (r.currency || 'TRY') as Currency, total: Number(r.pending_advances) || 0, count: 0 }))
      : Object.values(advs.filter(a => !a.is_deducted).reduce((acc: Record<string, CurrencyTotal>, a) => {
          const c = ((a as any).currency || 'TRY') as Currency;
          (acc[c] ??= { currency: c, total: 0, count: 0 }).total += (a.amount || 0);
          return acc;
        }, {}));
    const recentSlice = advs.slice(0, 50);
    setEmployees(emps);
    setRecent(recentSlice);
    setAllAdvSlices(allAdv);
    setAllPendSlices(allPend);
    saveCachedAdv({ employees: emps, recent: recentSlice, allAdvSlices: allAdv, allPendSlices: allPend });
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(cachedAdv !== null); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Katı per-currency: toplam/bekleyen avans — TÜM kayıtlardan (aktif/pasif fark etmez).
  const advAllByCcy  = useMemo(() => groupByCurrency(allAdvSlices,  s => ({ amount: s.total, currency: s.currency as Currency })), [allAdvSlices]);
  const pendAllByCcy = useMemo(() => groupByCurrency(allPendSlices, s => ({ amount: s.total, currency: s.currency as Currency })), [allPendSlices]);
  const activeCount  = useMemo(() => employees.filter(e => (e as any).is_active !== false).length, [employees]);

  if (loading) {
    return <CenteredLoader color={T.ink3} />;
  }

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: insets.top + 8, paddingBottom: 120, gap: 14 }}>
      {/* F1 HeroCard — Avans özeti */}
      <View style={{
        borderRadius: 20, overflow: 'hidden',
        backgroundColor: P, padding: 18, position: 'relative',
      }}>
        <View style={{ position: 'absolute', top: -40, end: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', bottom: -50, start: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
              Toplam Verilen Avans
            </Text>
            {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
            <MoneyMultiX slices={advAllByCcy} variant="cards" size="lg" accentColor={P} emptyText="—" />
            {pendAllByCcy.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)', marginBottom: 2 }}>Bekleyen</Text>
                <MoneyMultiX slices={pendAllByCcy} variant="inline" />
              </View>
            )}
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
            { label: 'Personel',     value: String(activeCount),               icon: Users    },
            { label: 'Para Birimi',  value: String(advAllByCcy.length || 1),    icon: Banknote },
            { label: 'Kayıt',        value: String(recent.length),             icon: Clock    },
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

      {/* Ekip listesi */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink }}>Ekip ve Avans Durumu</Text>
        </View>
        {employees.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center', gap: 8 }}>
            <Banknote size={28} color={T.ink3} strokeWidth={1.5} />
            <Text style={{ fontSize: 13, color: T.ink3 }}>Henüz aktif personel yok. Ekip menüsünden ekleyebilirsiniz.</Text>
          </View>
        ) : (
          employees.map((e, i) => {
            const isPassive = (e as any).is_active === false;
            return (
            <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: i < employees.length - 1 ? 1 : 0, borderBottomColor: T.hairline2, opacity: isPassive ? 0.62 : 1 }}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: isPassive ? T.hairline2 : P + '15', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: isPassive ? T.ink3 : P }}>{(e.full_name?.[0] ?? '?').toUpperCase()}</Text>
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
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: T.ink3 }}>Toplam verilen</Text>
                <MoneyMultiX slices={e.advancesByCcy ?? []} variant="inline" />
              </View>
              <Pressable onPress={() => setAdvOpen(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: T.ink }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.bg, marginStart: 2 }}>Avans Ver</Text>
              </Pressable>
            </View>
            );
          })
        )}
      </View>

      {/* Son avanslar */}
      <View style={{ backgroundColor: T.card, borderRadius: 16, borderWidth: 1, borderColor: T.hairline, overflow: 'hidden' }}>
        <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: T.hairline }}>
          <Text style={{ ...DISPLAY, fontSize: 18, color: T.ink }}>Son Avanslar</Text>
        </View>
        {recent.length === 0 ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: T.ink3 }}>Henüz avans yok.</Text>
          </View>
        ) : (
          recent.slice(0, 20).map((a, i) => {
            const emp = employees.find(e => e.id === a.employee_id);
            return (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: i < Math.min(recent.length, 20) - 1 ? 1 : 0, borderBottomColor: T.hairline2 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink }}>{emp?.full_name ?? '—'}</Text>
                    {a.is_deducted ? (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(5,150,105,0.10)' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#059669' }}>KESİLDİ</Text>
                      </View>
                    ) : (
                      <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(217,119,6,0.10)' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#D97706' }}>BEKLİYOR</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                    {new Date(a.advance_date).toLocaleDateString(localeTag())}{a.description ? ` · ${a.description}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: P }}>{fmtMoney(a.amount, (a as any).currency ?? 'TRY')}</Text>
                {!a.is_deducted && (
                  <Pressable
                    onPress={async () => {
                      const { error } = await markAdvanceDeducted(a.id);
                      if (error) toast.error((error as any).message);
                      else { toast.success('Avans kesildi olarak işaretlendi'); load(); }
                    }}
                    style={{ padding: 6 }}
                  >
                    <CheckCircle2 size={15} color={'#059669'} strokeWidth={1.6} />
                  </Pressable>
                )}
                <Pressable
                  onPress={async () => {
                    const { error } = await deleteAdvance(a.id);
                    if (error) toast.error((error as any).message);
                    else { toast.success('Avans silindi'); load(); }
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

      {advOpen && (
        <GiveAdvanceModal
          employee={advOpen}
          onClose={() => setAdvOpen(null)}
          onSaved={() => { setAdvOpen(null); load(); }}
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

// ═════════════════════════════════════════════════════════════════════
// GiveAdvanceModal — Patterns §13 Form Popup
// ═════════════════════════════════════════════════════════════════════
function GiveAdvanceModal({ employee, onClose, onSaved }: {
  employee: Employee; onClose: () => void; onSaved: () => void;
}) {
  const T = useMobileTokens();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('TRY');
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [desc, setDesc]     = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const amt = Number(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Geçerli tutar girin'); return; }
    setSaving(true);
    const { error } = await createAdvance({
      employee_id: employee.id, amount: amt, currency, advance_date: date,
      description: desc.trim() || undefined,
    });
    setSaving(false);
    if (error) { toast.error((error as any).message); return; }
    toast.success('Avans kaydedildi');
    onSaved();
  };

  const FL = { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.7, textTransform: 'uppercase' as const, color: T.ink2, marginBottom: 6 };
  const INP: any = {
    height: 44, borderRadius: 14, borderWidth: 1,
    borderColor: T.hairline, paddingHorizontal: 14,
    fontSize: 14, color: T.ink, backgroundColor: T.card,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(10,10,10,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
      >
        <View style={{
          backgroundColor: T.card, borderRadius: 24, width: '100%', maxWidth: 440,
          maxHeight: '92%', overflow: 'hidden',
          borderWidth: 1, borderColor: T.hairline,
          // @ts-ignore web
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        }}>
          {/* Header — Patterns §13 */}
          <View style={{
            flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
            paddingHorizontal: 28, paddingTop: 28, paddingBottom: 18,
            borderBottomWidth: 1, borderBottomColor: T.hairline,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ ...DISPLAY, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, color: T.ink }}>Avans Ver</Text>
              <Text style={{ fontSize: 12, color: T.ink3, marginTop: 4 }}>{employee.full_name}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1.5, borderColor: P, alignItems: 'center', justifyContent: 'center', marginStart: 12, marginTop: 2, cursor: 'pointer' as any }}
            >
              <X size={14} color={P} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 28, paddingVertical: 20, gap: 14 }}>
            {/* Para birimi — avans KENDİ para biriminde (katı per-currency) */}
            <View>
              <Text style={FL}>Para Birimi</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SUPPORTED_CURRENCIES.map(cur => (
                  <Pressable key={cur} onPress={() => setCurrency(cur)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: currency === cur ? P : T.hairline, backgroundColor: currency === cur ? P : 'transparent' }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: currency === cur ? '#FFF' : T.ink2 }}>{CURRENCY_META[cur].symbol}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: currency === cur ? '#FFF' : T.ink2 }}>{cur}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View>
              <Text style={FL}>{`Tutar (${CURRENCY_META[currency].symbol}) *`}</Text>
              <TextInput style={INP} value={amount} onChangeText={setAmount}
                placeholder="0,00" placeholderTextColor={T.ink3} keyboardType="decimal-pad" />
            </View>
            <View>
              <Text style={FL}>Tarih</Text>
              <DatePicker value={date} onChange={setDate} placeholder="Tarih seç" />
            </View>
            <View>
              <Text style={FL}>Açıklama (opsiyonel)</Text>
              <TextInput style={INP} value={desc} onChangeText={setDesc}
                placeholder="Kısa not…" placeholderTextColor={T.ink3} />
            </View>
          </View>

          {/* Footer — Patterns §13 */}
          <View style={{
            flexDirection: 'row', justifyContent: 'flex-end', gap: 8,
            paddingHorizontal: 28, paddingVertical: 16,
            borderTopWidth: 1, borderTopColor: T.hairline,
          }}>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999, borderWidth: 1.5, borderColor: T.hairline, opacity: saving ? 0.5 : 1, cursor: 'pointer' as any }}
            >
              <X size={12} color={T.ink3} strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink3 }}>İptal</Text>
            </Pressable>
            <Pressable
              onPress={handleSave} disabled={saving}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 7,
                paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999,
                backgroundColor: T.ink, opacity: saving ? 0.5 : 1,
                cursor: 'pointer' as any,
              }}
            >
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: P }} />
              <Text style={{ fontSize: 13, fontWeight: '700', color: T.bg }}>Avansı Kaydet</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
