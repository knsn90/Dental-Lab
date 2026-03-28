import { useState } from 'react';
import { useAuthStore } from '../../../core/store/authStore';
import { requestApproval as apiRequest } from '../api';

export function useRequestApproval() {
  const { profile } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const request = async (workOrderId: string, stepName: string): Promise<boolean> => {
    if (!profile?.id) { setError('Kullanıcı bulunamadı'); return false; }
    setLoading(true);
    setError(null);
    try {
      await apiRequest(workOrderId, stepName, profile.id);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { request, loading, error };
}
