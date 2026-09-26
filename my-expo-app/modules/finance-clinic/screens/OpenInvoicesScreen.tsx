/**
 * Mali İşlemler — Bekleyen Ödemeler.
 *
 * "Vadesi Geçen" AYRI bir sekmeydi; vadesi geçenler zaten bekleyenlerin alt
 * kümesi olduğu için aynı liste iki kez gösteriliyordu. Tek ekrana indirildi,
 * ayrım hero'daki kapsül filtresiyle yapılıyor.
 */

import React from 'react';
import { InvoiceListBase } from './_InvoiceListBase';

export function OpenInvoicesScreen({
  clinicId, onlyOverdue,
}: {
  clinicId: string;
  /** Özet ekranındaki "Vadesi geçen" bağlantısı bu görünümle açar. */
  onlyOverdue?: boolean;
}) {
  return <InvoiceListBase clinicId={clinicId} initialFilter={onlyOverdue ? 'overdue' : 'open'} />;
}
