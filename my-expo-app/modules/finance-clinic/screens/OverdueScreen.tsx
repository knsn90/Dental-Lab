/**
 * Mali İşlemler — Vadesi Geçen Faturalar.
 */

import React from 'react';
import { CheckCircle2 } from 'lucide-react-native';
import { InvoiceListBase } from './_InvoiceListBase';

export function OverdueScreen({ clinicId }: { clinicId: string }) {
  return (
    <InvoiceListBase
      clinicId={clinicId}
      filter="overdue"
      title="Vadesi Geçen"
      eyebrow="Acil Tahsilat"
      emptyTitle="Vadesi geçen fatura yok"
      emptyDescription="Tüm faturalarınız zamanında ödeniyor."
      emptyIcon={CheckCircle2}
    />
  );
}
