import { useState, useEffect, useCallback } from 'react';
import {
  fetchPayrollList, fetchPayroll, fetchPayrollItems, fetchPayrollSettings,
  calculatePayroll, savePayroll, approvePayroll, markPayrollPaid,
  revertPayrollToDraft, addPayrollItem, deletePayrollItem, savePayrollSettings,
  currentPeriod,
  type Payroll, type PayrollItem, type PayrollSettings, type PayrollItemType,
} from '../api';

// ─── Dönem bazlı liste ────────────────────────────────────────────────────────
export function usePayrollList(period: string) {
  const [list, setList]       = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchPayrollList(period);
    setList((data as Payroll[]) ?? []);
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  return { list, loading, refetch: load };
}

// ─── Tek bordro detayı + kalemler ────────────────────────────────────────────
export function usePayrollDetail(employeeId: string | null, period: string) {
  const [payroll, setPayroll]  = useState<Payroll | null>(null);
  const [items, setItems]      = useState<PayrollItem[]>([]);
  const [loading, setLoading]  = useState(false);
  const [calcLoading, setCalc] = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const [{ data: p }, { data: it }] = await Promise.all([
      fetchPayroll(employeeId, period),
      payroll?.id ? fetchPayrollItems(payroll.id) : Promise.resolve({ data: [] }),
    ]);
    setPayroll(p ?? null);
    if (p?.id) {
      const { data: items2 } = await fetchPayrollItems(p.id);
      setItems(items2 ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
  }, [employeeId, period]);

  useEffect(() => { load(); }, [load]);

  const calculate = async () => {
    if (!employeeId) return;
    setCalc(true);
    const { data } = await calculatePayroll(employeeId, period);
    if (data) setPayroll(data as Payroll);
    await load();
    setCalc(false);
  };

  const approve = async (approverId: string) => {
    if (!payroll?.id) return;
    const { data } = await approvePayroll(payroll.id, approverId);
    if (data) setPayroll(data);
  };

  const markPaid = async () => {
    if (!payroll?.id) return;
    const { data } = await markPayrollPaid(payroll.id);
    if (data) setPayroll(data);
  };

  const revertDraft = async () => {
    if (!payroll?.id) return;
    await revertPayrollToDraft(payroll.id);
    await load();
  };

  const addItem = async (type: PayrollItemType, description: string, amount: number) => {
    if (!payroll?.id) return;
    await addPayrollItem(payroll.id, { type, description, amount });
    await load();
  };

  const removeItem = async (itemId: string) => {
    await deletePayrollItem(itemId);
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  return {
    payroll, items, loading, calcLoading,
    refetch: load, calculate, approve, markPaid, revertDraft, addItem, removeItem,
  };
}

// ─── Ayarlar ──────────────────────────────────────────────────────────────────
export function usePayrollSettings(employeeId: string | null) {
  const DEFAULT: PayrollSettings = {
    employee_id: employeeId ?? '',
    working_days_per_month: 22,
    late_penalty_per_incident: 0,
    overtime_multiplier: 1.5,
    include_sgk: false,
    sgk_employee_rate: 0.14,
    sgk_employer_rate: 0.205,
  };

  const [settings, setSettings]  = useState<PayrollSettings>(DEFAULT);
  const [loading, setLoading]    = useState(false);
  const [saving, setSaving]      = useState(false);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    const { data } = await fetchPayrollSettings(employeeId);
    setSettings(data ?? { ...DEFAULT, employee_id: employeeId });
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  const save = async (updates: Partial<PayrollSettings>) => {
    if (!employeeId) return;
    setSaving(true);
    const merged = { ...settings, ...updates, employee_id: employeeId };
    const { data } = await savePayrollSettings(merged);
    if (data) setSettings(data);
    setSaving(false);
  };

  return { settings, loading, saving, refetch: load, save };
}
