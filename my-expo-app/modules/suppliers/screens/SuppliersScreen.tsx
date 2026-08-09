import { localeTag } from '../../../core/i18n';
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
} from 'lucide-react-native';
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
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { useMobileTokens } from '../../../core/theme/mobileDesignTokens';

interface Props {
  accentColor?: string;
}

export function SuppliersScreen({ accentColor = '#0A0A0A' }: Props) {
  const T = useMobileTokens();
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const baseCurrency = useBaseCurrency();
  const { setTitle, clear } = usePageTitleStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<SupplierCategory | 'all'>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<{ visible: boolean; supplier: Supplier | null }>({ visible: false, supplier: null });

  useEffect(() => { setTitle('Tedarikçiler', ''); return clear; }, []);

  // ── Patterns design tokens ──
  const PCard = {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(0,0,0,0.04)' } : {}),
  } as any;
  const DisplayFont = Platform.OS === 'web' ? 'Inter Tight, Inter, system-ui, sans-serif' : 'InterTight_300Light';
  const eyebrow = { fontSize: 11, fontWeight: '600' as const, color: '#9A9A9A', letterSpacing: 1, textTransform: 'uppercase' as const };

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
      {/* ── F1 HeroCard — Tedarikçi özeti ── */}
      <View style={{
        borderRadius: 20, overflow: 'hidden',
        backgroundColor: accentColor, padding: 18, position: 'relative',
      }}>
        <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        <View style={{ position: 'absolute', bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.12)' }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 10, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)', marginBottom: 8 }}>
              Toplam Borç
            </Text>
            {/* Katı per-currency: her para birimi ayrı kart, asla toplanmaz */}
            <MoneyMultiX slices={debtSlices} variant="cards" size="lg" accentColor={accentColor} emptyText="—" />
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 8 }}>
              {totalCount} aktif tedarikçi
              {overdueCnt > 0 ? ` · ${overdueCnt} borçlu` : ''}
            </Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' }}>
            <Building2 size={20} color="#FFFFFF" strokeWidth={1.6} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
          {([
            { label: 'Alacak',     slices: creditSlices,       icon: ArrowDownCircle },
            { label: 'Tedarikçi',  value: String(totalCount),  icon: Building2       },
            { label: 'Borçlu',     value: String(overdueCnt),  icon: AlertCircle     },
          ] as { label: string; value?: string; slices?: { currency: Currency; total: number }[]; icon: any }[]).map(stat => {
            const Icon = stat.icon;
            return (
              <View key={stat.label} style={{ flex: 1, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <Icon size={11} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                  <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
                    {stat.label}
                  </Text>
                </View>
                {stat.slices ? (
                  stat.slices.length === 0 ? (
                    <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20 }}>—</Text>
                  ) : (
                    <View style={{ gap: 1 }}>
                      {stat.slices.map(sl => (
                        <Text key={sl.currency} style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20 }} numberOfLines={1}>
                          {formatMoney(sl.total, sl.currency, { fractionDigits: 0 })}
                        </Text>
                      ))}
                    </View>
                  )
                ) : (
                  <Text
                    style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 16, color: '#FFFFFF', letterSpacing: -0.3, lineHeight: 20 }}
                    numberOfLines={1}
                  >
                    {stat.value}
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {/* ── Toolbar — tek satır: Search + Filtre + Yeni Tedarikçi ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: T.cardSoft, borderRadius: 14, borderWidth: 1, borderColor: T.hairline,
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

        {/* Filtre butonu — search ile aynı yükseklik */}
        {(() => {
          const hasFilter = catFilter !== 'all';
          return (
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                height: 44, paddingHorizontal: 14, borderRadius: 14,
                backgroundColor: hasFilter ? '#0A0A0A' : '#FFFFFF',
                borderWidth: hasFilter ? 0 : 1, borderColor: 'rgba(0,0,0,0.08)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <SlidersHorizontal size={14} strokeWidth={1.8} color={hasFilter ? '#FFFFFF' : '#475569'} />
              <Text style={{ fontSize: 12, fontWeight: hasFilter ? '700' : '600', color: hasFilter ? '#FFFFFF' : '#475569' }}>
                Filtre{hasFilter ? ' (1)' : ''}
              </Text>
            </Pressable>
          );
        })()}

        {/* CTA — Yeni Tedarikçi (sadece + ikon mobile'da kompakt) */}
        <Pressable
          onPress={() => setFormOpen({ visible: true, supplier: null })}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 44, paddingHorizontal: 14, borderRadius: 14,
            backgroundColor: '#0A0A0A',
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
          <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 22, letterSpacing: -0.4, color: '#0A0A0A' }}>
            {suppliers.length === 0 ? 'Henüz tedarikçi yok' : 'Sonuç bulunamadı'}
          </Text>
          <Text style={{ fontSize: 13, color: '#9A9A9A', textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
            {suppliers.length === 0 ? 'Sarf, ekipman ve hizmet aldığınız firmaları kaydedin; cari hesap otomatik oluşturulur.' : 'Arama veya filtre kriterlerini değiştirin.'}
          </Text>
        </View>
      ) : (
        isDesktop ? (
          <View style={[PCard, { padding: 0, overflow: 'hidden' }]}>
            {/* Desktop Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#FBF9F4', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
              <Text style={[eyebrow, { flex: 2.5 }]}>Firma</Text>
              <Text style={[eyebrow, { flex: 1.2 }]}>Kategori</Text>
              <Text style={[eyebrow, { flex: 1.2 }]}>Son hareket</Text>
              <Text style={[eyebrow, { flex: 1.5, textAlign: 'right' }]}>Bakiye</Text>
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
                    borderBottomColor: 'rgba(0,0,0,0.04)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                >
                  <View style={{ flex: 2.5, opacity: s.is_active ? 1 : 0.6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A', flexShrink: 1 }} numberOfLines={1}>{s.name}</Text>
                      {!s.is_active && (
                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: '#6B6B6B' }}>Pasif</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      {s.contact_person ? (
                        <Text style={{ fontSize: 11, color: '#9A9A9A' }} numberOfLines={1}>{s.contact_person}</Text>
                      ) : null}
                      {s.phone ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Phone size={9} color="#9A9A9A" strokeWidth={1.8} />
                          <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{s.phone}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 11, color: '#6B6B6B', fontWeight: '500' }}>{CATEGORY_LABELS[s.category]}</Text>
                    {s.default_currency !== baseCurrency ? (
                      <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>{s.default_currency}</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ fontSize: 11, color: '#6B6B6B' }}>{lastDate ?? '—'}</Text>
                    {bal && bal.purchase_count > 0 ? (
                      <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>{bal.purchase_count} alış</Text>
                    ) : null}
                  </View>
                  <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 18, letterSpacing: -0.4, color: toneColor, lineHeight: 22 }}>
                      {tone === 'zero' ? '—' : balanceText}
                    </Text>
                    {tone !== 'zero' && origText ? (
                      <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 1 }}>({origText})</Text>
                    ) : null}
                    {tone !== 'zero' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
                        <Text style={{ fontSize: 10, color: toneColor, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' }}>{toneLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ width: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingLeft: 4 }}>
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
                          ? `${s.name} firmasının geçmiş işlemi var. Pasife alınsın mı? (Veriler korunur; bakiye kapanana kadar listede "Pasif" olarak görünür.)`
                          : `${s.name} firmasını kalıcı silmek istediğinden emin misin?`;
                        if (!(await confirmAsync(hasBalance ? 'Firmayı Pasife Al' : 'Firmayı Sil', confirmMsg, { confirmText: hasBalance ? 'Pasife Al' : 'Sil', destructive: !hasBalance }))) return;
                        const res = hasBalance ? await deactivateSupplier(s.id) : await deleteSupplier(s.id);
                        if (res.error) {
                          const msg = String((res.error as any).message ?? '');
                          if (/foreign key|violates/i.test(msg)) {
                            const fb = await deactivateSupplier(s.id);
                            if (fb.error) { toast.error('Silinemedi: ' + msg); return; }
                            toast.success(`${s.name} pasife alındı (geçmiş kayıt var)`);
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
          /* Mobile: vertical card list */
          <View style={{ gap: 10 }}>
            {filtered.map((s) => {
              const bal = balanceMap[s.id];
              const tone = bal ? balanceColor(Number(bal.balance_account)) : 'zero';
              // Katı per-currency: tedarikçi kendi hesap para biriminde
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
                    backgroundColor: '#FFFFFF', borderRadius: 16,
                    borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
                    padding: 14, gap: 10,
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                  }}
                >
                  {/* Üst satır: firma adı + bakiye */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0, opacity: s.is_active ? 1 : 0.6 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0A0A0A', flexShrink: 1 }} numberOfLines={2}>{s.name}</Text>
                        {!s.is_active && (
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.06)' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', color: '#6B6B6B' }}>Pasif</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 2 }}>
                        {CATEGORY_LABELS[s.category]}
                        {s.default_currency !== baseCurrency ? ` · ${s.default_currency}` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 18, letterSpacing: -0.4, color: toneColor, lineHeight: 22 }}>
                        {tone === 'zero' ? '—' : balanceText}
                      </Text>
                      {tone !== 'zero' && origText ? (
                        <Text style={{ fontSize: 11, color: '#9A9A9A', marginTop: 1 }}>({origText})</Text>
                      ) : null}
                      {tone !== 'zero' ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
                          <Text style={{ fontSize: 10, color: toneColor, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>{toneLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  {/* Alt satır: son hareket + actions */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)' }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 11, color: '#6B6B6B' }} numberOfLines={1}>
                        {lastDate ?? 'Henüz hareket yok'}
                        {bal && bal.purchase_count > 0 ? ` · ${bal.purchase_count} alış` : ''}
                      </Text>
                      {(s.contact_person || s.phone) && (
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                          {s.contact_person ? (
                            <Text style={{ fontSize: 10, color: '#9A9A9A' }} numberOfLines={1}>{s.contact_person}</Text>
                          ) : null}
                          {s.phone ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <Phone size={9} color="#9A9A9A" strokeWidth={1.8} />
                              <Text style={{ fontSize: 10, color: '#9A9A9A' }}>{s.phone}</Text>
                            </View>
                          ) : null}
                        </View>
                      )}
                    </View>
                    <Pressable
                      onPress={(e: any) => { e?.stopPropagation?.(); setFormOpen({ visible: true, supplier: s }); }}
                      style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(31,86,137,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Pencil size={13} color="#1F5689" strokeWidth={1.8} />
                    </Pressable>
                    <Pressable
                      onPress={async (e: any) => {
                        e?.stopPropagation?.();
                        const hasBalance = !!(bal && (bal.purchase_count > 0 || Math.abs(Number(bal.balance_account) || 0) > 0.01));
                        const confirmMsg = hasBalance
                          ? `${s.name} firmasının geçmiş işlemi var. Pasife alınsın mı?`
                          : `${s.name} firmasını silmek istediğinden emin misin?`;
                        if (!(await confirmAsync(hasBalance ? 'Firmayı Pasife Al' : 'Firmayı Sil', confirmMsg, { confirmText: hasBalance ? 'Pasife Al' : 'Sil', destructive: !hasBalance }))) return;
                        const res = hasBalance ? await deactivateSupplier(s.id) : await deleteSupplier(s.id);
                        if (res.error) {
                          const msg = String((res.error as any).message ?? '');
                          if (/foreign key|violates/i.test(msg)) {
                            const fb = await deactivateSupplier(s.id);
                            if (fb.error) { toast.error('Silinemedi: ' + msg); return; }
                            toast.success(`${s.name} pasife alındı`);
                          } else { toast.error('Silinemedi: ' + msg); return; }
                        } else { toast.success(`${s.name} ${hasBalance ? 'pasife alındı' : 'silindi'}`); }
                        load();
                      }}
                      style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(156,46,46,0.10)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Trash2 size={13} color="#9C2E2E" strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })}
          </View>
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

      {/* ── Filtre Sheet ──────────────────────────────────── */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <Pressable onPress={() => setFilterOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(10,14,26,0.42)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}) }}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{
            backgroundColor: T.card,
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) + 12,
            maxHeight: '85%',
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: T.hairline, marginBottom: 14 }} />
            <View style={{ paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: T.ink, flex: 1 }}>Filtrele</Text>
              <Pressable onPress={() => setCatFilter('all')} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: T.ink2 }}>Temizle</Text>
              </Pressable>
              <Pressable onPress={() => setFilterOpen(false)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: T.cardSoft, alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}>
                <X size={16} color={T.ink2} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 18 }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: T.ink3, paddingHorizontal: 4 }}>Kategori</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {(['all','material','equipment','service','other'] as const).map(c => {
                    const active = catFilter === c;
                    const label = c === 'all' ? 'Tümü' : CATEGORY_LABELS[c];
                    return (
                      <Pressable key={c} onPress={() => setCatFilter(c)} style={{
                        paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999,
                        borderWidth: 1, borderColor: active ? accentColor : T.hairline,
                        backgroundColor: active ? accentColor : 'transparent',
                        cursor: 'pointer' as any,
                      }}>
                        <Text style={{ fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? '#FFFFFF' : T.ink2 }}>{label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
            <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
              <Pressable onPress={() => setFilterOpen(false)} style={{
                height: 48, borderRadius: 14, backgroundColor: '#0A0A0A',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer' as any,
              }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFFFFF' }}>Uygula</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
