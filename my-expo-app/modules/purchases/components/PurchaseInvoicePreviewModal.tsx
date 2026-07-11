/**
 * PurchaseInvoicePreviewModal — Resmi GİB e-Fatura görünümlü önizleme popup.
 *
 * Layout (GİB e-Fatura standardı, logo hariç):
 *   ▸ Üst sol: SATICI bilgi bloğu (firma, adres, tel/email/web, vergi dairesi, VKN)
 *   ▸ Üst sağ: "e-FATURA" yazısı
 *   ▸ Orta sol: SAYIN (alıcı) bloğu · Orta sağ: belge meta tablosu (Özelleştirme No,
 *     Senaryo, Fatura Tipi/No/Tarihi/Saati)
 *   ▸ ETTN satırı
 *   ▸ Kalem tablosu: SN, Ürün Kodu, Mal Hizmet, Miktar, Birim Fiyat, İskonto Oranı/Tutarı,
 *     KDV Oranı/Tutarı, Diğer Vergiler, Mal Hizmet Tutarı
 *   ▸ Sağ alt: tutar özeti
 *   ▸ Alt: Not satırları
 *
 * Veri: purchase_invoices header + stock_movements (type=IN, purchase_invoice_id)
 */
import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { X, Printer, Download, FileText } from 'lucide-react-native';
import {
  getPurchaseInvoice,
  getPurchaseInvoiceLines,
  type PurchaseInvoice,
  type PurchaseInvoiceLine,
} from '../api';
import { formatMoney } from '../../../core/money/currency';

const SANS = Platform.OS === 'web'
  ? { fontFamily: 'Arial, Helvetica, sans-serif' as const }
  : {};

// GİB e-Fatura tarzı renkler — beyaz zemin, ince siyah grid
const INK     = '#000000';
const BORDER  = '#000000';
const LIGHT   = '#F4F4F4';

interface Props {
  visible: boolean;
  onClose: () => void;
  purchaseInvoiceId: string | null;
  /** Alıcı (lab) bilgileri */
  labName?: string;
  labAddress?: string | null;
  labTaxOffice?: string | null;
  labTaxNo?: string | null;
  labPhone?: string | null;
  labEmail?: string | null;
  labWeb?: string | null;
  /** Satıcı (tedarikçi) bilgileri varsa override */
  supplierAddress?: string | null;
  supplierTaxOffice?: string | null;
  supplierTaxNo?: string | null;
  supplierPhone?: string | null;
  supplierEmail?: string | null;
  supplierWeb?: string | null;
}

