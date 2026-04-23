import { useCallback, useEffect, useState } from 'react';
import {
  fetchInvoices, fetchInvoiceById, fetchClinicBalances, fetchInvoiceStats,
  fetchUnbilledWorkOrders,
} from '../api';
import type {
  Invoice, InvoiceListFilters, ClinicBalance, UnbilledWorkOrder,
} from '../types';

// ─── Liste hook'u ─────────────────────────────────────────────────────────
export function useInvoices(filters: InvoiceListFilters = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // filters'ı JSON key olarak serialize et — useEffect dep dizisi için kararlı
  const key = JSON.stringify(filters);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchInvoices(filters);
    if (err) setError((err as any).message ?? String(err));
    setInvoices((data ?? []) as Invoice[]);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { void load(); }, [load]);

  return { invoices, loading, error, refetch: load };
}

// ─── Detay hook'u ─────────────────────────────────────────────────────────
export function useInvoice(id: string | undefined) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchInvoiceById(id);
    if (err) setError((err as any).message ?? String(err));
    setInvoice(data);
    setLoading(false);
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  return { invoice, loading, error, refetch: load };
}

// ─── Klinik cari özet hook'u ──────────────────────────────────────────────
export function useClinicBalances() {
  const [balances, setBalances] = useState<ClinicBalance[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchClinicBalances();
    setBalances((data ?? []) as ClinicBalance[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { balances, loading, refetch: load };
}

// ─── Toplu fatura: faturalanmamış siparişler hook'u ──────────────────────
export function useUnbilledWorkOrders(clinicId?: string) {
  const [orders, setOrders] = useState<UnbilledWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchUnbilledWorkOrders(clinicId);
    if (err) setError((err as any).message ?? String(err));
    setOrders((data ?? []) as UnbilledWorkOrder[]);
    setLoading(false);
  }, [clinicId]);

  useEffect(() => { void load(); }, [load]);

  return { orders, loading, error, refetch: load };
}

// ─── İstatistik hook'u (KPI strip için) ───────────────────────────────────
export function useInvoiceStats() {
  const [stats, setStats] = useState<{
    totalBilled: number; totalPaid: number; outstandingBalance: number;
    thisMonthBilled: number; overdueAmount: number; invoiceCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const s = await fetchInvoiceStats();
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { stats, loading, refetch: load };
}
