import { localeTag } from '../../../core/i18n';
/**
 * SupplierDetailScreen — Tedarikçi detayı + cari hesap ekstresi.
 *
 * Yapı:
 *   • Header: firma + bakiye (büyük Display 300)
 *   • Aksiyonlar: Ödeme ekle / İade / Düzenle
 *   • Bilgi kartı: iletişim, vergi, banka
 *   • Cari hareketler tablosu (PURCHASE / PAYMENT / RETURN / ADJUSTMENT)
 */

import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { HubContext } from '../../../core/ui/HubContext';
import { PurchaseInvoiceDetailScreen } from '../../purchases/screens/PurchaseInvoiceDetailScreen';
import { View, Text, Pressable, Platform, ScrollView, useWindowDimensions } from 'react-native';
import { confirmAsync } from '../../../core/util/confirm';
import {
  ArrowDownCircle, ArrowUpCircle, RotateCcw, Settings as Adjust,
  Phone, Mail, Globe, MapPin, Building2, CreditCard, Calendar,
  Pencil, Plus, Receipt, Printer, FileSpreadsheet, Trash2,
} from '../../../core/ui/icons';
import { useAuthStore } from '../../../core/store/authStore';
import { formatMoney, useBaseCurrency, type Currency } from '../../../core/money/currency';
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
import { autoT } from '../../../core/i18n/autoTranslate';
import { MobileTableX, MobileTableRowX, MobileTableIconX, useMobileTableText } from '../../../core/ui/MobileTableX';
import { WhiteHero, useWhiteHeroInk } from '../../../core/ui/WhiteHero';
import { GlassTooltip } from '../../../core/ui/GlassTooltip';
import { useInkUI } from '../../../core/theme/inkScale';
import { RowActionsMenu } from '../../../core/ui/RowActionsMenu';
import { NavyBackButtonX } from '../../../core/ui/NavyBackButtonX';

interface Props {
  supplierId: string;
  accentColor?: string;
  onBack: () => void;
}

