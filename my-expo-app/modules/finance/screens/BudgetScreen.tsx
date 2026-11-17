/**
 * BudgetScreen — Bütçe vs. Gerçekleşen
 *
 * Yapı (Çek / Senet · Ödeme Onayları ile aynı dil):
 *   • BEYAZ HERO: dönem (‹ Kasım 2026 ›, Aylık/Yıllık) → harcanan / bütçe →
 *     tek ilerleme çubuğu → aşan / sınıra yakın kategori sayısı → düğmeler
 *   • Tek kart: her gider kategorisi bir satır — bütçesi olan (ilerleme, kalan /
 *     aşım) ve bütçesi OLMAYAN ama harcaması olan (görünür kalsın diye)
 *   • "Geçen dönemi kopyala": boş döneme önceki dönemin limitlerini taşır
 *
 * Toplam kuralı: "Genel" (total) bütçe TÜM giderleri kapsar; varsa hero onu
 * esas alır, yoksa kategori bütçeleri toplanır (ikisi birlikte toplanmaz).
 * Gerçekleşen = expenses.amount_base (yoksa amount) — v_budget_actuals ile aynı.
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Modal, TextInput, RefreshControl,
  Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import {
  Plus, PieChart, Wallet, X, Trash2, ChevronLeft, ChevronRight, Copy,
  Package, Building2, Users, Wrench, Landmark, Truck, MoreHorizontal,
} from '../../../core/ui/icons';

import { supabase } from '../../../core/api/supabase';
import { toast } from '../../../core/ui/Toast';
import { useAuthStore } from '../../../core/store/authStore';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI } from '../../../core/theme/inkScale';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { confirmAsync } from '../../../core/util/confirm';
import { baseSymbol, useBaseCurrency } from '../../../core/money/baseCurrency';
import { parseAmount } from '../../cash/drawerModel';
import { autoT } from '../../../core/i18n/autoTranslate';
import { localeTag } from '../../../core/i18n';

type BudgetCategory = 'malzeme' | 'kira' | 'personel' | 'ekipman' | 'vergi' | 'diger' | 'total';
type ExpenseCategory = Exclude<BudgetCategory, 'total'> | 'kurye';
type BudgetPeriod = 'monthly' | 'yearly';

/** budgets.category CHECK listesi — 'kurye' bu listede yok (gider tarafında var). */
const BUDGETABLE: BudgetCategory[] = ['total', 'malzeme', 'personel', 'kira', 'ekipman', 'vergi', 'diger'];
const ALL_EXPENSE: ExpenseCategory[] = ['malzeme', 'personel', 'kira', 'ekipman', 'vergi', 'kurye', 'diger'];

const CAT: Record<ExpenseCategory | 'total', { label: string; icon: React.ComponentType<any>; color: string }> = {
  total:    { label: 'Genel bütçe',     icon: Wallet,         color: '#4A8FC9' },
  malzeme:  { label: 'Malzeme',         icon: Package,        color: '#3B82F6' },
  kira:     { label: 'Kira',            icon: Building2,      color: '#8B5CF6' },
  personel: { label: 'Personel',        icon: Users,          color: '#F59E0B' },
  ekipman:  { label: 'Ekipman',         icon: Wrench,         color: '#10B981' },
  vergi:    { label: 'Vergi / Sigorta', icon: Landmark,       color: '#EF4444' },
  kurye:    { label: 'Kurye',           icon: Truck,          color: '#0EA5E9' },
  diger:    { label: 'Diğer',           icon: MoreHorizontal, color: '#64748B' },
};

/** Kullanım oranı eşikleri — status paleti (iki temada da okunur). */
const TONE = { danger: '#D94B4B', warning: '#E89B2A', success: '#2D9A6B' } as const;
const toneOf = (pct: number) => pct > 100 ? TONE.danger : pct >= 80 ? TONE.warning : TONE.success;

interface BudgetRow {
  id: string;
  category: BudgetCategory;
  period: BudgetPeriod;
  period_start: string;
  budget_amount: number;
  actual_amount: number;
  notes: string | null;
}

