/**
 * InvoiceMobileTable — Faturalar mobil listesi.
 *
 * Kullanıcı: "Faturalar sayfasının da listesini aynı şekilde ayarla" (ekstre / giderler gibi).
 * Ekstre mobil tablosuyla aynı kalıp: tableCard + panel accent başlık şeridi,
 * hairline ayrımlı satırlar; solda fatura no + klinik/hekim/hasta + tarih/vade/durum,
 * sağda tutar + kalan.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { localeTag } from '../../../core/i18n';
import { autoT } from '../../../core/i18n/autoTranslate';
import { useInkUI } from '../../../core/theme/inkScale';
import { MobileTableX, MobileTableRowX, MobileTableIconX } from '../../../core/ui/MobileTableX';
import { normalizeDoctorName } from '../../../core/utils/textCase';
import { useLabToday } from '../../../core/metrics/useLabToday';
import { isInvoiceOverdue } from '../../../core/metrics/invoiceDefs';
import { FileText } from '../../../core/ui/icons';
import { INVOICE_STATUS_LABELS, type Invoice } from '../types';
import { chipTones, statusChip, fmtMoney, fmtDate, EFaturaBadge } from '../lib/invoiceListDisplay';

export function InvoiceMobileTable({ invoices, accent, onOpen }: {
  invoices: Invoice[];
  /** Başlık şeridi zemini — panel accent'i (masaüstü tablosuyla aynı) */
  accent: string;
  onOpen: (inv: Invoice) => void;
}) {
  return (
    <MobileTableX title="Faturalar" count={invoices.length} countLabel="fatura" accent={accent}>
      {invoices.map((inv, i) => (
        <InvoiceMobileRow key={inv.id} invoice={inv} isLast={i === invoices.length - 1} onPress={() => onOpen(inv)} />
      ))}
    </MobileTableX>
  );
}

function InvoiceMobileRow({ invoice, isLast, onPress }: { invoice: Invoice; isLast: boolean; onPress: () => void }) {
  const U = useInkUI();
  const CHIP_TONES = chipTones(U);
  const STATUS_CHIP = statusChip(U);
  const today = useLabToday();
  const isOverdue = isInvoiceOverdue(invoice, today);
  const balance = (Number(invoice.total) || 0) - (Number(invoice.paid_amount) || 0);
  const chip = isOverdue ? CHIP_TONES.danger : STATUS_CHIP[invoice.status];
  const tone = isOverdue ? CHIP_TONES.danger : CHIP_TONES.info;
  // Hekim isteği (masaüstüyle aynı): hekim + hasta adı da görünsün
  const sub = [
    invoice.clinic?.name ?? null,
    invoice.doctor?.full_name ? normalizeDoctorName(invoice.doctor.full_name) : null,
    invoice.work_order?.patient_name ?? null,
  ].filter(Boolean).join(' · ');

  return (
    <MobileTableRowX onPress={onPress} isLast={isLast} tint={isOverdue ? 'rgba(217,75,75,0.03)' : undefined}>
      <MobileTableIconX icon={FileText} tone={{ bg: tone.bg, fg: tone.text }} />

      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Fatura no tek başına — rozetle yarışınca kesiliyordu (F-NEX-2…) */}
        <Text style={{ fontSize: 13, fontWeight: '600', color: U.ink[900] }} numberOfLines={1}>
          {invoice.invoice_number}
        </Text>
        {sub ? (
          <Text style={{ fontSize: 11, color: U.ink[400], marginTop: 1 }} numberOfLines={1}>{sub}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6, rowGap: 3, marginTop: 2, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 11, color: U.ink[400] }}>{fmtDate(invoice.issue_date)}</Text>
          {invoice.due_date ? (
            <Text style={{ fontSize: 11, color: isOverdue ? CHIP_TONES.danger.text : U.ink[400], fontWeight: isOverdue ? '600' : '400' }}>
              Vade: {fmtDate(invoice.due_date)}
            </Text>
          ) : null}
          <EFaturaBadge invoice={invoice} />
        </View>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: isOverdue ? CHIP_TONES.danger.text : U.ink[900] }}>
          {fmtMoney(invoice.total, invoice.currency)}
        </Text>
        <View style={{ marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, backgroundColor: chip.bg }}>
          <Text style={{ fontSize: 9, fontWeight: '600', color: chip.text }}>
            {isOverdue ? autoT('Gecikmiş').toLocaleUpperCase(localeTag()) : autoT(INVOICE_STATUS_LABELS[invoice.status]).toLocaleUpperCase(localeTag())}
          </Text>
        </View>
        {balance > 0 && invoice.status !== 'iptal' ? (
          <Text style={{ fontSize: 10, color: isOverdue ? CHIP_TONES.danger.text : U.ink[400], marginTop: 3 }}>
            Kalan: {fmtMoney(balance, invoice.currency)}
          </Text>
        ) : null}
      </View>
    </MobileTableRowX>
  );
}