export function SupplierDetailScreen({ supplierId, accentColor = '#0A0A0A', onBack }: Props) {
  const U = useInkUI();
  const MT = useMobileTableText();
  const heroInk = useWhiteHeroInk();
  const isDesktop = useWindowDimensions().width >= 1024;
  const router     = useRouter();
  const segments   = useSegments();
  const panel      = (segments?.[0] as string) ?? '(lab)';
  const isEmbedded = useContext(HubContext);

  /**
   * Fatura detayı bu ekranın İÇİNDE açılır — hub'ın içeriğini değiştirmek
   * yerine. Sebep: hub seviyesinde açınca bu ekran unmount oluyor, geri
   * dönüldüğünde hangi tedarikçide olduğumuz kayboluyor ve liste başa
   * dönüyordu. Kenar çubuğu yine yerinde kalır (hub'ın içindeyiz).
   */
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const openInvoice = (id: string) => {
    if (isEmbedded) setInvoiceId(id);
    else router.push(`/${panel}/purchase-invoice/${id}` as any);
  };
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
    const ok = await confirmAsync('Hareketi Sil', msg, { confirmText: 'Sil', destructive: true });
    if (!ok) return;
    const { error } = await deleteTransaction(t.id);
    if (error) {
      const m = (error as any).message ?? 'Silinemedi';
      if (Platform.OS === 'web') alert(m); else console.warn(m);
      return;
    }
    load();
  };

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
  // Cari, tedarikçinin kendi para biriminde tutulur (EUR faturalı tedarikçide EUR).
  // Toplamlar/bakiye amount_account üzerinden; ≈₺ karşılığı ikincil bilgi olarak kalır.
  const acctCurrency = ((supplier?.default_currency ?? baseCurrency) as Currency);
  /**
   * Hareketin CARİ para birimindeki tutarı.
   *
   * amount_base'e ASLA düşülmez: o, labın baz para biriminde (EUR) tutulur ve
   * cari TL ise 593 TL'lik alış "₺11" olarak görünür. Hesap tutarı yoksa,
   * yalnız para birimleri aynıysa işlemin kendi tutarı kullanılabilir.
   */
  const acctOf = (t: any) => {
    if (t.amount_account != null) return Number(t.amount_account);
    if ((t.currency ?? acctCurrency) === acctCurrency) return Number(t.amount);
    return 0;   // çevrilemiyor — sıfır say, toplamı yanlış para birimiyle şişirme
  };

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
      const baseAmt = acctOf(t);
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

  if (invoiceId) {
    return (
      <PurchaseInvoiceDetailScreen
        invoiceId={invoiceId}
        onBack={() => { setInvoiceId(null); load(); }}
      />
    );
  }

  if (loading || !supplier) {
    return <CenteredLoader color={accentColor} />;
  }

  // Bakiye cari para biriminde (balance_account); view'da yoksa eski alana düş.
  const balanceAcct = balance
    ? Number((balance as any).balance_account ?? balance.balance_base)
    : 0;
  const tone = balance ? balanceColor(balanceAcct) : 'zero';
  const toneColor = tone === 'debt' ? U.chipTones.danger.fg : tone === 'credit' ? U.chipTones.success.fg : U.ink[400];
  // Kısa etiket: mobilde üç rakam tek satıra sığsın ("Bizim borcumuz" taşırıyordu)
  const toneLabel = tone === 'debt' ? 'Borcumuz' : tone === 'credit' ? 'Alacağımız' : 'Hesap eşit';
  const balanceText = balance
    ? formatMoney(Math.abs(balanceAcct), acctCurrency, { fractionDigits: 2 })
    : '—';

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
        new Date(t.transaction_date).toLocaleDateString(localeTag()),
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
        t.due_date ? new Date(t.due_date).toLocaleDateString(localeTag()) : '',
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
      [periodFrom && periodTo ? `Dönem: ${new Date(periodFrom).toLocaleDateString(localeTag())} – ${new Date(periodTo).toLocaleDateString(localeTag())}` : ''],
      [`Düzenlenme: ${new Date().toLocaleDateString(localeTag())}`],
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
      documentTitle: autoT('Cari Hesap Ekstresi'),
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

  // ── Görünüm: ekstre sayfasıyla aynı dil (beyaz hero + tablo kartları) ──
  const payPct = ledgerRows.totalDebit > 0 ? Math.min(100, (ledgerRows.totalCredit / ledgerRows.totalDebit) * 100) : 0;
  const fmt0 = (n: number) => formatMoney(n, acctCurrency, { fractionDigits: 0 });
  const heroDesc = [
    CATEGORY_LABELS[supplier.category] ? autoT(CATEGORY_LABELS[supplier.category]) : null,
    supplier.tax_no ? `VKN ${supplier.tax_no}${supplier.tax_office ? ` · ${supplier.tax_office}` : ''}` : null,
    balance && balance.purchase_count > 0
      ? `${balance.purchase_count} ${autoT('alış')}${balance.last_transaction_date ? ` · ${new Date(balance.last_transaction_date).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' })}` : ''}`
      : null,
  ].filter(Boolean).join(' · ');
  const contactRows = [
    supplier.contact_person ? { icon: Building2, label: 'İlgili kişi', value: supplier.contact_person } : null,
    supplier.phone ? { icon: Phone, label: 'Telefon', value: supplier.phone } : null,
    supplier.email ? { icon: Mail, label: 'E-posta', value: supplier.email } : null,
    supplier.website ? { icon: Globe, label: 'Web', value: supplier.website } : null,
    supplier.address ? { icon: MapPin, label: 'Adres', value: supplier.address } : null,
    supplier.iban ? { icon: CreditCard, label: supplier.bank_name ? `IBAN · ${supplier.bank_name}` : 'IBAN', value: supplier.iban } : null,
    supplier.payment_terms_days > 0 ? { icon: Calendar, label: 'Vade', value: `${supplier.payment_terms_days} ${autoT('gün')}` } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[];

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 60, gap: 16 }} showsVerticalScrollIndicator={false}>
      {/* Beyaz hero — ekstre sayfasıyla aynı: geri kicker'ın solunda, bakiye/alış/ödeme
          rakamları sağda, eylemler alt şeritte, ödeme oranı rayı en altta. */}
      <WhiteHero
        kicker={autoT('Tedarikçi Cari Hesabı')}
        leading={<NavyBackButtonX onPress={onBack} tooltip="Tedarikçi listesine döner" />}
        title={supplier.name}
        // Ticari unvanlar uzun ("… SANAYİ VE DIŞ TİCARET LİMİTED ŞİRKETİ"): 44px başlık
        // 6 satıra bölünüyordu → uzun adda hero'nun kompakt ölçüsü
        compact={supplier.name.length > 28}
        description={heroDesc || undefined}
        stats={[
          { value: tone === 'zero' ? '—' : fmt0(Math.abs(balanceAcct)), label: autoT(toneLabel) },
          { value: fmt0(ledgerRows.totalDebit),  label: autoT('Toplam alış') },
          { value: fmt0(ledgerRows.totalCredit), label: autoT('Toplam ödenen') },
        ]}
        actionsAlign="end"
        actions={!isDesktop ? <>
          {/* Mobil: tek satır — birincil eylem etiketli, gerisi etiketli "⋯" menüsünde
              (dokunmatikte ipucu balonu çıkmaz; yalın ikonlar anlaşılmıyordu) */}
          <GlassTooltip title={autoT('Ödeme ekle')} text={autoT('Tedarikçiye yapılan ödemeyi kaydeder')}>
            <HeroBtn icon={ArrowDownCircle} label="Ödeme ekle" onPress={() => setTxOpen({ visible: true, type: 'PAYMENT' })} />
          </GlassTooltip>
          {Platform.OS === 'web' && (
            <GlassTooltip title={autoT('Yazdır / PDF')} text={autoT('Ekstreyi yazdır veya PDF olarak kaydet')}>
              <HeroBtn icon={Printer} onPress={handlePrint} variant="ghost" />
            </GlassTooltip>
          )}
          <GlassTooltip title={autoT('Diğer işlemler')} text={autoT('Diğer işlemleri açar')}>
            <View style={{ borderRadius: 999, borderWidth: 1, borderColor: U.ink[200], padding: 6 }}>
              <RowActionsMenu size={26} color={U.ink[700]} actions={[
                { key: 'purchase', label: 'Manuel fatura', icon: Receipt, onPress: () => setTxOpen({ visible: true, type: 'PURCHASE' }) },
                { key: 'return', label: 'İade', icon: RotateCcw, onPress: () => setTxOpen({ visible: true, type: 'RETURN' }) },
                { key: 'adjust', label: 'Düzeltme', icon: Adjust, onPress: () => setTxOpen({ visible: true, type: 'ADJUSTMENT' }) },
                { key: 'edit', label: 'Düzenle', icon: Pencil, onPress: () => setEditOpen(true) },
                ...(Platform.OS === 'web' ? [{ key: 'excel', label: 'Excel', icon: FileSpreadsheet, onPress: handleExportExcel }] : []),
              ]} />
            </View>
          </GlassTooltip>
        </> : <>
          <GlassTooltip title={autoT('Ödeme ekle')} text={autoT('Tedarikçiye yapılan ödemeyi kaydeder')}>
            <HeroBtn icon={ArrowDownCircle} label="Ödeme ekle" onPress={() => setTxOpen({ visible: true, type: 'PAYMENT' })} />
          </GlassTooltip>
          <GlassTooltip title={autoT('Manuel fatura')} text={autoT('Elle alış faturası kaydeder')}>
            <HeroBtn icon={Receipt} label="Manuel fatura" onPress={() => setTxOpen({ visible: true, type: 'PURCHASE' })} variant="ghost" />
          </GlassTooltip>
          <GlassTooltip title={autoT('İade')} text={autoT('Tedarikçiye iade kaydeder')}>
            <HeroBtn icon={RotateCcw} label="İade" onPress={() => setTxOpen({ visible: true, type: 'RETURN' })} variant="ghost" />
          </GlassTooltip>
          <GlassTooltip title={autoT('Düzeltme')} text={autoT('Bakiye düzeltme kaydı ekler')}>
            <HeroBtn icon={Adjust} label="Düzeltme" onPress={() => setTxOpen({ visible: true, type: 'ADJUSTMENT' })} variant="ghost" />
          </GlassTooltip>
          <GlassTooltip title={autoT('Düzenle')} text={autoT('Firma bilgilerini düzenle')}>
            <HeroBtn icon={Pencil} label="Düzenle" onPress={() => setEditOpen(true)} variant="ghost" />
          </GlassTooltip>
          {Platform.OS === 'web' && (
            <>
              <GlassTooltip title={autoT('Yazdır / PDF')} text={autoT('Ekstreyi yazdır veya PDF olarak kaydet')}>
                <HeroBtn icon={Printer} label="Yazdır / PDF" onPress={handlePrint} variant="ghost" />
              </GlassTooltip>
              <GlassTooltip title={autoT('Excel')} text={autoT('Ekstreyi Excel dosyası olarak indir')}>
                <HeroBtn icon={FileSpreadsheet} label="Excel" onPress={handleExportExcel} variant="ghost" />
              </GlassTooltip>
            </>
          )}
        </>}
      >
        {/* Ödeme oranı — ekstredeki tahsilat oranı rayıyla aynı */}
        {ledgerRows.totalDebit > 0 ? (
          <View style={{ marginTop: 16, gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 0.7, textTransform: 'uppercase', color: heroInk.inkSoft }}>
                Ödeme oranı
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '700', color: heroInk.ink }}>{payPct.toFixed(0)}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: heroInk.tileBg, overflow: 'hidden' }}>
              <View style={{ width: `${payPct}%` as any, height: '100%', borderRadius: 3, backgroundColor: '#2D9A6B' }} />
            </View>
          </View>
        ) : null}
      </WhiteHero>

      {/* Cari hareketler — ekstre / finans tablolarıyla aynı kalıp */}
      <MobileTableX
        title="Cari hareketler" count={transactions.length} countLabel="kayıt"
        footer={transactions.length > 0 ? <>
          <Text style={MT.footNote}>{transactions.length} kayıt</Text>
          <View style={{ flex: 1 }} />
          <Text style={MT.footLabel}>Bakiye:</Text>
          <Text style={[MT.amount, { color: toneColor }]}>{tone === 'zero' ? '—' : balanceText}</Text>
        </> : undefined}
      >
        {transactions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
            <Receipt size={28} color={U.ink[300]} strokeWidth={1.4} />
            <Text style={{ fontSize: 13, color: U.ink[500] }}>Henüz cari hareket yok</Text>
          </View>
        ) : transactions.map((t, idx) => {
          const isCredit = t.type === 'PAYMENT' || t.type === 'RETURN';
          const sign = isCredit ? -1 : 1;
          // Tema-farkında tonlar: alış borç (kırmızı), ödeme alacak (yeşil), iade bilgi, düzeltme nötr
          const tt = t.type === 'PAYMENT' ? U.chipTones.success : t.type === 'RETURN' ? U.chipTones.info
            : t.type === 'ADJUSTMENT' ? { bg: U.chipNeutral, fg: U.ink[500] } : U.chipTones.danger;
          const Icon = t.type === 'PURCHASE' ? ArrowUpCircle : t.type === 'PAYMENT' ? ArrowDownCircle : t.type === 'RETURN' ? RotateCcw : Adjust;
          // PURCHASE satırı tıklanabilir: önce purchase_invoice_id, yoksa invoice_no ile bul
          const isPurchase = t.type === 'PURCHASE' && (!!t.purchase_invoice_id || !!t.invoice_no);

          // Fatura artık uygulama içinde tam sayfa açılır; resmî belge
          // görünümü orada "Yazdır" butonunun arkasında.
          const openPurchasePreview = async () => {
            if (t.purchase_invoice_id) {
              openInvoice(t.purchase_invoice_id);
              return;
            }
            // Legacy fallback — invoice_no'dan UUID bul
            if (t.invoice_no) {
              const { data: uuid } = await findPurchaseInvoiceByNumber(t.invoice_no, t.supplier_id);
              if (uuid) openInvoice(uuid);
            }
          };
          const meta = [
            t.bank_name,
            t.reference_no ? `Ref: ${t.reference_no}` : null,
            t.iban,
          ].filter(Boolean).join(' · ');

          return (
            <MobileTableRowX key={t.id} isLast={idx === transactions.length - 1} onPress={isPurchase ? openPurchasePreview : undefined}>
              <MobileTableIconX icon={Icon} tone={tt} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text numberOfLines={1} style={[MT.title, { flexShrink: 1 }]}>{TX_TYPE_LABELS[t.type]}</Text>
                  {t.invoice_no ? (
                    <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: U.chipNeutral }}>
                      <Text style={{ fontSize: 9.5, fontWeight: '600', color: U.ink[500] }}>#{t.invoice_no}</Text>
                    </View>
                  ) : null}
                  {t.payment_method && PAYMENT_METHOD_LABELS[t.payment_method] ? (
                    <Text style={{ fontSize: 10, color: U.ink[400] }}>· {PAYMENT_METHOD_LABELS[t.payment_method]}</Text>
                  ) : null}
                </View>
                {meta ? <Text style={MT.sub} numberOfLines={1}>{meta}</Text> : null}
                {t.description ? <Text style={MT.sub} numberOfLines={1}>{t.description}</Text> : null}
                <Text style={[MT.meta, { marginTop: 2 }]}>
                  {new Date(t.transaction_date).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' })}
                  {t.due_date ? ` · ${autoT('vade')} ${new Date(t.due_date).toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' })}` : ''}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[MT.amount, { color: tt.fg, fontVariant: ['tabular-nums'] }]}>
                    {sign > 0 ? '+' : '−'}{formatMoney(t.amount, t.currency, { fractionDigits: 2 })}
                  </Text>
                  {/* İkincil satır CARİNİN para biriminde (amount_account), baz ₺'de değil.
                      Bakiye/toplamlar zaten acctCurrency üzerinden hesaplanıyor; ≈ satırı
                      da onunla aynı birimde olmalı ki hareketler bakiyeyle kıyaslanabilsin.
                      Çevrim kaydın kendi account_rate_at_time'ıyla yapılmış (yeniden hesap yok). */}
                  {t.currency !== acctCurrency && t.amount_account != null ? (
                    <Text style={MT.amountSub}>
                      ≈ {formatMoney(Math.abs(Number(t.amount_account)), acctCurrency, { fractionDigits: 2 })}
                    </Text>
                  ) : null}
                </View>
                {/* Düzenle + Sil */}
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <GlassTooltip title={autoT('Düzenle')} text={autoT('Hareketi düzenler')}>
                    <Pressable
                      onPress={(e: any) => { e?.stopPropagation?.(); handleEditTx(t); }}
                      hitSlop={6}
                      style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipNeutral, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Pencil size={12} color={U.ink[500]} strokeWidth={1.8} />
                    </Pressable>
                  </GlassTooltip>
                  <GlassTooltip title={autoT('Sil')} text={autoT('Hareketi kalıcı olarak siler')}>
                    <Pressable
                      onPress={(e: any) => { e?.stopPropagation?.(); handleDeleteTx(t); }}
                      hitSlop={6}
                      style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: U.chipTones.danger.bg, ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) }}
                    >
                      <Trash2 size={12} color={U.chipTones.danger.fg} strokeWidth={1.8} />
                    </Pressable>
                  </GlassTooltip>
                </View>
              </View>
            </MobileTableRowX>
          );
        })}
      </MobileTableX>

      {/* İletişim ve banka — aynı tablo kalıbında */}
      {contactRows.length > 0 && (
        <MobileTableX title="İletişim ve banka">
          {contactRows.map((r, i) => (
            <MobileTableRowX key={r.label} isLast={i === contactRows.length - 1}>
              <MobileTableIconX icon={r.icon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={MT.meta}>{r.label}</Text>
                <Text style={[MT.title, { fontWeight: '500', marginTop: 1 }]}>{r.value}</Text>
              </View>
            </MobileTableRowX>
          ))}
        </MobileTableX>
      )}

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

/** Hero eylem düğmesi — ekstre sayfasındaki PillBtn ile aynı ölçü ve tonlar. */
function HeroBtn({ icon: Icon, label, onPress, variant = 'dark' }: {
  icon: React.ComponentType<any>; label?: string; onPress: () => void; variant?: 'dark' | 'ghost';
}) {
  const U = useInkUI();
  const dark = variant === 'dark';
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: label ? 16 : 12, paddingVertical: 10,
        borderRadius: 999,
        backgroundColor: dark ? U.ink[900] : 'transparent',
        borderWidth: dark ? 0 : 1,
        borderColor: U.ink[200],
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
      }}
    >
      <Icon size={14} color={dark ? U.onDarkPill : U.ink[700]} strokeWidth={1.8} />
      {!!label && (
        <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? U.onDarkPill : U.ink[700] }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