interface Line {
  key: ExpenseCategory | 'total';
  budget: BudgetRow | null;
  actual: number;
}

const fmtMoney = (n: number) =>
  baseSymbol() + (Number(n) || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const pad2 = (n: number) => String(n).padStart(2, '0');
function periodStartOf(period: BudgetPeriod, d = new Date()): string {
  return period === 'yearly' ? `${d.getFullYear()}-01-01` : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function shiftPeriod(period: BudgetPeriod, start: string, delta: number): string {
  const y = +start.slice(0, 4), m = +start.slice(5, 7) - 1;
  if (period === 'yearly') return `${y + delta}-01-01`;
  const d = new Date(y, m + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function periodEnd(period: BudgetPeriod, start: string): string {
  return shiftPeriod(period, start, 1);   // dışlayıcı üst sınır
}
function periodLabel(period: BudgetPeriod, start: string): string {
  const d = new Date(start + 'T00:00:00');
  if (period === 'yearly') return String(d.getFullYear());
  return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer', outlineStyle: 'none' } as any) : {};

export function BudgetScreen() {
  const labId = useAuthStore(st => st.profile?.lab_id);
  const theme = usePanelTheme();
  const U = useInkUI();
  const heroInk = useWhiteHeroInk(theme.primary);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  useBaseCurrency();

  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [start, setStart]   = useState<string>(() => periodStartOf('monthly'));
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [spend, setSpend]     = useState<Partial<Record<ExpenseCategory, number>>>({});
  const [prevCount, setPrevCount] = useState(0);
  const [loaded, setLoaded]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [editor, setEditor]   = useState<{ open: boolean; record: BudgetRow | null; category: BudgetCategory | null }>({ open: false, record: null, category: null });

  const isCurrent = start === periodStartOf(period);

  const load = useCallback(async (quiet = false) => {
    if (!labId) return;
    if (quiet) setRefreshing(true);
    setLoadError(null);
    const end = periodEnd(period, start);
    const prevStart = shiftPeriod(period, start, -1);
    const [b, e, p] = await Promise.all([
      supabase.from('v_budget_actuals').select('*').eq('period', period).eq('period_start', start),
      supabase.from('expenses').select('category, amount, amount_base').gte('expense_date', start).lt('expense_date', end),
      supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('period', period).eq('period_start', prevStart),
    ]);
    const err = b.error ?? e.error;
    if (err) {
      setLoadError(err.message);
    } else {
      setBudgets((b.data ?? []) as BudgetRow[]);
      const s: Partial<Record<ExpenseCategory, number>> = {};
      (e.data ?? []).forEach((x: any) => {
        const k = x.category as ExpenseCategory;
        s[k] = (s[k] ?? 0) + (Number(x.amount_base ?? x.amount) || 0);
      });
      setSpend(s);
      setPrevCount(p.count ?? 0);
    }
    setLoaded(true);
    setRefreshing(false);
  }, [labId, period, start]);

  useEffect(() => { load(); }, [load]);

  const changePeriodType = (p: BudgetPeriod) => {
    if (p === period) return;
    setPeriod(p);
    setStart(periodStartOf(p));
    setLoaded(false);
  };
  const step = (delta: number) => { setStart(s => shiftPeriod(period, s, delta)); setLoaded(false); };

  // ── Satırlar ──────────────────────────────────────────────────────
  const totalSpend = useMemo(() => Object.values(spend).reduce((a, n) => a + (n ?? 0), 0), [spend]);
  const overallRow = budgets.find(b => b.category === 'total') ?? null;

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    if (overallRow) out.push({ key: 'total', budget: overallRow, actual: totalSpend });
    ALL_EXPENSE.forEach(k => {
      const b = budgets.find(x => x.category === k) ?? null;
      const actual = spend[k] ?? 0;
      if (b || actual > 0) out.push({ key: k, budget: b, actual });
    });
    // Bütçeliler önce, en yüksek kullanım üstte; bütçesizler harcamaya göre altta
    const pctOf = (l: Line) => l.budget && l.budget.budget_amount > 0 ? l.actual / l.budget.budget_amount : -1;
    return out.sort((a, b) => {
      if (a.key === 'total') return -1;
      if (b.key === 'total') return 1;
      if (!!a.budget !== !!b.budget) return a.budget ? -1 : 1;
      return a.budget ? pctOf(b) - pctOf(a) : b.actual - a.actual;
    });
  }, [budgets, spend, overallRow, totalSpend]);

  const catBudgets = budgets.filter(b => b.category !== 'total');
  const totals = overallRow
    ? { budget: Number(overallRow.budget_amount) || 0, actual: totalSpend }
    : {
        budget: catBudgets.reduce((a, b) => a + (Number(b.budget_amount) || 0), 0),
        actual: catBudgets.reduce((a, b) => a + (spend[b.category as ExpenseCategory] ?? 0), 0),
      };
  const pct = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : 0;
  const overCount = lines.filter(l => l.key !== 'total' && l.budget && l.actual > l.budget.budget_amount).length;
  const nearCount = lines.filter(l => l.key !== 'total' && l.budget && l.budget.budget_amount > 0
    && l.actual / l.budget.budget_amount >= 0.8 && l.actual <= l.budget.budget_amount).length;
  const unbudgeted = lines.filter(l => !l.budget && l.key !== 'total').reduce((a, l) => a + l.actual, 0);
  const hasBudget = budgets.length > 0;

  const description = !hasBudget
    ? (totalSpend > 0
        ? `${autoT('Bu dönemde')} ${fmtMoney(totalSpend)} ${autoT('harcandı; henüz limit tanımlanmadı.')}`
        : autoT('Kategorilere limit tanımlayın; harcama giderlerden kendiliğinden işlenir.'))
    : [
        `%${pct.toFixed(0)} ${autoT('kullanıldı')}`,
        totals.actual <= totals.budget
          ? `${fmtMoney(totals.budget - totals.actual)} ${autoT('kaldı')}`
          : `${fmtMoney(totals.actual - totals.budget)} ${autoT('aşıldı')}`,
        !overallRow && unbudgeted > 0 ? `${fmtMoney(unbudgeted)} ${autoT('bütçesiz harcama')}` : null,
      ].filter(Boolean).join(' · ');

  // ── Eylemler ──────────────────────────────────────────────────────
  const openNew = (category: BudgetCategory | null = null) => setEditor({ open: true, record: null, category });
  const openEdit = (r: BudgetRow) => setEditor({ open: true, record: r, category: r.category });

  const copyPrevious = async () => {
    if (!labId || copying) return;
    setCopying(true);
    const prevStart = shiftPeriod(period, start, -1);
    const { data, error } = await supabase.from('budgets').select('category, amount, notes')
      .eq('period', period).eq('period_start', prevStart);
    if (error || !data?.length) {
      setCopying(false);
      toast.error(autoT('Önceki dönemin bütçesi okunamadı'));
      return;
    }
    const rows = data.map((r: any) => ({
      lab_id: labId, category: r.category, period, period_start: start,
      amount: r.amount, notes: r.notes, updated_at: new Date().toISOString(),
    }));
    const ins = await supabase.from('budgets').upsert(rows, { onConflict: 'lab_id,category,period,period_start', ignoreDuplicates: true });
    setCopying(false);
    if (ins.error) { toast.error(`${autoT('Kopyalanamadı')}: ${ins.error.message}`); return; }
    toast.success(`${rows.length} ${autoT('kategori bütçesi kopyalandı')}`);
    load(true);
  };

  const heroButtons: { key: string; label: string; icon: React.ComponentType<any>; onPress: () => void; primary?: boolean; busy?: boolean }[] = [
    { key: 'add', label: autoT('Bütçe ekle'), icon: Plus, onPress: () => openNew(), primary: true },
    ...(loaded && !hasBudget && prevCount > 0
      ? [{ key: 'copy', label: autoT('Önceki dönemi kopyala'), icon: Copy, onPress: copyPrevious, busy: copying }]
      : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <MobilePageTitle title="Bütçe" subtitle="Bütçe ve gerçekleşen" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={U.ink[300]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── BEYAZ HERO ───────────────────────────────────────────── */}
        <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
          <WhiteHero
            kicker={autoT('Bütçe')}
            accent={theme.primary}
            title={hasBudget ? (
              <>{autoT('Harcanan')} <Text style={{ color: pct > 100 ? TONE.danger : heroInk.accentInk }}>{fmtMoney(totals.actual)}</Text>
                <Text style={{ color: heroInk.inkFaint }}>{` / ${fmtMoney(totals.budget)}`}</Text></>
            ) : autoT('Bu dönem için bütçe yok')}
            description={loaded ? description : ' '}
            stats={hasBudget ? [
              { value: String(overCount), label: autoT('Aşan kategori'), ...(overCount > 0 ? { color: TONE.danger } : {}) },
              { value: String(nearCount), label: autoT('%80 üstü'), ...(nearCount > 0 ? { color: TONE.warning } : {}) },
            ] : []}
            actions={
              <>
                {heroButtons.map(it => (
                  <Pressable
                    key={it.key}
                    onPress={it.onPress}
                    disabled={it.busy}
                    accessibilityRole="button"
                    accessibilityLabel={it.label}
                    style={({ pressed, hovered }: any) => ({
                      flexDirection: 'row', alignItems: 'center', gap: 6,
                      height: 36, paddingHorizontal: 14, borderRadius: 999,
                      backgroundColor: it.primary ? U.ink[900] : (hovered ? U.rowHover : U.plainBtn.bg),
                      borderWidth: it.primary ? 0 : 1, borderColor: U.plainBtn.border,
                      opacity: pressed || it.busy ? 0.75 : 1, ...webPointer,
                    })}
                  >
                    {it.busy
                      ? <ActivityIndicator size="small" color={it.primary ? U.onDarkPill : U.plainBtn.fg} />
                      : <it.icon size={15} color={it.primary ? U.onDarkPill : U.plainBtn.fg} strokeWidth={1.8} />}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: it.primary ? U.onDarkPill : U.plainBtn.fg }}>{it.label}</Text>
                  </Pressable>
                ))}
              </>
            }
          >
            {/* Dönem seçici: Aylık/Yıllık + ‹ dönem › */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              <View style={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: heroInk.tileBg }}>
                {(['monthly', 'yearly'] as BudgetPeriod[]).map(p => {
                  const active = period === p;
                  return (
                    <Pressable key={p} onPress={() => changePeriodType(p)} accessibilityRole="tab" accessibilityState={{ selected: active }}
                      style={{ paddingHorizontal: active ? 18 : 12, paddingVertical: 7, borderRadius: 999, backgroundColor: active ? U.segActive : 'transparent', ...webPointer }}>
                      <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : heroInk.inkSoft }}>
                        {p === 'monthly' ? autoT('Aylık') : autoT('Yıllık')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <StepButton icon={ChevronLeft} label={autoT('Önceki dönem')} onPress={() => step(-1)} />
                <Text style={{ fontSize: 14, fontWeight: '600', color: heroInk.ink, minWidth: 120, textAlign: 'center' }}>
                  {periodLabel(period, start)}
                </Text>
                <StepButton icon={ChevronRight} label={autoT('Sonraki dönem')} onPress={() => step(1)} />
              </View>
              {!isCurrent && (
                <Pressable onPress={() => { setStart(periodStartOf(period)); setLoaded(false); }} style={webPointer}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: heroInk.inkSoft, textDecorationLine: 'underline' }}>
                    {period === 'monthly' ? autoT('Bu aya dön') : autoT('Bu yıla dön')}
                  </Text>
                </Pressable>
              )}
            </View>

            {hasBudget && (
              <View style={{ marginTop: 14, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: heroInk.tileBg }}>
                <View style={{ height: 10, width: `${Math.min(100, Math.max(0, pct))}%`, borderRadius: 5, backgroundColor: toneOf(pct) }} />
              </View>
            )}
          </WhiteHero>
        </View>

        {/* ── Kategori kartı ───────────────────────────────────────── */}
        <View style={{ paddingHorizontal: PAGE_PADDING }}>
          <View style={U.tableCard}>
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 14,
              borderBottomWidth: 1, borderBottomColor: U.hairline,
            }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>{autoT('Kategoriler')}</Text>
              <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${autoT('Toplam harcama')} ${fmtMoney(totalSpend)}`}</Text>
            </View>

            {loadError ? (
              <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16, gap: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: U.chipTones.danger.fg }}>{autoT('Bütçe yüklenemedi')}</Text>
                <Text style={{ fontSize: 12, color: U.ink[500], textAlign: 'center', maxWidth: 380 }}>{loadError}</Text>
                <Pressable onPress={() => load(true)} style={({ pressed }: any) => ({
                  marginTop: 4, height: 36, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center',
                  backgroundColor: U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.8 : 1, ...webPointer,
                })}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Tekrar dene')}</Text>
                </Pressable>
              </View>
            ) : !loaded ? (
              <View style={{ paddingVertical: 64, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, color: U.ink[400] }}>Yükleniyor…</Text>
              </View>
            ) : lines.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
                <PieChart size={36} strokeWidth={1.4} color={U.ink[300]} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>Bu dönemde bütçe ve harcama yok</Text>
                <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 340, lineHeight: 19 }}>
                  Kategorilere aylık ya da yıllık limit tanımlayın; giderler girildikçe kullanım burada görünür.
                </Text>
              </View>
            ) : (
              lines.map((l, i) => (
                <CategoryLine
                  key={l.key}
                  line={l}
                  isLast={i === lines.length - 1}
                  isDesktop={isDesktop}
                  onPress={() => l.budget ? openEdit(l.budget) : (l.key !== 'kurye' ? openNew(l.key as BudgetCategory) : undefined)}
                />
              ))
            )}
          </View>
          {loaded && spend.kurye ? (
            <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 10, textAlign: 'center', lineHeight: 16 }}>
              {autoT('Kurye giderleri için ayrı bütçe tanımlanamıyor; Genel bütçe tanımlarsanız kurye harcaması da ona dahil olur.')}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <BudgetEditor
        visible={editor.open}
        record={editor.record}
        presetCategory={editor.category}
        period={period}
        periodStart={start}
        takenCategories={budgets.map(b => b.category)}
        labId={labId ?? null}
        onClose={() => setEditor(e => ({ ...e, open: false }))}
        onSaved={() => { setEditor(e => ({ ...e, open: false })); load(true); }}
      />
    </View>
  );
}

function StepButton({ icon: Icon, label, onPress }: { icon: React.ComponentType<any>; label: string; onPress: () => void }) {
  const U = useInkUI();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed, hovered }: any) => ({
        width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
        backgroundColor: hovered ? U.rowHover : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
        opacity: pressed ? 0.75 : 1, ...webPointer,
      })}
    >
      <Icon size={14} color={U.plainBtn.fg} strokeWidth={2} />
    </Pressable>
  );
}

// ── Kategori satırı ─────────────────────────────────────────────────
function CategoryLine({ line: l, isLast, isDesktop, onPress }: { line: Line; isLast: boolean; isDesktop: boolean; onPress: () => void }) {
  const U = useInkUI();
  const cfg = CAT[l.key];
  const Icon = cfg.icon;
  const budget = l.budget ? Number(l.budget.budget_amount) || 0 : 0;
  const pct = budget > 0 ? (l.actual / budget) * 100 : 0;
  const tone = toneOf(pct);
  const remaining = budget - l.actual;
  const canBudget = l.key !== 'kurye';

  return (
    <Pressable
      onPress={canBudget ? onPress : undefined}
      disabled={!canBudget}
      accessibilityRole={canBudget ? 'button' : undefined}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairlineSoft,
        backgroundColor: hovered && canBudget ? U.rowHover : 'transparent',
        ...(canBudget ? webPointer : {}),
      })}
    >
      <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: cfg.color + '22' }}>
        <Icon size={17} color={cfg.color} strokeWidth={1.8} />
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>{autoT(cfg.label)}</Text>
          {l.key === 'total' && (
            <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>{autoT('tüm giderler')}</Text>
          )}
        </View>
        {l.budget ? (
          <>
            <View style={{ height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: U.ink[100] }}>
              <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: tone }} />
            </View>
            <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={1}>
              {`${fmtMoney(l.actual)} / ${fmtMoney(budget)}`}
            </Text>
          </>
        ) : (
          <Text style={{ fontSize: 12, color: U.ink[500] }} numberOfLines={2}>
            {canBudget
              ? `${autoT('Bütçe yok')} · ${fmtMoney(l.actual)} ${autoT('harcandı')}`
              : `${fmtMoney(l.actual)} ${autoT('harcandı')} · ${autoT('ayrı bütçe tanımlanamaz')}`}
          </Text>
        )}
      </View>

      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        {l.budget ? (
          <>
            <Text style={{ fontSize: 15, fontWeight: '700', color: tone, fontVariant: ['tabular-nums'] }}>{`%${pct.toFixed(0)}`}</Text>
            <Text style={{ fontSize: 11, fontWeight: '600', color: remaining < 0 ? TONE.danger : U.ink[500] }}>
              {remaining >= 0 ? `${fmtMoney(remaining)} ${autoT('kaldı')}` : `${fmtMoney(-remaining)} ${autoT('aşım')}`}
            </Text>
          </>
        ) : canBudget ? (
          <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: U.plainBtn.fg }}>{autoT('Bütçe belirle')}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ── Bütçe penceresi ─────────────────────────────────────────────────
function BudgetEditor({
  visible, record, presetCategory, period, periodStart, takenCategories, labId, onClose, onSaved,
}: {
  visible: boolean;
  record: BudgetRow | null;
  presetCategory: BudgetCategory | null;
  period: BudgetPeriod;
  periodStart: string;
  takenCategories: BudgetCategory[];
  labId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const U = useInkUI();
  const [category, setCategory] = useState<BudgetCategory>('total');
  const [amount, setAmount] = useState('');
  const [notes, setNotes]   = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  // Yeni kayıtta yalnız henüz bütçesi olmayan kategoriler seçilebilir
  const options = record ? [record.category] : BUDGETABLE.filter(c => !takenCategories.includes(c));

  useEffect(() => {
    if (!visible) return;
    setError(null);
    if (record) {
      setCategory(record.category);
      setAmount(String(record.budget_amount).replace('.', ','));
      setNotes(record.notes ?? '');
    } else {
      setCategory(presetCategory && options.includes(presetCategory) ? presetCategory : (options[0] ?? 'total'));
      setAmount('');
      setNotes('');
    }
  }, [visible, record, presetCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!labId) { setError(autoT('Laboratuvar bulunamadı.')); return; }
    const num = parseAmount(amount);  // "15.000" → 15000, "1.250,50" → 1250.5
    if (!Number.isFinite(num) || num <= 0) { setError(autoT('Geçerli bir tutar girin.')); return; }
    setSaving(true); setError(null);
    const payload = {
      lab_id: labId,
      category,
      period: record?.period ?? period,
      period_start: record?.period_start ?? periodStart,
      amount: num,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const r = record
      ? await supabase.from('budgets').update(payload).eq('id', record.id)
      : await supabase.from('budgets').upsert(payload, { onConflict: 'lab_id,category,period,period_start' });
    setSaving(false);
    if (r.error) { setError(`${autoT('Kaydedilemedi')}: ${r.error.message}`); return; }
    toast.success(record ? autoT('Bütçe güncellendi') : autoT('Bütçe eklendi'));
    onSaved();
  };

  const handleDelete = async () => {
    if (!record) return;
    const ok = await confirmAsync(autoT('Bütçeyi sil'), `${autoT(CAT[record.category].label)} ${autoT('bütçesi silinsin mi?')}`, { confirmText: autoT('Sil'), destructive: true });
    if (!ok) return;
    const { error: delErr } = await supabase.from('budgets').delete().eq('id', record.id);
    if (delErr) { setError(`${autoT('Silinemedi')}: ${delErr.message}`); return; }
    toast.success(autoT('Bütçe silindi'));
    onSaved();
  };

  const label = (t: string) => (
    <Text style={{ fontSize: 11, fontWeight: '700', color: U.ink[500], textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{t}</Text>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={U.modalOverlay}>
        <View style={[U.modalCard, { maxWidth: 480, width: '100%' }]}>
          <View style={U.modalHeaderRow}>
            <Text style={U.modalTitle}>{record ? 'Bütçeyi düzenle' : 'Yeni bütçe'}</Text>
            <Pressable onPress={onClose} style={[U.modalCloseBtn, webPointer]} accessibilityLabel={autoT('Kapat')}>
              <X size={16} color={U.ink[500]} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 12, color: U.ink[500], marginBottom: 14 }}>
            {`${record ? periodLabel(record.period, record.period_start) : periodLabel(period, periodStart)} · ${(record?.period ?? period) === 'monthly' ? autoT('Aylık') : autoT('Yıllık')}`}
          </Text>

          {options.length === 0 ? (
            <Text style={{ fontSize: 13, color: U.ink[500], lineHeight: 19 }}>
              Bu dönemde tüm kategorilerin bütçesi tanımlı. Değiştirmek için listeden bir kategoriye dokunun.
            </Text>
          ) : (
            <View style={{ gap: 16 }}>
              <View>
                {label(autoT('Kategori'))}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {options.map(cat => {
                    const active = category === cat;
                    return (
                      <Pressable key={cat} onPress={() => setCategory(cat)} disabled={!!record}
                        style={{
                          paddingHorizontal: active ? 16 : 12, paddingVertical: 8, borderRadius: 999,
                          borderWidth: 1, borderColor: active ? 'transparent' : U.plainBtn.border,
                          backgroundColor: active ? U.ink[900] : U.plainBtn.bg, ...webPointer,
                        }}>
                        <Text style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.onDarkPill : U.plainBtn.fg }}>
                          {autoT(CAT[cat].label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {category === 'total' && (
                  <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 6, lineHeight: 16 }}>
                    Genel bütçe tüm giderleri (kurye dahil) kapsar ve özetteki ana limit olur.
                  </Text>
                )}
              </View>

              <View>
                {label(`${autoT('Limit')} (${baseSymbol()})`)}
                <TextInput
                  style={U.inputStyle}
                  value={amount}
                  onChangeText={(v) => { setAmount(v); if (error) setError(null); }}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={U.ink[400]}
                  autoFocus={!record}
                />
              </View>

              <View>
                {label(autoT('Not'))}
                <TextInput
                  style={[U.inputStyle, { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' }]}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                  placeholderTextColor={U.ink[400]}
                />
              </View>
            </View>
          )}

          {error ? <Text style={{ fontSize: 12, color: U.chipTones.danger.fg, marginTop: 10 }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20 }}>
            {record ? (
              <Pressable onPress={handleDelete} accessibilityRole="button"
                style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 14, borderRadius: 999,
                  backgroundColor: U.chipTones.danger.bg, opacity: pressed ? 0.8 : 1, ...webPointer,
                })}>
                <Trash2 size={14} color={U.chipTones.danger.fg} strokeWidth={2} />
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.chipTones.danger.fg }}>Sil</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={onClose}
              style={({ pressed, hovered }: any) => ({
                height: 38, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center',
                backgroundColor: hovered ? U.rowHover : U.plainBtn.bg, borderWidth: 1, borderColor: U.plainBtn.border,
                opacity: pressed ? 0.85 : 1, ...webPointer,
              })}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>Vazgeç</Text>
            </Pressable>
            {options.length > 0 && (
              <Pressable onPress={handleSave} disabled={saving}
                style={({ pressed }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  height: 38, paddingHorizontal: 18, borderRadius: 999, backgroundColor: U.ink[900],
                  opacity: saving ? 0.7 : pressed ? 0.85 : 1, ...webPointer,
                })}>
                {saving ? <ActivityIndicator size="small" color={U.onDarkPill} /> : null}
                <Text style={{ fontSize: 13, fontWeight: '600', color: U.onDarkPill }}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
              </Pressable>
            )}
          </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
