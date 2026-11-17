import { localeTag } from '../../../core/i18n';
import { FilterMenu } from '../../../core/ui/FilterMenu';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * SuppliersScreen — Tedarikçiler & cari hesap ana ekranı.
 *
 * Yapı (Hizmet bedelleri sayfasıyla aynı dil):
 *   • BEYAZ HERO: ödenecek toplam (en büyük döviz dilimi) → borcun firmalara
 *     dağılımı çubuğu → altında düğme şeridi (Yeni tedarikçi · Excel'e aktar)
 *   • Tek kart: durum sekmeleri (Tümü/Borçlu/Alacaklı/Kapalı/Pasif) + arama +
 *     kategori + sıralama → satırlar → döviz döviz alt toplam
 *   • Satır eylemleri tek ⋯ menüsünde: Ödeme yap · Alış kaydet · Düzenle · Pasife al/Sil
 *   • Tedarikçi seçilince: SupplierDetailScreen
 */

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { confirmAsync } from '../../../core/util/confirm';
import {
  Plus, Search, Building2, ArrowDownCircle, ArrowUpCircle, Pencil, Trash2, X, FileText, MoreHorizontal, Phone,
} from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import {
  Supplier, SupplierBalance, SupplierCategory, TransactionType,
  CATEGORY_LABELS, listSuppliers, listBalances,
  deactivateSupplier, deleteSupplier,
} from '../api';
import { toast } from '../../../core/ui/Toast';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { SupplierDetailScreen } from './SupplierDetailScreen';
import { SupplierFormModal } from '../components/SupplierFormModal';
import { TransactionFormModal } from '../components/TransactionFormModal';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { usePanelTheme } from '../../../core/theme/usePanelTheme';
import { useInkUI, type InkUI } from '../../../core/theme/inkScale';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { HubContext } from '../../../core/ui/HubContext';
import { PAGE_PADDING } from '../../../core/ui/pageMetrics';
import { AnchorMenu } from '../../invoices/components/AnchorMenu';
import { downloadCsv, csvMoney, csvDate } from '../../../core/util/csvExport';
import { titleCaseTR } from '../../../core/utils/textCase';

interface Props {
  accentColor?: string;
}

type Seg = 'all' | 'debt' | 'credit' | 'zero' | 'passive';
type SortKey = 'balance' | 'name' | 'recent';
type RowMenuItem = { key: string; label: string; icon?: React.ComponentType<any>; onPress: () => void };

const DISPLAY = { fontFamily: 'Inter Tight, Inter, system-ui, sans-serif', fontWeight: '300' as const };
const EPS = 0.01;
// Borç dağılımı çubuğu: en büyük 3 firma + "diğerleri" (tileBg).
const DIST_COLORS = ['#4771AB', '#7C9CC9', '#B5C7E0'];

/** Tamamı BÜYÜK harf yazılmış ticari unvanı okunur hâle getirir; karışık yazılmışa dokunmaz. */
function displayName(raw: string): string {
  const letters = raw.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '');
  return letters.length > 3 && letters === letters.toLocaleUpperCase('tr-TR') ? titleCaseTR(raw) : raw;
}

function initials(name: string): string {
  const w = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR') || '?';
}

function colHeaderOf(U: InkUI) {
  return { fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: U.ink[500] };
}

