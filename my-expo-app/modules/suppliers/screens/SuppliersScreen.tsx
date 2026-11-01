import { localeTag } from '../../../core/i18n';
import { FilterMenu } from '../../../core/ui/FilterMenu';
import { autoT } from '../../../core/i18n/autoTranslate';
/**
 * SuppliersScreen — Tedarikçiler & Cari Hesap ana ekranı.
 *
 * Yapı:
 *   • KPI grid: toplam borç / alacak / firma sayısı
 *   • Filtre pills: kategori
 *   • Tedarikçi listesi: ad + bakiye + son hareket
 *   • Yeni tedarikçi ekleme + tedarikçi formu modal
 *   • Tedarikçi seçilince: SupplierDetailScreen
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView, TextInput, Modal, useWindowDimensions } from 'react-native';
import { confirmAsync } from '../../../core/util/confirm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Plus, Search, Building2, AlertCircle, ArrowDownCircle, ArrowUpCircle,
  Phone, Mail, Filter, Pencil, Trash2, SlidersHorizontal, X,
} from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
import { groupByCurrency } from '../../../core/money/aggregations';
import { MoneyMultiX } from '../../../core/money/MoneyMultiX';
import {
  Supplier, SupplierBalance, SupplierCategory,
  CATEGORY_LABELS, listSuppliers, listBalances, balanceColor,
  deactivateSupplier, deleteSupplier,
} from '../api';
import { toast } from '../../../core/ui/Toast';
import { MobilePageTitle } from '../../../core/ui/mobile/MobilePageTitle';
import { SupplierDetailScreen } from './SupplierDetailScreen';
import { SupplierFormModal } from '../components/SupplierFormModal';
import { SupplierMobileTable } from '../components/SupplierMobileTable';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';
import { useThemeModeStore } from '../../../core/store/themeModeStore';
import { usePanelTheme, onAccentInk } from '../../../core/theme/usePanelTheme';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';

interface Props {
  accentColor?: string;
}

export function SuppliersScreen({ accentColor = '#0A0A0A' }: Props) {
  // Tablo başlığı düz panel accent'i (uygulama genelinde aynı dil).
  const tblAccent = usePanelTheme().primary;
  const tblInk = onAccentInk(tblAccent);
  // Beyaz hero başlığı: çoklu-döviz TOPLANMAZ → en büyük dilim başlıkta.
  const heroInk = useWhiteHeroInk(tblAccent);
  const T = useMobileTokens();
  const isDark = useThemeModeStore(s => s.resolvedDark);
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const baseCurrency = useBaseCurrency();
  const { setTitle, clear } = usePageTitleStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<SupplierCategory | 'all'>('all');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<{ visible: boolean; supplier: Supplier | null }>({ visible: false, supplier: null });

  useEffect(() => { setTitle('Tedarikçiler', ''); return clear; }, []);

  // ── Patterns design tokens ──
  const PCard = {
    backgroundColor: T.card,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: T.hairline,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } : {}),
  } as any;
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const eyebrow = { fontSize: 11, fontWeight: '600' as const, color: T.ink3, letterSpacing: 1, textTransform: 'uppercase' as const };

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

  // Liste + hero AYNI kümeyi kullanır: aktifler + bakiyesi kapanmamış pasifler.
  // (Borçlu tedarikçi pasife alınınca listeden kaybolup hero toplamında sayılmasın diye —
  //  pasif ama bakiyesi ≠ 0 olanlar "Pasif" rozetiyle listede kalır.)
  const visibleSuppliers = useMemo(() => {
    return suppliers.filter(s => {
      if (s.is_active) return true;
      const b = balanceMap[s.id];
      return !!b && Math.abs(Number(b.balance_account) || 0) > 0.01;
    });
  }, [suppliers, balanceMap]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleSuppliers.filter(s => {
      if (catFilter !== 'all' && s.category !== catFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)
           && !(s.tax_no ?? '').toLowerCase().includes(q)
           && !(s.contact_person ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visibleSuppliers, search, catFilter]);

  // ── Aggregates — KATI per-currency (tedarikçi kendi para biriminde) ──
  const curById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) m.set(s.id, (s.default_currency || baseCurrency));
    return m;
  }, [suppliers, baseCurrency]);
  // Hero toplamları LİSTEYLE AYNI kümeden hesaplanır (visibleSuppliers).
  const visibleIds = useMemo(() => new Set(visibleSuppliers.map(s => s.id)), [visibleSuppliers]);
  /**
   * Her tedarikçi KENDİ hesap para biriminde okunur (balance_account).
   *
   * balance_base kullanılamaz: labın baz para birimi TRY'den EUR'ya geçti ve
   * geçmiş yeniden yazılmadı. Eski satırların amount_base'i TRY, yenilerinki
   * EUR — ikisini toplamak "739.917 TRY − 14.374 EUR = 725.543" gibi anlamsız
   * bir sayı üretiyordu ve ekranda € olarak gösteriliyordu.
   */
  const supBal = balances
    .filter(b => visibleIds.has(b.supplier_id))
    .map(b => ({
      amount: Number(b.balance_account) || 0,
      currency: (curById.get(b.supplier_id) || baseCurrency) as Currency,
    }));
  const debtSlices   = groupByCurrency(supBal.filter(x => x.amount > 0), x => ({ amount: x.amount,  currency: x.currency }));
  const creditSlices = groupByCurrency(supBal.filter(x => x.amount < 0), x => ({ amount: -x.amount, currency: x.currency }));
  const totalCount  = suppliers.filter(s => s.is_active).length;
  const overdueCnt  = balances.filter(b => visibleIds.has(b.supplier_id) && Number(b.balance_account) > 0).length;
  const debtLead = debtSlices[0] ?? null;
  const debtRest = debtSlices.slice(1);

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
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 48, gap: 14 }}>
      <MobilePageTitle title="Tedarikçiler" subtitle="Cari hesaplar ve ödemeler" />
      {/* ── Hero — "BEYAZ HERO" (core/ui/WhiteHero) ─────────────────
          Prim Motoru hiyerarşisi: kicker → 44px tek büyük rakam → bağlam
          cümlesi → sağda 40px stat'lar. Rakam TOPLANMAZ; başlık en büyük
          para birimi dilimini, kalanlar altındaki chip şeridini kullanır. */}
      <WhiteHero
        kicker="Tedarikçiler"
        accent={tblAccent}
        title={
          debtLead ? (
            <>Toplam borç <Text style={{ color: heroInk.accentInk }}>{formatMoney(debtLead.total, debtLead.currency, { fractionDigits: 0 })}</Text></>
          ) : '—'
        }
        description={
          `${totalCount} aktif tedarikçi` +
          (overdueCnt > 0 ? ` · ${overdueCnt} firmaya borç var` : ' · açık borç yok') +
          (creditSlices.length ? ' · alacaklı olduğun firmalar da var' : '')
        }
        stats={[
          { value: String(totalCount), label: 'Tedarikçi' },
          { value: String(overdueCnt), label: 'Borçlu' },
          ...(debtRest.length ? [{ value: String(debtRest.length + 1), label: 'Para Birimi' }] : []),
        ]}
      >
        {debtRest.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <MoneyMultiX slices={debtRest} variant="inline" onAccent={heroInk.moneyOnAccent} />
          </View>
        )}
        {creditSlices.length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: heroInk.inkSoft, marginBottom: 3 }}>Alacak</Text>
            <MoneyMultiX slices={creditSlices} variant="inline" onAccent={heroInk.moneyOnAccent} />
          </View>
        )}
      </WhiteHero>

      {/* ── Toolbar — tek satır: Search + Filtre + Yeni Tedarikçi ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: T.card, borderRadius: 9999, borderWidth: 1, borderColor: T.hairline,
          paddingHorizontal: 12, height: 44,
        }}>
          <Search size={15} color={T.ink3} strokeWidth={1.6} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Ara…"
            placeholderTextColor={T.ink3}
            style={{ flex: 1, fontSize: 14, color: T.ink, height: 44, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
          />
        </View>

        {/* Filtre — masaüstünde tetikleyiciye ÇAPALI popover (core/ui/FilterMenu).
            Eskiden ekranın altına yapışan tam genişlikte bir sheet açılıyordu;
            masaüstünde mobil kalıbı gibi duruyordu. */}
        <FilterMenu
          label={autoT('Filtre')}
          items={[
            { key: 'all',       label: autoT('Tümü') },
            { key: 'material',  label: autoT(CATEGORY_LABELS.material) },
            { key: 'equipment', label: autoT(CATEGORY_LABELS.equipment) },
            { key: 'service',   label: autoT(CATEGORY_LABELS.service) },
            { key: 'other',     label: autoT(CATEGORY_LABELS.other) },
          ]}
          active={catFilter}
          onChange={(k) => setCatFilter(k as typeof catFilter)}
        />

        {/* CTA — Yeni Tedarikçi (sadece + ikon mobile'da kompakt) */}
        <Pressable
          onPress={() => setFormOpen({ visible: true, supplier: null })}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 44, paddingHorizontal: 14, borderRadius: 9999,
            backgroundColor: tblAccent,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
          }}
        >
          <Plus size={15} color="#FFF" strokeWidth={2.2} />
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>Yeni</Text>
        </Pressable>
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <CenteredLoader color={accentColor} inline />
      ) : filtered.length === 0 ? (
        <View style={[PCard, { alignItems: 'center', paddingVertical: 56, gap: 12 }]}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14' }}>
            <Building2 size={28} color={accentColor} strokeWidth={1.4} />
          </View>
          <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: T.ink }}>
            {suppliers.length === 0 ? 'Henüz tedarikçi yok' : 'Sonuç bulunamadı'}
          </Text>
          <Text style={{ fontSize: 13, color: T.ink3, textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
            {suppliers.length === 0 ? 'Sarf, ekipman ve hizmet aldığınız firmaları kaydedin; cari hesap otomatik oluşturulur.' : 'Arama veya filtre kriterlerini değiştirin.'}
          </Text>
        </View>
      ) : (
        isDesktop ? (
          <View style={[PCard, { padding: 0, overflow: 'hidden' }]}>
            {/* Desktop Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: tblAccent }}>
              <Text style={[eyebrow, { flex: 2.5, color: tblInk }]}>Firma</Text>
              <Text style={[eyebrow, { flex: 1.2, color: tblInk }]}>Kategori</Text>
              <Text style={[eyebrow, { flex: 1.2, color: tblInk }]}>Son hareket</Text>
              <Text style={[eyebrow, { flex: 1.5, textAlign: 'end' as any, color: tblInk }]}>Bakiye</Text>
              <View style={{ width: 12 }} />
            </View>
            {filtered.map((s, idx) => {
              const bal = balanceMap[s.id];
              const tone = bal ? balanceColor(Number(bal.balance_account)) : 'zero';
              // Katı per-currency: tedarikçi kendi para biriminde (yabancıysa balance_original)
              // Tedarikçinin kendi para birimi — baz dönüşümü yapılmaz
              const balCur = (s.default_currency || baseCurrency) as Currency;
              const balanceText = bal
                ? formatMoney(Math.abs(Number(bal.balance_account) || 0), balCur, { fractionDigits: 0 })
                : '—';
              const origText: string | null = null;
              const lastDate = bal?.last_transaction_date
                ? new Date(bal.last_transaction_date).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' })
                : null;
              const toneColor = tone === 'debt' ? '#9C2E2E' : tone === 'credit' ? '#1F6B47' : '#9A9A9A';
              const toneLabel = tone === 'debt' ? 'Borç' : tone === 'credit' ? 'Alacak' : 'Eşit';
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setActiveId(s.id)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: 18, paddingVertical: 14,
                    borderBottomWidth: idx < filtered.length - 1 ? 1 : 0,
                    borderBottomColor: T.hairline,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                >
                  <View style={{ flex: 2.5, opacity: s.is_active ? 1 : 0.6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: T.ink, flexShrink: 1 }} numberOfLines={1}>{s.name}</Text>
                      {!s.is_active && (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: T.hairline }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: T.ink3 }}>Pasif</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      {s.contact_person ? (
                        <Text style={{ fontSize: 11, color: T.ink3 }} numberOfLines={1}>{s.contact_person}</Text>
                      ) : null}
                      {s.phone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Phone size={9} color={T.ink3} strokeWidth={1.8} />
                          <Text style={{ fontSize: 11, color: T.ink3 }}>{s.phone}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 11, color: T.ink3, fontWeight: '500' }}>{CATEGORY_LABELS[s.category]}</Text>
                    {s.default_currency !== baseCurrency ? (
                      <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{s.default_currency}</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 11, color: T.ink3 }}>{lastDate ?? '—'}</Text>
                    {bal && bal.purchase_count > 0 ? (
                      <Text style={{ fontSize: 10, color: T.ink3, marginTop: 1 }}>{bal.purchase_count} alış</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 18, letterSpacing: -0.4, color: toneColor, lineHeight: 22 }}>
                      {tone === 'zero' ? '—' : balanceText}
                    </Text>
                    {tone !== 'zero' && origText ? (
                      <Text style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>({origText})</Text>
                    ) : null}
                    {tone !== 'zero' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
                        <Text style={{ fontSize: 10, color: toneColor, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' }}>{toneLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ width: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingStart: 4 }}>
                    <Pressable
                      onPress={(e: any) => { e?.stopPropagation?.(); setFormOpen({ visible: true, supplier: s }); }}
                      style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(31,86,137,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Pencil size={12} color="#1F5689" strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={async (e: any) => {
                        e?.stopPropagation?.();
                        const hasBalance = !!(bal && (bal.purchase_count > 0 || Math.abs(Number(bal.balance_account) || 0) > 0.01));
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
                          } else { toast.error('Silinemedi: ' + msg); return; }
                        } else { toast.success(`${s.name} ${hasBalance ? 'pasife alındı' : 'silindi'}`); }
                        load();
                      }}
                      style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,46,46,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Trash2 size={12} color="#9C2E2E" strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          /* Mobile: tableCard — ekstre / giderler mobil tablosuyla aynı kalıp */
          <SupplierMobileTable
            suppliers={filtered}
            balanceMap={balanceMap}
            baseCurrency={baseCurrency}
            onOpen={(s) => setActiveId(s.id)}
            onEdit={(s) => setFormOpen({ visible: true, supplier: s })}
            onRemove={async (s) => {
              const bal = balanceMap[s.id];
              const hasBalance = !!(bal && (bal.purchase_count > 0 || Math.abs(Number(bal.balance_account) || 0) > 0.01));
              const confirmMsg = hasBalance
                ? `${s.name} ${autoT('firmasının geçmiş işlemi var. Pasife alınsın mı?')}`
                : `${s.name} ${autoT('firmasını silmek istediğinden emin misin?')}`;
              if (!(await confirmAsync(autoT(hasBalance ? 'Firmayı Pasife Al' : 'Firmayı Sil'), confirmMsg, { confirmText: autoT(hasBalance ? 'Pasife Al' : 'Sil'), destructive: !hasBalance }))) return;
              const res = hasBalance ? await deactivateSupplier(s.id) : await deleteSupplier(s.id);
              if (res.error) {
                const msg = String((res.error as any).message ?? '');
                if (/foreign key|violates/i.test(msg)) {
                  const fb = await deactivateSupplier(s.id);
                  if (fb.error) { toast.error(autoT('Silinemedi:') + ' ' + msg); return; }
                  toast.success(`${s.name} ${autoT('pasife alındı')}`);
                } else { toast.error('Silinemedi: ' + msg); return; }
              } else { toast.success(`${s.name} ${hasBalance ? 'pasife alındı' : 'silindi'}`); }
              load();
            }}
          />
        )
      )}

      {/* ── Form modal ── */}
      <SupplierFormModal
        visible={formOpen.visible}
        supplier={formOpen.supplier}
        accentColor={accentColor}
        onClose={() => setFormOpen({ visible: false, supplier: null })}
        onSaved={() => { setFormOpen({ visible: false, supplier: null }); load(); }}
      />

    </ScrollView>
  );
}
