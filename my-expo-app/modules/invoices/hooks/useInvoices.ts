import { useCallback, useEffect, useState } from 'react';
import {
  fetchInvoices, fetchInvoiceById, fetchClinicBalances, fetchInvoiceStats,
  fetchUnbilledWorkOrders, fetchClinicBalancesByCurrency,
  type InvoiceStats,
} from '../api';
import type {
  Invoice, InvoiceListFilters, ClinicBalance, ClinicBalanceCcy, UnbilledWorkOrder,
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

  // Sessiz tazeleme — loading'e DOKUNMAZ (içerik unmount olmaz). Satır-içi düzenlemede
  // (adet/fiyat/indirim kaydet) tüm ekranın remount olup scroll'un sıfırlanmasını ve
  // input'un kaybolmasını önler.
  const loadSilent = useCallback(async () => {
    if (!id) return;
    const { data, error: err } = await fetchInvoiceById(id);
    if (err) setError((err as any).message ?? String(err));
    setInvoice(data);
  }, [id]);

  // Tek bir kalemi yerelde güncelle (UPDATE'in döndürdüğü taze satırla) VE fatura
  // toplamlarını (subtotal/tax_amount/total) DB trigger'ıyla aynı mantıkta yerelde
  // yeniden hesapla. Fatura sorgusunun gömülü invoice_items(*) embed'i bayat kalsa
  // bile doğru değer korunur — refetch'e bağımlılık kalkar.
  const patchItem = useCallback((itemId: string, patch: Record<string, any>) => {
    setInvoice(inv => {
      if (!inv) return inv;
      const items = ((inv as any).items ?? []).map((it: any) => it.id === itemId ? { ...it, ...patch } : it);
      const subtotal = items.reduce((s: number, it: any) => s + (Number(it.net_total ?? it.total) || 0), 0);
      const taxRate = Number((inv as any).tax_rate) || 0;
      const taxAmount = Math.round(subtotal * taxRate) / 100;   // subtotal*rate/100, 2 hane
      const total = subtotal + taxAmount;
      return { ...inv, items, subtotal, tax_amount: taxAmount, total } as Invoice;
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { invoice, loading, error, refetch: load, refetchSilent: loadSilent, patchItem };
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
// Katı per-currency cari bakiyeler — her (klinik, para birimi) için ayrı satır.
export function useClinicBalancesByCurrency() {
  const [rows, setRows]     = useState<ClinicBalanceCcy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchClinicBalancesByCurrency();
    setRows((data ?? []) as ClinicBalanceCcy[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { rows, loading, refetch: load };
}

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
  const [stats, setStats] = useState<InvoiceStats | null>(null);
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