export function SuppliersScreen({ accentColor = '#0A0A0A' }: Props) {
  const tblAccent = usePanelTheme().primary;
  const heroInk = useWhiteHeroInk(tblAccent);
  const U = useInkUI();
  const isEmbedded = useContext(HubContext);
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const baseCurrency = useBaseCurrency();
  const { setTitle, clear } = usePageTitleStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [seg, setSeg] = useState<Seg>('all');
  const [catFilter, setCatFilter] = useState<SupplierCategory | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('balance');
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<{ visible: boolean; supplier: Supplier | null }>({ visible: false, supplier: null });
  const [txTarget, setTxTarget] = useState<{ supplier: Supplier; type: TransactionType } | null>(null);

  useEffect(() => { setTitle('Tedarikçiler', ''); return clear; }, []);

  const load = async () => {
    setLoading(true);
    const [s, b] = await Promise.all([listSuppliers({}), listBalances()]);
    if (s.data) setSuppliers(s.data);
    if (b.data) setBalances(b.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [labId]);

  const balanceMap = useMemo(() => {
    const m: Record<string, SupplierBalance> = {};
    for (const b of balances) m[b.supplier_id] = b;
    return m;
  }, [balances]);

  /** Tedarikçinin KENDİ hesap para birimindeki bakiyesi (balance_base kullanılmaz — baz döviz değişti). */
  const balOf = (s: Supplier) => Number(balanceMap[s.id]?.balance_account) || 0;
  const curOf = (s: Supplier) => (s.default_currency || baseCurrency) as Currency;

  // Liste + hero AYNI kümeyi kullanır: aktifler + bakiyesi kapanmamış pasifler.
  const visibleSuppliers = useMemo(() => suppliers.filter(s => s.is_active || Math.abs(balOf(s)) > EPS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers, balanceMap]);

  const segOf = (s: Supplier): Exclude<Seg, 'all'> => {
    if (!s.is_active) return 'passive';
    const b = balOf(s);
    return b > EPS ? 'debt' : b < -EPS ? 'credit' : 'zero';
  };

  // Sekme dışındaki süzgeçler (arama, kategori) — sekme sayıları bunun üstünden.
  const base = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return visibleSuppliers.filter(s => {
      if (catFilter !== 'all' && s.category !== catFilter) return false;
      if (q && !s.name.toLocaleLowerCase('tr-TR').includes(q)
           && !(s.tax_no ?? '').toLowerCase().includes(q)
           && !(s.contact_person ?? '').toLocaleLowerCase('tr-TR').includes(q)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSuppliers, search, catFilter]);

  const segCounts = useMemo(() => {
    const c = { all: base.length, debt: 0, credit: 0, zero: 0, passive: 0 };
    for (const s of base) c[segOf(s)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, balanceMap]);

  const filtered = useMemo(() => {
    const rows = seg === 'all' ? [...base] : base.filter(s => segOf(s) === seg);
    rows.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'tr');
      if (sortKey === 'recent') {
        const da = balanceMap[a.id]?.last_transaction_date ?? '';
        const db = balanceMap[b.id]?.last_transaction_date ?? '';
        return db.localeCompare(da);
      }
      return Math.abs(balOf(b)) - Math.abs(balOf(a));
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, seg, sortKey, balanceMap]);

  // Kategori sütunu/süzgeci yalnız birden çok kategori kullanılıyorsa anlam taşır.
  const usedCats = useMemo(() => Array.from(new Set(visibleSuppliers.map(s => s.category))), [visibleSuppliers]);
  const showCategory = usedCats.length > 1;

  // ── Hero toplamları — KATI per-currency (döviz TOPLANMAZ) ──
  const supBal = visibleSuppliers.map(s => ({ s, amount: balOf(s), currency: curOf(s) }));
  const debtSlices   = groupByCurrency(supBal.filter(x => x.amount > EPS),  x => ({ amount: x.amount,  currency: x.currency }));
  const creditSlices = groupByCurrency(supBal.filter(x => x.amount < -EPS), x => ({ amount: -x.amount, currency: x.currency }));
  const totalCount = suppliers.filter(s => s.is_active).length;
  const debtorCount = supBal.filter(x => x.amount > EPS).length;
  const debtLead = debtSlices[0] ?? null;
  const debtRest = debtSlices.slice(1);
  const creditLead = creditSlices[0] ?? null;

  // Borcun firmalara dağılımı (yalnız baş dövizde) — en büyük 3 + diğerleri.
  const dist = useMemo(() => {
    if (!debtLead) return null;
    const rows = supBal
      .filter(x => x.amount > EPS && x.currency === debtLead.currency)
      .sort((a, b) => b.amount - a.amount);
    const top = rows.slice(0, 3).map((x, i) => ({ label: displayName(x.s.name), value: x.amount, color: DIST_COLORS[i] }));
    const others = rows.slice(3).reduce((t, x) => t + x.amount, 0);
    return { top, others, othersN: Math.max(0, rows.length - 3) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debtLead?.currency, debtLead?.total, balances, suppliers]);

  const fmt0 = (n: number, c: Currency) => formatMoney(n, c, { fractionDigits: 0 });

  const exportCsv = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await downloadCsv(
      `Tedarikciler-${today}`,
      filtered,
      [
        { header: 'Firma',         value: r => r.name },
        { header: 'Kategori',      value: r => CATEGORY_LABELS[r.category] },
        { header: 'Yetkili',       value: r => r.contact_person ?? '' },
        { header: 'Telefon',       value: r => r.phone ?? '' },
        { header: 'VKN',           value: r => r.tax_no ?? '' },
        { header: 'Para Birimi',   value: r => curOf(r) },
        { header: 'Bakiye',        value: r => csvMoney(balOf(r)) },
        { header: 'Son Hareket',   value: r => csvDate(balanceMap[r.id]?.last_transaction_date ?? null) },
        { header: 'Durum',         value: r => (r.is_active ? 'Aktif' : 'Pasif') },
      ],
    );
    if (!res.ok && res.error) toast.error(res.error);
    else toast.success(autoT('CSV indirildi'));
  };

  const removeSupplier = async (s: Supplier) => {
    const bal = balanceMap[s.id];
    const hasBalance = !!(bal && (bal.purchase_count > 0 || Math.abs(Number(bal.balance_account) || 0) > EPS));
    const confirmMsg = hasBalance
      ? `${s.name} ${autoT('firmasının geçmiş işlemi var. Pasife alınsın mı? (Veriler korunur; bakiye kapanana kadar listede "Pasif" olarak görünür.)')}`
      : `${s.name} ${autoT('firmasını kalıcı silmek istediğinden emin misin?')}`;
    if (!(await confirmAsync(autoT(hasBalance ? 'Firmayı Pasife Al' : 'Firmayı Sil'), confirmMsg, { confirmText: autoT(hasBalance ? 'Pasife Al' : 'Sil'), destructive: !hasBalance }))) return;
    const res = hasBalance ? await deactivateSupplier(s.id) : await deleteSupplier(s.id);
    if (res.error) {
      const msg = String((res.error as any).message ?? '');
      if (/foreign key|violates/i.test(msg)) {
        const fb = await deactivateSupplier(s.id);
        if (fb.error) { toast.error(autoT('Silinemedi:') + ' ' + msg); return; }
        toast.success(`${s.name} ${autoT('pasife alındı (geçmiş kayıt var)')}`);
      } else { toast.error(autoT('Silinemedi:') + ' ' + msg); return; }
    } else { toast.success(`${s.name} ${autoT(hasBalance ? 'pasife alındı' : 'silindi')}`); }
    load();
  };

  const rowMenu = (s: Supplier): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    if (s.is_active && balOf(s) > EPS) items.push({ key: 'pay', label: autoT('Ödeme yap'), icon: ArrowDownCircle, onPress: () => setTxTarget({ supplier: s, type: 'PAYMENT' }) });
    if (s.is_active) items.push({ key: 'buy', label: autoT('Alış kaydet'), icon: ArrowUpCircle, onPress: () => setTxTarget({ supplier: s, type: 'PURCHASE' }) });
    items.push({ key: 'edit', label: autoT('Düzenle'), icon: Pencil, onPress: () => setFormOpen({ visible: true, supplier: s }) });
    items.push({ key: 'rm', label: autoT(s.is_active ? 'Pasife al / Sil' : 'Sil'), icon: Trash2, onPress: () => { void removeSupplier(s); } });
    return items;
  };

  const heroButtons: RowMenuItem[] = [
    { key: 'new', label: autoT('Yeni tedarikçi'), icon: Plus, onPress: () => setFormOpen({ visible: true, supplier: null }) },
    ...(Platform.OS === 'web' ? [{ key: 'csv', label: autoT("Excel'e aktar"), icon: FileText, onPress: () => { void exportCsv(); } }] : []),
  ];

  const segItems: { key: Seg; label: string; n: number; tone: string | null }[] = [
    { key: 'all',     label: autoT('Tümü'),     n: segCounts.all,     tone: null },
    { key: 'debt',    label: autoT('Borçlu'),   n: segCounts.debt,    tone: U.chipTones.danger.fg },
    { key: 'credit',  label: autoT('Alacaklı'), n: segCounts.credit,  tone: U.chipTones.success.fg },
    { key: 'zero',    label: autoT('Kapalı'),   n: segCounts.zero,    tone: null },
    ...(segCounts.passive > 0 ? [{ key: 'passive' as Seg, label: autoT('Pasif'), n: segCounts.passive, tone: null }] : []),
  ];

  // Alt satır: listedeki firmaların döviz döviz ödenecek / alacak toplamı.
  const footDebt = groupByCurrency(filtered.filter(s => balOf(s) > EPS), s => ({ amount: balOf(s), currency: curOf(s) }));
  const footCredit = groupByCurrency(filtered.filter(s => balOf(s) < -EPS), s => ({ amount: -balOf(s), currency: curOf(s) }));

  if (activeId) {
    return (
      <SupplierDetailScreen
        supplierId={activeId}
        accentColor={accentColor}
        onBack={() => { setActiveId(null); load(); }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={{ paddingTop: 4, paddingBottom: 48 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {!isEmbedded && <MobilePageTitle title="Tedarikçiler" subtitle="Cari hesaplar ve ödemeler" />}

      {/* ── BEYAZ HERO ─────────────────────────────────────────────
          Ödenecek toplam (baş döviz) → sağda borçlu firma / alacak →
          borcun firmalara dağılımı → altta düğme şeridi. Döviz TOPLANMAZ. */}
      <View style={{ paddingHorizontal: PAGE_PADDING, paddingTop: 10, paddingBottom: 12 }}>
        <WhiteHero
          kicker={autoT('Cari hesaplar')}
          accent={tblAccent}
          title={debtLead ? (
            <>{autoT('Ödenecek')} <Text style={{ color: heroInk.accentInk }}>{fmt0(debtLead.total, debtLead.currency)}</Text></>
          ) : autoT('Açık borç yok')}
          description={`${totalCount} ${autoT('aktif tedarikçi')}`}
          stats={[
            { value: String(debtorCount), label: autoT('Borçlu firma') },
            ...(creditLead ? [{ value: fmt0(creditLead.total, creditLead.currency), label: autoT('Alacak'), color: heroInk.isDark ? '#6EE7B7' : '#0F6E56' }] : []),
          ]}
          actions={
            <>
              {heroButtons.map((it) => (
                <Pressable
                  key={it.key}
                  onPress={it.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={it.label}
                  style={({ pressed, hovered }: any) => ({
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    height: 36, paddingHorizontal: 14, borderRadius: 999,
                    backgroundColor: hovered ? U.rowHover : U.plainBtn.bg,
                    borderWidth: 1, borderColor: U.plainBtn.border, opacity: pressed ? 0.8 : 1,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                  })}
                >
                  {it.icon ? <it.icon size={15} color={U.plainBtn.fg} strokeWidth={1.8} /> : null}
                  <Text style={{ fontSize: 13, fontWeight: '600', color: U.plainBtn.fg }}>{it.label}</Text>
                </Pressable>
              ))}
            </>
          }
        >
          {debtRest.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <MoneyMultiX slices={debtRest} variant="inline" onAccent={heroInk.moneyOnAccent} />
            </View>
          )}
          {dist && debtLead && dist.top.length > 1 && (
            <View style={{ marginTop: 16, gap: 8 }}>
              <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: heroInk.tileBg, gap: 2 }}>
                {dist.top.map(d => <View key={d.label} style={{ flex: d.value, backgroundColor: d.color }} />)}
                {dist.others > 0 && <View style={{ flex: dist.others, backgroundColor: heroInk.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)' }} />}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
                {dist.top.map(d => <HeroLegend key={d.label} color={d.color} label={d.label} value={fmt0(d.value, debtLead.currency)} />)}
                {dist.others > 0 && (
                  <HeroLegend
                    color={heroInk.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)'}
                    label={`${autoT('Diğer')} ${dist.othersN} ${autoT('firma')}`}
                    value={fmt0(dist.others, debtLead.currency)}
                  />
                )}
              </View>
            </View>
          )}
        </WhiteHero>
      </View>

      {/* ── Tedarikçi kartı: sekmeler + arama/kategori/sıralama kartın içinde ── */}
      <View style={{ paddingHorizontal: PAGE_PADDING }}>
        <View style={U.tableCard}>
          <View style={{
            paddingHorizontal: isDesktop ? 20 : 16, paddingTop: isDesktop ? 18 : 14, paddingBottom: 14, gap: 12,
            borderBottomWidth: 1, borderBottomColor: U.hairline,
          }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
                        contentContainerStyle={{ flexDirection: 'row', padding: 3, borderRadius: 999, backgroundColor: U.ink[100] }}>
              {segItems.map(o => {
                const active = seg === o.key;
                return (
                  <Pressable
                    key={o.key}
                    onPress={() => setSeg(o.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={{
                      paddingHorizontal: active ? 18 : 12, paddingVertical: 8, borderRadius: 999,
                      backgroundColor: active ? U.segActive : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer', outlineStyle: 'none' } as any : {}),
                    }}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: active ? '700' : '500', color: active ? U.ink[900] : (o.tone ?? U.ink[500]) }}>
                      {`${o.label} · ${o.n}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', rowGap: 8 }}>
              <View style={{
                flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 180,
                flexDirection: 'row', alignItems: 'center', gap: 8,
                height: 40, paddingHorizontal: 14, borderRadius: 9999,
                borderWidth: 1, borderColor: U.plainBtn.border, backgroundColor: U.plainBtn.bg,
              }}>
                <Search size={14} color={U.ink[400]} strokeWidth={1.8} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Firma, vergi no, yetkili"
                  placeholderTextColor={U.ink[400]}
                  style={{ flex: 1, fontSize: 13.5, color: U.ink[900], ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} accessibilityLabel={autoT('Aramayı temizle')} style={{ cursor: 'pointer' as any }}>
                    <X size={13} color={U.ink[400]} strokeWidth={2} />
                  </Pressable>
                )}
              </View>
              {showCategory && (
                <FilterMenu
                  label={autoT('Kategori')}
                  items={[
                    { key: 'all', label: autoT('Tümü') },
                    ...usedCats.map(c => ({ key: c, label: autoT(CATEGORY_LABELS[c]) })),
                  ]}
                  active={catFilter}
                  onChange={(k) => setCatFilter(k as typeof catFilter)}
                />
              )}
              <FilterMenu
                label={autoT('Sırala')}
                items={[
                  { key: 'balance', label: autoT('Bakiye') },
                  { key: 'recent',  label: autoT('Son hareket') },
                  { key: 'name',    label: autoT('Ad') },
                ]}
                active={sortKey}
                onChange={(k) => setSortKey(k as SortKey)}
              />
            </View>
          </View>

          {loading && filtered.length === 0 ? (
            <View style={{ paddingVertical: 64, alignItems: 'center' }}>
              <ActivityIndicator color={U.ink[400]} />
            </View>
          ) : filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 12 }}>
              {suppliers.length === 0
                ? <Building2 size={36} strokeWidth={1.4} color={U.ink[300]} />
                : <Search size={36} strokeWidth={1.4} color={U.ink[300]} />}
              <Text style={{ fontSize: 15, fontWeight: '600', color: U.ink[900] }}>
                {suppliers.length === 0 ? 'Henüz tedarikçi yok' : 'Sonuç bulunamadı'}
              </Text>
              <Text style={{ fontSize: 13, color: U.ink[400], textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
                {suppliers.length === 0 ? 'Sarf, ekipman ve hizmet aldığınız firmaları kaydedin; cari hesap otomatik oluşturulur.' : 'Arama veya filtre kriterlerini değiştirin.'}
              </Text>
            </View>
          ) : (
            <>
              {isDesktop ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: U.hairline }}>
                  <Text style={{ ...colHeaderOf(U), flex: 1 }}>Firma</Text>
                  {showCategory ? <Text style={{ ...colHeaderOf(U), width: COL.cat }}>Kategori</Text> : null}
                  <Text style={{ ...colHeaderOf(U), width: COL.last }}>Son hareket</Text>
                  <Text style={{ ...colHeaderOf(U), width: COL.bal, textAlign: 'right' }}>Bakiye</Text>
                  <View style={{ width: COL.menu }} />
                </View>
              ) : null}
              {filtered.map((s, i) => (
                <SupplierRow
                  key={s.id}
                  supplier={s}
                  balance={balanceMap[s.id] ?? null}
                  amount={balOf(s)}
                  currency={curOf(s)}
                  showCurrency={curOf(s) !== baseCurrency}
                  showCategory={showCategory}
                  desktop={isDesktop}
                  isLast={i === filtered.length - 1}
                  menu={rowMenu(s)}
                  onPress={() => setActiveId(s.id)}
                />
              ))}
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                paddingHorizontal: isDesktop ? 20 : 16, paddingVertical: 12,
                borderTopWidth: 1, borderTopColor: U.hairline, backgroundColor: U.surfaceSoft,
                borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
              }}>
                <Text style={{ fontSize: 12, color: U.ink[500] }}>{`${filtered.length} ${autoT('firma')}`}</Text>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  {footDebt.map(d => (
                    <Text key={`d-${d.currency}`} style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>
                      {`${autoT('Ödenecek')} `}<Text style={{ fontWeight: '700', color: U.ink[900] }}>{fmt0(d.total, d.currency)}</Text>
                    </Text>
                  ))}
                  {footCredit.map(d => (
                    <Text key={`c-${d.currency}`} style={{ fontSize: 12, color: U.ink[500], fontVariant: ['tabular-nums'] }}>
                      {`${autoT('Alacak')} `}<Text style={{ fontWeight: '700', color: U.chipTones.success.fg }}>{fmt0(d.total, d.currency)}</Text>
                    </Text>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* ── Modaller ── */}
      <SupplierFormModal
        visible={formOpen.visible}
        supplier={formOpen.supplier}
        accentColor={accentColor}
        onClose={() => setFormOpen({ visible: false, supplier: null })}
        onSaved={() => { setFormOpen({ visible: false, supplier: null }); load(); }}
      />
      {txTarget && (
        <TransactionFormModal
          visible
          type={txTarget.type}
          supplier={txTarget.supplier}
          accentColor={accentColor}
          onClose={() => setTxTarget(null)}
          onSaved={() => { setTxTarget(null); load(); }}
        />
      )}
    </ScrollView>
  );
}

// ─── Satır (masaüstü: sütunlu · mobil: iki kolonlu) ─────────────────
const COL = { cat: 120, last: 150, bal: 150, menu: 36 };

function daysAgo(iso: string): number {
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function SupplierRow({ supplier: s, balance, amount, currency, showCurrency, showCategory, desktop, isLast, menu, onPress }: {
  supplier: Supplier; balance: SupplierBalance | null; amount: number; currency: Currency; showCurrency: boolean;
  showCategory: boolean; desktop: boolean; isLast: boolean; menu: RowMenuItem[]; onPress: () => void;
}) {
  const U = useInkUI();
  const name = displayName(s.name);
  const tone = amount > EPS ? 'debt' : amount < -EPS ? 'credit' : 'zero';
  const toneColor = tone === 'debt' ? U.chipTones.danger.fg : tone === 'credit' ? U.chipTones.success.fg : U.ink[400];
  const toneLabel = tone === 'debt' ? autoT('Borç') : tone === 'credit' ? autoT('Alacak') : autoT('Kapalı');
  const money = tone === 'zero' ? '—' : formatMoney(Math.abs(amount), currency, { fractionDigits: 0 });
  const last = balance?.last_transaction_date ?? null;
  const lastText = last
    ? new Date(last).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const ago = last ? daysAgo(last) : null;
  const agoText = ago === null ? null : ago === 0 ? autoT('bugün') : `${ago} ${autoT('gün önce')}`;
  const sub = [s.contact_person, s.phone].filter(Boolean).join(' · ');

  const menuBtn = (
    <AnchorMenu
      width={220}
      items={menu}
      renderTrigger={(open) => (
        <Pressable
          onPress={(e: any) => { e?.stopPropagation?.(); open(); }}
          accessibilityRole="button"
          accessibilityLabel={autoT('Tedarikçi işlemleri')}
          style={({ pressed, hovered }: any) => ({
            width: desktop ? 32 : 44, height: desktop ? 32 : 44, borderRadius: 999,
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: hovered || pressed ? U.rowHover : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          })}
        >
          <MoreHorizontal size={16} color={U.ink[500]} strokeWidth={1.8} />
        </Pressable>
      )}
    />
  );

  const avatar = (
    <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: U.ink[100] }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: U.ink[700] }}>{initials(name)}</Text>
    </View>
  );

  const passiveTag = !s.is_active ? (
    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: U.ink[100] }}>
      <Text style={{ fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: U.ink[500] }}>{autoT('Pasif')}</Text>
    </View>
  ) : null;

  const balanceBlock = (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      <Text style={{ fontSize: desktop ? 15 : 14, fontWeight: '600', color: tone === 'zero' ? U.ink[400] : U.ink[900], fontVariant: ['tabular-nums'] }}>
        {money}
      </Text>
      {tone !== 'zero' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
          <Text style={{ fontSize: 11, fontWeight: '600', color: toneColor }}>
            {showCurrency ? `${toneLabel} · ${currency}` : toneLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );

  if (!desktop) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }: any) => ({
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingStart: 16, paddingEnd: 6, paddingVertical: 12,
          borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
          backgroundColor: pressed ? U.rowHover : 'transparent',
          opacity: s.is_active ? 1 : 0.65,
        })}
      >
        {avatar}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>{name}</Text>
            {passiveTag}
          </View>
          <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>
            {agoText ? `${autoT('Son hareket')} ${agoText}` : (sub || '—')}
          </Text>
        </View>
        {balanceBlock}
        {menuBtn}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingStart: 20, paddingEnd: 14, paddingVertical: 12,
        borderBottomWidth: isLast ? 0 : 1, borderBottomColor: U.hairline,
        backgroundColor: hovered ? U.rowHover : 'transparent',
        opacity: s.is_active ? 1 : 0.65,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      })}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {avatar}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '600', color: U.ink[900], flexShrink: 1 }} numberOfLines={1}>{name}</Text>
            {passiveTag}
          </View>
          {sub ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.phone ? <Phone size={10} color={U.ink[400]} strokeWidth={1.8} /> : null}
              <Text style={{ fontSize: 11.5, color: U.ink[400] }} numberOfLines={1}>{sub}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {showCategory ? (
        <Text style={{ width: COL.cat, fontSize: 12, color: U.ink[500] }} numberOfLines={1}>{autoT(CATEGORY_LABELS[s.category])}</Text>
      ) : null}
      <View style={{ width: COL.last, gap: 2 }}>
        <Text style={{ fontSize: 12.5, color: U.ink[700] }}>{lastText}</Text>
        <Text style={{ fontSize: 11, color: U.ink[400] }} numberOfLines={1}>
          {[agoText, balance && balance.purchase_count > 0 ? `${balance.purchase_count} ${autoT('alış')}` : null].filter(Boolean).join(' · ') || ' '}
        </Text>
      </View>
      <View style={{ width: COL.bal }}>{balanceBlock}</View>
      {menuBtn}
    </Pressable>
  );
}

function HeroLegend({ color, label, value }: { color: string; label: string; value: string }) {
  const heroInk = useWhiteHeroInk();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 280 }}>
      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11.5, color: heroInk.inkSoft, flexShrink: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 11.5, fontWeight: '700', color: heroInk.ink }}>{value}</Text>
    </View>
  );
}
