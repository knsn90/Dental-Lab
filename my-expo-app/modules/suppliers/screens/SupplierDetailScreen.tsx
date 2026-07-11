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
import { View, Text, Pressable, Platform, ScrollView} from 'react-native';
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, RotateCcw, Settings as Adjust,
  Phone, Mail, Globe, MapPin, Building2, CreditCard, Calendar,
  Pencil, Plus, Receipt, Printer, FileSpreadsheet, Trash2,
} from 'lucide-react-native';
import { useAuthStore } from '../../../core/store/authStore';
import { formatMoney, useBaseCurrency } from '../../../core/money/currency';
import { CurrencyBreakdown } from '../../../core/money/CurrencyBreakdown';
import { sumByCurrency } from '../../../core/money/aggregations';
import {
  Supplier, SupplierBalance, SupplierTransaction, TransactionType, TX_TYPE_LABELS,
  PAYMENT_METHOD_LABELS, CATEGORY_LABELS,
  getSupplier, getBalance, listTransactions, balanceColor, deleteTransaction,
} from '../api';
import { SupplierFormModal } from '../components/SupplierFormModal';
import { TransactionFormModal } from '../components/TransactionFormModal';
import { PurchaseInvoicePreviewModal } from '../../purchases/components/PurchaseInvoicePreviewModal';
import { findPurchaseInvoiceByNumber } from '../../purchases/api';
import { ActivityIndicator } from '../../../core/ui/teethCompat';
import { CenteredLoader } from '../../../core/ui/CenteredLoader';
import { buildCariStatementHtml, type CariLine } from '../../../core/util/buildCariStatementHtml';

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
  const [txOpen, setTxOpen] = useState<{ visible: boolean; type: TransactionType; editing?: SupplierTransaction | null }>({ visible: false, type: 'PAYMENT', editing: null });
  // Satın alma faturası önizleme — PURCHASE satırına tıklanınca E-Fatura popup'ı açılır
  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  const handleEditTx = (t: SupplierTransaction) => {
    setTxOpen({ visible: true, type: t.type, editing: t });
  };

  const handleDeleteTx = async (t: SupplierTransaction) => {
    const msg = `"${TX_TYPE_LABELS[t.type]}" hareketini silmek istediğine emin misin? Cari bakiye yeniden hesaplanacak.`;
    const ok = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(msg)
      : true;
    if (!ok) return;
    const { error } = await deleteTransaction(t.id);
    if (error) {
      const m = (error as any).message ?? 'Silinemedi';
      if (Platform.OS === 'web') alert(m); else console.warn(m);
      return;
    }
    load();
  };

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

  // Hooks ÖNCE, early return SONRA — "Rendered more hooks" hatasını önler.
  // Phase 4: currency breakdown for purchases vs payments
  const purchaseSummary = useMemo(() => sumByCurrency(
    transactions.filter(t => t.type === 'PURCHASE'),
    t => ({ amount: Number(t.amount), currency: t.currency, amountBase: Number(t.amount_base ?? t.amount) }),
  ), [transactions]);
  const paymentSummary = useMemo(() => sumByCurrency(
    transactions.filter(t => t.type === 'PAYMENT' || t.type === 'RETURN'),
    t => ({ amount: Number(t.amount), currency: t.currency, amountBase: Number(t.amount_base ?? t.amount) }),
  ), [transactions]);

  // Hareketleri eskiden yeniye sıralayıp running balance hesapla.
  // PURCHASE = borç (debit), PAYMENT/RETURN = alacak (credit).
  // ADJUSTMENT pozitifse borç, negatifse alacak.
  // NOT: hook olduğu için ERKEN RETURN'DEN ÖNCE yer almalı.
  const ledgerRows = useMemo(() => {
    const asc = [...transactions].sort((a, b) => {
      const d = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
      return d !== 0 ? d : new Date(a.created_at as any).getTime() - new Date(b.created_at as any).getTime();
    });
    let running = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = asc.map(t => {
      const baseAmt = t.amount_base != null ? Number(t.amount_base) : Number(t.amount);
      let debit = 0, credit = 0;
      if (t.type === 'PURCHASE') debit = baseAmt;
      else if (t.type === 'PAYMENT' || t.type === 'RETURN') credit = baseAmt;
      else if (t.type === 'ADJUSTMENT') { if (baseAmt >= 0) debit = baseAmt; else credit = -baseAmt; }
      running += debit - credit;
      totalDebit += debit;
      totalCredit += credit;
      return { t, debit, credit, running };
    });
    return { rows, totalDebit, totalCredit, closing: running };
  }, [transactions]);

  if (loading || !supplier) {
    return <CenteredLoader color={accentColor} />;
  }

  const tone = balance ? balanceColor(balance.balance_base) : 'zero';
  const toneColor = tone === 'debt' ? '#9C2E2E' : tone === 'credit' ? '#1F6B47' : '#9A9A9A';
  const toneLabel = tone === 'debt' ? 'Bizim borcumuz' : tone === 'credit' ? 'Bizim alacağımız' : 'Hesap eşit';
  const balanceText = balance ? formatMoney(Math.abs(balance.balance_base), baseCurrency, { fractionDigits: 0 }) : '—';

  // ── Export helpers ──
  const escapeCsv = (v: any): string => {
    const s = v == null ? '' : String(v);
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const periodFrom = ledgerRows.rows[0]?.t.transaction_date ?? null;
  const periodTo   = ledgerRows.rows[ledgerRows.rows.length - 1]?.t.transaction_date ?? null;

  const handleExportExcel = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    // T-hesap standardı: Tarih | Belge No | Açıklama | Borç | Alacak | Bakiye | B/A
    const headers = ['Tarih', 'Belge No', 'Açıklama', 'Borç (TL)', 'Alacak (TL)', 'Bakiye (TL)', 'B/A', 'Orijinal Tutar', 'Para Birimi', 'Ödeme Şekli', 'Banka', 'Ref/Dekont No', 'IBAN', 'Vade Tarihi'];

    const fmtNum = (n: number) => n === 0 ? '' : n.toFixed(2);
    const rows = ledgerRows.rows.map(({ t, debit, credit, running }) => {
      const meta = [t.bank_name, t.iban, t.description].filter(Boolean).join(' · ');
      return [
        new Date(t.transaction_date).toLocaleDateString('tr-TR'),
        t.invoice_no ?? t.reference_no ?? '',
        `${TX_TYPE_LABELS[t.type]}${meta ? ' — ' + meta : ''}`,
        fmtNum(debit),
        fmtNum(credit),
        running.toFixed(2),
        running > 0.01 ? 'B' : running < -0.01 ? 'A' : '—',
        Number(t.amount).toFixed(2),
        t.currency,
        t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : '',
        t.bank_name ?? '',
        t.reference_no ?? '',
        t.iban ?? '',
        t.due_date ? new Date(t.due_date).toLocaleDateString('tr-TR') : '',
      ];
    });

    const closing = ledgerRows.closing;
    const totalRow = ['', '', 'TOPLAM', ledgerRows.totalDebit.toFixed(2), ledgerRows.totalCredit.toFixed(2), closing.toFixed(2), closing > 0.01 ? 'B' : closing < -0.01 ? 'A' : '—', '', '', '', '', '', '', ''];

    // Header metadata satırları (üstte)
    const titleRows = [
      ['CARİ HESAP EKSTRESİ'],
      [`Firma: ${supplier.name}`],
      [supplier.tax_no ? `VKN: ${supplier.tax_no}` : ''],
      [supplier.tax_office ? `Vergi Dairesi: ${supplier.tax_office}` : ''],
      [periodFrom && periodTo ? `Dönem: ${new Date(periodFrom).toLocaleDateString('tr-TR')} – ${new Date(periodTo).toLocaleDateString('tr-TR')}` : ''],
      [`Düzenlenme: ${new Date().toLocaleDateString('tr-TR')}`],
      [`Para Birimi: ${baseCurrency} (bakiyeler TL karşılığı)`],
      [''],
    ];

    const all = [...titleRows, headers, ...rows, totalRow];
    const csv = all.map(r => r.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = supplier.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
    a.download = `cari_ekstre_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const w = window.open('', '_blank', 'width=1100,height=800');
    if (!w) { alert('Pop-up engellendi — yazdırma penceresi açılamadı.'); return; }

    const cariLines: CariLine[] = ledgerRows.rows.map(({ t, debit, credit, running }) => ({
      refNo: t.invoice_no ?? t.reference_no ?? null,
      reference: [TX_TYPE_LABELS[t.type], t.payment_method ? PAYMENT_METHOD_LABELS[t.payment_method] : null].filter(Boolean).join(' · '),
      date: t.transaction_date,
      counterparty: t.bank_name ?? t.description ?? supplier.name,
      counterpartySub: t.iban ?? null,
      amount: debit > 0 ? debit : credit,
      currency: baseCurrency,
      type: debit > 0 ? 'debit' : 'credit',
      balance: running,
    }));

    const html = buildCariStatementHtml({
      documentTitle: 'Cari Hesap Ekstresi',
      periodFrom: periodFrom ?? null,
      periodTo: periodTo ?? null,
      lab: { name: 'Laboratuvar' },
      holder: {
        name: supplier.name,
        taxNo: supplier.tax_no ?? null,
        taxOffice: supplier.tax_office ?? null,
        phone: supplier.phone ?? null,
        email: supplier.email ?? null,
      },
      openingBalance: 0,
      closingBalance: ledgerRows.closing,
      currency: baseCurrency,
      lines: cariLines,
    });
    w.document.open(); w.document.write(html); w.document.close();
  };

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
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Platform.OS === 'web' && (
            <>
              <Pressable
                onPress={handleExportExcel}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <FileSpreadsheet size={12} color="#1F6B47" strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#1F6B47' }}>Excel</Text>
              </Pressable>
              <Pressable
                onPress={handlePrint}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
              >
                <Printer size={12} color="#6B6B6B" strokeWidth={1.8} />
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B6B6B' }}>Yazdır / PDF</Text>
              </Pressable>
            </>
          )}
          <Pressable
            onPress={() => setEditOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
          >
            <Pencil size={12} color="#6B6B6B" strokeWidth={1.8} />
            <Text style={{ fontSize: 12, fontWeight: '500', color: '#6B6B6B' }}>Düzenle</Text>
          </Pressable>
        </View>
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
          // PURCHASE satırı tıklanabilir: önce purchase_invoice_id, yoksa invoice_no ile bul
          const isPurchase = t.type === 'PURCHASE' && (!!t.purchase_invoice_id || !!t.invoice_no);

          const openPurchasePreview = async () => {
            if (t.purchase_invoice_id) {
              setPreviewInvoiceId(t.purchase_invoice_id);
              return;
            }
            // Legacy fallback — invoice_no'dan UUID bul
            if (t.invoice_no) {
              const { data: uuid } = await findPurchaseInvoiceByNumber(t.invoice_no, t.supplier_id);
              if (uuid) setPreviewInvoiceId(uuid);
            }
          };

          return (
            <Pressable
              key={t.id}
              onPress={isPurchase ? openPurchasePreview : undefined}
              style={({ hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingHorizontal: 18, paddingVertical: 13,
                borderBottomWidth: idx < transactions.length - 1 ? 1 : 0,
                borderBottomColor: 'rgba(0,0,0,0.04)',
                backgroundColor: isPurchase && hovered ? 'rgba(0,0,0,0.025)' : 'transparent',
                ...(Platform.OS === 'web' && isPurchase ? { cursor: 'pointer' } as any : {}),
              })}
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
                {(t.bank_name || t.reference_no || t.iban) ? (
                  <Text style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }} numberOfLines={1}>
                    {[
                      t.bank_name,
                      t.reference_no ? `Ref: ${t.reference_no}` : null,
                      t.iban,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
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

              {/* Edit + Delete actions */}
              <View style={{ flexDirection: 'row', gap: 4, marginLeft: 8 }}>
                <Pressable
                  onPress={(e: any) => { e?.stopPropagation?.(); handleEditTx(t); }}
                  hitSlop={6}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(0,0,0,0.04)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Pencil size={12} color="#6B6B6B" strokeWidth={1.8} />
                </Pressable>
                <Pressable
                  onPress={(e: any) => { e?.stopPropagation?.(); handleDeleteTx(t); }}
                  hitSlop={6}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(156,46,46,0.08)',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
                  }}
                >
                  <Trash2 size={12} color="#9C2E2E" strokeWidth={1.8} />
                </Pressable>
              </View>
            </Pressable>
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
        editing={txOpen.editing ?? null}
        supplier={supplier}
        accentColor={accentColor}
        onClose={() => setTxOpen({ ...txOpen, visible: false, editing: null })}
        onSaved={() => { setTxOpen({ ...txOpen, visible: false, editing: null }); load(); }}
      />

      {/* E-Fatura tarzı satın alma faturası önizleme */}
      <PurchaseInvoicePreviewModal
        visible={!!previewInvoiceId}
        onClose={() => setPreviewInvoiceId(null)}
        purchaseInvoiceId={previewInvoiceId}
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
