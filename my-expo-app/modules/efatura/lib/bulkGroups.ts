// Toplu e-faturalar: aynı ETTN'yi paylaşan (en az iki) Siman faturası = bir resmi e-fatura.
// Saf — test: bulkGroups.test.mts. Faturalar › "Toplu e-Fatura" sekmesi bunu listeler.

export interface BulkMemberRow {
  id: string;
  invoice_number: string;
  issue_date: string;
  total: number;
  currency: string;
  status: string;
  efatura_uuid: string | null;
  efatura_number: string | null;
  efatura_status: string | null;
  efatura_type: string | null;
  efatura_sent_at: string | null;
  clinic_name: string;
  clinic_logo: string | null;
}

export interface BulkGroup {
  ettn: string;
  number: string | null;
  status: string | null;
  type: string | null;
  sentAt: string | null;
  clinicName: string;
  clinicLogo: string | null;
  currency: string;
  total: number;
  firstDate: string;
  lastDate: string;
  invoices: BulkMemberRow[];
}

export function groupBulkEInvoices(rows: BulkMemberRow[]): BulkGroup[] {
  const byEttn = new Map<string, BulkMemberRow[]>();
  for (const r of rows) {
    const k = String(r.efatura_uuid ?? '').toLowerCase();
    if (!k) continue;
    byEttn.set(k, [...(byEttn.get(k) ?? []), r]);
  }
  const groups: BulkGroup[] = [];
  for (const [ettn, list] of byEttn) {
    if (list.length < 2) continue;
    const invoices = [...list].sort((a, b) =>
      a.issue_date.localeCompare(b.issue_date) || a.invoice_number.localeCompare(b.invoice_number));
    const head = invoices.find((i) => i.efatura_number) ?? invoices[0];
    groups.push({
      ettn,
      number: head.efatura_number,
      status: head.efatura_status,
      type: head.efatura_type,
      sentAt: invoices.map((i) => i.efatura_sent_at).filter(Boolean).sort().pop() ?? null,
      clinicName: head.clinic_name,
      clinicLogo: head.clinic_logo,
      currency: (head.currency || 'TRY').toUpperCase(),
      total: Math.round(invoices.reduce((a, i) => a + (Number(i.total) || 0), 0) * 100) / 100,
      firstDate: invoices[0].issue_date,
      lastDate: invoices[invoices.length - 1].issue_date,
      invoices,
    });
  }
  return groups.sort((a, b) => String(b.sentAt ?? '').localeCompare(String(a.sentAt ?? '')));
}

export function filterGroups(groups: BulkGroup[], query: string): BulkGroup[] {
  const q = query.trim().toLocaleLowerCase('tr-TR');
  if (!q) return groups;
  const has = (s: string | null | undefined) => String(s ?? '').toLocaleLowerCase('tr-TR').includes(q);
  return groups.filter((g) => has(g.number) || has(g.clinicName) || has(g.ettn) || g.invoices.some((i) => has(i.invoice_number)));
}
