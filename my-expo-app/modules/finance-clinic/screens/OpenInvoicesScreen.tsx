/**
 * Mali İşlemler — Bekleyen Faturalar (tümü, vade sırasına göre).
 */

import React from 'react';
import { Clock } from 'lucide-react-native';
import { InvoiceListBase } from './_InvoiceListBase';

export function OpenInvoicesScreen({ clinicId }: { clinicId: string }) {
  return (
    <InvoiceListBase
      clinicId={clinicId}
      filter="open"
      title="Bekleyen Ödemeler"
      eyebrow="Açık Faturalar"
      emptyTitle="Bekleyen ödeme yok"
      emptyDescription="Tüm açık faturalar tahsil edilmiş."
      emptyIcon={Clock}
    />
  );
}