export function PurchaseInvoicePreviewModal({
  visible, onClose, purchaseInvoiceId,
  labName = 'Laboratuvar',
  labAddress, labTaxOffice, labTaxNo, labPhone, labEmail, labWeb,
  supplierAddress, supplierTaxOffice, supplierTaxNo, supplierPhone, supplierEmail, supplierWeb,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [header,  setHeader]  = useState<PurchaseInvoice | null>(null);
  const [lines,   setLines]   = useState<PurchaseInvoiceLine[]>([]);

  useEffect(() => {
    if (!visible || !purchaseInvoiceId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getPurchaseInvoice(purchaseInvoiceId),
      getPurchaseInvoiceLines(purchaseInvoiceId),
    ]).then(([hRes, lRes]) => {
      if (!active) return;
      if (!hRes.error) setHeader(hRes.data ?? null);
      if (!lRes.error) setLines(lRes.data ?? []);
      setLoading(false);
    });
    return () => { active = false; };
  }, [visible, purchaseInvoiceId]);

  // Hesaplamalar
  const subtotal  = header?.subtotal   ?? 0;
  const vatAmount = header?.vat_amount ?? 0;
  const total     = header?.total      ?? 0;
  const vatRate   = header?.vat_rate   ?? 20;
  const currency  = (header?.currency ?? 'TRY') as any;
  // Kur snapshot — döviz faturalarında orijinal kur ve TL karşılığı gösterilir
  const baseCurrency = (header?.base_currency_at_time ?? 'TRY') as any;
  const exchangeRate = Number(header?.rate_at_time ?? 1);
  const subtotalBase = Number(header?.subtotal_base ?? 0);
  const totalBase    = Number(header?.total_base ?? 0);
  const vatAmountBase = totalBase - subtotalBase;
  const isForeignCurrency = currency !== baseCurrency && exchangeRate > 0 && exchangeRate !== 1;
  const created   = header?.created_at ? new Date(header.created_at) : null;
  const invoiceDate = header?.invoice_date
    ? new Date(header.invoice_date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';
  const invoiceTime = created
    ? created.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';
  // ETTN — purchase_invoice id'sinden 8-4-4-4-12 UUID formatı
  const ettn = (header?.id ?? '').toLowerCase();

  // Asgari satır sayısı — boş satırlar grid'i doldursun
  const MIN_ROWS = 18;
  const emptyRows = Math.max(0, MIN_ROWS - lines.length);

  const handlePrint = () => { if (Platform.OS === 'web') window.print(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(10,14,26,0.42)',
        alignItems: 'center', justifyContent: 'center',
        padding: Platform.OS === 'web' ? 24 : 0,
        ...(Platform.OS === 'web' ? { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } : {}),
      }}>
        <Pressable onPress={onClose} style={{ position: 'absolute', inset: 0 } as any} />

        <View style={{
          width: '100%', maxWidth: 920, maxHeight: '94%',
          backgroundColor: '#FFFFFF',
          borderRadius: 8,
          overflow: 'hidden',
          ...(Platform.OS === 'web' ? {
            boxShadow: '0 24px 60px rgba(15,23,42,0.28)',
          } as any : {}),
        }}>
          {/* Toolbar — modal kontrolleri (yazdırırken gizlenmeli) */}
          <View
            // @ts-ignore web
            className="print:hidden"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingHorizontal: 18, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
              backgroundColor: '#F8FAFC',
            }}
          >
            <FileText size={16} color="#0F172A" strokeWidth={1.8} />
            <Text style={{ ...SANS, fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
              Satın Alma Faturası — Önizleme
            </Text>
            <View style={{ flex: 1 }} />
            {Platform.OS === 'web' && (
              <Pressable
                onPress={handlePrint}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: hovered ? '#E2E8F0' : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Printer size={14} color="#475569" strokeWidth={1.8} />
                <Text style={{ ...SANS, fontSize: 12, color: '#475569', fontWeight: '600' }}>Yazdır</Text>
              </Pressable>
            )}
            {header?.invoice_file_url ? (
              <Pressable
                onPress={() => {
                  if (Platform.OS === 'web' && header.invoice_file_url) {
                    window.open(header.invoice_file_url, '_blank');
                  }
                }}
                style={({ hovered }: any) => ({
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  paddingHorizontal: 12, paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: hovered ? '#E2E8F0' : 'transparent',
                  cursor: 'pointer' as any,
                })}
              >
                <Download size={14} color="#475569" strokeWidth={1.8} />
                <Text style={{ ...SANS, fontSize: 12, color: '#475569', fontWeight: '600' }}>Orijinal</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={{
                width: 30, height: 30, borderRadius: 6,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.04)',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
              }}
            >
              <X size={16} color="#475569" strokeWidth={2} />
            </Pressable>
          </View>

          {/* BELGE — A4 GİB tarzı (mobile'da yatay scroll ile sığar) */}
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ backgroundColor: '#FFFFFF' }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ padding: 60, alignItems: 'center' }}>
                <ActivityIndicator color="#0F172A" />
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={{ padding: 24, minWidth: 760 }}
              >
              <View style={{ ...SANS, color: INK, width: 712 } as any}>
                {/* ═══ ÜST BLOK — SATICI + e-FATURA başlık ═══ */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {/* Sol: satıcı (tedarikçi) bilgileri */}
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={{ ...SANS, fontSize: 11, fontWeight: '700', color: INK, marginBottom: 4 }}>
                      {(header?.supplier_name ?? '—').toUpperCase()}
                    </Text>
                    {supplierAddress ? (
                      <DocLine label={null} value={supplierAddress} />
                    ) : null}
                    {supplierPhone ? (
                      <DocLine label="Tel:" value={supplierPhone} />
                    ) : null}
                    {supplierEmail ? (
                      <DocLine label="E-Posta:" value={supplierEmail} />
                    ) : null}
                    {supplierWeb ? (
                      <DocLine label="Web Sitesi:" value={supplierWeb} />
                    ) : null}
                    {supplierTaxOffice ? (
                      <DocLine label="Vergi Dairesi:" value={supplierTaxOffice} />
                    ) : null}
                    {supplierTaxNo ? (
                      <DocLine label="VKN:" value={supplierTaxNo} />
                    ) : null}
                  </View>
                  {/* Sağ: e-FATURA başlık (logo yok) */}
                  <View style={{ minWidth: 200, alignItems: 'center', paddingTop: 8 }}>
                    <Text style={{ ...SANS, fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.6 }}>
                      e-FATURA
                    </Text>
                  </View>
                </View>

                {/* ─── Ayraç çizgi ─── */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 8, marginBottom: 12 }} />

                {/* ═══ ORTA BLOK — SAYIN (alıcı) + belge meta tablosu ═══ */}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  {/* Sol: alıcı (lab) bilgileri */}
                  <View style={{ flex: 1, paddingRight: 16 }}>
                    <Text style={{ ...SANS, fontSize: 10, fontWeight: '700', color: INK, marginBottom: 2 }}>SAYIN</Text>
                    <Text style={{ ...SANS, fontSize: 11, fontWeight: '700', color: INK, marginBottom: 4 }}>
                      {labName}
                    </Text>
                    {labAddress ? <DocLine label={null} value={labAddress} /> : <DocLine label={null} value="/" />}
                    {labWeb     ? <DocLine label="Web Sitesi:" value={labWeb} /> : <DocLine label="Web Sitesi:" value="" />}
                    {labEmail   ? <DocLine label="E-Posta:" value={labEmail} /> : <DocLine label="E-Posta:" value="" />}
                    {labPhone   ? <DocLine label="Tel: Fax:" value={labPhone} /> : <DocLine label="Tel: Fax:" value="" />}
                    {labTaxOffice ? <DocLine label="Vergi Dairesi:" value={labTaxOffice} /> : <DocLine label="Vergi Dairesi:" value="" />}
                    {labTaxNo   ? <DocLine label="VKN:" value={labTaxNo} /> : <DocLine label="VKN:" value="" />}
                  </View>
                  {/* Sağ: belge meta tablosu */}
                  <View style={{ width: 290, borderWidth: 1, borderColor: BORDER }}>
                    <MetaRow label="Özelleştirme No:" value="TR1.2" />
                    <MetaRow label="Senaryo:" value="TEMELFATURA" />
                    <MetaRow label="Fatura Tipi:" value="SATIS" />
                    <MetaRow label="Fatura No:" value={header?.invoice_number ?? '—'} />
                    <MetaRow label="Fatura Tarihi:" value={invoiceDate} />
                    <MetaRow label="Fatura Saati:" value={invoiceTime} last={!isForeignCurrency} />
                    {isForeignCurrency && (
                      <MetaRow
                        label="Döviz Kuru:"
                        value={`1 ${currency} = ${exchangeRate.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${baseCurrency}`}
                        last
                      />
                    )}
                  </View>
                </View>

                {/* ─── Ayraç ─── */}
                <View style={{ borderBottomWidth: 1, borderBottomColor: BORDER, marginTop: 8, marginBottom: 8 }} />

                {/* ETTN */}
                <Text style={{ ...SANS, fontSize: 10, color: INK, marginBottom: 8 }}>
                  <Text style={{ fontWeight: '700' }}>ETTN: </Text>
                  {ettn || '—'}
                </Text>

                {/* ═══ KALEM TABLOSU ═══ */}
                <View style={{ borderWidth: 1, borderColor: BORDER }}>
                  {/* Header */}
                  <View style={{ flexDirection: 'row', backgroundColor: LIGHT }}>
                    <TH text="SN"          w={28} />
                    <TH text="Ürün Kodu"   w={70} />
                    <TH text="Mal Hizmet"  flex={3} />
                    <TH text="Miktar"      w={56}  align="right" />
                    <TH text="Birim Fiyat" w={64}  align="right" />
                    <TH text="İskonto Oranı"  w={56} align="right" />
                    <TH text="İskonto Tutarı" w={60} align="right" />
                    <TH text="KDV Oranı"   w={56}  align="right" />
                    <TH text="KDV Tutarı"  w={70}  align="right" />
                    <TH text="Diğer Vergiler" w={64} align="right" last />
                    <TH text="Mal Hizmet Tutarı" w={84} align="right" last />
                  </View>
                  {/* Rows */}
                  {lines.map((l, idx) => {
                    const q  = Number(l.quantity ?? 0);
                    const p  = Number(l.unit_cost_at_time ?? 0);
                    const lineTotal  = q * p;
                    const lineKdv    = lineTotal * (Number(vatRate) / 100);
                    return (
                      <View key={l.id} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER }}>
                        <TD text={String(idx + 1)} w={28} />
                        <TD text={l.item_id ? l.item_id.slice(0, 8).toUpperCase() : ''} w={70} />
                        <TD text={l.item_name ?? '—'} flex={3} align="left" />
                        <TD text={`${q.toLocaleString('tr-TR', { maximumFractionDigits: 3 })}${l.unit ? ' ' + l.unit : ''}`} w={56} align="right" />
                        <TD text={formatMoney(p, currency, { fractionDigits: 2 })} w={64} align="right" />
                        <TD text="%0" w={56} align="right" />
                        <TD text={formatMoney(0, currency, { fractionDigits: 2 })} w={60} align="right" />
                        <TD text={`%${vatRate}`} w={56} align="right" />
                        <TD text={formatMoney(lineKdv, currency, { fractionDigits: 2 })} w={70} align="right" />
                        <TD text="" w={64} align="right" last />
                        <TD text={formatMoney(lineTotal, currency, { fractionDigits: 2 })} w={84} align="right" last />
                      </View>
                    );
                  })}
                  {/* Empty filler rows */}
                  {Array.from({ length: emptyRows }).map((_, i) => (
                    <View key={`e${i}`} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: BORDER }}>
                      <TD text="" w={28} />
                      <TD text="" w={70} />
                      <TD text="" flex={3} />
                      <TD text="" w={56} />
                      <TD text="" w={64} />
                      <TD text="" w={56} />
                      <TD text="" w={60} />
                      <TD text="" w={56} />
                      <TD text="" w={70} />
                      <TD text="" w={64} last />
                      <TD text="" w={84} last />
                    </View>
                  ))}
                </View>

                {/* ═══ TOPLAM ÖZETİ ═══ */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: -1 }}>
                  <View style={{ width: isForeignCurrency ? 480 : 380, borderWidth: 1, borderColor: BORDER, borderTopWidth: 0 }}>
                    <SumRow
                      label="Mal Hizmet Toplam Tutarı"
                      value={formatMoney(subtotal, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(subtotalBase, baseCurrency, { fractionDigits: 2 }) : null}
                    />
                    <SumRow
                      label="Toplam İskonto"
                      value={formatMoney(0, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(0, baseCurrency, { fractionDigits: 2 }) : null}
                    />
                    <SumRow
                      label="Toplam Masraf"
                      value={formatMoney(0, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(0, baseCurrency, { fractionDigits: 2 }) : null}
                    />
                    <SumRow
                      label={`Hesaplanan KDV(%${vatRate})`}
                      value={formatMoney(vatAmount, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(vatAmountBase, baseCurrency, { fractionDigits: 2 }) : null}
                    />
                    <SumRow
                      label="Vergiler Dahil Toplam Tutar"
                      value={formatMoney(total, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(totalBase, baseCurrency, { fractionDigits: 2 }) : null}
                    />
                    <SumRow
                      label="Ödenecek Tutar"
                      value={formatMoney(total, currency, { fractionDigits: 2 })}
                      base={isForeignCurrency ? formatMoney(totalBase, baseCurrency, { fractionDigits: 2 }) : null}
                      last bold
                    />
                  </View>
                </View>

                {/* ═══ NOT SATIRLARI ═══ */}
                <View style={{
                  marginTop: 10,
                  borderWidth: 1, borderColor: BORDER,
                  padding: 8,
                  minHeight: 90,
                }}>
                  {header?.notes ? (
                    <Text style={{ ...SANS, fontSize: 10, color: INK, marginBottom: 4 } as any}>
                      <Text style={{ fontWeight: '700' }}>Not: </Text>
                      {header.notes}
                    </Text>
                  ) : null}
                  <Text style={{ ...SANS, fontSize: 10, color: INK, marginBottom: 4 } as any}>
                    <Text style={{ fontWeight: '700' }}>Ödeme Notu: </Text>
                    {paymentLabel(header?.payment_method ?? null)}
                  </Text>
                </View>
              </View>
              </ScrollView>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function paymentLabel(p: PurchaseInvoice['payment_method']): string {
  switch (p) {
    case 'cash':         return 'NAKİT';
    case 'transfer':     return 'HAVALE / EFT';
    case 'check':        return 'ÇEK';
    case 'card':         return 'KREDİ KARTI';
    case 'open_account': return 'AÇIK HESAP';
    default:             return 'AÇIK HESAP';
  }
}

function DocLine({ label, value }: { label: string | null; value: string }) {
  if (!label) {
    return <Text style={{ ...SANS, fontSize: 10, color: INK } as any}>{value}</Text>;
  }
  return (
    <Text style={{ ...SANS, fontSize: 10, color: INK } as any}>
      <Text style={{ fontWeight: '700' } as any}>{label} </Text>
      {value || ''}
    </Text>
  );
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row',
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: BORDER,
    }}>
      <View style={{ width: 130, padding: 4, backgroundColor: LIGHT, borderRightWidth: 1, borderRightColor: BORDER }}>
        <Text style={{ ...SANS, fontSize: 10, fontWeight: '700', color: INK } as any}>{label}</Text>
      </View>
      <View style={{ flex: 1, padding: 4 }}>
        <Text style={{ ...SANS, fontSize: 10, color: INK } as any}>{value}</Text>
      </View>
    </View>
  );
}

function TH({ text, flex, w, align = 'center', last }: {
  text: string; flex?: number; w?: number;
  align?: 'left' | 'right' | 'center'; last?: boolean;
}) {
  return (
    <View
      style={{
        ...(flex != null ? { flex } : {}),
        ...(w   != null ? { width: w } : {}),
        padding: 4,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: BORDER,
        minHeight: 28,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          ...SANS,
          fontSize: 9, fontWeight: '700', color: INK,
          textAlign: align,
        } as any}
      >
        {text}
      </Text>
    </View>
  );
}

function TD({ text, flex, w, align = 'center', last }: {
  text: string; flex?: number; w?: number;
  align?: 'left' | 'right' | 'center'; last?: boolean;
}) {
  return (
    <View
      style={{
        ...(flex != null ? { flex } : {}),
        ...(w   != null ? { width: w } : {}),
        padding: 4,
        borderRightWidth: last ? 0 : 1,
        borderRightColor: BORDER,
        minHeight: 22,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          ...SANS,
          fontSize: 10, color: INK,
          textAlign: align,
        } as any}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function SumRow({ label, value, base, last, bold }: { label: string; value: string; base?: string | null; last?: boolean; bold?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row',
      borderBottomWidth: last ? 0 : 1,
      borderBottomColor: BORDER,
    }}>
      <View style={{ flex: 1, padding: 6, borderRightWidth: 1, borderRightColor: BORDER }}>
        <Text style={{ ...SANS, fontSize: 10, fontWeight: '700', color: INK, textAlign: 'right' } as any}>
          {label}
        </Text>
      </View>
      <View style={{ width: 130, padding: 6, borderRightWidth: base ? 1 : 0, borderRightColor: BORDER }}>
        <Text style={{ ...SANS, fontSize: bold ? 11 : 10, fontWeight: '700', color: INK, textAlign: 'right' } as any}>
          {value}
        </Text>
      </View>
      {base ? (
        <View style={{ width: 110, padding: 6 }}>
          <Text style={{ ...SANS, fontSize: bold ? 11 : 10, fontWeight: '700', color: INK, textAlign: 'right' } as any}>
            {base}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
