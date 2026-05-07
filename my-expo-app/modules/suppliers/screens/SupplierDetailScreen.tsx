/**
 * SupplierDetailScreen — Tedarikçi detayı + cari hesap ekstresi.
 *
 * Yapı:
 *   • Header: firma + bakiye (büyük Display 300)
 *   • Aksiyonlar: Ödeme ekle / İade / Düzenle
 *   • Bilgi kartı: iletişim, vergi, banka
 *   • Cari hareketler tablosu (PURCHASE / PAYMENT / RETURN / ADJUSTMENT)
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Platform, ScrollView, ActivityIndicator } from 'react-native';
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, RotateCcw, Settings as Adjust,
  Phone, Mail, Globe, MapPin, Building2, CreditCard, Calendar,
  Pencil, Plus, Receipt,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { formatMoney, useBaseCurrency } from '../../../core/money/currency';
import { CurrencyBreakdown } from '../../../core/money/CurrencyBreakdown';
import { sumByCurrency } from '../../../core/money/aggregations';
import {
  Supplier, SupplierBalance, SupplierTransaction, TransactionType, TX_TYPE_LABELS,
  PAYMENT_METHOD_LABELS, CATEGORY_LABELS,
  getSupplier, getBalance, listTransactions, balanceColor,
} from '../api';
import { SupplierFormModal } from '../components/SupplierFormModal';
import { TransactionFormModal } from '../components/TransactionFormModal';

interface Props {
  supplierId: string;
  accentColor?: string;
  onBack: () => void;
}

export function SupplierDetailScreen({ supplierId, accentColor = '#0A0A0A', onBack }: Props) {
  const baseCurrency = useBaseCurrency();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [balance, setBalance] = useState<SupplierBalance | null>(null);
  const [transactions, setTransactions] = useState<SupplierTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [txOpen, setTxOpen] = useState<{ visible: boolean; type: TransactionType }>({ visible: false, type: 'PAYMENT' });

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
    const [s, b, tx] = await Promise.all([
      getSupplier(supplierId),
      getBalance(supplierId),
      listTransactions(supplierId, 200),
    ]);
    if (s.data) setSupplier(s.data);
    if (b.data) setBalance(b.data);
    if (tx.data) setTransactions(tx.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [supplierId]);

  if (loading || !supplier) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <ActivityIndicator color={accentColor} size="large" />
      </View>
    );
  }

  // Phase 4: currency breakdown for purchases vs payments
  const purchaseSummary = useMemo(() => sumByCurrency(
    transactions.filter(t => t.type === 'PURCHASE'),
    t => ({ amount: Number(t.amount), currency: t.currency, amountBase: Number(t.amount_base ?? t.amount) }),
  ), [transactions]);
  const paymentSummary = useMemo(() => sumByCurrency(
    transactions.filter(t => t.type === 'PAYMENT' || t.type === 'RETURN'),
    t => ({ amount: Number(t.amount), currency: t.currency, amountBase: Number(t.amount_base ?? t.amount) }),
  ), [transactions]);

  const tone = balance ? balanceColor(balance.balance_base) : 'zero';
  const toneColor = tone === 'debt' ? '#9C2E2E' : tone === 'credit' ? '#1F6B47' : '#9A9A9A';
  const toneLabel = tone === 'debt' ? 'Bizim borcumuz' : tone === 'credit' ? 'Bizim alacağımız' : 'Hesap eşit';
  const balanceText = balance ? formatMoney(Math.abs(balance.balance_base), baseCurrency, { fractionDigits: 0 }) : '—';

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 14 }}>
      {/* Back + Edit */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={onBack}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.04)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
        >
          <ArrowLeft size={14} color="#6B6B6B" strokeWidth={1.8} />
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Tedarikçiler</Text>
        </Pressable>
        <Pressable
          onPress={() => setEditOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
        >
          <Pencil size={12} color="#6B6B6B" strokeWidth={1.8} />
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B6B6B' }}>Düzenle</Text>
        </Pressable>
      </View>

      {/* Hero: name + balance */}
      <View style={[PCard, { gap: 14 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: accentColor + '14' }}>
              <Building2 size={22} color={accentColor} strokeWidth={1.6} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={eyebrow}>{CATEGORY_LABELS[supplier.category]}</Text>
              <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 28, letterSpacing: -0.8, color: '#0A0A0A', marginTop: 2 }} numberOfLines={2}>
                {supplier.name}
              </Text>
              {supplier.tax_no ? (
                <Text style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>
                  VKN {supplier.tax_no}{supplier.tax_office ? ` · ${supplier.tax_office}` : ''}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Balance card */}
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[eyebrow, { color: toneColor }]}>{toneLabel}</Text>
            <Text style={{ fontFamily: DisplayFont, fontWeight: '300', fontSize: 38, letterSpacing: -1.2, color: toneColor, lineHeight: 44 }}>
              {tone === 'zero' ? '—' : balanceText}
            </Text>
            {balance && balance.purchase_count > 0 ? (
              <Text style={{ fontSize: 11, color: '#9A9A9A' }}>
                {balance.purchase_count} alış · {balance.last_transaction_date ? new Date(balance.last_transaction_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : '—'}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Pressable
            onPress={() => setTxOpen({ visible: true, type: 'PAYMENT' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999, backgroundColor: accentColor, ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: `0 4px 16px ${accentColor}33` } as any : {}) }}
          >
            <ArrowDownCircle size={14} color="#FFF" strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>Ödeme ekle</Text>
          </Pressable>
          <Pressable
            onPress={() => setTxOpen({ visible: true, type: 'PURCHASE' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Receipt size={14} color="#6B6B6B" strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Manuel fatura</Text>
          </Pressable>
          <Pressable
            onPress={() => setTxOpen({ visible: true, type: 'RETURN' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <RotateCcw size={14} color="#6B6B6B" strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>İade</Text>
          </Pressable>
          <Pressable
            onPress={() => setTxOpen({ visible: true, type: 'ADJUSTMENT' })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Adjust size={14} color="#6B6B6B" strokeWidth={1.8} />
            <Text style={{ fontSize: 13, fontWeight: '500', color: '#6B6B6B' }}>Düzeltme</Text>
          </Pressable>
        </View>

        {/* Summary — Phase 4: currency breakdown popups */}
        {balance && (balance.total_purchases > 0 || balance.total_payments > 0) ? (
          <View style={{ flexDirection: 'row', gap: 24, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)', flexWrap: 'wrap' }}>
            <View>
              <Text style={[eyebrow, { color: '#9C2E2E' }]}>Toplam alış</Text>
              <CurrencyBreakdown
                summary={purchaseSummary}
                baseCurrency={baseCurrency}
                mode="compact"
                title="Alış"
                accentColor="#9C2E2E"
                numberStyle={{ fontFamily: DisplayFont, fontWeight: '300' as any, fontSize: 18, letterSpacing: -0.4, color: '#9C2E2E', lineHeight: 22 }}
              />
            </View>
            <View>
              <Text style={[eyebrow, { color: '#1F6B47' }]}>Toplam ödenen</Text>
              <CurrencyBreakdown
                summary={paymentSummary}
                baseCurrency={baseCurrency}
                mode="compact"
                title="Ödeme"
                accentColor="#1F6B47"
                numberStyle={{ fontFamily: DisplayFont, fontWeight: '300' as any, fontSize: 18, letterSpacing: -0.4, color: '#1F6B47', lineHeight: 22 }}
              />
            </View>
          </View>
        ) : null}
      </View>

      {/* Contact info */}
      {(supplier.contact_person || supplier.phone || supplier.email || supplier.website || supplier.address || supplier.iban) && (
        <View style={[PCard, { gap: 10 }]}>
          <Text style={eyebrow}>İletişim & banka</Text>
          {supplier.contact_person ? <InfoRow icon={Building2} label="İlgili kişi" value={supplier.contact_person} /> : null}
          {supplier.phone ? <InfoRow icon={Phone} label="Telefon" value={supplier.phone} /> : null}
          {supplier.email ? <InfoRow icon={Mail} label="E-posta" value={supplier.email} /> : null}
          {supplier.website ? <InfoRow icon={Globe} label="Web" value={supplier.website} /> : null}
          {supplier.address ? <InfoRow icon={MapPin} label="Adres" value={supplier.address} /> : null}
          {supplier.iban ? <InfoRow icon={CreditCard} label={`IBAN${supplier.bank_name ? ` · ${supplier.bank_name}` : ''}`} value={supplier.iban} /> : null}
          {supplier.payment_terms_days > 0 ? <InfoRow icon={Calendar} label="Vade" value={`${supplier.payment_terms_days} gün`} /> : null}
        </View>
      )}

      {/* Transactions table */}
      <View style={[PCard, { padding: 0, overflow: 'hidden' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' }}>
          <Text style={[eyebrow, { color: '#6B6B6B' }]}>Cari hareketler</Text>
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 11, color: '#9A9A9A' }}>{transactions.length} kayıt</Text>
        </View>

        {transactions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Receipt size={28} color="#D9D9D9" strokeWidth={1.4} />
            <Text style={{ fontSize: 13, color: '#9A9A9A' }}>Henüz cari hareket yok</Text>
          </View>
        ) : transactions.map((t, idx) => {
          const isCredit = t.type === 'PAYMENT' || t.type === 'RETURN';
          const sign = isCredit ? -1 : 1;
          const txColor = t.type === 'PAYMENT' ? '#1F6B47' : t.type === 'RETURN' ? '#0F766E' : t.type === 'ADJUSTMENT' ? '#6B6B6B' : '#9C2E2E';
          const Icon = t.type === 'PURCHASE' ? ArrowUpCircle : t.type === 'PAYMENT' ? ArrowDownCircle : t.type === 'RETURN' ? RotateCcw : Adjust;

          return (
            <View
              key={t.id}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 18, paddingVertical: 13,
                borderBottomWidth: idx < transactions.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.04)',
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: txColor + '14' }}>
                <Icon size={16} color={txColor} strokeWidth={1.6} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#0A0A0A' }}>{TX_TYPE_LABELS[t.type]}</Text>
                  {t.invoice_no ? (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)' }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: '#6B6B6B' }}>#{t.invoice_no}</Text>
                    </View>
                  ) : null}
                  {t.payment_method ? (
                    <Text style={{ fontSize: 10, color: '#9A9A9A' }}>· {PAYMENT_METHOD_LABELS[t.payment_method]}</Text>
                  ) : null}
                </View>
                {t.description ? (
                  <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }} numberOfLines={1}>{t.description}</Text>
                ) : null}
                <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>
                  {new Date(t.transaction_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {t.due_date ? ` · vade: ${new Date(t.due_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: txColor, letterSpacing: -0.2 }}>
                  {sign > 0 ? '+' : '−'}{formatMoney(t.amount, t.currency, { fractionDigits: 2 })}
                </Text>
                {t.currency !== baseCurrency && t.amount_base != null ? (
                  <Text style={{ fontSize: 10, color: '#9A9A9A', marginTop: 1 }}>
                    ≈ {formatMoney(Math.abs(t.amount_base), baseCurrency, { fractionDigits: 0 })}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      {/* Modals */}
      <SupplierFormModal
        visible={editOpen}
        supplier={supplier}
        accentColor={accentColor}
        onClose={() => setEditOpen(false)}
        onSaved={() => { setEditOpen(false); load(); }}
      />
      <TransactionFormModal
        visible={txOpen.visible}
        type={txOpen.type}
        supplier={supplier}
        accentColor={accentColor}
        onClose={() => setTxOpen({ ...txOpen, visible: false })}
        onSaved={() => { setTxOpen({ ...txOpen, visible: false }); load(); }}
      />
    </ScrollView>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.04)' }}>
        <Icon size={12} color="#6B6B6B" strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, color: '#9A9A9A', fontWeight: '500' }}>{label}</Text>
        <Text style={{ fontSize: 13, color: '#2C2C2C', fontWeight: '500', marginTop: 1 }}>{value}</Text>
      </View>
    </View>
  );
}
