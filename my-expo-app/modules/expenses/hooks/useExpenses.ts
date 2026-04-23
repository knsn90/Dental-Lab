import { useState, useEffect, useCallback } from 'react';
import { fetchExpenses, type Expense, type ExpenseCategory } from '../api';

export function useExpenses(filters?: { category?: ExpenseCategory; date_from?: string; date_to?: string }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchExpenses(filters);
    setExpenses(data ?? []);
    setLoading(false);
  }, [filters?.category, filters?.date_from, filters?.date_to]);

  useEffect(() => { load(); }, [load]);

  return { expenses, loading, refetch: load };
}
