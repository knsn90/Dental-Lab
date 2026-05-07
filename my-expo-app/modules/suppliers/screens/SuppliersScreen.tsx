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
import { View, Text, Pressable, Platform, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import {
  Plus, Search, Building2, AlertCircle, ArrowDownCircle, ArrowUpCircle,
  Phone, Mail, Filter,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { usePageTitleStore } from '../../../core/store/pageTitleStore';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
import {
  Supplier, SupplierBalance, SupplierCategory,
  CATEGORY_LABELS, listSuppliers, listBalances, balanceColor,
} from '../api';
import { SupplierDetailScreen } from './SupplierDetailScreen';
import { SupplierFormModal } from '../components/SupplierFormModal';

interface Props {
  accentColor?: string;
}

export function SuppliersScreen({ accentColor = '#0A0A0A' }: Props) {
  const profile = useAuthStore(s => s.profile);
  const labId = (profile as any)?.lab_id ?? null;
  const baseCurrency = useBaseCurrency();
  const { setTitle, clear } = usePageTitleStore();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<SupplierCategory | 'all'>('all');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(s => {
      if (!s.is_active) return false;
      if (catFilter !== 'all' && s.category !== catFilter) return false;
      if (q && !s.name.toLowerCase().includes(q)
           && !(s.tax_no ?? '').toLowerCase().includes(q)
           && !(s.contact_person ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [suppliers, search, catFilter]);

  // ── Aggregates ──
  const totalDebt   = balances.reduce((s, b) => s + Math.max(0, b.balance_base), 0);
  const totalCredit = balances.reduce((s, b) => s + Math.max(0, -b.balance_base), 0);
  const totalCount  = suppliers.filter(s => s.is_active).length;
  const overdueCnt  = balances.filter(b => b.balance_base > 0).length;

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
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}>
      {/* ── KPI grid ── */}
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'Toplam borç',     value: formatMoney(totalDebt, baseCurrency, { fractionDigits: 0 }), icon: ArrowUpCircle,   color: '#9C2E2E' },
          { label: 'Toplam alacak',   value: formatMoney(totalCredit, baseCurrency, { fractionDigits: 0 }), icon: ArrowDownCircle, color: '#1F6B47' },
          { label: 'Aktif tedarikçi', value: String(totalCount),  icon: Building2,    color: accentColor },
          { label: 'Borçlu firma',    value: String(overdueCnt),  icon: AlertCircle,  color: overdueCnt > 0 ? '#D97706' : '#9CA3AF' },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <View key={i} style={[PCard, { flex: 1, minWidth: 160, gap: 4 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={eyebrow}>{kpi.label}</Text>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: kpi.color + '14' }}>
                  <Icon size={15} color={kpi.color} strokeWidth={1.6} />
                </View>
              </View>
              <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: i < 2 ? 26 : 36, letterSpacing: -1, color: '#0A0A0A', lineHeight: i < 2 ? 32 : 42 }} numberOfLines={1}>
                {kpi.value}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Toolbar ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <View style={{
          flex: 1, minWidth: 200, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)',
          paddingHorizontal: 12, height: 44,
        }}>
          <Search size={15} color="#9A9A9A" strokeWidth={1.6} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Firma adı, vergi no, kişi ara…"
            placeholderTextColor="#9A9A9A"
            style={{ flex: 1, fontSize: 14, color: '#0A0A0A', height: 44, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }}
          />
        </View>

        {/* Category filter */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['all','material','equipment','service','other'] as const).map(c => {
            const active = catFilter === c;
            const label = c === 'all' ? 'Tümü' : CATEGORY_LABELS[c];
            return (
              <Pressable
                key={c}
                onPress={() => setCatFilter(c)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999,
                  backgroundColor: active ? accentColor : '#FFFFFF',
                  borderWidth: 1, borderColor: active ? accentColor : 'rgba(0,0,0,0.05)',
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: active ? '600' : '500', color: active ? '#FFF' : '#6B6B6B' }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* CTA */}
        <Pressable
          onPress={() => setFormOpen({ visible: true, supplier: null })}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            paddingHorizontal: 14, paddingVertical: 9, borderRadius: 9999,
            backgroundColor: accentColor,
            ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: `0 4px 16px ${accentColor}33` } as any : {}),
          }}
        >
          <Plus size={14} color="#FFF" strokeWidth={2} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Yeni tedarikçi</Text>
        </Pressable>
      </View>

      {/* ── Liste ── */}
      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}>
          <ActivityIndicator color={accentColor} />
        </View>
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
        <View style={[PCard, { padding: 0, overflow: 'hidden' }]}>
          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, backgroundColor: '#FBF9F4', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
            <Text style={[eyebrow, { flex: 2.5 }]}>Firma</Text>
            <Text style={[eyebrow, { flex: 1.2 }]}>Kategori</Text>
            <Text style={[eyebrow, { flex: 1.2 }]}>Son hareket</Text>
            <Text style={[eyebrow, { flex: 1.5, textAlign: 'right' }]}>Bakiye</Text>
            <View style={{ width: 12 }} />
          </View>

          {filtered.map((s, idx) => {
            const bal = balanceMap[s.id];
            const tone = bal ? balanceColor(bal.balance_base) : 'zero';
            const balanceText = bal ? formatMoney(Math.abs(bal.balance_base), baseCurrency, { fractionDigits: 0 }) : '—';
            const lastDate = bal?.last_transaction_date
              ? new Date(bal.last_transaction_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
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
                <View style={{ flex: 2.5 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }} numberOfLines={1}>{s.name}</Text>
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
                  {tone !== 'zero' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: toneColor }} />
                      <Text style={{ fontSize: 10, color: toneColor, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' }}>{toneLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ width: 12 }} />
              </Pressable>
            );
          })}
        </View>
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
